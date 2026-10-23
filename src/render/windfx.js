// Efeitos visuais do gênio do vento (Zefirinho/Zefirão): palma de ar, lâmina de vácuo em meia-lua, a marca de
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
