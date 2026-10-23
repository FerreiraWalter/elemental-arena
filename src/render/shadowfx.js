// Efeitos visuais do elemento SOMBRA (Pantrinja/Kagepantera): a sombra viva (a própria pantera em silhueta roxa,
// com fumaça saindo), shurikens e kunais girando, a escuridão da Noite Eterna no chão e o rastro do teletransporte.
import { rgba } from './pixel.js';
import { hash2 } from '../core/math.js';

export const SHD_COL = {
  core: rgba('#f4ecff'), hot: rgba('#c8a8ff'), mid: rgba('#8a6aff'), deep: rgba('#4a2aa8'), dark: rgba('#1a0e30'),
  steel: rgba('#d8dce8'), steelD: rgba('#7a7e92'), red: rgba('#e8203a'),
};

// Sombra viva: silhueta tingida da dona, translúcida e tremulando, com fumaça roxa subindo; ao imitar um golpe
// fica mais nítida por um instante. Voando até o ponto, deixa um rastro.
export function drawLivingShadow(r, s, t) {
  const o = s.owner;
  if (!o || !o.def || !r.art.has(o.def.sprite)) return;
  const l = r.l, P = r.particles;
  const x = Math.round(s.x), y = Math.round(s.y);
  const fade = Math.min(1, s.life / 0.4), atk = s.atk > 0 ? 1 : 0;
  l.globalAlpha = 0.35 * fade; l.fillStyle = '#1a0e30';
  l.beginPath(); l.ellipse(x, y + 2, o.r + 2, (o.r + 2) * 0.45, 0, 0, Math.PI * 2); l.fill();
  const pose = { t, walk: 0, moving: s.moving ? 1 : 0, crouch: s.moving ? 0 : 0.3, lunge: atk, open: atk, dash: s.moving ? 1 : 0, spin: 0, dead: 0, seed: s.id * 7, power: 0, tint: ['#24103e', 0.82] };
  const f = r.art.render('shadow:' + (s.id % 6), o.def.sprite, pose);
  const face = (Math.cos(s.facing) >= 0 ? 1 : -1) * (f.faces === -1 ? -1 : 1);
  l.globalAlpha = (0.62 + 0.18 * Math.sin(t * 9 + s.id) + atk * 0.25) * fade;
  r.blitFrame(f, x + (Math.random() < 0.08 ? (Math.random() < 0.5 ? -1 : 1) : 0), y, face, 1, 1, 0);
  l.globalAlpha = 1;
  // Olhos acesos (lilás) e fumaça escura subindo do corpo.
  if (Math.random() < 0.5) P.add({ ramp: 'shadow', x: x + (Math.random() - 0.5) * o.r * 1.6, y: y - Math.random() * 4, z: Math.random() * (f.top || 20) * 0.8, vz: 14 + Math.random() * 12, vx: (Math.random() - 0.5) * 8, life: 0.7, size: 2, grow: 1.5, alpha: 0.7 * fade });
  if (s.moving) for (let k = 0; k < 3; k++) P.add({ ramp: 'shadow', x: x - Math.cos(s.facing) * k * 4, y: y - Math.sin(s.facing) * k * 4, z: 8, vz: 4, life: 0.35, size: 2, alpha: 0.8 });
  s._top = f.top;
}

// Marquinha no chão onde a sombra vai parar (para a dona saber para onde vai).
export function drawShadowTarget(g, s, t) {
  if (!s.moving) return;
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + t * 4;
    g.set(Math.round(s.tx + Math.cos(a) * 8), Math.round(s.ty + Math.sin(a) * 4), k % 2 ? SHD_COL.mid : SHD_COL.hot);
  }
}

// Shurikens: estrela de 4 pontas afiadas girando de verdade, aço com contorno escuro, fio de luz no eixo de cada
// ponta, furo no meio e a pontinha roxa. A pequena (básico) é rápida e fina; a bumerangue (fuuma) é grande, gira mais devagar e deixa um
// rastro de giro roxo e faíscas (mais na volta).
const STEEL = [rgba('#2a2438'), rgba('#5a5672'), rgba('#9a98b4'), rgba('#d8dcec'), rgba('#ffffff')];
function star(g, x, y, R, rot) {
  const r2 = (R + 2) * (R + 2);
  for (let dy = -R - 2; dy <= R + 2; dy++) for (let dx = -R - 2; dx <= R + 2; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const r = Math.sqrt(d2), th = Math.atan2(dy, dx) - rot;
    const q = ((th % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    const off = Math.min(q, Math.PI / 2 - q) / (Math.PI / 4); // 0 = no eixo da ponta, 1 = entre duas pontas
    const reach = Math.max(R * 0.42, R * (1 - off) ** 1.1); // pontas afiadas em volta de um miolo
    if (r > reach + 1.2) continue;
    if (r > reach + 0.35) { g.set(x + dx, y + dy, SHD_COL.dark); continue; } // contorno de fora: destaca no chão claro
    if (r < Math.max(0.7, R * 0.15)) { g.set(x + dx, y + dy, SHD_COL.dark); continue; } // furo do meio
    if (r > reach - 0.9) { g.set(x + dx, y + dy, r > R * 0.8 && off < 0.2 ? SHD_COL.hot : STEEL[0]); continue; } // contorno (ponta roxa)
    const lit = Math.cos(th + rot + 2.4) * 0.5 + 0.5; // luz de cima à esquerda
    g.set(x + dx, y + dy, off < 0.14 ? STEEL[4] : STEEL[Math.min(3, 1 + Math.round(lit * 2.2))]); // fio de luz no eixo
  }
}
export function drawShuriken(g, p, x, y, t, P) {
  x = Math.round(x); y = Math.round(y);
  const big = p.kind === 'fuuma', back = p.boomerang?.back;
  const R = big ? Math.round(p.r + 4) : 4;
  const spin = (big ? 12 : 22) * (p.age || t) + p.id;
  if (big) {
    // Rastro: dois arcos de giro atrás da estrela (roxo que some) e poucas faíscas.
    const sp = Math.hypot(p.vx || 0, p.vy || 0) || 1, ux = (p.vx || 0) / sp, uy = (p.vy || 0) / sp;
    for (let k = 1; k <= 2; k++) {
      const cx = x - ux * (R * 0.9 * k), cy = y - uy * (R * 0.9 * k), rr = R - k;
      for (let q = 0; q < 10; q++) {
        const a = spin - k * 0.5 + (q / 10) * Math.PI * 2;
        if (q % 3 === 2) continue;
        g.set(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, k === 1 ? SHD_COL.mid : SHD_COL.deep);
      }
    }
    star(g, x, y, R, spin);
    if (P && Math.random() < (back ? 0.5 : 0.3)) P.add({ ramp: 'shadow', x: x + (Math.random() - 0.5) * R, y: y + (Math.random() - 0.5) * R, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.25, add: !p.fromShadow });
    return;
  }
  star(g, x, y, R, spin);
  // Rastro fino atrás da estrelinha.
  const sp = Math.hypot(p.vx || 0, p.vy || 0) || 1, ux = (p.vx || 0) / sp, uy = (p.vy || 0) / sp;
  for (let k = 3; k <= 6; k++) g.set(x - ux * k, y - uy * k, k < 5 ? SHD_COL.hot : SHD_COL.mid);
  if (P && Math.random() < (p.fromShadow ? 0.6 : 0.3)) P.add({ ramp: 'shadow', x, y, vx: -(p.vx || 0) * 0.04, vy: -(p.vy || 0) * 0.04, life: 0.2, add: !p.fromShadow });
}

// Noite Eterna: disco escuro pontilhado (deixa o chão ver por baixo), borda roxa girando e estrelinhas.
export function drawNight(g, z, t) {
  const fade = Math.min(1, z.life / 0.5, (z.max - z.life) / 0.25 + 0.2), R = z.r;
  const fr = Math.floor(t * 6);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const e = (dx * dx) / (R * R) + (dy * dy) / (R * R * 0.42);
    if (e > 1) continue;
    const h = hash2(dx + z.id, dy, 3);
    if (e > 0.9) { if (h < 0.55 * fade) g.set(z.x + dx, z.y + dy, h < 0.2 ? SHD_COL.mid : SHD_COL.deep); continue; }
    if (h < (0.62 - e * 0.25) * fade) g.set(z.x + dx, z.y + dy, SHD_COL.dark);
    else if (hash2(dx, dy + z.id, fr) > 0.997) g.set(z.x + dx, z.y + dy, SHD_COL.hot);
  }
}

// Teletransporte até a sombra: fio de fumaça roxa ligando os dois pontos.
export function swapTrail(P, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(4, Math.round(d / 6));
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    P.add({ ramp: 'shadow', x: x0 + (x1 - x0) * f + (Math.random() - 0.5) * 4, y: y0 + (y1 - y0) * f + (Math.random() - 0.5) * 4, z: 6 + Math.random() * 6, vz: 8, life: 0.35 + f * 0.2, size: 2, alpha: 0.8 });
  }
}
