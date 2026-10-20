import { T } from '../sim/tiles.js';

// Floresta Ancestral: árvores colossais, trilha de terra, clareira central com um pequeno santuário antigo.
// Leitura: árvore/rocha/pilar = sólido permanente · tronco caído/arbusto = cobertura que quebra e queima ·
// musgo, folhas, mata baixa e terra = passáveis (mata baixa atrasa; folhas secas queimam rápido).
// Árvores maiores ficam nas bordas e nas "esquinas" da clareira; as rotas laterais ficam livres.
const MIRS = (B) => [(p) => p, B.mirX, B.mirY, B.rot];
const TREES = [[96, 60, 15], [250, 50, 13], [330, 150, 12], [70, 232, 14], [392, 70, 12], [420, 190, 10], [40, 170, 12], [200, 20, 11]];
const GIANTS = [[44, 52, 19]]; // árvores ancestrais nos cantos (marcos)
const LOGS = [[[270, 250], [330, 226]], [[116, 170], [190, 190]]]; // troncos caídos (segmentos), longe das trilhas
const ROCKS = [[318, 90, 9], [60, 290, 8], [470, 130, 8]];
const BUSHES = [[160, 222, 8], [254, 110, 8], [380, 240, 8]];
const SPAWNS_FFA = [{ x: 150, y: 120 }, { x: 874, y: 456 }, { x: 874, y: 120 }, { x: 150, y: 456 }];

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
  spawns: [{ x: 120, y: 288 }, { x: 904, y: 288 }],
  spawnsFFA: SPAWNS_FFA,
  waterHeal: 1,
  style: { ambient: 'leaves', bg: '#1d3a1c', canopy: true, palette: { grass: ['#24461f', '#2c5626', '#35662c', '#3f7634', '#5a9444'] } },
  build(w, B) {
    const tr = w.terrain;
    B.each((i, x, y) => {
      const n = B.noise(x, y, 46, 2) * 0.8 + B.noise(x, y, 12, 4) * 0.2;
      tr.setBase(i, n > 0.68 ? T.LEAVES : n < 0.3 ? T.DIRT : T.MOSS);
    });
    // Faixa de mata baixa nas bordas e manchas internas.
    B.sym4([[90, 24, 70, 14], [300, 36, 60, 12], [30, 210, 12, 50], [240, 220, 16, 12]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.UNDERGROWTH, undefined, 0.5, 13));
    // Quatro trilhas de terra: do nascimento de cada canto até a clareira central.
    for (const mir of MIRS(B)) B.path([[150, 120], [250, 150], [350, 200], [430, 250], [512, 288]].map(mir), 20, T.DIRT, undefined, 0.35);
    B.blob(512, 288, 78, 58, T.DIRT, undefined, 0.3);
    // Riachos descendo do topo e subindo da base até o lago central (atravessáveis; água atrasa quem não é de água).
    for (const mir of [(p) => p, B.mirY]) B.path([[512, 0], [520, 60], [512, 120], [512, 238]].map(mir), 12, T.WATER, undefined, 0.2);
    B.blob(512, 288, 20, 14, T.WATER, undefined, 0.2);
    B.sym4(TREES, (x, y, r) => w.addObstacle('tree', x, y, r));
    B.sym4(GIANTS, (x, y, r) => w.addObstacle('tree', x, y, r));
    for (const seg of LOGS) for (const mir of MIRS(B)) {
      const [[x0, y0], [x1, y1]] = seg.map(mir);
      const n = 4, ang = Math.atan2(y1 - y0, x1 - x0), group = {};
      for (let k = 0; k < n; k++) {
        const o = w.addObstacle('log', x0 + (x1 - x0) * (k + 0.5) / n, y0 + (y1 - y0) * (k + 0.5) / n, 6);
        o.ang = ang; o.seg = k; o.segs = n; o.group = group;
      }
    }
    B.sym4(ROCKS, (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym4(BUSHES, (x, y, r) => w.addObstacle('bush', x, y, r));
    // Santuário antigo: 4 pilares na clareira (cobertura permanente, bordas abertas).
    for (const [dx, dy] of [[-36, -30], [36, -30], [-36, 30], [36, 30]]) w.addObstacle('pillar', 512 + dx, 288 + dy, 6);
    w.hazards = [];
    w.decor = [];
    for (const o of w.obstacles) if (o.kind === 'tree') w.decor.push({ kind: 'canopy', x: o.x, y: o.y - 10, r: o.r * 2.6, o });
    B.sym4([[108, 100], [210, 320], [270, 176], [400, 224], [150, 372], [40, 60]], (x, y) => w.decor.push({ kind: 'mushroom', x, y, c: B.hash(x, y) }));
    w.decor.push({ kind: 'lightshafts' });
  },
};
