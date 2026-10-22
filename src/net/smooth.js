// Suavização de rede do cliente (sem DOM: roda no navegador e nos testes).
// 1) Buffer de interpolação: os snapshots chegam irregulares pela internet; em vez de desenhar o que chegou "agora"
//    (o que trava e dá saltos), desenhamos o mundo ~2 snapshots no passado, interpolando entre dois snapshots reais.
//    O atraso se adapta ao jitter medido (mín. 50 ms, máx. 160 ms).
// 2) Predição do PRÓPRIO monstro: ele é desenhado onde o servidor o colocará com as teclas que você já apertou
//    (reaplica as entradas ainda não confirmadas sobre o estado mais novo do servidor, com a mesma física de
//    aceleração) e é corrigido suavemente. Em golpes, esquivas e empurrões usa a velocidade do servidor.
// 3) Resposta na hora às teclas (sem esperar a ida e volta ao servidor):
//    - esquiva, investida e salto acontecem na tela no instante do aperto (pose, seta, movimento);
//    - nas outras habilidades, o som de lançamento e a recarga no HUD começam na hora; o golpe em si vem do servidor;
//    - o monstro vira para o mouse na hora;
//    - as recargas do HUD mostram o tempo do servidor "agora" (descontando o atraso de rede).
//    O servidor continua mandando: se ele não confirmar a tecla (atordoado, por exemplo), a previsão é desfeita.
import { applySnapshot, SNAP_HZ } from './snapshot.js';

const SNAP_MS = 1000 / SNAP_HZ;
const BUFFER_MS = 300;
const EXTRAP_MS = 110; // quanto tempo os outros monstros seguem andando sem snapshot novo // o servidor guarda teclas por 0,3 s (control/player.js)
const stepVel = (v, target, dt) => v + (target - v) * Math.min(1, 12 * dt);
const total = (ab) => ab.windup + ab.active + ab.recovery;

export class NetSmoother {
  constructor() { this.reset(); }

  reset() {
    this.q = []; // snapshots recebidos, ainda não aplicados
    this.off = null; this.jitter = 0; this.lastRecv = 0; // relógio do servidor e jitter (ms)
    this.prevT = null; this.curT = null; // tempos (s do servidor) dos snapshots anterior/atual aplicados
    this.latest = null; // estado mais novo do meu monstro
    this.hist = []; // entradas recentes { t, dt, ux, uy, spd, dvx?, dvy?, air?, land? }
    this.pred = { init: false, x: 0, y: 0, vx: 0, vy: 0 };
    this.srv = null; // meu monstro como veio do último snapshot aplicado { m, action, cd }
    this.acks = []; // teclas reconhecidas na hora { id, t, cd0, cooldown, confirmed, heard }
    this.pc = null; // habilidade de movimento prevista { m, id, ab, t0, aim, dir, aimPoint, leapDist? }
    this.tail = null; // cópia atrasada (do servidor) de uma habilidade já mostrada: escondida { id, until, seen }
    this.wasLeap = false;
  }

  enqueue(s, now, world) {
    const sample = now - s.time * 1000;
    if (this.off === null || sample < this.off) this.off = sample; else this.off += (sample - this.off) * 0.002;
    if (this.lastRecv) this.jitter = this.jitter * 0.9 + Math.abs(now - this.lastRecv - SNAP_MS) * 0.1;
    this.lastRecv = now;
    this.q.push(s);
    if (this.q.length > 40) {
      // Aba em segundo plano (no celular: trocou de app, notificação, tela bloqueada): a fila cresce e os mais velhos
      // saem. O terreno e as mensagens vão só como DIFERENÇAS: junta os dos descartados no mais velho que fica, senão
      // o que mudou neles (alagamento da tsunami, fogo, grama, raízes) nunca chegaria ao espelho.
      const dropped = this.q.splice(0, this.q.length - 40), keep = this.q[0];
      keep.terr = dropped.flatMap((d) => d.terr || []).concat(keep.terr || []);
      keep.feed = dropped.flatMap((d) => d.feed || []).concat(keep.feed || []);
    }
    const slot = world.playerTeam;
    if (slot !== null && s.teams[slot] && s.teams[slot].f >= 0) {
      const r = s.mons[s.teams[slot].f];
      if (r) this.latest = { idx: s.teams[slot].f, recv: now, x: r.x, y: r.y, vx: r.vx, vy: r.vy };
    }
  }

  get delay() { return Math.max(50, Math.min(160, SNAP_MS * 1.5 + this.jitter * 2)); }

  // Aplica os snapshots que já "venceram" o atraso; devolve a fração de interpolação entre o anterior e o atual.
  pump(now, world, ctx) {
    if (this.off === null) return 1;
    const renderT = (now - this.off - this.delay) / 1000;
    let applied = false;
    if (this.curT === null && this.q.length) {
      const s = this.q.shift();
      this.curT = s.time; this.prevT = s.time - 1 / SNAP_HZ;
      applySnapshot(world, s, ctx);
      applied = true;
    }
    while (this.q.length && (renderT >= this.curT || this.q.length > 6)) {
      const s = this.q.shift();
      this.prevT = this.curT; this.curT = s.time;
      applySnapshot(world, s, ctx);
      applied = true;
    }
    if (applied) this.captureServer(world);
    if (this.curT === null || this.curT <= this.prevT) return 1;
    // Snapshot atrasado (rede travou): em vez de congelar no último estado e saltar quando o próximo chegar,
    // continua o movimento na mesma direção por até EXTRAP_MS (alpha > 1). Teleportes não são extrapolados (renderer).
    const span = (this.curT - this.prevT) * 1000;
    return Math.max(0, Math.min(1 + EXTRAP_MS / span, (renderT - this.prevT) / (this.curT - this.prevT)));
  }

  // Guarda o que o servidor disse do meu monstro (a previsão é refeita por cima disso a cada quadro),
  // confirma teclas reconhecidas e descarta o "cast" atrasado do servidor (o som já tocou no aperto).
  captureServer(world) {
    const m = world.active;
    this.srv = m ? { m, action: m.action, cd: { ...m.cd }, ch: { ...m.ch } } : null;
    if (!m) return;
    for (const k of this.acks) {
      if (!k.confirmed && ((m.action && m.action.ab.id === k.id) || (m.cd[k.id] || 0) > k.cd0 + 0.05 || (k.charge && k.ch0 !== undefined && (m.ch[k.id] ?? k.ch0) < k.ch0))) k.confirmed = true;
    }
    world.events = world.events.filter((e) => {
      if (e.type !== 'cast' || e.local || e.m !== m) return true;
      const k = this.acks.find((a) => a.id === e.ab && !a.heard);
      if (!k) return true;
      k.heard = true;
      return false;
    });
  }

  // Cargas que sobram segundo o servidor menos as que eu já gastei e ele ainda não confirmou.
  chargesLeft(id, ab) {
    const base = this.srv?.ch?.[id] ?? ab.charges;
    return base - this.acks.filter((k) => k.id === id && k.charge && !k.confirmed).length;
  }

  drawnPos(m) { return this.pred.init ? { x: this.pred.x, y: this.pred.y } : { x: m.x, y: m.y }; }

  // Tempo de recarga que ainda falta para `id` segundo as teclas reconhecidas aqui.
  localCd(id, now) {
    let v = 0;
    for (const k of this.acks) if (k.id === id) v = Math.max(v, k.cooldown - (now - k.t) / 1000);
    return v;
  }

  // O servidor vai aceitar esta tecla quando ela chegar lá? (estado mostrado + o atraso de rede)
  canCast(m, id, ab, now, rtt) {
    if (!m.alive || !m.onField || m.locked || m.status.stun > 0) return false;
    if (m.status.root > 0 && ab.dash) return false;
    const tol = (rtt + this.delay) / 1000;
    if ((this.srv.cd[id] || 0) - tol > 0.05 || this.localCd(id, now) > 0.05) return false;
    if (ab.charges && this.chargesLeft(id, ab) <= 0) return false;
    if (this.pc && (now - this.pc.t0) / 1000 < total(this.pc.ab) - 0.03) return false;
    const sa = this.srv.action;
    if (sa && !(this.tail && sa.ab.id === this.tail.id) && !this.acks.some((k) => k.id === sa.ab.id)) {
      const ab2 = sa.ab;
      const left = sa.phase === 'windup' ? ab2.windup - sa.t + ab2.active + ab2.recovery : sa.phase === 'active' ? ab2.active - sa.t + ab2.recovery : ab2.recovery - sa.t;
      if (left - tol > 0.05) return false;
    }
    return true;
  }

  // Tecla apertada (online). Devolve true se a resposta foi dada na hora.
  press(slot, world, now, rtt = 60) {
    const m = world.active, srv = this.srv;
    if (!m || !srv || srv.m !== m || world.over || slot === 'evolve') return false;
    const id = m.def.controls[slot];
    const ab = id && m.ability(id);
    if (!ab || !this.canCast(m, id, ab, now, rtt)) return false;
    const inp = world.input, pos = this.drawnPos(m);
    const aim = Math.atan2(inp.aim.y - pos.y, inp.aim.x - pos.x);
    const ml = Math.hypot(inp.move.x, inp.move.y);
    const dir = ab.kind === 'dodge' && ml > 0 ? Math.atan2(inp.move.y, inp.move.x) : aim;
    this.acks.push({ id, t: now, cd0: srv.cd[id] || 0, cooldown: ab.charges ? (ab.chargeGap ?? 0.6) : ab.cooldown, charge: !!ab.charges, ch0: srv.ch?.[id], confirmed: false, heard: false });
    if (this.acks.length > 10) this.acks.shift();
    if ((ab.kind === 'dodge' || ab.kind === 'dash') && ab.dash) {
      const pc = { m, id, ab, t0: now, aim: ab.kind === 'dodge' ? dir : aim, dir, aimPoint: { x: inp.aim.x, y: inp.aim.y } };
      if (ab.leap) pc.leapDist = Math.max(ab.minRange ?? 30, Math.min(ab.range, Math.hypot(inp.aim.x - pos.x, inp.aim.y - pos.y)));
      this.pc = pc;
      this.tail = null;
    }
    world.emit({ type: 'cast', m, ab: id, kind: ab.kind, purpose: ab.kind === 'dodge' ? 'dodge' : 'attack', x: pos.x, y: pos.y, local: true });
    return true;
  }

  // Refaz, a cada quadro, o estado mostrado do meu monstro: servidor + o que já sei localmente.
  overlay(world, now, rtt) {
    const m = world.active, srv = this.srv;
    if (!m || !srv || srv.m !== m) { this.pc = null; this.tail = null; this.acks.length = 0; return; }
    m.action = srv.action;
    const tol = (rtt + this.delay) / 1000;
    const limit = rtt + this.delay + BUFFER_MS + 250;
    this.acks = this.acks.filter((k) => (k.confirmed ? now - k.t < k.cooldown * 1000 + 1500 : now - k.t < limit));
    for (const id in srv.cd) m.cd[id] = Math.max(0, srv.cd[id] - tol, this.localCd(id, now));
    for (const id in srv.ch) { const ab = m.ability(id); if (ab) m.ch[id] = Math.max(0, this.chargesLeft(id, ab)); }

    const P = this.pc;
    if (P) {
      const ab = P.ab, e = (now - P.t0) / 1000;
      if (P.m !== m || !m.alive || !this.acks.some((k) => k.t === P.t0)) this.pc = null; // trocou ou o servidor recusou
      else if (e >= total(ab)) { this.pc = null; this.tail = { id: P.id, until: now + rtt + this.delay + 250, seen: false }; }
      else {
        const phase = e < ab.windup ? 'windup' : e < ab.windup + ab.active ? 'active' : 'recovery';
        const t = phase === 'windup' ? e : phase === 'active' ? e - ab.windup : e - ab.windup - ab.active;
        const sa = srv.action;
        m.action = {
          ab, phase, t, aim: P.aim, dir: P.dir, hit: new Set(), aimPoint: P.aimPoint, point: P.aimPoint,
          data: sa && sa.ab.id === P.id ? sa.data : {}, leapDist: P.leapDist, purpose: ab.kind === 'dodge' ? 'dodge' : 'attack', predicted: true,
        };
        m.facing = P.aim;
      }
    }
    if (!this.pc && this.tail) {
      const T = this.tail, sa = srv.action;
      if (now > T.until) this.tail = null;
      else if (sa && sa.ab.id === T.id) { T.seen = true; m.action = null; }
      else if (T.seen) this.tail = null;
    }
    // Sem habilidade em andamento: olha para o mouse já (o servidor confirma depois).
    if (!m.action && m.alive) {
      const p = this.drawnPos(m), inp = world.input;
      if (Math.hypot(inp.aim.x - p.x, inp.aim.y - p.y) > 2) m.facing = m.lookAt = Math.atan2(inp.aim.y - p.y, inp.aim.x - p.x);
    }
  }

  // Define m.lead (deslocamento sobre a posição interpolada) para o monstro do jogador.
  // `paused`: janela de menu aberta (sem entrada). `rtt` em ms.
  lead(now, dt, alpha, world, paused, rtt = 60) {
    rtt = Math.max(0, Math.min(400, rtt));
    this.overlay(world, now, rtt);
    const m = world.active, L = this.latest, pred = this.pred, hist = this.hist;
    if (!m || paused || !L || world.roster[L.idx] !== m) { if (m) m.lead = null; pred.init = false; hist.length = 0; return; }
    const inp = world.input, l = Math.hypot(inp.move.x, inp.move.y);
    // Livre = o servidor não mostra nenhuma ação que eu não esteja prevendo aqui.
    const sa = this.srv?.action;
    const mine = !sa || (this.pc && sa.ab.id === this.pc.id) || (this.tail && sa.ab.id === this.tail.id);
    const free = m.alive && mine && !m.switchState && !(m.evolveT > 0) && !(m.status.stun > 0) && !(m.status.root > 0) && !(m.lift > 0) && !world.over;
    const spd = m.def.speed * m.speedMult(world); // inclui o freio da fase da habilidade prevista
    // Esquiva/investida/salto previstos: velocidade fixa na fase ativa (como no servidor).
    const pa = free && m.action?.predicted ? m.action : null;
    let dvx, dvy, air = false;
    if (pa && pa.phase === 'active' && pa.ab.dash) {
      const sp = pa.leapDist != null ? pa.leapDist / pa.ab.active : pa.ab.dash.speed;
      dvx = Math.cos(pa.dir) * sp; dvy = Math.sin(pa.dir) * sp; air = !!pa.ab.leap;
    }
    const land = this.wasLeap && !air; // o salto finca no chão: velocidade zera ao cair
    this.wasLeap = air;
    const dashing = dvx !== undefined;
    const ux = free && !dashing && l ? inp.move.x / l : 0, uy = free && !dashing && l ? inp.move.y / l : 0;
    hist.push({ t: now, dt, ux, uy, spd, dvx, dvy, air, land });
    while (hist.length && now - hist[0].t > 1500) hist.shift();
    const ba = alpha > 1 && Math.abs(m.x - m.px) + Math.abs(m.y - m.py) > 24 ? 1 : alpha;
    const base = { x: m.px + (m.x - m.px) * ba, y: m.py + (m.y - m.py) * ba };
    const move = (s, vx, vy, d, through) => {
      const nx = s.x + vx * d, ny = s.y + vy * d;
      if (through || world.standable(m, nx, ny)) { s.x = nx; s.y = ny; return true; }
      if (world.standable(m, nx, s.y)) { s.x = nx; return true; }
      if (world.standable(m, s.x, ny)) { s.y = ny; return true; }
      return false;
    };

    // Alvo = estado mais novo do servidor + o que as minhas entradas ainda não confirmadas vão fazer.
    let tx, ty;
    if (free) {
      const s = { x: L.x, y: L.y };
      let vx = L.vx, vy = L.vy;
      for (const e of hist) {
        if (e.t < L.recv - rtt) continue;
        if (e.land) { vx = 0; vy = 0; }
        if (e.dvx !== undefined) { vx = e.dvx; vy = e.dvy; } else { vx = stepVel(vx, e.ux * e.spd, e.dt); vy = stepVel(vy, e.uy * e.spd, e.dt); }
        if (!move(s, vx, vy, e.dt, e.air)) { vx = 0; vy = 0; }
      }
      tx = s.x; ty = s.y;
    } else {
      const t = Math.min(0.25, (now - L.recv + rtt / 2) / 1000);
      tx = L.x + L.vx * t; ty = L.y + L.vy * t;
    }

    if (!pred.init || Math.hypot(tx - pred.x, ty - pred.y) > (dashing ? 140 : 50)) { pred.x = tx; pred.y = ty; pred.vx = L.vx; pred.vy = L.vy; pred.init = true; }
    else {
      if (free) { // integra localmente com a mesma física (resposta imediata às teclas)
        if (land) { pred.vx = 0; pred.vy = 0; }
        if (dashing) { pred.vx = dvx; pred.vy = dvy; } else { pred.vx = stepVel(pred.vx, ux * spd, dt); pred.vy = stepVel(pred.vy, uy * spd, dt); }
        if (!move(pred, pred.vx, pred.vy, dt, air)) { pred.vx = 0; pred.vy = 0; }
      }
      const k = 1 - Math.exp(-dt * (free ? 8 : 14));
      pred.x += (tx - pred.x) * k; pred.y += (ty - pred.y) * k;
    }
    m.lead = { x: pred.x - base.x, y: pred.y - base.y };
  }
}
