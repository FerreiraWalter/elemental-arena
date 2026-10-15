import { TILE, COLS, ROWS, WORLD_W } from '../config.js';
import { T } from '../sim/tiles.js';

// Arena original: quadra de terra batida com arquibancadas (mantida como arena clássica).
export const COURT = { x: 96, y: 64, w: 448, h: 232, cx: 320, cy: 180, circleR: 56, dotR: 9, semiR: 34 };

const ROCKS = [[236, 132, 11], [150, 254, 8], [312, 112, 6]];
const CRATES = [[118, 146, 7], [292, 262, 7]];
const BUSHES = [[46, 332, 10], [22, 64, 8]];
const WEEDS = [[150, 104, 3.4], [208, 300, 3.0], [96, 220, 2.6], [262, 76, 2.4], [372, 196, 1.8]];
const PONDS = [[46, 300, 4.6, 3.4]];

export default {
  id: 'quadra',
  name: 'Quadra Clássica',
  subtitle: 'A arena original',
  description: 'Quadra de terra cercada de grama, com mato seco, caixotes, lagos e torcida.',
  features: ['Mato seco e grama inflamáveis', 'Caixotes e arbustos destrutíveis', 'Lagos curam o monstro de água'],
  spawns: [{ x: 168, y: 180 }, { x: 472, y: 180 }],
  waterHeal: 1,
  style: { court: true, crowd: true, ambient: 'dust', bg: '#3e7a2c' },
  build(w, B) {
    const tr = w.terrain;
    B.each((i, x, y) => {
      const n = B.noise(x, y, 26) * 22 + B.noise(x, y, 9, 7) * 8;
      const inner = x > 40 + n && x < 600 - n && y > 44 + n * 0.6 && y < 330 - n * 0.6;
      tr.setBase(i, inner ? T.SAND : T.GRASS);
    });
    for (let r = 0; r < 7; r++) for (let c = 36; c < 44; c++) {
      const wob = B.hash(c, r) > 0.75;
      if (!(wob && (c === 36 || c === 43))) tr.setBase(r * COLS + c, T.SAND);
    }
    const tblob = (x, y, rx, ry, type, jitter) => B.blob(x, y, rx * TILE, ry * TILE, type, undefined, jitter);
    B.sym(WEEDS, (x, y, s) => tblob(x, y, s, s * 0.8, T.WEEDS, 0.5));
    B.sym(PONDS, (x, y, rx, ry) => tblob(x, y, rx, ry, T.WATER, 0.25));
    w.walls = [
      { x: 72, y: 4, w: 192, h: 34, kind: 'bleacher' },
      { x: 376, y: 4, w: 192, h: 34, kind: 'bleacher' },
    ];
    for (const wall of w.walls) {
      for (let r = Math.floor(wall.y / TILE); r < Math.ceil((wall.y + wall.h) / TILE); r++)
        for (let c = Math.floor(wall.x / TILE); c < Math.ceil((wall.x + wall.w) / TILE); c++) tr.setBase(tr.idx(c, r), T.BLOCK);
    }
    B.sym(ROCKS, (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym(CRATES, (x, y, r) => w.addObstacle('crate', x, y, r));
    B.sym(BUSHES, (x, y, r) => w.addObstacle('bush', x, y, r));
    void ROWS; void WORLD_W;
  },
};
