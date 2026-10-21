// Efeitos do vento (Araralvo / Araravento): tornado, penas, carga do tornado e vórtice, pixel a pixel no fxT.
import { hash2 } from '../core/math.js';
import { rgba } from './pixel.js';

export const WIND_COL = { white: rgba('#ffffff'), light: rgba('#d8f6ff'), mid: rgba('#8ccbe4'), deep: rgba('#3f7fa6'), dark: rgba('#1c3a52'), ink: rgba('#10202e') };
const FEATHER = [rgba('#e8202a'), rgba('#2a6ad8'), rgba('#3fae4a')];

// Funil girando: anéis que alargam com a altura; a frente de cada anel é clara, o fundo pontilhado e escuro.
export function drawTornado(g, x, y, r, t, id, k = 1) {
  const H = Math.round(r * 3.4);
  // Sombra no chão (o funil lê bem até sobre areia clara).
  for (let q = -r; q <= r; q++) for (let v = -1; v <= 1; v++) if (q * q / (r * r) + v * v / 2 <= 1) g.set(x + q, y + 2 + v, WIND_COL.dark);
  for (let h = 0; h < H; h++) {
    const u = h / H, rw = r * (0.3 + 1.0 * u), cy = y - h;
    const sway = Math.sin(t * 7 + h * 0.22 + id) * u * 2.2;
    const n = Math.max(6, Math.round(rw * 3.2));
    for (let q = 0; q < n; q++) {
      const a = (q / n) * Math.PI * 2 + t * 13 - h * 0.32;
      const front = Math.sin(a) > 0;
      if (!front && (q + h) % 2) continue;
      if (hash2(q, h, Math.floor(t * 20) + id) > 0.55 + 0.45 * k) continue;
      const c = front ? (Math.cos(a) > 0.5 ? WIND_COL.white : WIND_COL.light) : h % 3 ? WIND_COL.deep : WIND_COL.mid;
      g.set(x + sway + Math.cos(a) * rw, cy + Math.sin(a) * rw * 0.28, c);
    }
    // Contorno escuro nas bordas do funil.
    g.set(x + sway - rw - 1, cy, WIND_COL.ink); g.set(x + sway + rw + 1, cy, WIND_COL.ink);
  }
  // Base: poeira girando no chão.
  for (let q = 0; q < 10; q++) {
    const a = (q / 10) * Math.PI * 2 - t * 9;
    g.set(x + Math.cos(a) * r * 0.55, y + 1 + Math.sin(a) * r * 0.2, WIND_COL.dark);
  }
}

// Pena voando: haste de 4 px na cor da arara com ponta branca.
export function drawFeather(g, p, x, y) {
  const an = Math.atan2(p.vy, p.vx), ca = Math.cos(an), sa = Math.sin(an);
  const col = FEATHER[p.id % 3];
  for (let q = -3; q <= 1; q++) g.set(x + ca * q, y + sa * q, col);
  g.set(x + ca * 2, y + sa * 2, WIND_COL.white);
  g.set(x - ca * 2 - sa, y - sa * 2 + ca, col); g.set(x - ca * 2 + sa, y - sa * 2 - ca, col);
}

// Carga do tornado: redemoinho em volta da arara que fecha e clareia; acima de 35% (já levanta) ganha brilho.
export function drawCharge(g, x, y, r, k, t, lifts) {
  const R = r + 10 - k * 4, n = Math.round(10 + k * 18);
  for (let q = 0; q < n; q++) {
    const a = (q / n) * Math.PI * 2 * (0.4 + 0.6 * k) + t * (8 + k * 10);
    const c = lifts ? (q % 3 ? WIND_COL.white : WIND_COL.light) : q % 2 ? WIND_COL.mid : WIND_COL.deep;
    const px = x + Math.cos(a) * R, py = y - 4 + Math.sin(a) * R * 0.45;
    g.set(px, py + 1, WIND_COL.ink); g.set(px, py, c); g.set(px + 1, py, c);
  }
  // Barrinha de carga embaixo dos pés.
  const w = 16, by = y + r * 0.4 + 5;
  for (let i = -1; i <= w; i++) { g.set(x - w / 2 + i, by - 1, WIND_COL.ink); g.set(x - w / 2 + i, by + 2, WIND_COL.ink); }
  for (let i = 0; i < w; i++) for (let v = 0; v < 2; v++) g.set(x - w / 2 + i, by + v, i < w * k ? (k >= 1 ? WIND_COL.white : lifts ? WIND_COL.light : WIND_COL.mid) : WIND_COL.dark);
  // Marca do ponto em que o tornado já levanta (35%).
  g.set(x - w / 2 + Math.round(w * 0.35), by - 2, WIND_COL.white);
}

// Vórtice no chão: braços espiralando para dentro.
export function drawVortex(g, z, t) {
  const fade = Math.min(1, z.life / 0.4), R = z.r, rot = -t * (z.big ? 3 : 4);
  const arms = z.big ? 4 : 3, N = Math.round(R * 2.6);
  for (let a = 0; a < arms; a++) for (let i = 0; i < N; i++) {
    const u = i / N, ang = rot + a * (Math.PI * 2 / arms) + u * Math.PI * 2.6, rr = u * R;
    if (hash2(i, a, Math.floor(t * 10)) > 0.3 + 0.7 * fade) continue;
    const c = u > 0.75 ? WIND_COL.deep : u > 0.4 ? WIND_COL.mid : WIND_COL.light;
    g.set(z.x + Math.cos(ang) * rr, z.y + Math.sin(ang) * rr * 0.6, c);
  }
  const steps = Math.round(R * 3);
  for (let s = 0; s < steps; s += 2) {
    const a = (s / steps) * Math.PI * 2 + rot * 0.5;
    g.set(z.x + Math.cos(a) * R, z.y + Math.sin(a) * R * 0.6, WIND_COL.dark);
  }
  // Prestes a estourar: centro pisca branco.
  if (z.lift && z.life < 0.6 && Math.floor(t * 16) % 2) for (let q = -2; q <= 2; q++) { g.set(z.x + q, z.y, WIND_COL.white); g.set(z.x, z.y + q * 0.6, WIND_COL.white); }
}
