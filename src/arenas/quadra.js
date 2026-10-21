import { TILE, COLS, ROWS, WORLD_W, WORLD_H } from '../config.js';
import { T } from '../sim/tiles.js';

// Quadra Clássica (1024×576): a arena mais limpa e competitiva. Terra batida com linhas, arquibancadas contínuas em
// cima e embaixo e cercas nas laterais (limites sempre visíveis). O mapa é IGUAL nos 4 quadrantes (espelho horizontal
// e vertical): quem nasce em qualquer canto vê a mesma cobertura. Poucos obstáculos, todos intencionais:
// rochas (permanentes) e caixotes (quebram e queimam) servem de cobertura; mato seco e lagos nos cantos ficam fora do
// centro. Nada é decoração "sólida": o que bloqueia tem hitbox do tamanho do desenho.
export const COURT = { x: 144, y: 100, w: 736, h: 376, cx: 512, cy: 288, circleR: 72, dotR: 9, semiR: 44 };

// Nascimento no todos-contra-todos (um por quadrante) e no duelo/2v2 (lados opostos da quadra).
const SPAWNS_FFA = [{ x: 176, y: 140 }, { x: 848, y: 436 }, { x: 848, y: 140 }, { x: 176, y: 436 }];
export const PADS = SPAWNS_FFA.concat([{ x: 120, y: 288 }, { x: 904, y: 288 }]);

const ROCKS = [[300, 196, 11], [452, 128, 9]]; // cobertura permanente (e espelhos)
const CRATES = [[238, 168, 7], [384, 226, 7]]; // cobertura destrutível e inflamável
const WEEDS = [[216, 114, 3.4], [470, 92, 3.0], [92, 232, 2.6]];
const PONDS = [[64, 516, 4.2, 3.0]];

export default {
  id: 'quadra',
  name: 'Quadra Clássica',
  subtitle: 'A arena de referência',
  description: 'Quadra de terra com linhas, arquibancadas e cercas: limites sempre visíveis, cobertura mínima e simétrica nos quatro cantos. Rochas (permanentes) e caixotes (quebram e queimam). Ideal para aprender e duelar.',
  features: ['Mapa idêntico nos 4 quadrantes: nenhum canto leva vantagem', 'Rochas bloqueiam para sempre; caixotes quebram e queimam', 'Mato seco e grama inflamáveis; lagos nos cantos curam o monstro de água', 'Centro e laterais abertos: bom para 1v1, 2v2 e 1v1v1v1'],
  spawns: [{ x: 120, y: 288 }, { x: 904, y: 288 }],
  spawnsFFA: SPAWNS_FFA,
  // Relíquias de cura (simétricas: nenhum lado fica mais perto).
  relics: [[512, 120], [512, 456]],
  waterHeal: 1,
  style: { court: true, crowd: true, ambient: 'dust', bg: '#3e7a2c' },
  build(w, B) {
    const tr = w.terrain;
    B.each((i, x, y) => {
      const n = B.noise(x, y, 26) * 22 + B.noise(x, y, 9, 7) * 8;
      const inner = x > 56 + n && x < WORLD_W - 56 - n && y > 52 + n * 0.6 && y < WORLD_H - 52 - n * 0.6;
      tr.setBase(i, inner ? T.SAND : T.GRASS);
    });
    const tblob = (x, y, rx, ry, type, jitter) => B.blob(x, y, rx * TILE, ry * TILE, type, undefined, jitter);
    B.sym4(WEEDS, (x, y, s) => tblob(x, y, s, s * 0.8, T.WEEDS, 0.5));
    B.sym4(PONDS, (x, y, rx, ry) => tblob(x, y, rx, ry, T.WATER, 0.25));
    // Paredes: arquibancadas contínuas (cima/baixo) e cercas nas laterais. Sólidos, hitbox = retângulo desenhado.
    w.walls = [
      { x: 36, y: 4, w: WORLD_W - 72, h: 34, kind: 'bleacher' }, { x: 36, y: WORLD_H - 38, w: WORLD_W - 72, h: 34, kind: 'bleacher' },
      { x: 2, y: 40, w: 12, h: WORLD_H - 80, kind: 'fence' }, { x: WORLD_W - 14, y: 40, w: 12, h: WORLD_H - 80, kind: 'fence' },
    ];
    for (const wall of w.walls) {
      for (let r = Math.floor(wall.y / TILE); r < Math.ceil((wall.y + wall.h) / TILE); r++)
        for (let c = Math.floor(wall.x / TILE); c < Math.ceil((wall.x + wall.w) / TILE); c++) tr.setBase(tr.idx(c, r), T.BLOCK);
    }
    B.sym4(ROCKS, (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym4(CRATES, (x, y, r) => w.addObstacle('crate', x, y, r));
    w.hazards = [];
    w.decor = [];
    void COLS; void ROWS;
  },
};
