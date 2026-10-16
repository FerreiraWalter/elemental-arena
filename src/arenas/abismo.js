import { TILE } from '../config.js';
import { T } from '../sim/tiles.js';
import { Geyser } from '../sim/hazards.js';

// Abismo dos Mares: três ilhas de ruínas oceânicas sobre água funda, ligadas por canais rasos (vaus com correnteza)
// e DUAS pontes largas em cada canal (norte e sul). A ilha central tem um templo elevado com escadas ao norte e ao sul.
// Um farol ancestral em cada ilha lateral serve de marco.
// Alturas: 0 água funda · 0.5 vau · 1 ilhas e pontes · 1.5/2.0 escadas · 2.5 templo.
// Regras de leitura: pedra/pilar/farol = sólido · água funda = só nadadores · vau = todos andam (correnteza empurra) ·
// ponte de madeira = largura suficiente para os maiores monstros se cruzarem.
const PLAT = { c0: 40, c1: 49, r0: 22, r1: 29 }; // templo (colunas/linhas, inclusivas): 80×64 px
const STAIR = [43, 46]; // colunas das escadas
const CH = [[215, 247], [457, 489]]; // canais (x0, x1)

export default {
  id: 'abismo',
  name: 'Abismo dos Mares',
  subtitle: 'Ilhas, pontes e um templo afundado',
  description: 'Ruínas oceânicas: ilhas de pedra, canais com correnteza e pontes largas. No centro, um templo elevado: quem o domina atira de cima.',
  features: [
    'Água funda: só o monstro de água nada nela',
    'Templo elevado: de baixo não dá para acertar quem está em cima',
    'Canais com correnteza empurram; pontes largas ligam as ilhas (norte e sul)',
    'Gêiseres explodem, arremessam e apagam o fogo',
  ],
  spawns: [{ x: 104, y: 200 }, { x: 600, y: 200 }],
  waterHeal: 0.6,
  heights: true,
  style: { ambient: 'mist', bg: '#0e2a4a' },
  build(w, B) {
    const tr = w.terrain;
    B.fill(T.DEEP, 0);
    // Ilhas (chão = altura 1) com bordas irregulares. As laterais são recortadas pelos canais.
    const island = (cx, cy, rx, ry, xmin, xmax, off) => B.where((x, y) => {
      if (x < xmin || x > xmax) return false;
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      return dx * dx + dy * dy + (B.noise(x, y, 18, off) - 0.5) * 0.4 <= 1;
    }, T.STONE, 1);
    island(112, 200, 116, 160, 12, CH[0][0], 1);
    island(592, 200, 116, 160, CH[1][1], 692, 1);
    island(352, 200, 124, 150, CH[0][1], CH[1][0], 2);
    // Praias nas bordas das ilhas e musgo/algas sobre a pedra.
    B.each((i, x, y, c, r) => {
      if (tr.type[i] !== T.STONE) return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = tr.idx(c + dx, r + dy);
        if (j >= 0 && tr.type[j] === T.DEEP) { tr.setBase(i, T.SAND, 1); return; }
      }
    });
    B.each((i, x, y) => { if (tr.type[i] === T.STONE && B.noise(x, y, 22, 9) > 0.68) tr.setBase(i, T.MOSS, 1); });
    // Canais rasos com correnteza (esquerda desce, direita sobe) entre as ilhas.
    for (const [k, [x0, x1]] of CH.entries()) {
      const flow = k === 0 ? 26 : -26;
      B.where((x, y) => x >= x0 && x < x1 && y > 44 && y < 356, T.WATER, 0.5);
      B.each((i, x) => { if (x >= x0 && x < x1 && tr.type[i] === T.WATER) { tr.flowY[i] = flow; tr.flowX[i] = 0; } });
    }
    // Pontes largas (40 px): duas por canal, no norte e no sul.
    for (const by of [88, 272]) for (const [x0, x1] of CH) B.rect(x0 - 24, by, x1 - x0 + 48, 40, T.BRIDGE, 1);
    // Templo central elevado e escadas largas (4 colunas) ao norte e ao sul.
    for (let r = PLAT.r0; r <= PLAT.r1; r++) for (let c = PLAT.c0; c <= PLAT.c1; c++) tr.setBase(tr.idx(c, r), T.STONE, 2.5);
    for (let c = STAIR[0]; c <= STAIR[1]; c++) {
      tr.setBase(tr.idx(c, PLAT.r0 - 2), T.STONE, 1.5); tr.setBase(tr.idx(c, PLAT.r0 - 1), T.STONE, 2);
      tr.setBase(tr.idx(c, PLAT.r1 + 2), T.STONE, 1.5); tr.setBase(tr.idx(c, PLAT.r1 + 1), T.STONE, 2);
    }
    // Lagoas fundas dentro das ilhas laterais (o monstro de água mergulha; os outros contornam).
    B.sym([[70, 110, 20, 14]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.DEEP, 0, 0.3, 5));
    // Ruínas: colunas e rochas como cobertura (todas sólidas permanentes, fora das pontes e escadas) e um farol por ilha lateral.
    B.sym([[150, 150, 6], [150, 250, 6], [296, 132, 6]], (x, y, r) => w.addObstacle('pillar', x, y, r));
    B.sym([[174, 214, 8]], (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym([[60, 318, 9]], (x, y, r) => w.addObstacle('lighthouse', x, y, r));
    // Gêiseres nos canais e na ilha central.
    w.hazards = [];
    B.sym([[231, 200], [300, 74]], (x, y) => w.hazards.push(new Geyser(w, x, y)));
    // Cachoeiras no topo (alimentam o abismo): decoração; a água funda abaixo delas corre para baixo.
    w.decor = [{ kind: 'waterfall', x: 332, y: 0, w: 40, h: 26 }, { kind: 'waterfall', x: 24, y: 0, w: 24, h: 18 }, { kind: 'waterfall', x: 656, y: 0, w: 24, h: 18 }];
    B.each((i, x, y) => { if (tr.type[i] === T.DEEP && y < 60) tr.flowY[i] = 30; });
    w.platform = { x: PLAT.c0 * TILE, y: PLAT.r0 * TILE, w: (PLAT.c1 - PLAT.c0 + 1) * TILE, h: (PLAT.r1 - PLAT.r0 + 1) * TILE };
  },
};
