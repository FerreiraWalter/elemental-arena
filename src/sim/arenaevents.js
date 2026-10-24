// Eventos de arena roteirizados pelo TEMPO da partida (iguais no servidor e no cliente, que só recebe w.time):
//  · RisingWall (Terra Rachada): rachaduras avisam e um bloco de terra SOBE do chão e vira parede.
//  · Tsunami (Atlântida): ondas sucessivas avançam da esquerda, alagam o chão (água funda) e derrubam as colunas;
//    quem não nada é arrastado para a frente da onda. No fim só sobra o coliseu.
//  · Kraken (Atlântida): chefe neutro (PvE) no poço do coliseu. Dorme até a maré chegar perto ou alguém se aproximar;
//    acordado, arremessa bolas d'água e pedras em TODOS os lados e bate com os tentáculos em quem chega na borda.
//    Vida e ritmo mudam com o modo (1v1, 2v2, 1v1v1v1). Quem dá o golpe final ganha cura e energia de evolução.
// O estado que o cliente precisa (fase de cada evento) vai no snapshot `haz`; paredes e vida do Kraken são
// reconstruídas por sync() (paredes) e pelos obstáculos (vida).
import { clamp } from '../core/math.js';
import { T } from './tiles.js';
import { EVOLUTION, TILE, COLS, ROWS, WORLD_W, WORLD_H as WORLD_H_PX } from '../config.js';

const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// ───────────── Terra Rachada: paredes que sobem ─────────────
export class RisingWall {
  constructor(rect, at, H) {
    this.kind = 'earthWall';
    this.rect = rect; this.at = at; this.H = H;
    this.warnT = 2.5; this.riseT = 1.2;
    this.x = rect.x + rect.w / 2; this.y = rect.y + rect.h / 2;
    this.phase = 'idle'; this.t = at;
    this.wall = null;
  }
  update(w) {
    const dt = this.at - w.time;
    if (dt > this.warnT) { this.phase = 'idle'; this.t = dt - this.warnT; return; }
    if (dt > 0) {
      if (this.phase === 'idle') w.emit({ type: 'hazardWarn', kind: this.kind, x: this.x, y: this.y, r: Math.max(this.rect.w, this.rect.h) / 2 });
      this.phase = 'warn'; this.t = dt; return;
    }
    this.phase = 'active'; this.t = 0;
    if (!this.wall) this.raise(w, true);
  }
  // Cliente: a fase chega pelo snapshot; a parede (colisão e desenho) é recriada aqui.
  sync(w) { if (this.phase === 'active' && !this.wall) this.raise(w, false); }
  raise(w, sim) {
    const r = this.rect;
    this.wall = { x: r.x, y: r.y, w: r.w, h: r.h, kind: 'earth', H: this.H, dyn: true, at: this.at, rise: this.riseT };
    w.walls.push(this.wall);
    w.obstacleVersion = (w.obstacleVersion || 0) + 1;
    if (!sim) return;
    w.emit({ type: 'quake', x: this.x, y: r.y + r.h, r: Math.max(r.w, r.h) / 2 + 10 });
    w.emit({ type: 'wallRise', x: this.x, y: this.y });
    // Quem estava em cima é arremessado para fora (pelo lado mais perto) e leva um tranco.
    for (const m of w.monsters) {
      if (!m.alive || !m.onField) continue;
      if (m.x < r.x - m.r || m.x > r.x + r.w + m.r || m.y < r.y - m.r || m.y > r.y + r.h + m.r) continue;
      const out = [[r.x - m.r - 3, m.y, m.x - r.x], [r.x + r.w + m.r + 3, m.y, r.x + r.w - m.x], [m.x, r.y - m.r - 3, m.y - r.y], [m.x, r.y + r.h + m.r + 3, r.y + r.h - m.y]]
        .sort((a, b) => a[2] - b[2]);
      const spot = out.find(([x, y]) => !w.blocked(x, y, m.r) && w.standable(m, x, y)) || out[0];
      m.x = m.px = spot[0]; m.y = m.py = spot[1];
      w.damage(m, 6, null, { tag: 'paredeDeTerra', element: 'earth', stun: 0.3, kb: 120, ang: Math.atan2(m.y - this.y, m.x - this.x) });
    }
  }
  threat(m) {
    if (this.phase !== 'warn') return null;
    const r = this.rect, R = Math.hypot(r.w, r.h) / 2 + m.r + 10;
    if (Math.hypot(m.x - this.x, m.y - this.y) > R) return null;
    return { kind: 'zone', key: 'w' + this.at + ':' + this.x, x: this.x, y: this.y, r: R, time: this.t };
  }
}

// ───────────── Atlântida: tsunami ─────────────
// Fase que ANDA: a onda nasce na borda esquerda e persegue sem parar até a porta do coliseu (velocidade constante,
// arrancando suave). Tudo atrás dela vira mar; a câmera rola junto (arena `scroll`).
export class Tsunami {
  constructor({ start = 10, speed = 8, end = 700, warn = 4, dmg = 8 } = {}) {
    this.kind = 'tsunami';
    this.start = start; this.speed = speed; this.end = end; this.warnT = warn; this.dmg = dmg;
    this.x = 0; this.y = 0;
    this.phase = 'idle'; this.t = start - warn;
    this.flooded = 0; // até onde (px) o chão já foi alagado
    this.hitAt = new Map(); // monstro → quando a crista o pegou por último
  }
  // Frente da água no instante `time` (determinística: o cliente calcula a mesma coisa).
  frontAt(time) {
    const e = time - this.start;
    if (e <= 0) return 0;
    const ramp = e < 3 ? e * e / 6 : e - 1.5; // arranca suave nos 3 primeiros segundos
    return Math.min(this.end, ramp * this.speed + 40 * ease(e / 2));
  }
  get done() { return this.phase === 'idle' && this.t >= 999; }
  update(w) {
    const front = this.frontAt(w.time);
    this.lastTime = w.time;
    if (w.time < this.start - this.warnT) { this.phase = 'idle'; this.t = this.start - this.warnT - w.time; } else if (w.time < this.start) {
      if (this.phase !== 'warn') { w.emit({ type: 'tsunamiWarn', x: 0 }); w.say('A MARÉ RECUA... a TSUNAMI vem da esquerda! Corra para o coliseu!', '#8fd8ff'); }
      this.phase = 'warn'; this.t = this.start - w.time;
    } else if (front < this.end) {
      if (this.phase !== 'active') w.emit({ type: 'tsunami', x: front });
      this.phase = 'active'; this.t = (this.end - front) / this.speed;
    } else { this.phase = 'idle'; this.t = 999; }
    if (front > this.flooded + 4) this.flood(w, front);
    if (this.phase === 'active') this.sweep(w, front);
  }
  // Alaga as colunas de tiles que a frente já passou e derruba o que estiver nelas.
  flood(w, front) {
    const tr = w.terrain;
    const c0 = Math.max(0, Math.floor(this.flooded / TILE)), c1 = Math.min(COLS - 1, Math.floor(front / TILE) - 1);
    for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
      const i = r * COLS + c;
      if (tr.type[i] === T.DEEP) continue;
      tr.setBase(i, T.DEEP, tr.height[i]);
      tr.fire[i] = 0; tr.burning.delete(i); tr.roots[i] = 0; tr.rootSet.delete(i); tr.wet[i] = 0;
      tr.dirty.add(i);
      if (c + 1 < COLS) tr.dirty.add(i + 1); // a borda do chão vizinho vira margem
      if (c > 0) tr.dirty.add(i - 1); // e a coluna alagada antes deixa de ser borda (some a espuma)
    }
    this.flooded = Math.max(this.flooded, (c1 + 1) * TILE);
    for (const o of w.obstacles) if (!o.destroyed && o.kind !== 'kraken' && o.x < this.flooded) w.destroyObstacle(o);
    for (const rl of w.relics) if (rl.x < this.flooded) rl.t = Infinity;
    // Quem não nada e ficou para trás é levado para a frente da onda (nunca fica sobre a água funda).
    for (const m of w.monsters) {
      if (!m.alive || !m.onField || m.element === 'water' || m.x - m.r * 0.55 > this.flooded) continue;
      const p = w.safeSpot(this.flooded + m.r + 10, m.y, m.r, 0, true);
      m.x = m.px = Math.max(p.x, this.flooded + m.r + 10); m.y = m.py = p.y;
      m.level = tr.heightAt(m.x, m.y);
    }
  }
  // A crista pega quem ficou para trás (no máximo a cada 1,2 s): molha, fere e empurra para a frente.
  sweep(w, front) {
    for (const m of w.monsters) {
      if (!m.alive || !m.onField || m.x > front + 24 || w.time - (this.hitAt.get(m.id) ?? -9) < 1.2) continue;
      this.hitAt.set(m.id, w.time);
      const water = m.element === 'water';
      w.damage(m, this.dmg * (water ? 0.4 : 1), null, { tag: 'tsunami', element: 'water', wet: 3, stun: water ? 0 : 0.25, kb: water ? 60 : 240, ang: 0 });
      w.emit({ type: 'waveCrash', x: m.x, y: m.y, r: 20, ang: 0, small: true });
    }
  }
  // IA: perto da crista (ou antes de ela chegar), uma zona grande atrás faz o monstro fugir para a direita.
  threat(m) {
    if (this.phase === 'idle' || m.element === 'water') return null;
    const front = this.frontAt(this.phase === 'warn' ? this.start + 2 : (this.lastTime ?? this.start));
    if (m.x > front + 90) return null;
    return { kind: 'zone', key: 'tsu', x: front - 200, y: m.y, r: 290 + m.r, time: this.phase === 'warn' ? this.t : 0 };
  }
}

// ───────────── Atlântida: Kraken ─────────────
// Por modo: vida, dano de cada arremesso, intervalo entre ataques e quantos alvos por ataque. Abaixo de metade da
// vida entra em FÚRIA: ataca mais rápido e mira um alvo a mais.
export const KRAKEN = {
  '1v1': { hp: 420, dmg: 7, gap: 2.6, n: 1 },
  '2v2': { hp: 620, dmg: 8, gap: 2.1, n: 2 },
  ffa: { hp: 720, dmg: 8, gap: 1.9, n: 2 },
  wakeAt: 5, // acorda logo no começo: arremessa coisas na corrida inteira
  slamR: 76, // tapa em volta do poço
  armR: 300, // tentáculo que desce do céu: só em quem está a até 300 px
  rage: 0.5, rageGap: 0.72,
};
export const krakenMode = (w) => (w.ffa ? 'ffa' : w.teams.length >= 4 ? '2v2' : '1v1');

export class Kraken {
  constructor(w, x, y) {
    this.kind = 'kraken';
    this.x = x; this.y = y; this.r = 30;
    this.phase = 'idle'; this.t = 0;
    this.body = w.addObstacle('kraken', x, y, this.r, { hp: KRAKEN['1v1'].hp });
    this.body.hazard = this;
    // Dono "neutro" dos arremessos: nenhum time (os tiros acertam todo mundo).
    this.owner = { id: -1, team: -1, x, y, r: this.r, alive: true, element: 'water', name: 'Kraken' };
    this.cfg = null; this.shot = 0; this.aim = 0;
  }
  setup(w) {
    if (this.cfg) return;
    this.cfg = KRAKEN[krakenMode(w)];
    if (this.body.hp === this.body.maxHp) this.body.hp = this.cfg.hp;
    this.body.maxHp = this.cfg.hp;
  }
  sync(w) { this.setup(w); }
  get awake() { return this.phase !== 'idle'; }
  get raging() { return this.body.hp < this.body.maxHp * KRAKEN.rage; }
  update(w, dt) {
    this.setup(w);
    if (this.body.destroyed) { this.phase = 'idle'; this.t = 0; this.owner.alive = false; return; }
    if (!this.awake) {
      if (w.time < KRAKEN.wakeAt && this.body.hp >= this.body.maxHp) return;
      this.phase = 'active'; this.t = 1.2;
      w.emit({ type: 'krakenWake', x: this.x, y: this.y });
      w.say('O KRAKEN DESPERTOU! Ele arremessa coisas em TODO MUNDO.', '#c890ff');
      return;
    }
    if (this.raging && !this.rageSaid) { this.rageSaid = true; w.emit({ type: 'krakenRage', x: this.x, y: this.y }); w.say('O KRAKEN ESTÁ FURIOSO!', '#ff6ad0'); }
    this.t -= dt;
    if (this.t > 0) return;
    if (this.phase === 'active') { this.phase = 'warn'; this.t = 0.6; this.pick(w); return; }
    this.attack(w);
    this.phase = 'active'; this.t = this.cfg.gap * (this.raging ? KRAKEN.rageGap : 1);
  }
  pick(w) {
    const ts = w.monsters.filter((m) => m.alive && m.onField);
    // Prefere quem está mais perto, com sorteio (ninguém fica livre só por estar longe).
    this.next = ts.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y) + (w.rng() - 0.5) * 400).slice(0, this.cfg.n + (this.raging ? 1 : 0));
    if (this.next[0]) this.aim = Math.atan2(this.next[0].y - this.y, this.next[0].x - this.x);
    w.emit({ type: 'krakenWindup', x: this.x, y: this.y });
  }
  attack(w) {
    const c = this.cfg;
    // Alguém na borda do poço: tapa de tentáculos em volta (empurra para longe).
    const close = w.monsters.filter((m) => m.alive && m.onField && Math.hypot(m.x - this.x, m.y - this.y) < KRAKEN.slamR + m.r);
    if (close.length) {
      w.emit({ type: 'tentacleSlam', x: this.x, y: this.y, r: KRAKEN.slamR, big: true });
      for (const m of close) w.damage(m, c.dmg * 1.3, null, { tag: 'kraken', element: 'water', wet: 3, stun: 0.35, kb: 320, ang: Math.atan2(m.y - this.y, m.x - this.x) });
      return;
    }
    for (const t of (this.next || []).filter((m) => m.alive && m.onField)) {
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      // Rodízio: bola d'água, pedra e (de perto) tentáculo que desce do céu.
      const k = this.shot++ % 3, kind = k === 2 && d < KRAKEN.armR ? 'krakenArm' : k === 1 ? 'krakenRock' : 'krakenBall';
      const flight = kind === 'krakenArm' ? 0.95 : 0.9 + d / 650; // de longe demora mais (dá para desviar na corrida)
      // Mira onde o alvo vai estar (com um erro pequeno): andar de lado ainda desvia.
      const tx = clamp(t.x + t.vx * flight * 0.55 + (w.rng() - 0.5) * 24, 12, WORLD_W - 12), ty = clamp(t.y + t.vy * flight * 0.55 + (w.rng() - 0.5) * 24, 12, 564);
      const R = kind === 'krakenArm' ? 26 : kind === 'krakenRock' ? 18 : 24;
      const dmg = c.dmg * (kind === 'krakenArm' ? 1.25 : kind === 'krakenRock' ? 1.15 : 1);
      w.spawnProjectile({ kind, tag: 'kraken', owner: this.owner, lob: true, flat: kind === 'krakenArm', x: this.x, y: this.y - 10, tx, ty, flight, radius: R, dmg });
    }
  }
  threat() { return null; } // os arremessos já viram ameaça pela trajetória (Brain lê os projéteis em arco)
}

// Bola d'água / pedra / tentáculo do Kraken caindo. Devolvido por uma guarda, cai no poço e fere o Kraken.
export function landShot(w, p) {
  const rock = p.kind === 'krakenRock', arm = p.kind === 'krakenArm';
  w.emit(arm ? { type: 'tentacleSlam', x: p.tx, y: p.ty, r: p.radius, big: true } : { type: rock ? 'rockHit' : 'splash', x: p.tx, y: p.ty, r: p.radius, water: true, big: true });
  for (const m of w.monsters) {
    if (!m.alive || !m.onField || m.team === p.team || Math.hypot(m.x - p.tx, m.y - p.ty) > p.radius + m.r) continue;
    const src = p.team === -1 ? null : p.owner;
    const fx = arm ? { wet: 2, stun: 0.6, lift: 0.6, kb: 60 } : rock ? { stun: 0.5, kb: 120 } : { wet: 3, kb: 170, stun: 0.15 };
    w.damage(m, p.dmg, src, { tag: 'kraken', element: rock ? 'earth' : 'water', proj: true, ang: Math.atan2(m.y - p.ty, m.x - p.tx), ...fx });
  }
  if (!rock) w.douseArea(p.tx, p.ty, p.radius, 5, null);
  if (p.team !== -1) {
    for (const o of w.obstacles) if (o.kind === 'kraken' && !o.destroyed && Math.hypot(o.x - p.tx, o.y - p.ty) < o.r + p.radius) { o.lastHitBy = p.owner; w.hurtObstacle(o, p.dmg * 1.5); }
  }
}

// Kraken derrotado: quem deu o golpe final se cura e ganha energia de evolução.
export function krakenDown(w, o) {
  w.emit({ type: 'krakenDown', x: o.x, y: o.y });
  const m = o.lastHitBy;
  if (m && m.alive && m.def) {
    w.heal(m, m.maxHp * 0.35);
    w.gainEnergy(m, EVOLUTION.threshold * 0.6);
    w.say(`${m.name} DERROTOU O KRAKEN! (+vida e energia)`, '#c890ff');
  } else w.say('O KRAKEN AFUNDOU!', '#c890ff');
}

// ───────────── Vale ASCII: VARREDURA e capinzais ─────────────
// De tempos em tempos uma linha de luz atravessa a arena inteira (de cima para baixo, depois de baixo para cima).
// Quem é pego leva dano e fica CORROMPIDO (lento); a esquiva no tempo certo passa por ela. Por onde a linha passa, o
// mundo é "redesenhado": os capinzais (campos de texto onde quem está dentro some para o inimigo) trocam de lugar.
// Tudo sai do tempo da partida (w.time): o cliente calcula a mesma posição da linha e o mesmo arranjo dos campos.
const SCAN = { first: 18, period: 26, warn: 2.2, speed: 110, band: 12, dmg: 6, slow: [1.5, 0.35], hide: 0.6 };
export const BRUSH_R = 46;
// Dois arranjos espelhados (4 campos cada); a linha alterna um ↔ outro por onde passa.
export const BRUSH = [
  [[300, 150], [724, 150], [300, 426], [724, 426]],
  [[196, 288], [828, 288], [512, 112], [512, 464]],
];
export class Scanline {
  constructor() {
    this.kind = 'scanline';
    this.x = WORLD_W / 2; this.y = 0;
    this.phase = 'idle'; this.t = SCAN.first - SCAN.warn;
    this.hit = new Map(); // monstro → última varredura que o pegou
    this.dur = WORLD_H_PX / SCAN.speed;
  }
  // Varredura k: começa em first + k·period; as pares descem, as ímpares sobem.
  sweepAt(time) {
    const k = Math.floor((time - SCAN.first + SCAN.warn) / SCAN.period);
    if (k < 0) return { k: -1, e: -Infinity };
    return { k, e: time - (SCAN.first + k * SCAN.period) }; // e < 0: aviso; 0..dur: ativa
  }
  lineY(k, e) { const y = e * SCAN.speed; return k % 2 === 0 ? y : WORLD_H_PX - y; }
  // Arranjo do campo `j` no instante `time`: quantas varreduras já passaram por cima dele.
  layoutOf(j, time) {
    const cy = BRUSH[0][j][1], cy2 = BRUSH[1][j][1];
    let n = 0;
    const last = Math.floor((time - SCAN.first) / SCAN.period);
    for (let k = 0; k <= last; k++) {
      const e = time - (SCAN.first + k * SCAN.period), y = this.lineY(k, Math.min(e, this.dur));
      const yc = n % 2 ? cy2 : cy; // o campo está onde o arranjo atual o colocou
      const passed = k % 2 === 0 ? y >= yc : y <= yc;
      if (passed) n++;
    }
    return n % 2;
  }
  fields(time) { return BRUSH[0].map((_, j) => { const L = this.layoutOf(j, time); const [x, y] = BRUSH[L][j]; return { x, y, r: BRUSH_R, j, L }; }); }

  update(w) {
    const { k, e } = this.sweepAt(w.time);
    if (k < 0 || e > this.dur) { this.phase = 'idle'; this.t = k < 0 ? SCAN.first - SCAN.warn - w.time : (SCAN.first + (k + 1) * SCAN.period - SCAN.warn) - w.time; }
    else if (e < 0) { if (this.phase !== 'warn') w.emit({ type: 'scanWarn', down: k % 2 === 0, x: WORLD_W / 2, y: k % 2 === 0 ? 10 : WORLD_H_PX - 10 }); this.phase = 'warn'; this.t = -e; }
    else {
      this.phase = 'active'; this.t = e;
      const y = this.lineY(k, e);
      this.y = y;
      for (const m of w.monsters) {
        if (!m.alive || !m.onField || this.hit.get(m) === k) continue;
        if (Math.abs(m.y - y) > SCAN.band / 2 + m.r * 0.6) continue;
        this.hit.set(m, k);
        if (m.status.invuln > 0) { w.emit({ type: 'evaded', m, x: m.x, y: m.y }); continue; }
        w.damage(m, SCAN.dmg, null, { tag: 'varredura', element: 'neutral', slow: SCAN.slow, x: m.x, y: m.y });
        w.emit({ type: 'scanHit', m, x: m.x, y: m.y });
      }
      // Campos que a linha acabou de atravessar trocam de lugar.
      const prevF = this._fields || this.fields(w.time - 1 / 60);
      const now = this.fields(w.time);
      now.forEach((f, j) => { if (f.L !== prevF[j].L) w.emit({ type: 'rerender', x: f.x, y: f.y, x0: prevF[j].x, y0: prevF[j].y, r: BRUSH_R }); });
      this._fields = now;
    }
    // Capinzal: quem está dentro (e não atacou há pouco) some para o inimigo.
    const fs = this.fields(w.time);
    for (const m of w.monsters) {
      if (!m.alive || !m.onField) continue;
      const inside = fs.some((f) => (m.x - f.x) ** 2 + ((m.y - f.y) * 1.25) ** 2 < (f.r - 4) ** 2);
      m.inBrush = inside;
      if (inside && w.time - (m._lastCastT ?? -9) > SCAN.hide && !m.action) m.status.cloak = Math.max(m.status.cloak, 0.25);
    }
  }
  // IA: a linha ativa perto é uma ameaça (esquivar no tempo certo ou sair do caminho).
  threat(m) {
    if (this.phase !== 'active') return null;
    const dy = m.y - this.y;
    if (Math.abs(dy) > 40) return null;
    return { kind: 'zone', key: 'scan', x: m.x, y: this.y, r: 26, time: Math.abs(dy) / SCAN.speed };
  }
}
