// Efeitos visuais do elemento elétrico (Raiolua/Trovogato) e da Casca Viva do Brotossauro.
// Tudo em pixel art sobre os buffers de efeitos do renderer (fxG = chão, fxT = por cima).
import { rgba } from './pixel.js';
import { hash2 } from '../core/math.js';

export const VOLT_COL = { core: rgba('#ffffff'), hot: rgba('#d8fbff'), mid: rgba('#8fe8ff'), deep: rgba('#3fa9ff'), dark: rgba('#2a4cff', 200), glow: rgba('#8fe8ff', 110) };
const BARK = [rgba('#4e2e1a'), rgba('#7a4a28'), rgba('#a8743e'), rgba('#5aa83c'), rgba('#9be862')];

// Raio em zigue-zague entre dois pontos (pixel a pixel). seed muda o desenho a cada quadro.
export function bolt(g, x0, y0, x1, y1, seed, { width = 1, jag = 4, glow = true } = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const segs = Math.max(2, Math.round(L / 7));
  let px = x0, py = y0;
  for (let i = 1; i <= segs; i++) {
    const k = i / segs;
    const off = i === segs ? 0 : (hash2(i, seed, 41) - 0.5) * 2 * jag * Math.sin(Math.PI * k);
    const qx = x0 + dx * k + nx * off, qy = y0 + dy * k + ny * off;
    line(g, px, py, qx, qy, width, glow);
    // Galhinhos laterais.
    if (hash2(i, seed, 77) > 0.8 && i < segs) {
      const s = (hash2(i, seed, 13) - 0.5) * 2;
      line(g, qx, qy, qx + nx * 5 * s + dx / L * 4, qy + ny * 5 * s + dy / L * 4, 0, false);
    }
    px = qx; py = qy;
  }
}

function line(g, x0, y0, x1, y1, width, glow) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let s = 0; s <= n; s++) {
    const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n;
    g.set(x, y, VOLT_COL.core);
    if (width >= 1) { g.set(x + 1, y, VOLT_COL.mid); g.set(x, y + 1, VOLT_COL.mid); }
    if (glow && s % 2 === 0) { g.set(x - 1, y, VOLT_COL.deep); g.set(x, y - 1, VOLT_COL.glow); }
  }
}

// Bola de Raio: núcleo branco, casca ciano e faíscas tremendo em volta.
export function drawSpark(g, p, x, y, t, P) {
  const R = p.kind === 'voltOrb' ? 4 : 2.6, hy = y;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const d = Math.hypot(dx, dy) + (hash2(dx, dy, Math.floor(t * 30)) - 0.5) * 0.9;
    if (d > R + 0.6) continue;
    g.set(x + dx, hy + dy, d < R * 0.4 ? VOLT_COL.core : d < R * 0.75 ? VOLT_COL.hot : VOLT_COL.mid);
  }
  const arcs = p.kind === 'voltOrb' ? 3 : 2;
  for (let k = 0; k < arcs; k++) {
    const a = t * 18 + k * 2.1 + hash2(k, Math.floor(t * 20), 5) * 2;
    const r2 = R + 2 + hash2(k, Math.floor(t * 24), 9) * 3;
    bolt(g, x + Math.cos(a) * (R - 1), hy + Math.sin(a) * (R - 1), x + Math.cos(a) * r2, hy + Math.sin(a) * r2, Math.floor(t * 40) + k, { width: 0, jag: 1, glow: false });
  }
  if (Math.random() < 0.6) P.add({ ramp: 'volt', x: x - p.vx * 0.02, y: hy, vx: -p.vx * 0.15 + (Math.random() - 0.5) * 30, vy: -p.vy * 0.15 + (Math.random() - 0.5) * 30, life: 0.22, add: true });
}

// Marca no chão antes do raio cair: círculo tracejado que pisca e "aperta", com faíscas subindo.
export function drawThunderMark(g, p, t, dotCircle) {
  const k = p.t / p.flight, R = p.radius;
  const blink = Math.floor(t * (10 + k * 20)) % 2;
  dotCircle(g, p.tx, p.ty, R, blink ? VOLT_COL.core : VOLT_COL.deep, t * 3, 3);
  dotCircle(g, p.tx, p.ty, Math.max(2, R * (1 - k)), VOLT_COL.mid, -t * 5, 3);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + t * 2;
    g.set(p.tx + Math.cos(a) * R * 0.5, p.ty + Math.sin(a) * R * 0.45, VOLT_COL.hot);
  }
  if (k > 0.55 && hash2(Math.floor(t * 30), p.id, 3) > 0.6) {
    // Pré-descarga: fiozinhos de raio descendo do céu.
    bolt(g, p.tx + (hash2(p.id, Math.floor(t * 30), 1) - 0.5) * R, p.ty - 70, p.tx + (hash2(p.id, Math.floor(t * 30), 2) - 0.5) * R * 0.6, p.ty - 20, Math.floor(t * 30), { width: 0, jag: 3, glow: false });
  }
}

// Solo eletrificado: linhas de choque cruzando o círculo, piscando; some aos poucos.
export function drawZone(g, z, t) {
  const fade = Math.min(1, z.life / 0.6);
  const R = z.r;
  const seed = Math.floor(t * 14) + z.id * 7;
  const n = z.big ? 4 : 1;
  for (let k = 0; k < n; k++) {
    if (hash2(k, seed, z.id) > 0.45 + fade * 0.5) continue;
    const a = hash2(k, seed, 3) * Math.PI * 2, b = a + Math.PI * (0.6 + hash2(k, seed, 4) * 0.8);
    bolt(g, z.x + Math.cos(a) * R * 0.9, z.y + Math.sin(a) * R * 0.8, z.x + Math.cos(b) * R * 0.9, z.y + Math.sin(b) * R * 0.8, seed + k, { width: 0, jag: 2, glow: false });
  }
  const dots = z.big ? 22 : 6;
  for (let q = 0; q < dots; q++) {
    if (hash2(q, seed, z.id + 5) > 0.6 * fade + 0.1) continue;
    const a = (q / dots) * Math.PI * 2 + t;
    const r = R * (0.3 + 0.7 * hash2(q, z.id, 8));
    g.set(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.85, q % 3 ? VOLT_COL.deep : VOLT_COL.mid);
  }
}

// Cargas do gato: pontinhos de luz girando em volta da cabeça; cheio, arcos saem do corpo.
export function drawVolt(g, m, x, y, top, t, max) {
  const n = m.volt || 0;
  if (!n) return;
  const cy = y - top * 0.6;
  for (let k = 0; k < n; k++) {
    const a = t * 4 + (k / max) * Math.PI * 2;
    const px = x + Math.cos(a) * (m.r + 5), py = cy + Math.sin(a) * (m.r + 5) * 0.45;
    g.set(px, py, VOLT_COL.core); g.set(px + 1, py, VOLT_COL.mid); g.set(px, py + 1, VOLT_COL.deep);
  }
  if (n >= max && hash2(m.id, Math.floor(t * 16), 2) > 0.45) {
    const a = hash2(m.id, Math.floor(t * 16), 3) * Math.PI * 2;
    bolt(g, x, cy, x + Math.cos(a) * (m.r + 8), cy + Math.sin(a) * (m.r + 6), Math.floor(t * 16), { width: 0, jag: 2, glow: false });
  }
}

// Casca Viva: placas de casca e folhas girando em volta do corpo (quem está protegido).
export function drawBark(g, m, x, y, top, t) {
  const R = m.r + 4, cy = y - top * 0.35;
  const k = Math.min(1, m.status.dr / 0.8);
  const n = 14;
  for (let q = 0; q < n; q++) {
    if (q / n > k + 0.15) continue;
    const a = (q / n) * Math.PI * 2 + t * 0.9;
    const px = x + Math.cos(a) * R, py = cy + Math.sin(a) * R * 0.75;
    const leaf = q % 4 === 0;
    g.set(px, py, leaf ? BARK[3 + (Math.floor(t * 4 + q) & 1)] : BARK[1 + (q & 1)]);
    if (!leaf) g.set(px, py + 1, BARK[0]);
  }
}

// Seiva grudada (lento): gotas verdes escorrendo dos pés.
export function sapDrip(P, x, y, r) {
  if (Math.random() < 0.18) P.add({ ramp: 'sap', x: x + (Math.random() - 0.5) * r * 1.6, y, z: 6 + Math.random() * 6, vz: -6, g: 120, life: 0.5 });
}
