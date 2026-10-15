// Partículas puramente visuais (não afetam a simulação, usam Math.random).

const RAMPS = {
  fire: ['#fff7c2', '#ffd84a', '#ff9a1f', '#f2541b', '#b3200f', '#4a1a12'],
  spark: ['#ffffff', '#fff2a0', '#ffc040', '#ff7a1a'],
  smoke: ['#6a6260', '#5a5452', '#4a4644', '#3e3a38'],
  steam: ['#ffffff', '#eef6fa', '#d6e6ee', '#c0d4de'],
  water: ['#ffffff', '#c8f0ff', '#7cd0ff', '#3a9ae8', '#1f62c0'],
  dust: ['#e8d4a4', '#d0b880', '#b89c68'],
  ash: ['#8a827a', '#6a625a', '#4a4440'],
  wood: ['#c8874a', '#a5672e', '#7a4a22'],
  rock: ['#aaa6a6', '#858186', '#5c5a5e'],
  leaf: ['#84c858', '#5aa83c', '#3f8a2e'],
  ink: ['#5a4a7a', '#3a2a52', '#2a1e42', '#1a1230'],
  leafFall: ['#d49a3e', '#b8702c', '#7aac50', '#5a8c3a'],
  pollen: ['#fff6a0', '#ffe066', '#f4f0d0'],
};

export class Particles {
  constructor() { this.list = []; }

  add(o) {
    if (this.list.length > 2600) return;
    this.list.push({
      x: o.x, y: o.y, z: o.z || 0, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      g: o.g || 0, drag: o.drag ?? 2, life: o.life || 0.6, age: 0, size: o.size || 1,
      grow: o.grow || 0, ramp: RAMPS[o.ramp || 'fire'], add: !!o.add, alpha: o.alpha ?? 1,
    });
  }

  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 40) * (0.3 + Math.random() * 0.9);
      this.add({ ...o, x: x + (Math.random() - 0.5) * (o.spread || 2), y: y + (Math.random() - 0.5) * (o.spread || 2), vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp * 0.7 + (o.vy || 0), vz: (o.vz || 0) * (0.5 + Math.random()), life: (o.life || 0.5) * (0.6 + Math.random() * 0.8) });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.age += dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.vz -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0 && p.g > 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      p.size += p.grow * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  draw(ctx, additive) {
    for (const p of this.list) {
      if (p.add !== additive) continue;
      const f = p.age / p.life;
      const c = p.ramp[Math.min(p.ramp.length - 1, Math.floor(f * p.ramp.length))];
      ctx.globalAlpha = p.alpha * (f > 0.7 ? (1 - f) / 0.3 : 1);
      ctx.fillStyle = c;
      const s = Math.max(1, Math.round(p.size));
      const x = Math.round(p.x - s / 2), y = Math.round(p.y - p.z - s / 2);
      if (s >= 3) {
        // Partículas grandes (fumaça, vapor) com cantos arredondados.
        ctx.fillRect(x + 1, y, s - 2, s);
        ctx.fillRect(x, y + 1, s, s - 2);
      } else ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
