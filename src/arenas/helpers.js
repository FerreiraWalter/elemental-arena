import { TILE, COLS, ROWS, WORLD_W, WORLD_H } from '../config.js';
import { valueNoise, hash2 } from '../core/math.js';

// Ferramentas para montar arenas em coordenadas do mundo (px). Todas aceitam altura opcional.
export function builder(world) {
  const tr = world.terrain;
  const seed = world.seed;
  const noise = (x, y, scale, off = 0) => valueNoise(x / scale, y / scale, seed + off);
  const cells = function* () {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) yield [r * COLS + c, c * TILE + 4, r * TILE + 4, c, r];
  };
  const B = {
    tr, seed, noise,
    each(fn) { for (const [i, x, y, c, r] of cells()) fn(i, x, y, c, r); },
    set(i, type, h) { tr.setBase(i, type, h); },
    fill(type, h) { B.each((i) => tr.setBase(i, type, h)); },
    where(pred, type, h) { B.each((i, x, y) => { if (pred(x, y, i)) tr.setBase(i, type, h); }); },
    rect(x, y, w, h, type, height) { B.where((px, py) => px >= x && px < x + w && py >= y && py < y + h, type, height); },
    // Elipse com borda orgânica (jitter em fração do raio).
    blob(cx, cy, rx, ry, type, height, jitter = 0.25, off = 11) {
      B.where((x, y) => {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        return dx * dx + dy * dy + (noise(x, y, 14, off) - 0.5) * jitter * 2 <= 1;
      }, type, height);
    },
    // Faixa ao longo de uma poligonal (caminhos, riachos).
    path(points, width, type, height, jitter = 0.3) {
      B.where((x, y) => {
        let best = Infinity;
        for (let k = 0; k < points.length - 1; k++) {
          const [x0, y0] = points[k], [x1, y1] = points[k + 1];
          const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
          const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
          best = Math.min(best, Math.hypot(x - x0 - dx * t, y - y0 - dy * t));
        }
        return best <= width / 2 + (noise(x, y, 10, 5) - 0.5) * width * jitter;
      }, type, height);
    },
    rot: ([x, y, ...rest]) => [WORLD_W - x, WORLD_H - y, ...rest],
    // Simetria rotacional em torno do centro: duelos justos para os dois lados.
    sym(list, fn) { for (const e of list) { fn(...e); fn(...B.rot(e)); } },
    hash: (x, y, off = 0) => hash2(x | 0, y | 0, seed + off),
  };
  return B;
}
