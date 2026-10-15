import { TILE, COLS, ROWS } from '../config.js';
import { T } from '../sim/tiles.js';
import { Geyser } from '../sim/hazards.js';

// Abismo das Marés: ilhas de pedra sobre água funda, com uma plataforma elevada no centro.
// Visão de cima: as "plataformas" são níveis de altura. Penhascos bloqueiam a passagem e os tiros de
// quem está embaixo (quem está no alto atira para baixo); escadas e pontes ligam os níveis.
// Alturas: 0 água funda · 0.5 água rasa (vau) · 1 ilhas · 1.5/2.0 escadas · 2.5 plataforma.
const PLAT = { c0: 34, c1: 45, r0: 18, r1: 27 }; // plataforma central (colunas/linhas, inclusivas)

export default {
  id: 'abismo',
  name: 'Abismo das Marés',
  subtitle: 'Ilhas, vaus e uma plataforma alta',
  description: 'Ilhas de pedra sobre um abismo de água. Pontes e vaus com correnteza ligam as ilhas; quem domina a plataforma alta atira de cima.',
  features: [
    'Água funda: só o monstro de água nada nela',
    'Plataforma alta: de baixo não dá para acertar quem está em cima',
    'Vaus com correnteza empurram quem atravessa',
    'Gêiseres explodem, arremessam e apagam o fogo',
  ],
  spawns: [{ x: 96, y: 180 }, { x: 544, y: 180 }],
  waterHeal: 0.6,
  heights: true,
  style: { ambient: 'mist', bg: '#0e2a4a' },
  build(w, B) {
    const tr = w.terrain;
    B.fill(T.DEEP, 0);
    // Ilhas laterais e central (chão = altura 1), com bordas irregulares.
    const island = (cx, cy, rx, ry, xmin, xmax, off) => B.where((x, y) => {
      if (x < xmin || x > xmax) return false;
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      return dx * dx + dy * dy + (B.noise(x, y, 18, off) - 0.5) * 0.5 <= 1;
    }, T.STONE, 1);
    island(100, 180, 104, 150, 12, 199, 1);
    island(540, 180, 104, 150, 441, 628, 1);
    island(320, 180, 120, 140, 225, 415, 2);
    // Praias de areia nas bordas das ilhas.
    B.each((i, x, y, c, r) => {
      if (tr.type[i] !== T.STONE) return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = tr.idx(c + dx, r + dy);
        if (j >= 0 && tr.type[j] === T.DEEP) { tr.setBase(i, T.SAND, 1); return; }
      }
    });
    // Musgo e algas sobre a pedra.
    B.each((i, x, y) => { if (tr.type[i] === T.STONE && B.noise(x, y, 22, 9) > 0.66) tr.setBase(i, T.MOSS, 1); });
    // Vaus: água rasa com correnteza entre as ilhas (esquerda desce, direita sobe).
    for (const [x0, x1, flow] of [[200, 225, 26], [416, 441, -26]]) {
      B.where((x, y) => x >= x0 && x < x1 && y > 56 && y < 304, T.WATER, 0.5);
      B.each((i, x, y) => {
        if (x >= x0 && x < x1 && tr.type[i] === T.WATER) { tr.flowY[i] = flow; tr.flowX[i] = 0; }
      });
    }
    // Pontes sobre os vaus (altura 1: caminho seguro).
    for (const by of [92, 252]) for (const [x0, x1] of [[150, 240], [400, 490]]) B.rect(x0, by, x1 - x0, 24, T.BRIDGE, 1);
    // Plataforma central elevada e escadas ao norte e ao sul.
    for (let r = PLAT.r0; r <= PLAT.r1; r++) for (let c = PLAT.c0; c <= PLAT.c1; c++) tr.setBase(tr.idx(c, r), T.STONE, 2.5);
    for (let c = 38; c <= 41; c++) {
      tr.setBase(tr.idx(c, PLAT.r0 - 2), T.STONE, 1.5); tr.setBase(tr.idx(c, PLAT.r0 - 1), T.STONE, 2);
      tr.setBase(tr.idx(c, PLAT.r1 + 2), T.STONE, 1.5); tr.setBase(tr.idx(c, PLAT.r1 + 1), T.STONE, 2);
    }
    // Lagunas fundas dentro das ilhas laterais (o monstro de água mergulha; os outros contornam).
    B.sym([[70, 96, 18, 14]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.DEEP, 0, 0.3, 5));
    // Ruínas submersas: colunas e rochas como cobertura.
    B.sym([[150, 120, 6], [86, 262, 6], [270, 112, 6], [262, 244, 6]], (x, y, r) => w.addObstacle('pillar', x, y, r));
    B.sym([[166, 214, 8]], (x, y, r) => w.addObstacle('rock', x, y, r));
    // Gêiseres nos vaus e na ilha central.
    w.hazards = [];
    B.sym([[212, 180], [262, 70]], (x, y) => w.hazards.push(new Geyser(w, x, y)));
    // Cachoeiras no topo (alimentam o abismo) e névoa: decoração; a água funda abaixo delas corre para baixo.
    w.decor = [{ kind: 'waterfall', x: 300, y: 0, w: 40, h: 26 }, { kind: 'waterfall', x: 20, y: 0, w: 24, h: 18 }, { kind: 'waterfall', x: 596, y: 0, w: 24, h: 18 }];
    B.each((i, x, y) => { if (tr.type[i] === T.DEEP && y < 60) { tr.flowY[i] = 30; } });
    w.platform = { x: PLAT.c0 * TILE, y: PLAT.r0 * TILE, w: (PLAT.c1 - PLAT.c0 + 1) * TILE, h: (PLAT.r1 - PLAT.r0 + 1) * TILE };
    void COLS; void ROWS;
  },
};
