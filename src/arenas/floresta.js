import { T } from '../sim/tiles.js';

// Floresta Ancestral: árvores colossais, trilha de terra, clareira central com um pequeno santuário antigo.
// Leitura: árvore/rocha/pilar = sólido permanente · tronco caído/arbusto = cobertura que quebra e queima ·
// musgo, folhas, mata baixa e terra = passáveis (mata baixa atrasa; folhas secas queimam rápido).
// Árvores maiores ficam nas bordas e nas "esquinas" da clareira; as rotas laterais ficam livres.
const TREES = [[96, 76, 15], [228, 54, 13], [204, 292, 16], [284, 132, 12], [130, 356, 13], [330, 326, 11], [168, 168, 10]];
const GIANTS = [[44, 120, 19]]; // árvores ancestrais em cantos (marcos para memorizar a região)
const LOGS = [[[246, 262], [306, 290]], [[116, 156], [158, 122]]]; // troncos caídos (segmentos), longe da trilha
const ROCKS = [[318, 70, 9], [60, 276, 8]];
const BUSHES = [[160, 222, 8], [254, 100, 8]];

export default {
  id: 'floresta',
  name: 'Floresta Ancestral',
  subtitle: 'Árvores colossais e trilhas',
  description: 'Uma floresta antiga e viva. Árvores e rochas bloqueiam tiros; troncos caídos são cobertura que quebra e queima. A trilha de terra e a clareira central são abertas.',
  features: [
    'Árvores e rochas: sólidas e permanentes (bloqueiam tiros e visão)',
    'Troncos caídos e arbustos: cobertura que queima',
    'Mata baixa atrasa; folhas secas queimam rápido',
    'Riacho, lago raso e santuário de pilares no centro',
  ],
  spawns: [{ x: 84, y: 200 }, { x: 620, y: 200 }],
  waterHeal: 1,
  style: { ambient: 'leaves', bg: '#1d3a1c', canopy: true, palette: { grass: ['#24461f', '#2c5626', '#35662c', '#3f7634', '#5a9444'] } },
  build(w, B) {
    const tr = w.terrain;
    B.each((i, x, y) => {
      const n = B.noise(x, y, 46, 2) * 0.8 + B.noise(x, y, 12, 4) * 0.2;
      tr.setBase(i, n > 0.68 ? T.LEAVES : n < 0.3 ? T.DIRT : T.MOSS);
    });
    B.sym([[136, 236, 16, 12], [236, 188, 14, 10], [48, 44, 22, 16]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.UNDERGROWTH, undefined, 0.5, 13));
    // Trilha sinuosa e clareira central.
    B.path([[0, 200], [120, 190], [230, 130], [352, 200], [474, 270], [584, 210], [704, 200]], 18, T.DIRT, undefined, 0.35);
    B.blob(352, 200, 44, 34, T.DIRT, undefined, 0.3);
    // Riacho descendo pelo centro até um lago raso (atravessável em qualquer ponto; água atrasa quem não é de água).
    B.path([[330, 0], [350, 60], [364, 130]], 12, T.WATER, undefined, 0.2);
    B.path([[374, 400], [354, 340], [340, 270]], 12, T.WATER, undefined, 0.2);
    B.blob(352, 200, 18, 13, T.WATER, undefined, 0.2);
    // Árvores, troncos caídos, rochas e arbustos.
    B.sym(TREES, (x, y, r) => w.addObstacle('tree', x, y, r));
    B.sym(GIANTS, (x, y, r) => w.addObstacle('tree', x, y, r));
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
    // Santuário antigo: 4 pilares de pedra em quadrado na clareira (cobertura permanente, bordas abertas).
    for (const [dx, dy] of [[-34, -30], [34, -30], [-34, 30], [34, 30]]) w.addObstacle('pillar', 352 + dx, 200 + dy, 6);
    w.hazards = [];
    w.decor = [];
    for (const o of w.obstacles) if (o.kind === 'tree') w.decor.push({ kind: 'canopy', x: o.x, y: o.y - 10, r: o.r * 2.6, o });
    B.sym([[108, 100], [210, 320], [270, 176], [334, 224], [150, 372], [40, 60]], (x, y) => w.decor.push({ kind: 'mushroom', x, y, c: B.hash(x, y) }));
    w.decor.push({ kind: 'lightshafts' });
  },
};
