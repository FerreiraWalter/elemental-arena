import { TILE, COLS, ROWS, WORLD_W, WORLD_H } from '../config.js';
import { valueNoise, hash2 } from '../core/math.js';

// Ferramentas para montar arenas em coordenadas do mundo (px). Todas aceitam altura opcional.
export function builder(world) {
  const tr = world.terrain;
  const seed = world.seed;
  // Ruído simétrico por rotação de 180° em torno do centro: costas, manchas e bordas ficam iguais dos dois lados
  // (nenhum lado ganha uma ilha maior ou um bosque mais denso). O contraste é restaurado após a média.
  // Com 4 jogadores a simetria é dupla (espelho horizontal E vertical): as 4 quadrantes são iguais.
  const noise = (x, y, scale, off = 0) => {
    const a = valueNoise(x / scale, y / scale, seed + off), b = valueNoise((WORLD_W - x) / scale, y / scale, seed + off);
    const c = valueNoise(x / scale, (WORLD_H - y) / scale, seed + off), d = valueNoise((WORLD_W - x) / scale, (WORLD_H - y) / scale, seed + off);
    return Math.max(0, Math.min(1, 0.5 + ((a + b + c + d) / 4 - 0.5) * 1.7));
  };
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
    // Espelhos: horizontal, vertical e os dois (= rot). `sym4` repete um elemento nos 4 quadrantes (sem duplicar os que
    // ficam sobre um eixo): todos os jogadores têm o mesmo mapa ao redor do seu ponto de nascimento.
    mirX: ([x, y, ...rest]) => [WORLD_W - x, y, ...rest],
    mirY: ([x, y, ...rest]) => [x, WORLD_H - y, ...rest],
    quad(e) {
      const out = [e];
      for (const f of [B.mirX, B.mirY, B.rot]) { const m = f(e); if (!out.some((o) => Math.abs(o[0] - m[0]) < 0.5 && Math.abs(o[1] - m[1]) < 0.5)) out.push(m); }
      return out;
    },
    sym4(list, fn) { for (const e of list) for (const q of B.quad(e)) fn(...q); },
    // Simetria rotacional em torno do centro: duelos justos para os dois lados.
    sym(list, fn) { for (const e of list) { fn(...e); fn(...B.rot(e)); } },
    hash: (x, y, off = 0) => hash2(x | 0, y | 0, seed + off),
  };
  return B;
}
