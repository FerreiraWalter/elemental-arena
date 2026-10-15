// Suavização de rede do cliente (sem DOM: roda no navegador e nos testes).
// 1) Buffer de interpolação: os snapshots chegam irregulares pela internet; em vez de desenhar o que chegou "agora"
//    (o que trava e dá saltos), desenhamos o mundo ~2 snapshots no passado, interpolando entre dois snapshots reais.
//    O atraso se adapta ao jitter medido (mín. 50 ms, máx. 160 ms).
// 2) Predição do PRÓPRIO monstro: ele é desenhado onde o servidor o colocará com as teclas que você já apertou
//    (reaplica as entradas ainda não confirmadas sobre o estado mais novo do servidor, com a mesma física de
//    aceleração) e é corrigido suavemente. Em golpes, esquivas e empurrões usa a velocidade do servidor.
import { applySnapshot, SNAP_HZ } from './snapshot.js';

const SNAP_MS = 1000 / SNAP_HZ;
const stepVel = (v, target, dt) => v + (target - v) * Math.min(1, 12 * dt);

export class NetSmoother {
  constructor() { this.reset(); }

  reset() {
    this.q = []; // snapshots recebidos, ainda não aplicados
    this.off = null; this.jitter = 0; this.lastRecv = 0; // relógio do servidor e jitter (ms)
    this.prevT = null; this.curT = null; // tempos (s do servidor) dos snapshots anterior/atual aplicados
    this.latest = null; // estado mais novo do meu monstro
    this.hist = []; // entradas recentes { t, dt, ux, uy, spd }
    this.pred = { init: false, x: 0, y: 0, vx: 0, vy: 0 };
  }

  enqueue(s, now, world) {
    const sample = now - s.time * 1000;
    if (this.off === null || sample < this.off) this.off = sample; else this.off += (sample - this.off) * 0.002;
    if (this.lastRecv) this.jitter = this.jitter * 0.9 + Math.abs(now - this.lastRecv - SNAP_MS) * 0.1;
    this.lastRecv = now;
    this.q.push(s);
    if (this.q.length > 40) this.q.splice(0, this.q.length - 40);
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
    if (this.curT === null && this.q.length) {
      const s = this.q.shift();
      this.curT = s.time; this.prevT = s.time - 1 / SNAP_HZ;
      applySnapshot(world, s, ctx);
    }
    while (this.q.length && (renderT >= this.curT || this.q.length > 6)) {
      const s = this.q.shift();
      this.prevT = this.curT; this.curT = s.time;
      applySnapshot(world, s, ctx);
    }
    if (this.curT === null || this.curT <= this.prevT) return 1;
    return Math.max(0, Math.min(1, (renderT - this.prevT) / (this.curT - this.prevT)));
  }

  // Define m.lead (deslocamento sobre a posição interpolada) para o monstro do jogador.
  // `paused`: janela de menu aberta (sem entrada). `rtt` em ms.
  lead(now, dt, alpha, world, paused, rtt = 60) {
    const m = world.active, L = this.latest, pred = this.pred, hist = this.hist;
    if (!m || paused || !L || world.roster[L.idx] !== m) { if (m) m.lead = null; pred.init = false; hist.length = 0; return; }
    const inp = world.input, l = Math.hypot(inp.move.x, inp.move.y);
    const free = m.alive && !m.action && !m.switchState && !(m.evolveT > 0) && !(m.status.stun > 0) && !(m.status.root > 0) && !(m.lift > 0) && !world.over;
    const spd = m.def.speed * m.speedMult(world);
    const ux = free && l ? inp.move.x / l : 0, uy = free && l ? inp.move.y / l : 0;
    hist.push({ t: now, dt, ux, uy, spd });
    while (hist.length && now - hist[0].t > 1200) hist.shift();
    rtt = Math.max(0, Math.min(400, rtt));
    const base = { x: m.px + (m.x - m.px) * alpha, y: m.py + (m.y - m.py) * alpha };

    // Alvo = estado mais novo do servidor + o que as minhas entradas ainda não confirmadas vão fazer.
    let tx, ty;
    if (free) {
      let x = L.x, y = L.y, vx = L.vx, vy = L.vy;
      for (const e of hist) {
        if (e.t < L.recv - rtt) continue;
        vx = stepVel(vx, e.ux * e.spd, e.dt); vy = stepVel(vy, e.uy * e.spd, e.dt);
        const nx = x + vx * e.dt, ny = y + vy * e.dt;
        if (world.standable(m, nx, ny)) { x = nx; y = ny; } else if (world.standable(m, nx, y)) x = nx; else if (world.standable(m, x, ny)) y = ny; else { vx = 0; vy = 0; }
      }
      tx = x; ty = y;
    } else {
      const t = Math.min(0.25, (now - L.recv + rtt / 2) / 1000);
      tx = L.x + L.vx * t; ty = L.y + L.vy * t;
    }

    if (!pred.init || Math.hypot(tx - pred.x, ty - pred.y) > 50) { pred.x = tx; pred.y = ty; pred.vx = L.vx; pred.vy = L.vy; pred.init = true; }
    else {
      if (free) { // integra localmente com a mesma física (resposta imediata às teclas)
        pred.vx = stepVel(pred.vx, ux * spd, dt); pred.vy = stepVel(pred.vy, uy * spd, dt);
        const nx = pred.x + pred.vx * dt, ny = pred.y + pred.vy * dt;
        if (world.standable(m, nx, ny)) { pred.x = nx; pred.y = ny; } else if (world.standable(m, nx, pred.y)) pred.x = nx; else if (world.standable(m, pred.x, ny)) pred.y = ny; else { pred.vx = 0; pred.vy = 0; }
      }
      const k = 1 - Math.exp(-dt * (free ? 8 : 14));
      pred.x += (tx - pred.x) * k; pred.y += (ty - pred.y) * k;
    }
    m.lead = { x: pred.x - base.x, y: pred.y - base.y };
  }
}
