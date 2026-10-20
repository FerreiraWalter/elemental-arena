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
    if (width >= 2) { g.set(x - 1, y, VOLT_COL.hot); g.set(x + 1, y, VOLT_COL.core); g.set(x + 2, y, VOLT_COL.mid); if (s % 2) g.set(x - 2, y, VOLT_COL.deep); }
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

// Rastro do dash: liga os pedaços de solo eletrificado em um CAMINHO contínuo (brilho no chão + raio tremendo).
export function drawTrails(g, zones, t) {
  const tr = zones.filter((z) => !z.big).sort((a, b) => a.id - b.id);
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (a.team !== b.team || Math.hypot(b.x - a.x, b.y - a.y) > 22) continue;
    const fade = Math.min(1, Math.min(a.life, b.life) / 0.6);
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let s = 0; s <= n; s++) {
      const x = a.x + (b.x - a.x) * s / n, y = a.y + (b.y - a.y) * s / n;
      if (hash2(s + a.id * 31, Math.floor(t * 12), 6) > 0.35 + 0.6 * fade) continue;
      g.set(x, y - 1, VOLT_COL.dark); g.set(x, y + 1, VOLT_COL.dark);
      g.set(x, y, fade > 0.5 ? VOLT_COL.deep : VOLT_COL.dark);
      if ((s + Math.floor(t * 20)) % 4 === 0) g.set(x, y, VOLT_COL.hot);
    }
    if (hash2(a.id, Math.floor(t * 18), 4) < 0.25 + 0.6 * fade) bolt(g, a.x, a.y - 1, b.x, b.y - 1, Math.floor(t * 30) + a.id, { width: 0, jag: 2, glow: false });
  }
}

// Clarão de impacto do raio do céu: disco branco que encolhe para ciano, com o chão chamuscado nas bordas.
export function drawImpact(g, f) {
  const k = f.life / f.max, R = f.r * (0.55 + 0.45 * (1 - k));
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy / 0.6) / R;
    if (d > 1) continue;
    if (d < k * 0.7) g.set(f.x + dx, f.y + dy, d < k * 0.35 ? VOLT_COL.core : VOLT_COL.hot);
    else if (d > 0.82 && hash2(dx | 0, dy | 0, f.id) < 0.5) g.set(f.x + dx, f.y + dy, VOLT_COL.dark);
  }
}

// Núcleo de Sobrecarga carregando: esfera que cresce no peito do gato, com arcos estalando para fora.
export function drawCore(g, x, y, k, t, seed) {
  const R = 2 + k * 6 + Math.sin(t * 40) * 0.6;
  for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
    const d = Math.hypot(dx, dy) + (hash2(dx, dy, Math.floor(t * 30)) - 0.5) * 0.8;
    if (d > R) continue;
    g.set(x + dx, y + dy, d < R * 0.45 ? VOLT_COL.core : d < R * 0.8 ? VOLT_COL.hot : VOLT_COL.mid);
  }
  const arcs = 2 + Math.round(k * 3);
  for (let i = 0; i < arcs; i++) {
    const a = hash2(i, Math.floor(t * 24), seed) * Math.PI * 2, L = R + 4 + k * 10 * hash2(i, Math.floor(t * 24), 7);
    bolt(g, x + Math.cos(a) * R * 0.8, y + Math.sin(a) * R * 0.8, x + Math.cos(a) * L, y + Math.sin(a) * L, Math.floor(t * 30) + i, { width: 0, jag: 2, glow: false });
  }
}

// Cauda de raio dos gatos elétricos (Raiolua/Trovogato): haste que sai do quadril, sobe e termina num caracol
// azul que balança e solta faíscas. Desenhada direto no contexto 2D, ANTES do sprite (fica atrás do corpo).
const TAIL_COL = ['#1d2f9e', '#3f7cff', '#8fe8ff', '#e8fdff'];
export function drawTail(l, x, y, face, size, t, seed, speed = 0, off = 0) {
  const back = -face, k = size;
  const run = Math.min(1, speed / 90);                 // correndo, a cauda deita para trás
  const sway = Math.sin(t * 4 + seed) * 1.2;
  const pts = [];
  // Haste: curva do quadril até o início do caracol.
  const rx = x + back * off * 0.6, ry = y;
  const ex = x + back * (off + (7 + run * 5) * k) + sway * back, ey = y - (9 - run * 5) * k;
  const cx1 = x + back * (off + 7 * k), cy1 = y + 1;
  const NS = Math.round(14 * k);
  for (let i = 0; i <= NS; i++) {
    const u = i / NS, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    pts.push([a * rx + b * cx1 + c * ex, a * ry + b * cy1 + c * ey]);
  }
  // Caracol: gira para cima e de volta na direção do corpo, fechando.
  const R0 = (4 + Math.sin(t * 6 + seed) * 0.4) * k, total = Math.PI * 2 * 1.15;
  const ccx = ex - back * R0, ccy = ey, base = Math.atan2(0, back);
  const NC = Math.round(30 * k);
  for (let i = 1; i <= NC; i++) {
    const d = (i / NC) * total, r = R0 * (1 - 0.72 * d / total);
    const a = base - back * d;
    pts.push([ccx + Math.cos(a) * r, ccy + Math.sin(a) * r]);
  }
  const best = new Map();
  pts.forEach(([qx, qy], i) => {
    const u = i / (pts.length - 1);
    const th = (2.1 - 1.5 * u) * k * 0.75;
    const R = Math.ceil(th + 1.3);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const dd = Math.hypot(dx, dy);
      const c = dd <= th * 0.35 ? 3 : dd <= th * 0.75 ? 2 : dd <= th + 0.3 ? 1 : dd <= th + 1.1 ? 0 : -1;
      if (c < 0) continue;
      const key = (Math.round(qy + dy) << 12) | (Math.round(qx + dx) & 4095);
      if ((best.get(key) ?? -1) < c) best.set(key, c);
    }
  });
  // Brilho correndo pela cauda (pulso de energia indo até a ponta).
  const pulse = Math.floor(((t * 1.6 + seed * 0.1) % 1) * pts.length);
  for (let j = -1; j <= 1; j++) { const q = pts[pulse + j]; if (q) best.set((Math.round(q[1]) << 12) | (Math.round(q[0]) & 4095), 3); }
  for (let c = 0; c < 4; c++) {
    l.fillStyle = TAIL_COL[c];
    for (const [key, cc] of best) if (cc === c) l.fillRect(key & 4095, key >> 12, 1, 1);
  }
  // Faíscas soltas em volta do caracol.
  l.fillStyle = TAIL_COL[3];
  for (let i = 0; i < 3; i++) {
    const f = Math.floor(t * 12);
    if (hash2(i, f, seed) < 0.45) continue;
    const a = hash2(i, f, seed + 1) * Math.PI * 2, r = R0 + 2 + hash2(i, f, seed + 2) * 3 * k;
    l.fillRect(Math.round(ccx + Math.cos(a) * r), Math.round(ccy + Math.sin(a) * r), 1, 1);
  }
}
