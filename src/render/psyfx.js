// Efeitos visuais do elemento PSÍQUICO (Sapomental/Sapofilósofo): bolhas e orbes, espiral/mandala no chão,
// marcas de transe e espiral de hipnose sobre a cabeça, e a aura de esferinhas flutuando em volta do sapo.
import { rgba } from './pixel.js';
import { hash2 } from '../core/math.js';

export const PSY_COL = {
  core: rgba('#ffffff'), pink: rgba('#ff9ae6'), hot: rgba('#f4c8ff'), mid: rgba('#d07aff'), deep: rgba('#9a4ad8'),
  dark: rgba('#5a2a9a'), glow: rgba('#d07aff', 120), faint: rgba('#9a4ad8', 140),
};

// Bolha / orbe: núcleo branco, casca lilás, anel brilhante girando; deixa um rastro de brilhos.
export function drawPsyProj(g, p, x, y, t, P) {
  const R = p.kind === 'psyOrb' ? 3.2 : p.big ? 4.6 : 3.8;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > R + 0.4) continue;
    const hl = dx < 0 && dy < 0 && d < R * 0.55;
    g.set(x + dx, y + dy, hl ? PSY_COL.core : d < R * 0.45 ? PSY_COL.hot : d < R * 0.8 ? PSY_COL.mid : PSY_COL.deep);
  }
  const n = p.kind === 'psyOrb' ? 3 : 5;
  for (let k = 0; k < n; k++) {
    const a = t * 6 + (k / n) * Math.PI * 2, r = R + 2;
    g.set(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, k % 2 ? PSY_COL.pink : PSY_COL.hot);
  }
  if (!p.orbit && P && Math.random() < 0.6) P.add({ ramp: 'psy', x: x - (p.vx || 0) * 0.02, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.3, add: true });
}

// Espiral Hipnótica (2 braços girando) e Mandala do Despertar (pétalas de lótus em volta); some aos poucos.
export function drawSpiral(g, z, t) {
  const fade = Math.min(1, z.life / 0.5), R = z.r, rot = t * (z.big ? 1.4 : 2.2);
  const arms = z.big ? 3 : 2, N = Math.round(R * 3);
  for (let a = 0; a < arms; a++) for (let i = 0; i < N; i++) {
    const u = i / N, ang = rot + a * (Math.PI * 2 / arms) + u * Math.PI * 3.2, r = u * R;
    if (hash2(i, a, Math.floor(t * 8)) > 0.35 + 0.65 * fade) continue;
    const c = (i + Math.floor(t * 20)) % 6 === 0 ? PSY_COL.pink : u < 0.25 ? PSY_COL.hot : PSY_COL.mid;
    const px = z.x + Math.cos(ang) * r, py = z.y + Math.sin(ang) * r * 0.8;
    g.set(px, py, c); g.set(px + 1, py, u > 0.6 ? PSY_COL.deep : c); g.set(px, py + 1, PSY_COL.dark); // braço grosso com sombra
  }
  // Borda: pétalas (Mandala) ou anel pontilhado (Espiral).
  const M = z.big ? 8 : 0, steps = Math.round(R * 4);
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * Math.PI * 2;
    const petal = M ? 1 + 0.18 * Math.abs(Math.sin(a * M / 2 + t * 0.6)) : 1;
    if (!M && s % 3) continue;
    if (hash2(s, 7, Math.floor(t * 6)) > 0.4 + 0.6 * fade) continue;
    g.set(z.x + Math.cos(a) * R * petal, z.y + Math.sin(a) * R * 0.8 * petal, s % 2 ? PSY_COL.deep : PSY_COL.mid);
  }
}

// Transe: pontinhos rosa girando sobre a cabeça (1 a 3).
export function drawTrance(g, m, x, y, top, t) {
  const n = m.trance || 0;
  if (!n) return;
  const cy = y - top - 7;
  for (let k = 0; k < 3; k++) {
    const a = t * 3 + (k / 3) * Math.PI * 2, px = x + Math.cos(a) * 6, py = cy + Math.sin(a) * 2.2;
    g.set(px, py, k < n ? PSY_COL.pink : PSY_COL.faint);
    if (k < n) g.set(px + 1, py, PSY_COL.hot);
  }
}

// Hipnotizado: espiral rosa girando sobre a cabeça e brilhos subindo.
export function drawCharm(g, m, x, y, top, t, P) {
  const cx = x, cy = y - top - 9;
  for (let i = 0; i < 22; i++) {
    const u = i / 22, a = -t * 9 + u * Math.PI * 4, r = 1 + u * 5;
    g.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, i % 4 === 0 ? PSY_COL.core : u < 0.5 ? PSY_COL.pink : PSY_COL.mid);
  }
  if (P && Math.random() < 0.3) P.add({ ramp: 'psy', x: x + (Math.random() - 0.5) * m.r * 2, y, z: Math.random() * top, vz: 14, life: 0.5, add: true });
}

// Aura do sapo: duas esferinhas boiando dos lados (como na arte) e brilhos de vez em quando.
export function drawFrogAura(g, m, x, y, top, t, P) {
  for (const s of [-1, 1]) {
    const bob = Math.sin(t * 2.2 + s) * 2, ox = x + s * (m.r + 7), oy = y - top * 0.7 + bob;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 2.2) continue;
      g.set(ox + dx, oy + dy, dx < 0 && dy < 0 ? PSY_COL.core : d < 1.2 ? PSY_COL.hot : PSY_COL.mid);
    }
  }
  if (P && Math.random() < (m.evolved ? 0.35 : 0.15)) P.add({ ramp: 'psy', x: x + (Math.random() - 0.5) * m.r * 2.6, y, z: Math.random() * top, vz: 8, life: 0.6, add: true });
}

// Língua: linha rosa grossa com a pontinha arredondada.
export function drawTongue(g, tg) {
  const k = Math.min(1, (tg.max - tg.life) / (tg.max * 0.5)), ex = tg.x0 + (tg.x - tg.x0) * k, ey = tg.y0 + (tg.y - tg.y0) * k;
  const n = Math.ceil(Math.hypot(ex - tg.x0, ey - tg.y0));
  const pink = rgba('#ff7ab8'), dark = rgba('#b8306a'), hi = rgba('#ffc0dc');
  for (let s = 0; s <= n; s++) {
    const x = tg.x0 + (ex - tg.x0) * s / n, y = tg.y0 + (ey - tg.y0) * s / n;
    g.set(x, y, pink); g.set(x, y + 1, dark); if (s % 3 === 0) g.set(x, y - 1, hi);
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dy) <= 2) g.set(ex + dx, ey + dy, Math.hypot(dx, dy) < 1 ? hi : pink);
}

// Ligação pontilhada (troca mental, volta da projeção astral).
export function drawLink(g, ln, t) {
  const n = Math.ceil(Math.hypot(ln.x1 - ln.x0, ln.y1 - ln.y0));
  for (let s = 0; s <= n; s += 2) {
    if ((s + Math.floor(t * 40)) % 6 > 3) continue;
    g.set(ln.x0 + (ln.x1 - ln.x0) * s / n, ln.y0 + (ln.y1 - ln.y0) * s / n, s % 4 ? PSY_COL.mid : PSY_COL.pink);
  }
}
