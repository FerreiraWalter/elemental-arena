// Perigos ambientais das arenas. Cada perigo tem um ciclo (ocioso → aviso → ativo), é telegrafado
// visualmente e expõe `threat(m)` para a IA desviar. A simulação só chama update(); nada aqui é roteirizado
// em relação aos monstros: o ciclo usa o RNG do mundo.

class CyclicHazard {
  constructor(w, x, y, r, { idle, warn, active }) {
    this.x = x; this.y = y; this.r = r;
    this.cfg = { idle, warn, active };
    this.phase = 'idle';
    this.t = idle[0] + w.rng() * (idle[1] - idle[0]);
  }
  update(w, dt) {
    this.t -= dt;
    if (this.t > 0) { if (this.phase === 'active') this.onActive?.(w, dt); return; }
    if (this.phase === 'idle') { this.phase = 'warn'; this.t = this.cfg.warn; this.onWarn?.(w); }
    else if (this.phase === 'warn') { this.phase = 'active'; this.t = this.cfg.active; this.hit = new Set(); this.onStart?.(w); }
    else { this.phase = 'idle'; const [a, b] = this.cfg.idle; this.t = a + w.rng() * (b - a); }
  }
  // Zona de ameaça para a IA (mesmo formato de scanThreats).
  threat(m) {
    if (this.phase === 'idle' || (this.immune && this.immune(m))) return null;
    if (Math.hypot(m.x - this.x, m.y - this.y) > this.r + m.r + 10) return null;
    return { kind: 'zone', key: 'h' + this.x + ':' + this.y, x: this.x, y: this.y, r: this.r + m.r + 10, time: this.phase === 'warn' ? this.t : 0 };
  }
}

// Jardim: raízes que irrompem do chão e prendem quem estiver em cima (a planta é imune).
export class RootVent extends CyclicHazard {
  constructor(w, x, y) { super(w, x, y, 18, { idle: [7, 12], warn: 1.1, active: 0.4 }); this.kind = 'rootVent'; }
  immune(m) { return m.element === 'plant'; }
  onWarn(w) { w.emit({ type: 'hazardWarn', kind: this.kind, x: this.x, y: this.y, r: this.r }); }
  onStart(w) {
    w.emit({ type: 'rootsErupt', x: this.x, y: this.y, r: this.r, hazard: true });
    for (const m of w.monsters) {
      if (!m.alive || m.element === 'plant' || Math.hypot(m.x - this.x, m.y - this.y) > this.r + m.r) continue;
      if (w.damage(m, 5, null, { element: 'plant', tag: 'raizes-do-jardim', stun: 0.1 }) > 0) {
        m.status.root = Math.max(m.status.root, 1.2);
        w.emit({ type: 'rooted', m, x: m.x, y: m.y });
      }
    }
    const tr = w.terrain;
    for (let dy = -this.r; dy <= this.r; dy += 8) for (let dx = -this.r; dx <= this.r; dx += 8) {
      if (dx * dx + dy * dy <= this.r * this.r) tr.growRoots(tr.at(this.x + dx, this.y + dy), 4);
    }
  }
}

// Abismo: gêiser que borbulha e explode, arremessando e molhando; apaga fogo e projéteis de fogo.
export class Geyser extends CyclicHazard {
  constructor(w, x, y) { super(w, x, y, 14, { idle: [6, 10], warn: 1.2, active: 0.9 }); this.kind = 'geyser'; }
  onWarn(w) { w.emit({ type: 'hazardWarn', kind: this.kind, x: this.x, y: this.y, r: this.r }); }
  onStart(w) {
    w.emit({ type: 'geyser', x: this.x, y: this.y, r: this.r });
    w.douseArea(this.x, this.y, this.r + 8, 8, null);
  }
  onActive(w) {
    for (const m of w.monsters) {
      if (!m.alive || this.hit.has(m.id) || Math.hypot(m.x - this.x, m.y - this.y) > this.r + m.r) continue;
      this.hit.add(m.id);
      const k = m.element === 'water' ? 0.5 : 1;
      w.damage(m, 9 * k, null, { element: 'water', tag: 'geiser', kb: 260, ang: Math.atan2(m.y - this.y, m.x - this.x) || 0, stun: 0.25, wet: 3 });
    }
    for (const p of w.projectiles) {
      if (!p.dead && !p.lob && (p.kind === 'ember' || p.kind === 'magma') && Math.hypot(p.x - this.x, p.y - this.y) < this.r) w.clash(p, null);
    }
  }
}

export const HAZARDS = { rootVent: RootVent, geyser: Geyser };
