// Efeitos visuais do gênio do vento (Arutchin/Anemokahn): palma de ar, lâmina de vácuo em meia-lua, a marca de
// Turbulência girando em volta do alvo e as cargas de Brisa sobre a cabeça do gênio.
import { rgba } from './pixel.js';

export const WIND_COL = { core: rgba('#ffffff'), hot: rgba('#d8fbff'), mid: rgba('#9ae8ff'), deep: rgba('#3fa8d8'), dark: rgba('#1a4a6a') };

// Palma de ar: anelzinho de vento com o miolo claro.
export function drawPalm(g, p, x, y, t) {
  x = Math.round(x); y = Math.round(y);
  g.set(x, y, WIND_COL.core);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + t * 14 + p.id;
    g.set(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.2, k % 2 ? WIND_COL.mid : WIND_COL.hot);
  }
  const sp = Math.hypot(p.vx, p.vy) || 1;
  for (let k = 3; k <= 5; k++) g.set(x - (p.vx / sp) * k, y - (p.vy / sp) * k, WIND_COL.deep);
}

// Lâmina de vácuo: meia-lua branca virada para a frente, com fio ciano e rastro de linhas de vento.
export function drawVacuum(g, p, x, y, P) {
  x = Math.round(x); y = Math.round(y);
  const a = Math.atan2(p.vy, p.vx), R = 6;
  const cx = x - Math.cos(a) * 3, cy = y - Math.sin(a) * 3;
  for (let q = -9; q <= 9; q++) {
    const an = a + (q / 9) * 1.25, th = 1 - Math.abs(q) / 10;
    for (let r = R - 1.6 * th; r <= R + 0.4; r += 0.6) g.set(cx + Math.cos(an) * r, cy + Math.sin(an) * r, r > R - 0.4 ? WIND_COL.mid : WIND_COL.core);
  }
  for (const s of [-3, 3]) for (let k = 4; k <= 10; k++) g.set(x - Math.cos(a) * k - Math.sin(a) * s, y - Math.sin(a) * k + Math.cos(a) * s, k < 7 ? WIND_COL.hot : WIND_COL.deep);
  if (P && Math.random() < 0.5) P.add({ ramp: 'wind', x, y, vx: -p.vx * 0.05, vy: -p.vy * 0.05, life: 0.2, add: true });
}

// Turbulência: dois redemoinhos girando em volta da cintura do alvo, piscando no último segundo.
export function drawTurbMark(g, m, x, y, top, t) {
  if (m.turb < 1 && Math.floor(t * 10) % 2) return;
  const R = m.r + 5, cy = y - top * 0.4;
  for (let k = 0; k < 2; k++) for (let q = 0; q < 9; q++) {
    const an = t * 5 + k * Math.PI + q * 0.22;
    const rr = R - q * 0.35;
    g.set(x + Math.cos(an) * rr, cy + Math.sin(an) * rr * 0.45, q < 3 ? WIND_COL.core : q < 6 ? WIND_COL.mid : WIND_COL.deep);
  }
  // Marquinha em espiral sobre a cabeça.
  for (let q = 0; q < 7; q++) { const an = -t * 7 + q * 0.9, rr = 1 + q * 0.45; g.set(x + Math.cos(an) * rr, y - top - 6 + Math.sin(an) * rr * 0.7, q > 4 ? WIND_COL.deep : WIND_COL.mid); }
}

// Cargas de Brisa: bolinhas de vento girando sobre o gênio (uma por carga).
export function drawBrisa(g, m, x, y, top, t) {
  const n = m.brisa || 0;
  for (let k = 0; k < n; k++) {
    const an = t * 4 + k * Math.PI, bx = x + Math.cos(an) * 8, by = y - top - 3 + Math.sin(an) * 2;
    g.set(bx, by, WIND_COL.core); g.set(bx + 1, by, WIND_COL.hot); g.set(bx, by + 1, WIND_COL.mid); g.set(bx - 1, by, WIND_COL.mid);
  }
}

// Palma do Vendaval (Q do Anemokahn): uma mão de vento aberta voando com os dedos para a frente. Desenhada em
// coordenadas da mão (u = para a frente, v = de lado) e girada para a direção do voo: palma oval, quatro dedos, o
// polegar aberto de lado, miolo branco, borda ciano, contorno azul-escuro e linhas de vento saindo do punho.
function inHand(u, v, s) {
  if ((u / (4 * s)) ** 2 + (v / (4.6 * s)) ** 2 <= 1) return 1; // palma
  const fingers = [[-3.9, 8.6], [-1.3, 10.4], [1.3, 10.6], [3.9, 9]]; // [lado, comprimento]
  for (const [fv, len] of fingers) if (Math.abs(v - fv * s) <= 0.85 * s && u >= 1.5 * s && u <= len * s) return 2;
  // Polegar: sai do lado da palma, aberto para fora e um pouco para a frente.
  const tu = u + 0.5 * s, tv = v + 4.2 * s; // base do polegar
  const along = tu * 0.6 - tv * 0.8, across = tu * 0.8 + tv * 0.6; // eixo inclinado ~53° para fora
  if (along >= 0 && along <= 6 * s && Math.abs(across) <= 0.95 * s) return 2;
  return 0;
}
export function drawWindHand(g, p, x, y, t, P) {
  x = Math.round(x); y = Math.round(y); // o buffer de pixels só aceita posição inteira
  const a = Math.atan2(p.vy, p.vx), ca = Math.cos(a), sa = Math.sin(a), s = (p.r || 9) / 9 * 1.25;
  const R = Math.ceil(12 * s);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    const k = inHand(u, v, s);
    if (k) {
      const edge = !inHand(u + 1.2, v, s) || !inHand(u, v + 1.2, s) || !inHand(u, v - 1.2, s) || !inHand(u - 1.2, v, s);
      g.set(x + dx, y + dy, edge ? WIND_COL.mid : k === 1 && v > 1.5 * s ? WIND_COL.hot : WIND_COL.core);
    } else if (inHand(u + 1, v, s) || inHand(u - 1, v, s) || inHand(u, v + 1, s) || inHand(u, v - 1, s)) g.set(x + dx, y + dy, WIND_COL.dark); // contorno
  }
  // Rastro: linhas de vento ondulando atrás do punho.
  for (const off of [-4, 0, 4]) for (let k = 6; k <= 16; k++) {
    const u = -k * s, v = off * s + Math.sin(t * 18 + k * 0.5 + off) * 0.8;
    g.set(x + u * ca - v * sa, y + u * sa + v * ca, k < 10 ? WIND_COL.mid : WIND_COL.deep);
  }
  if (P && Math.random() < 0.6) P.add({ ramp: 'wind', x: x - ca * 8 * s, y: y - sa * 8 * s, vx: -p.vx * 0.08 + (Math.random() - 0.5) * 30, vy: -p.vy * 0.08 + (Math.random() - 0.5) * 30, life: 0.3, add: true });
}
