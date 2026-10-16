import { TILE, COLS, ROWS, WORLD_W } from '../config.js';
import { T } from '../sim/tiles.js';

// Quadra Clássica: a arena mais limpa. Terra batida com linhas, arquibancadas em cima e embaixo (simétrico),
// poucos obstáculos intencionais: rochas e caixotes como cobertura, mato seco e lagos nos cantos.
// Tudo que bloqueia tem hitbox do tamanho do desenho; nada é espalhado "só de enfeite".
export const COURT = { x: 112, y: 72, w: 480, h: 256, cx: 352, cy: 200, circleR: 60, dotR: 9, semiR: 36 };

const ROCKS = [[262, 140, 11]]; // cobertura permanente (e seu espelho)
const CRATES = [[196, 152, 7], [352, 124, 7]]; // cobertura destrutível e inflamável
const WEEDS = [[176, 112, 3.4], [238, 304, 3.0], [112, 232, 2.6], [300, 86, 2.4]];
const PONDS = [[56, 332, 3.8, 2.8]];

export default {
  id: 'quadra',
  name: 'Quadra Clássica',
  subtitle: 'A arena de referência',
  description: 'Quadra de terra com linhas, arquibancadas dos dois lados e torcida. Pouca cobertura: rochas (permanentes) e caixotes (quebram e queimam). Ideal para aprender e duelar.',
  features: ['Rochas bloqueiam para sempre; caixotes quebram e queimam', 'Mato seco e grama inflamáveis', 'Lagos nos cantos curam o monstro de água', 'Centro e laterais abertos: bom para 2v2'],
  spawns: [{ x: 104, y: 200 }, { x: 600, y: 200 }],
  waterHeal: 1,
  style: { court: true, crowd: true, ambient: 'dust', bg: '#3e7a2c' },
  build(w, B) {
    const tr = w.terrain;
    B.each((i, x, y) => {
      const n = B.noise(x, y, 26) * 22 + B.noise(x, y, 9, 7) * 8;
      const inner = x > 44 + n && x < 660 - n && y > 48 + n * 0.6 && y < 352 - n * 0.6;
      tr.setBase(i, inner ? T.SAND : T.GRASS);
    });
    // Corredores de terra por trás das arquibancadas (entrada da torcida) e a faixa central.
    for (const rows of [[0, 8], [ROWS - 8, ROWS]]) for (let r = rows[0]; r < rows[1]; r++) for (let c = 36; c < 52; c++) {
      const wob = B.hash(c, r) > 0.75;
      if (!(wob && (c === 36 || c === 51))) tr.setBase(r * COLS + c, T.SAND);
    }
    const tblob = (x, y, rx, ry, type, jitter) => B.blob(x, y, rx * TILE, ry * TILE, type, undefined, jitter);
    B.sym(WEEDS, (x, y, s) => tblob(x, y, s, s * 0.8, T.WEEDS, 0.5));
    B.sym(PONDS, (x, y, rx, ry) => tblob(x, y, rx, ry, T.WATER, 0.25));
    w.walls = [
      { x: 76, y: 4, w: 200, h: 34, kind: 'bleacher' }, { x: 428, y: 4, w: 200, h: 34, kind: 'bleacher' },
      { x: 76, y: 362, w: 200, h: 34, kind: 'bleacher' }, { x: 428, y: 362, w: 200, h: 34, kind: 'bleacher' },
    ];
    for (const wall of w.walls) {
      for (let r = Math.floor(wall.y / TILE); r < Math.ceil((wall.y + wall.h) / TILE); r++)
        for (let c = Math.floor(wall.x / TILE); c < Math.ceil((wall.x + wall.w) / TILE); c++) tr.setBase(tr.idx(c, r), T.BLOCK);
    }
    B.sym(ROCKS, (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym(CRATES, (x, y, r) => w.addObstacle('crate', x, y, r));
    w.hazards = [];
    w.decor = [];
    void WORLD_W;
  },
};
