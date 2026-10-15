import { T } from '../sim/tiles.js';

// Floresta Ancestral: árvores gigantes, troncos caídos, rochas com musgo e cogumelos.
// Ênfase em posicionamento, linha de visão e cobertura que pode queimar.
const TREES = [[80, 72, 14], [205, 52, 13], [178, 258, 15], [256, 136, 12], [118, 328, 13], [300, 300, 11]];
const LOGS = [[[226, 242], [286, 266]], [[104, 150], [146, 118]]]; // troncos caídos (segmentos)
const ROCKS = [[300, 64, 9], [54, 250, 8]];
const BUSHES = [[146, 204, 8], [232, 96, 8], [36, 120, 7]];

export default {
  id: 'floresta',
  name: 'Floresta Ancestral',
  subtitle: 'Árvores gigantes e cobertura',
  description: 'Uma floresta encantada e densa. Árvores e rochas bloqueiam tiros; troncos caídos são cobertura que pode queimar e abrir caminhos.',
  features: [
    'Árvores e rochas bloqueiam passagem, tiros e visão',
    'Troncos caídos: cobertura destrutível e inflamável',
    'Mata baixa atrasa; folhas secas queimam rápido',
    'Riacho e lago no centro',
  ],
  spawns: [{ x: 64, y: 186 }, { x: 576, y: 174 }],
  waterHeal: 1,
  style: { ambient: 'leaves', bg: '#1d3a1c', canopy: true, palette: { grass: ['#24461f', '#2c5626', '#35662c', '#3f7634', '#5a9444'] } },
  build(w, B) {
    const tr = w.terrain;
    // Chão de musgo com clareiras de terra, folhas secas e mata baixa.
    B.each((i, x, y) => {
      const n = B.noise(x, y, 46, 2) * 0.8 + B.noise(x, y, 12, 4) * 0.2;
      tr.setBase(i, n > 0.66 ? T.LEAVES : n < 0.3 ? T.DIRT : T.MOSS);
    });
    B.sym([[120, 220, 16, 12], [210, 170, 14, 10], [40, 40, 22, 16]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.UNDERGROWTH, undefined, 0.5, 13));
    // Trilha sinuosa e clareira central.
    B.path([[0, 186], [110, 176], [210, 120], [320, 180], [430, 240], [530, 184], [640, 174]], 16, T.DIRT, undefined, 0.35);
    B.blob(320, 180, 34, 28, T.DIRT, undefined, 0.3);
    // Riacho descendo pelo centro até um lago raso.
    B.path([[300, 0], [318, 60], [334, 128]], 12, T.WATER, undefined, 0.2);
    B.path([[340, 360], [322, 300], [306, 232]], 12, T.WATER, undefined, 0.2);
    B.blob(320, 180, 18, 13, T.WATER, undefined, 0.2);
    // Árvores (troncos sólidos), troncos caídos, rochas e arbustos.
    B.sym(TREES, (x, y, r) => w.addObstacle('tree', x, y, r));
    for (const seg of LOGS) for (const [[x0, y0], [x1, y1]] of [seg, [B.rot(seg[0]), B.rot(seg[1])]]) {
      const n = 4, ang = Math.atan2(y1 - y0, x1 - x0);
      const group = {};
      for (let k = 0; k < n; k++) {
        const o = w.addObstacle('log', x0 + (x1 - x0) * (k + 0.5) / n, y0 + (y1 - y0) * (k + 0.5) / n, 6);
        o.ang = ang; o.seg = k; o.segs = n; o.group = group;
      }
    }
    B.sym(ROCKS, (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym(BUSHES, (x, y, r) => w.addObstacle('bush', x, y, r));
    w.hazards = [];
    // Decoração: copas, cogumelos luminosos e feixes de luz.
    w.decor = [];
    for (const o of w.obstacles) if (o.kind === 'tree') w.decor.push({ kind: 'canopy', x: o.x, y: o.y - 10, r: o.r * 2.6, o });
    B.sym([[96, 98], [192, 280], [240, 160], [300, 200], [140, 340], [36, 60]], (x, y) => w.decor.push({ kind: 'mushroom', x, y, c: B.hash(x, y) }));
    w.decor.push({ kind: 'lightshafts' });
  },
};
