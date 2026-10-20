import { TAU, angleDiff, pointSeg, clamp } from '../core/math.js';
import { TILE, ELEMENT_MULT, WORLD_W, WORLD_H } from '../config.js';
import { props } from '../sim/tiles.js';
import { EVOLUTION } from '../config.js';
import { TACTICS } from './tactics.js';
import { PathGrid } from './path.js';

// Máquina de estados + "context steering": o estado decide a intenção (aproximar, manter distância,
// recuar, fugir de perigo...) e o steering avalia 16 direções contra obstáculos, terreno perigoso,
// projéteis vindo e áreas telegrafadas, escolhendo o melhor movimento a cada passo.

export const STATE_LABEL = {
  observe: 'Observando', acquire: 'Adquirindo alvo', approach: 'Aproximando', strafe: 'Mantendo distância',
  kite: 'Recuando taticamente', attack: 'Atacando', evade: 'Esquivando', escapeHazard: 'Fugindo do perigo',
  retreat: 'Recuando (vida baixa)', recover: 'Atordoado', search: 'Procurando alvo', flank: 'Flanqueando',
  protect: 'Protegendo aliado', switchTarget: 'Trocando de alvo', controlTerrain: 'Controlando terreno', victory: 'Vitória!',
  human: 'Jogador', player: 'Controlado por você', rooted: 'Enraizado', switching: 'Trocando',
};

const DIRS = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos((i / 16) * TAU), y: Math.sin((i / 16) * TAU) }));
const SKILL_BIAS = 0.2; // preferência da IA por habilidades Q/E/F sobre o golpe básico
const PROBES = [[8, 2, 1], [16, 0.8, 0.6], [28, 0.3, 0.3]]; // distância, peso de bloqueio, peso de terreno

export class Brain {
  constructor(m, w) {
    this.m = m;
    this.w = w;
    this.mods = null; // modificadores de dificuldade
    this.applyProfile();
    this.state = 'observe';
    this.mode = 'strafe'; // modo de locomoção subjacente (mantido durante ataques)
    this.stateT = 0;
    this.thinkT = 0.3 + w.rng() * 0.3;
    this.target = null;
    this.mem = new Map();
    this.threats = [];
    this.rolled = new Set();
    this.strafeSign = w.rng() < 0.5 ? 1 : -1;
    this.strafeT = 1.5;
    this.goalPt = null;
    this.dir = { x: 0, y: 0 };
    this.evadeDir = null;
    this.evadeT = 0;
    this.retreatCd = 0;
    this.flankT = 0;
    this.unstick = null;
    this.stuckCheck = { x: m.x, y: m.y, t: 0 };
    this.entries = {};
    this.debug = { scores: new Float32Array(16), goal: null, pick: -1 };
  }

  // Perfil da forma atual (muda ao evoluir), com os modificadores de dificuldade.
  applyProfile() {
    const p = { ...this.m.def.profile };
    if (this.mods) for (const k in this.mods) p[k] = (p[k] ?? 1) * this.mods[k];
    this.p = p;
  }

  // Evolução tática: evolui quando a energia enche e não há ameaça iminente.
  considerEvolve() {
    const m = this.m, w = this.w;
    if (!m.canEvolve || m.action || m.locked) return;
    if (this.threats.some((th) => th.time < 0.8)) return;
    const foe = this.target;
    const d = foe ? Math.hypot(foe.x - m.x, foe.y - m.y) : 999;
    const hpF = m.hp / m.maxHp;
    // Com vida baixa evolui logo (a forma nova tem mais vida máxima); senão espera uma janela segura.
    if (hpF < 0.5 || d > 70 || foe?.locked || (foe?.action && foe.action.phase === 'recovery')) w.requestEvolve(m);
  }

  // Chamado quando o jogador devolve o controle deste monstro para a IA.
  resume() {
    this.state = 'acquire';
    this.stateT = 0;
    this.mode = 'strafe';
    this.goalPt = null;
    this.thinkT = 0;
    this.evadeT = 0;
    this.rolled.clear();
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    this.entries[s] = (this.entries[s] || 0) + 1;
    this.w.emit({ type: 'state', m: this.m, state: s });
  }

  update(dt) {
    const m = this.m, w = this.w;
    this.stateT += dt;
    this.retreatCd -= dt;
    this.thinkT -= dt;
    this.evadeT -= dt;
    this.flankT -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = 1.2 + w.rng() * 1.6;
      if (w.rng() < 0.55) this.strafeSign *= -1;
    }
    m.stats.states[this.state] = (m.stats.states[this.state] || 0) + dt;
    this.perceive();
    if (w.over) { this.setState('victory'); m.move.throttle = 0; return; }
    if (m.status.stun > 0) { this.setState('recover'); m.move.throttle = 0; return; }
    if (this.state === 'recover') this.setState('acquire');

    this.scanThreats();
    this.considerEvolve();
    if (m.locked) { m.move.throttle = 0; return; }
    this.reactToThreats();
    if (this.thinkT <= 0) { this.thinkT = (0.1 + w.rng() * 0.08) * (this.p.think ?? 1); this.think(); }

    // Rastreio da mira durante a preparação/ativação de uma habilidade.
    const a = m.action;
    if (a && a.target && a.target.alive && a.target.onField) {
      if (a.ab.kind === 'lob') {
        const left = a.phase === 'windup' ? a.ab.windup - a.t : 0;
        a.point = this.predict(a.target, Infinity, left + a.ab.flight);
        a.aimPoint = a.point;
      } else {
        a.aimPoint = this.aimAt(a.target, a.ab.speed || Infinity, a);
      }
    }
    this.steer(dt);
  }

  // ───────────── Percepção ─────────────
  perceive() {
    const m = this.m, w = this.w;
    for (const e of w.monsters) {
      if (e.team === m.team) continue;
      let mem = this.mem.get(e.id);
      if (!mem) { mem = { x: e.x, y: e.y, vx: 0, vy: 0, seenT: w.time, visible: true }; this.mem.set(e.id, mem); }
      // Ilusões de Tinta: enganada, a IA "vê" a cópia no lugar do monstro de verdade até ela estourar.
      if (this.fooled && this.fooled.owner === e.id) {
        const d = w.decoys.find((x) => x.id === this.fooled.decoy);
        if (d) {
          mem.visible = w.los(m.x, m.y, d.x, d.y);
          if (mem.visible) { mem.x = d.x; mem.y = d.y; mem.vx = d.vx; mem.vy = d.vy; mem.seenT = w.time; }
          continue;
        }
        this.fooled = null;
      }
      // Camuflado: só é percebido muito de perto.
      if (e.status.cloak > 0 && Math.hypot(e.x - m.x, e.y - m.y) > 30) { mem.visible = false; continue; }
      mem.visible = e.alive && w.los(m.x, m.y, e.x, e.y);
      if (mem.visible) {
        mem.x = e.x; mem.y = e.y;
        mem.vx = mem.vx * 0.7 + (e.vx + e.kx * 0.5) * 0.3;
        mem.vy = mem.vy * 0.7 + (e.vy + e.ky * 0.5) * 0.3;
        mem.seenT = w.time;
      } else if (e.alive && w.time - mem.seenT > 2.5 && w.time - (mem.heardT || 0) > 1.5) {
        // Sem ver há um tempo: "ouve" a posição aproximada do inimigo (evita procurar para sempre).
        mem.x = e.x; mem.y = e.y; mem.vx = mem.vy = 0;
        mem.heardT = w.time;
      }
    }
  }

  chooseTarget() {
    const m = this.m, w = this.w;
    const enemies = w.enemiesOf(m);
    if (!enemies.length) { this.target = null; return; }
    // Proteger aliado ferido tem prioridade.
    for (const ally of w.alliesOf(m)) {
      if (ally.hp / ally.maxHp > 0.4) continue;
      const threat = enemies.find((e) => Math.hypot(e.x - ally.x, e.y - ally.y) < 70);
      if (threat) { this.protecting = ally; this.target = threat; return; }
    }
    this.protecting = null;
    let best = null, bestS = -Infinity;
    for (const e of enemies) {
      const mem = this.mem.get(e.id);
      const d = Math.hypot(mem.x - m.x, mem.y - m.y);
      let s = -d / 100 + (1 - e.hp / e.maxHp) * 0.8 + (mem.visible ? 0.5 : 0);
      if ((ELEMENT_MULT[m.element]?.[e.element] ?? 1) > 1) s += 0.3;
      if (e.ai?.target === m) s += 0.3;
      if (e === this.target) s += 0.6;
      if (s > bestS) { bestS = s; best = e; }
    }
    if (this.target && this.target !== best && this.target.alive) this.setState('switchTarget');
    this.target = best;
  }

  // Projéteis e ataques telegrafados que ameaçam este monstro (respeitando o tempo de reação).
  scanThreats() {
    const m = this.m, w = this.w;
    const out = [];
    const react = this.p.reaction;
    for (const p of w.projectiles) {
      if (p.team === m.team) continue;
      if (p.lob) {
        const left = p.flight - p.t;
        if (p.t < react * 0.8) continue;
        if (Math.hypot(m.x - p.tx, m.y - p.ty) < p.radius + m.r + 8) out.push({ kind: 'zone', key: 'p' + p.id, x: p.tx, y: p.ty, r: p.radius + m.r + 8, time: left });
        continue;
      }
      if (p.age < react) continue;
      const rx = p.x - m.x, ry = p.y - m.y;
      const vv = p.vx * p.vx + p.vy * p.vy;
      const tc = -(rx * p.vx + ry * p.vy) / vv;
      if (tc < 0 || tc > 0.8) continue;
      const mx = rx + p.vx * tc, my = ry + p.vy * tc;
      const miss = Math.hypot(mx, my);
      if (miss > m.r + p.r + 6) continue;
      out.push({ kind: 'proj', key: 'p' + p.id, p, time: tc, vx: p.vx, vy: p.vy, ox: -mx, oy: -my });
    }
    for (const e of w.enemiesOf(m)) {
      const a = e.action;
      if (!a || a.phase === 'recovery') continue;
      if (a.phase === 'windup' && a.t < react) continue;
      const ab = a.ab, key = 'a' + e.id + ':' + ab.id + ':' + e.stats.casts;
      if (ab.harmless) continue;
      const left = a.phase === 'windup' ? ab.windup - a.t : 0;
      const d = Math.hypot(m.x - e.x, m.y - e.y);
      const ang = Math.atan2(m.y - e.y, m.x - e.x);
      if (ab.kind === 'cone') {
        if (d < ab.len + m.r + 14 && Math.abs(angleDiff(a.aim, ang)) < ab.half + 0.35) out.push({ kind: 'cone', key, e, aim: a.aim, time: left });
      } else if (ab.kind === 'beam') {
        const ex = e.x + Math.cos(a.aim) * ab.range, ey = e.y + Math.sin(a.aim) * ab.range;
        if (pointSeg(m.x, m.y, e.x, e.y, ex, ey).d < ab.width + m.r + 10) out.push({ kind: 'beam', key, e, aim: a.aim, time: left });
      } else if (ab.kind === 'aoe') {
        if (d < ab.radius + m.r + 12) out.push({ kind: 'zone', key, x: e.x, y: e.y, r: ab.radius + m.r + 12, time: left });
      } else if (ab.kind === 'melee' && a.phase === 'windup') {
        if (d < e.r + ab.range + m.r + 10) out.push({ kind: 'melee', key, e, aim: a.aim, time: left });
      } else if (ab.kind === 'dash' && a.phase === 'windup') {
        if (d < 130 && Math.abs(angleDiff(a.aim, ang)) < 0.4) out.push({ kind: 'beam', key, e, aim: a.aim, time: left });
      }
    }
    for (const h of w.hazards) { const th = h.threat(m); if (th) out.push(th); }
    out.sort((a, b) => a.time - b.time);
    this.threats = out;
  }

  evadeDirection(th) {
    const m = this.m;
    let cand;
    if (th.kind === 'proj') {
      const l = Math.hypot(th.vx, th.vy);
      const px = -th.vy / l, py = th.vx / l;
      const s = (th.ox * px + th.oy * py) >= 0 ? 1 : -1;
      cand = [{ x: px * s, y: py * s }, { x: -px * s, y: -py * s }];
    } else if (th.kind === 'zone') {
      const dx = m.x - th.x, dy = m.y - th.y, d = Math.hypot(dx, dy);
      const a = d > 1 ? Math.atan2(dy, dx) : this.w.rng() * TAU;
      cand = [{ x: Math.cos(a), y: Math.sin(a) }, { x: Math.cos(a + 0.9), y: Math.sin(a + 0.9) }, { x: Math.cos(a - 0.9), y: Math.sin(a - 0.9) }];
    } else {
      const ex = Math.cos(th.aim), ey = Math.sin(th.aim);
      const px = -ey, py = ex;
      const side = ((m.x - th.e.x) * px + (m.y - th.e.y) * py) >= 0 ? 1 : -1;
      const back = th.kind === 'melee' ? 0.6 : 0.15;
      cand = [{ x: px * side + ex * back, y: py * side + ey * back }, { x: -px * side + ex * back, y: -py * side + ey * back }];
    }
    let best = cand[0], bestS = -Infinity;
    for (const c of cand) {
      const l = Math.hypot(c.x, c.y) || 1;
      c.x /= l; c.y /= l;
      let s = 0;
      for (const k of [14, 30, 48]) {
        const x = m.x + c.x * k, y = m.y + c.y * k;
        if (this.w.blockedFor(m, x, y, m.r * 0.8)) s -= 2;
        else s -= this.tileCost(x, y);
      }
      if (s > bestS) { bestS = s; best = c; }
    }
    return best;
  }

  reactToThreats() {
    const m = this.m, w = this.w;
    const th = this.threats[0];
    if (!th || m.action) return;
    const dir = this.evadeDirection(th);
    const dodge = m.def.dodge;
    // Casco Reflexo: contra golpe de perto ou projétil prestes a acertar, bloquear (e devolver) vale mais que fugir.
    const guard = m.def.abilities.find((ab) => ab.kind === 'guard');
    if (guard && th.time < 0.28 && (th.kind === 'melee' || th.kind === 'proj' || th.kind === 'beam' || th.kind === 'cone') && !this.rolled.has('g' + th.key) && m.ready(guard.id)) {
      this.rolled.add('g' + th.key);
      if (w.rng() < this.p.dodgeSkill * 0.95) {
        m.cast(w, guard, { aim: m.facing, purpose: 'defend' });
        this.setState('evade');
        return;
      }
    }
    if (th.time < 0.34 && !this.rolled.has(th.key)) {
      this.rolled.add(th.key);
      if (m.ready(dodge.id) && w.rng() < this.p.dodgeSkill) {
        m.cast(w, dodge, { dir: Math.atan2(dir.y, dir.x), purpose: 'dodge' });
        w.emit({ type: 'dodge', m, threat: th.kind, x: m.x, y: m.y });
        this.setState('evade');
        this.evadeT = 0.3;
        this.evadeDir = dir;
        return;
      }
    }
    if (th.time < 0.7) {
      this.evadeDir = dir;
      this.evadeT = Math.max(this.evadeT, 0.22);
      this.setState('evade');
    }
    if (this.rolled.size > 64) this.rolled.clear();
  }

  // ───────────── Decisão ─────────────
  context() {
    const m = this.m, w = this.w, t = this.target;
    const mem = this.mem.get(t.id);
    const tr = w.terrain;
    const d = Math.hypot(mem.x - m.x, mem.y - m.y);
    const ta = t.action;
    const c = {
      w, m, t, mem, d, rng: w.rng, brain: this,
      vis: mem.visible, sinceSeen: w.time - mem.seenT,
      hpF: m.hp / m.maxHp, thpF: t.hp / t.maxHp,
      tBusy: t.status.stun > 0 || (ta && ta.phase !== 'active' && ta.ab.kind !== 'dodge'),
      tChanneling: !!ta && (ta.ab.kind === 'beam' || ta.ab.kind === 'aoe' || ta.ab.kind === 'cone'),
      tWhirl: !!ta && ta.ab.kind === 'aoe',
      tSpeed: Math.hypot(mem.vx, mem.vy),
      tOnFire: tr.fire[tr.at(t.x, t.y)] > 0,
      tRetreating: t.ai?.state === 'retreat',
      onWater: !!props(tr.type[tr.at(m.x, m.y)]).water,
      hazardHere: this.tileCost(m.x, m.y),
      inEnemyArea: this.threats.some((th) => th.kind === 'zone' || th.kind === 'beam' || th.kind === 'cone'),
      embersIncoming: this.threats.filter((th) => th.kind === 'proj').length,
      tGuarding: t.action?.ab.kind === 'guard' && t.action.phase === 'active',
      heatFull: m.heat > 70,
      mySentries: w.obstacles.filter((o) => o.sentry && o.owner === m && !o.destroyed).length,
    };
    // Exausto (Fornalha) é janela de ataque: conta como ocupado.
    if (t.status.exhaust > 0) c.tBusy = true;
    const away = Math.atan2(m.y - mem.y, m.x - mem.x);
    c.awayPoint = { x: m.x + Math.cos(away) * 80, y: m.y + Math.sin(away) * 80 };
    // Fogo perto de mim (para a água apagar) e vegetação perto do alvo (para o fogo incendiar).
    let fx = 0, fy = 0, fn = 0;
    for (const i of tr.burning) {
      const x = tr.cx(i), y = tr.cy(i);
      if (Math.hypot(x - m.x, y - m.y) < 40) { fx += x; fy += y; fn++; }
    }
    c.fireNearMe = fn;
    c.fireCluster = fn ? { x: fx / fn, y: fy / fn } : null;
    let best = null, bestD = Infinity, fuelN = 0;
    const c0 = Math.floor((mem.x - 28) / TILE), r0 = Math.floor((mem.y - 28) / TILE);
    for (let r = r0; r <= r0 + 7; r++) for (let cc = c0; cc <= c0 + 7; cc++) {
      const i = tr.idx(cc, r);
      if (i < 0 || !tr.isFlammable(i) || tr.fire[i] > 0 || tr.wet[i] > 0) continue;
      fuelN++;
      const x = tr.cx(i), y = tr.cy(i);
      const dd = Math.hypot(x - mem.x, y - mem.y);
      if (dd < bestD) { bestD = dd; best = { x, y }; }
    }
    c.fuelNearTarget = fuelN;
    c.fuelTileNearTarget = best;
    c.fuelTileVisible = best ? w.los(m.x, m.y, best.x, best.y) && Math.hypot(best.x - m.x, best.y - m.y) < 200 : false;
    if (c.hazardHere > 0 || c.onWater) c.safePoint = c.safeDryPoint = this.findSafeTile();
    return c;
  }

  think() {
    const m = this.m, w = this.w;
    this.chooseTarget();
    if (!this.target) { this.setState('observe'); this.mode = 'hold'; return; }
    if (this.state === 'observe' && this.stateT < 0.5) { this.mode = 'hold'; return; }
    const c = this.context();
    this.ctx = c;

    // 1) Habilidades (o movimento continua em paralelo, limitado pela fase da habilidade).
    // Desviando de algo iminente (< 0,3 s) não ataca; com ameaça mais distante, revida enquanto se move.
    const urgent = this.evadeT > 0 && this.threats.length && this.threats[0].time < 0.3;
    if (!m.busy && !urgent) {
      const pick = this.pickAbility(c);
      if (pick) {
        const ab = pick.ab;
        const aimPoint = pick.aimPoint || pick.point || (pick.target ? this.aimAt(pick.target, ab.speed || Infinity, null) : null);
        const aim = aimPoint ? Math.atan2(aimPoint.y - m.y, aimPoint.x - m.x) : m.facing;
        const ok = m.cast(w, ab, {
          aim, aimPoint, target: pick.aimPoint || pick.point ? null : pick.target, dir: aim,
          point: pick.point || (pick.lob ? this.predict(pick.target, Infinity, ab.windup + ab.flight) : null),
          purpose: pick.purpose || 'attack',
        });
        if (ok) {
          m.action.data.jitter = (w.rng() + w.rng() - 1) * this.p.accuracy * 1.6;
          this.setState(pick.purpose === 'terrain' ? 'controlTerrain' : pick.purpose === 'escape' ? 'escapeHazard' : 'attack');
        }
      }
    }

    // 2) Intenção de movimento.
    if (this.evadeT > 0) { this.mode = 'evade'; return; }
    const elemental = m.element !== 'fire';
    if (c.hazardHere > 0.3 && (elemental || c.onWater)) {
      this.goalPt = c.safePoint || this.findSafeTile();
      this.mode = 'goto';
      if (!m.action) this.setState('escapeHazard');
      return;
    }
    if (this.state === 'retreat') {
      const done = c.hpF > this.p.retreatHp + 0.2 || this.stateT > 7 || (c.d < 30 && c.vis) || w.suddenDeath;
      if (done) { this.retreatCd = 12; this.setState('acquire'); }
      else { this.goalPt = this.retreatPoint(c) || this.goalPt; this.mode = 'goto'; return; }
    } else if (c.hpF < this.p.retreatHp && this.retreatCd <= 0 && c.d < 160 && !w.suddenDeath) {
      const rp = this.retreatPoint(c);
      if (rp) { this.goalPt = rp; this.mode = 'goto'; this.setState('retreat'); return; }
    }
    if (this.protecting) {
      const a = this.protecting, e = this.target;
      this.goalPt = { x: (a.x + e.x) / 2, y: (a.y + e.y) / 2 };
      this.mode = 'goto';
      if (!m.action) this.setState('protect');
      return;
    }
    if (!c.vis) {
      if (c.sinceSeen < 3) {
        if (this.flankT <= 0 || !this.goalPt) { this.flankT = 0.6; this.goalPt = this.flankPoint(c) || { x: c.mem.x, y: c.mem.y }; }
        this.mode = 'goto';
        if (!m.action) this.setState('flank');
      } else {
        this.goalPt = { x: c.mem.x, y: c.mem.y };
        this.mode = 'goto';
        if (!m.action) this.setState('search');
      }
      return;
    }
    const [lo, hi] = this.desiredRange(c);
    this.range = [lo, hi];
    if (c.d > hi) { this.mode = 'approach'; if (!m.action) this.setState('approach'); }
    else if (c.d < lo) { this.mode = 'kite'; if (!m.action) this.setState('kite'); }
    else { this.mode = 'strafe'; if (!m.action) this.setState('strafe'); }
  }

  pickAbility(c) {
    const m = this.m, w = this.w;
    let best = null, bestS = 0.3;
    for (const ab of m.def.abilities) {
      if (ab.kind === 'dodge' && ab !== m.def.dodge) continue;
      if (!m.ready(ab.id)) continue;
      const f = TACTICS[ab.id];
      const r = f && f(c);
      if (!r) continue;
      // Combate focado em skills: com uma habilidade Q/E/F boa disponível, a IA a prefere ao golpe básico
      // (como um jogador faria). Ataques que não causam dano (cura, buff) não ganham o bônus.
      const ctl = m.def.controls;
      const skill = ab.id === ctl.q || ab.id === ctl.e || ab.id === ctl.f;
      const s = r.score + (skill && r.purpose !== 'escape' ? SKILL_BIAS : 0) + (w.rng() - 0.5) * 0.16;
      if (s > bestS) { bestS = s; best = { ...r, ab }; }
    }
    return best;
  }

  desiredRange(c) {
    const m = this.m;
    const ctl = m.def.controls;
    const k = m.def.sig?.kind;
    // Fornalha: exausto, recua; inimigo superaquecido ou em disparada, dá espaço.
    if (m.status.exhaust > 0) return [80, 150];
    if (m.status.overheat > 0) return [0, m.r + c.t.r + 14]; // superaquecido: hora de pressionar de perto
    if (m.element !== 'fire' && (c.t.status.overheat > 0 || c.t.charged) && c.hpF < 0.8) return [70, 140];
    if (c.tGuarding) return [50, 110];
    // Ímpeto: sem carga, circula de longe (correr enche a barra); carregado, entra para o golpe.
    if (k === 'momentum') {
      if (m.charged || c.thpF < 0.25) return [0, m.r + c.t.r + 10];
      return [55, 115];
    }
    // Marca do Louva-a-deus: com 3 marcas no alvo, aproxima para executar.
    if (k === 'marks' && c.t.marks?.by === m.id && c.t.marks.n >= 3) return [0, m.r + c.t.r + 20];
    if (m.element === 'fire') {
      if (c.tWhirl) return [62, 120];
      const meleeReady = m.cd[ctl.melee] < 0.25 || m.cd[ctl.q] <= 0;
      if (meleeReady || c.thpF < 0.3) return [0, c.m.r + c.t.r + 12];
      return [40, 100];
    }
    const [lo, hi] = this.p.range;
    if (m.element === 'plant') {
      if (c.t.element === 'fire') return [80, 140]; // contra fogo, mantém distância e prende com raízes
      return m.cd[ctl.melee] <= 0 && c.d < 60 ? [0, 30] : [lo, hi];
    }
    if (m.cd[ctl.e] <= 0 && c.d < 60) return [0, hi];
    if (c.thpF < 0.25 && c.hpF > 0.5) return [30, 100];
    if (m.cd[ctl.q] <= 0.3) return [lo + 10, hi];
    return [lo, hi];
  }

  // ───────────── Pontos de interesse ─────────────
  tileCost(x, y) {
    const tr = this.w.terrain;
    const i = tr.at(x, y);
    if (i < 0) return 1;
    let c = 0;
    if (tr.fire[i] > 0) c += this.p.fireCost * (this.m.element === 'fire' && this.m.hp / this.m.maxHp > 0.7 ? 0.3 : 1);
    else if (tr.heat[i] > 0.4 && this.p.fireCost > 0) c += this.p.fireCost * 0.4;
    if (tr.roots[i] > 0 && this.m.element !== 'plant') c += 0.45;
    const p = props(tr.type[i]);
    if (p.thorns && this.m.element !== 'plant') c += 0.6;
    if (p.slow && this.m.element !== 'plant') c += 0.12;
    if (p.water) c += this.p.waterCost;
    else if (tr.wet[i] > 0) c += this.p.wetCost;
    return c;
  }

  findSafeTile() {
    const m = this.m, tr = this.w.terrain;
    const c0 = Math.floor(m.x / TILE), r0 = Math.floor(m.y / TILE);
    let best = null, bestS = Infinity;
    for (let r = r0 - 7; r <= r0 + 7; r++) for (let c = c0 - 7; c <= c0 + 7; c++) {
      const i = tr.idx(c, r);
      if (i < 0) continue;
      const x = c * TILE + 4, y = r * TILE + 4;
      if (this.tileCost(x, y) > 0.05 || this.w.blockedFor(m, x, y, m.r * 0.8)) continue;
      // Prefere tiles cujos vizinhos também sejam seguros, e longe do inimigo.
      let ring = 0;
      for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) ring += Math.max(0, this.tileCost(x + dx, y + dy));
      let s = Math.hypot(x - m.x, y - m.y) + ring * 20;
      if (this.target) s -= Math.min(60, Math.hypot(x - this.target.x, y - this.target.y)) * 0.2;
      if (s < bestS) { bestS = s; best = { x, y }; }
    }
    return best;
  }

  retreatPoint(c) {
    const m = this.m, w = this.w, tr = w.terrain;
    let best = null, bestS = Infinity;
    if (m.element === 'water') {
      for (const i of w.waterTiles) {
        const x = tr.cx(i), y = tr.cy(i);
        const s = Math.hypot(x - m.x, y - m.y) - 0.8 * Math.hypot(x - c.mem.x, y - c.mem.y);
        if (s < bestS) { bestS = s; best = { x, y }; }
      }
    } else if (m.element === 'plant') {
      const sentry = w.obstacles.find((o) => o.sentry && o.owner === m && !o.destroyed);
      if (sentry) return { x: sentry.x + Math.sign(m.x - sentry.x || 1) * 18, y: sentry.y + 10 };
      const c0 = Math.floor(m.x / TILE), r0 = Math.floor(m.y / TILE);
      for (let r = r0 - 14; r <= r0 + 14; r += 2) for (let cc = c0 - 14; cc <= c0 + 14; cc += 2) {
        const i = tr.idx(cc, r);
        if (i < 0 || !props(tr.type[i]).vegetation || tr.fire[i] > 0 || tr.heat[i] > 0) continue;
        const x = tr.cx(i), y = tr.cy(i);
        const s = Math.hypot(x - m.x, y - m.y) - 0.6 * Math.hypot(x - c.mem.x, y - c.mem.y);
        if (s < bestS) { bestS = s; best = { x, y }; }
      }
    } else if (m.element === 'fire') {
      for (const i of tr.burning) {
        if (tr.fire[i] < 2) continue;
        const x = tr.cx(i), y = tr.cy(i);
        const dm = Math.hypot(x - m.x, y - m.y);
        if (dm > 200) continue;
        const s = dm - 0.5 * Math.hypot(x - c.mem.x, y - c.mem.y);
        if (s < bestS) { bestS = s; best = { x, y }; }
      }
    }
    return best;
  }

  flankPoint(c) {
    const m = this.m, w = this.w;
    const [lo, hi] = this.range || this.p.range;
    const R = clamp((lo + hi) / 2, 40, 130);
    let best = null, bestS = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const x = c.mem.x + Math.cos(a) * R, y = c.mem.y + Math.sin(a) * R;
      if (w.blockedFor(m, x, y, m.r) || this.tileCost(x, y) > 0.5) continue;
      if (!w.los(x, y, c.mem.x, c.mem.y)) continue;
      const s = -Math.hypot(x - m.x, y - m.y);
      if (s > bestS) { bestS = s; best = { x, y }; }
    }
    return best;
  }

  predict(e, speed, extraT = 0) {
    const mem = this.mem.get(e.id);
    const m = this.m;
    const lead = this.p.lead;
    let t = extraT + (speed === Infinity ? 0 : Math.hypot(mem.x - m.x, mem.y - m.y) / speed);
    let x = mem.x, y = mem.y;
    for (let k = 0; k < 2; k++) {
      x = mem.x + mem.vx * lead * t;
      y = mem.y + mem.vy * lead * t;
      if (speed !== Infinity) t = extraT + Math.hypot(x - m.x, y - m.y) / speed;
    }
    return { x: clamp(x, 8, WORLD_W - 8), y: clamp(y, 8, WORLD_H - 8) };
  }

  aimAt(e, speed, action) {
    const p = this.predict(e, speed);
    const j = action?.data?.jitter || 0;
    if (!j) return p;
    const m = this.m;
    const a = Math.atan2(p.y - m.y, p.x - m.x) + j, d = Math.hypot(p.x - m.x, p.y - m.y);
    return { x: m.x + Math.cos(a) * d, y: m.y + Math.sin(a) * d };
  }

  // ───────────── Steering por contexto ─────────────
  steer(dt) {
    const m = this.m, w = this.w, t = this.target;
    let gx = 0, gy = 0, throttle = 1;
    const mem = t ? this.mem.get(t.id) : null;
    const tx = mem ? mem.x : m.x, ty = mem ? mem.y : m.y;
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const tanX = -uy * this.strafeSign, tanY = ux * this.strafeSign;
    const mode = this.evadeT > 0 && this.evadeDir ? 'evade' : this.mode;
    switch (mode) {
      case 'approach': gx = ux; gy = uy; if (this.ctx?.vis) { gx += tanX * 0.25; gy += tanY * 0.25; } break;
      case 'kite': gx = -ux + tanX * 0.7; gy = -uy + tanY * 0.7; break;
      case 'strafe': {
        const [lo, hi] = this.range || [d - 1, d + 1];
        const mid = (lo + hi) / 2;
        const radial = clamp((d - mid) / Math.max(20, (hi - lo) / 2), -1, 1);
        gx = tanX + ux * radial * 0.8; gy = tanY + uy * radial * 0.8; throttle = 0.85;
        break;
      }
      case 'evade': gx = this.evadeDir.x; gy = this.evadeDir.y; break;
      case 'goto': if (this.goalPt) {
        const ex = this.goalPt.x - m.x, ey = this.goalPt.y - m.y, el = Math.hypot(ex, ey);
        if (el < 4) throttle = 0; else { gx = ex / el; gy = ey / el; if (el < 16) throttle = el / 16; }
      } break;
      default: throttle = 0;
    }
    // Destrava se ficou preso contra algo.
    this.stuckCheck.t += dt;
    if (this.stuckCheck.t > 0.8) {
      const moved = Math.hypot(m.x - this.stuckCheck.x, m.y - this.stuckCheck.y);
      if (moved < 5 && throttle > 0.5 && !m.action) { const a = w.rng() * TAU; this.unstick = { x: Math.cos(a), y: Math.sin(a), t: 0.6 }; this.strafeSign *= -1; }
      this.stuckCheck = { x: m.x, y: m.y, t: 0 };
    }
    if (this.unstick) { gx += this.unstick.x * 1.2; gy += this.unstick.y * 1.2; this.unstick.t -= dt; if (this.unstick.t <= 0) this.unstick = null; }

    // Caminho em volta de obstáculos, ilhas e penhascos quando a linha reta não é caminhável.
    if ((mode === 'approach' || mode === 'goto') && throttle > 0) {
      const goal = mode === 'goto' ? this.goalPt : { x: tx, y: ty };
      const wp = goal && this.waypoint(goal);
      if (wp) {
        const ex = wp.x - m.x, ey = wp.y - m.y, el = Math.hypot(ex, ey) || 1;
        gx = ex / el; gy = ey / el;
        if (this.unstick) { gx += this.unstick.x * 0.6; gy += this.unstick.y * 0.6; }
      }
    }
    const gl = Math.hypot(gx, gy);
    const scores = this.debug.scores;
    let bestI = -1, bestS = -Infinity;
    const spd = m.def.speed;
    const projThreats = this.threats.filter((th) => th.kind === 'proj');
    const zones = this.threats.filter((th) => th.kind !== 'proj');
    for (let i = 0; i < 16; i++) {
      const dir = DIRS[i];
      let interest = gl > 0 ? (dir.x * gx + dir.y * gy) / gl : 0;
      interest += 0.2 * (dir.x * this.dir.x + dir.y * this.dir.y);
      let danger = 0;
      for (const [k, wb, wt] of PROBES) {
        const x = m.x + dir.x * k, y = m.y + dir.y * k;
        if (w.blockedFor(m, x, y, m.r * 0.8)) danger += wb;
        else danger += this.tileCost(x, y) * wt;
      }
      for (const th of projThreats) {
        const fx = m.x + dir.x * spd * th.time, fy = m.y + dir.y * spd * th.time;
        const px = th.p.x + th.vx * th.time, py = th.p.y + th.vy * th.time;
        if (Math.hypot(fx - px, fy - py) < m.r + th.p.r + 6) danger += 1.4;
      }
      for (const th of zones) {
        const x = m.x + dir.x * 18, y = m.y + dir.y * 18;
        if (this.inThreat(th, x, y) && th.time < 1.2) danger += 1.1;
      }
      scores[i] = interest - danger;
      if (scores[i] > bestS) { bestS = scores[i]; bestI = i; }
    }
    // Se tudo ao redor for pior que ficar parado, só fica parado quando o lugar atual é seguro.
    const hereCost = this.tileCost(m.x, m.y);
    if (bestS < -0.6 && hereCost <= 0 && mode !== 'evade') throttle = 0;
    const b = DIRS[bestI];
    this.dir.x += (b.x - this.dir.x) * 0.35;
    this.dir.y += (b.y - this.dir.y) * 0.35;
    const l = Math.hypot(this.dir.x, this.dir.y) || 1;
    m.move.x = this.dir.x / l;
    m.move.y = this.dir.y / l;
    m.move.throttle = gl > 0 || hereCost > 0 ? throttle : 0;
    m.lookAt = t && mem.visible ? Math.atan2(dy, dx) : Math.atan2(m.move.y, m.move.x);
    this.debug.pick = bestI;
    this.debug.goal = mode === 'goto' ? this.goalPt : null;
  }

  // Próximo ponto do caminho A* até `goal` (null = pode ir em linha reta).
  waypoint(goal) {
    const m = this.m, w = this.w;
    const grid = (w.pathGrid ||= new PathGrid(w));
    const swim = m.element === 'water';
    const avoid = this.p.waterCost > 0.5; // fogo e Gotapus/Brotossauro não entram na água por vontade própria
    if (grid.walkable(m.x, m.y, goal.x, goal.y, swim, avoid)) { this.path = null; return null; }
    const moved = this.pathGoal ? Math.hypot(goal.x - this.pathGoal.x, goal.y - this.pathGoal.y) : Infinity;
    if (!this.path || moved > 24 || w.time - this.pathT > 0.8) {
      this.path = grid.find(m.x, m.y, goal.x, goal.y, swim, 2600, this.p.waterCost);
      this.pathGoal = { x: goal.x, y: goal.y };
      this.pathT = w.time;
      this.pathIdx = 0;
    }
    const path = this.path;
    if (!path || !path.length) return null;
    while (this.pathIdx < path.length - 1 && Math.hypot(path[this.pathIdx].x - m.x, path[this.pathIdx].y - m.y) < 8) this.pathIdx++;
    // Atalho: o ponto mais adiante (até 8 tiles) ainda alcançável em linha reta.
    let k = this.pathIdx;
    for (let j = Math.min(path.length - 1, this.pathIdx + 8); j > this.pathIdx; j--) {
      if (grid.walkable(m.x, m.y, path[j].x, path[j].y, swim, avoid)) { k = j; break; }
    }
    this.debug.path = path;
    return path[k];
  }

  inThreat(th, x, y) {
    if (th.kind === 'zone') return Math.hypot(x - th.x, y - th.y) < th.r;
    const e = th.e;
    if (th.kind === 'melee') return Math.hypot(x - e.x, y - e.y) < e.r + 30;
    const ang = Math.atan2(y - e.y, x - e.x);
    if (th.kind === 'cone') return Math.hypot(x - e.x, y - e.y) < 90 && Math.abs(angleDiff(th.aim, ang)) < 0.75;
    const ex = e.x + Math.cos(th.aim) * 200, ey = e.y + Math.sin(th.aim) * 200;
    return pointSeg(x, y, e.x, e.y, ex, ey).d < this.m.r + 9;
  }
}
