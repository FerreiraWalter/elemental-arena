import { TILE } from '../config.js';
import { T } from '../sim/tiles.js';
import { Geyser } from '../sim/hazards.js';

// Abismo dos Mares (1024×576): uma ilha central com templo elevado e quatro ilhas de canto (uma por jogador), sobre água
// funda. Pontes largas (48 px) ligam as ilhas de canto entre si (norte, sul, oeste, leste) e ao centro (diagonais).
// Poças de maré rasas, colunas, rochas e faróis servem de cobertura; gêiseres no centro. Quatro cantos idênticos (simetria dupla).
// Alturas: 0 água funda · 0.5 vau · 1 ilhas e pontes · 1.5/2.0 escadas · 2.5 templo.
// Regras de leitura: pedra/pilar/farol = sólido · água funda = só nadadores · vau = todos andam (correnteza empurra) ·
// ponte de madeira = largura suficiente para os maiores monstros se cruzarem.
const PLAT = { c0: 57, c1: 70, r0: 31, r1: 40 }; // templo (colunas/linhas, inclusivas): 112×80 px
const STAIR = [61, 66]; // colunas das escadas (norte: linhas 29-30; sul: 41-42)
const CORNERS = [[176, 120], [848, 120], [176, 456], [848, 456]];
const SPAWNS_FFA = [{ x: 176, y: 120 }, { x: 848, y: 456 }, { x: 848, y: 120 }, { x: 176, y: 456 }];

export default {
  id: 'abismo',
  name: 'Abismo dos Mares',
  subtitle: 'Quatro ilhas, pontes e um templo afundado',
  description: 'Ruínas oceânicas: quatro ilhas de canto ligadas por pontes largas a um templo elevado no centro. Água funda só para nadadores.',
  features: [
    'Água funda: só o monstro de água nada nela',
    'Templo elevado: de baixo não dá para acertar quem está em cima',
    'Pontes largas entre as ilhas; poças de maré rasas',
    'Gêiseres explodem, arremessam e apagam o fogo',
  ],
  spawns: [{ x: 176, y: 120 }, { x: 848, y: 456 }],
  spawnsFFA: SPAWNS_FFA,
  waterHeal: 0.6,
  heights: true,
  style: { ambient: 'mist', bg: '#0e2a4a' },
  build(w, B) {
    const tr = w.terrain;
    B.fill(T.DEEP, 0);
    const island = (cx, cy, rx, ry, off) => B.where((x, y) => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      return dx * dx + dy * dy + (B.noise(x, y, 18, off) - 0.5) * 0.4 <= 1;
    }, T.STONE, 1);
    island(512, 288, 210, 130, 2);
    for (const [cx, cy] of CORNERS) island(cx, cy, 128, 92, 1);
    // Pontes (48 px, altura 1): norte, sul, oeste, leste entre ilhas de canto e diagonais até o centro.
    const bridge = (pts, wd = 48) => { for (const mir of [(p) => p, B.mirX, B.mirY, B.rot]) B.path(pts.map(mir), wd, T.BRIDGE, 1, 0); };
    bridge([[176, 120], [848, 120]], 40); // N (e S por espelho)
    bridge([[176, 120], [176, 456]], 40); // W (e E)
    bridge([[272, 204], [430, 262]]); // diagonais
    // Praias e musgo.
    B.each((i, x, y, c, r) => {
      if (tr.type[i] !== T.STONE) return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = tr.idx(c + dx, r + dy);
        if (j >= 0 && tr.type[j] === T.DEEP) { tr.setBase(i, T.SAND, 1); return; }
      }
    });
    B.each((i, x, y) => { if (tr.type[i] === T.STONE && B.noise(x, y, 22, 9) > 0.68) tr.setBase(i, T.MOSS, 1); });
    // Margem rasa (2 tiles, altura 0.5) em volta de ilhas e pontes: nadadores entram e saem da água funda por ela,
    // e ninguém fica preso numa bolsa de água funda cercada por pontes.
    const rim = [];
    B.each((i, x, y, c, r) => {
      if (tr.type[i] !== T.DEEP) return;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const j = tr.idx(c + dc, r + dr);
        if (j >= 0 && tr.type[j] !== T.DEEP) { rim.push(i); return; }
      }
    });
    for (const i of rim) tr.setBase(i, T.WATER, 0.5);
    // Fosso estreito (1–2 tiles de água rasa com chão dos DOIS lados, ex.: entre uma ponte e a ilha central) vira tábua de
    // ponte: senão quem evita água (fogo) não passa de uma para a outra. A margem rasa continua onde dá para o mar.
    const land = (j) => j >= 0 && tr.height[j] === 1 && tr.type[j] !== T.WATER && tr.type[j] !== T.DEEP;
    const plank = [];
    B.each((i, x, y, c, r) => {
      if (tr.type[i] !== T.WATER || tr.height[i] !== 0.5) return;
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        let a = false, b = false;
        for (let k = 1; k <= 2; k++) { if (land(tr.idx(c + dc * k, r + dr * k))) a = true; if (land(tr.idx(c - dc * k, r - dr * k))) b = true; }
        if (a && b) { plank.push(i); return; }
      }
    });
    for (const i of plank) tr.setBase(i, T.BRIDGE, 1);
    // Poças de maré (rasas, altura 1: todos andam).
    B.sym4([[110, 150, 16, 10]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.WATER, 1, 0.3, 5));
    // Templo central elevado e escadas largas (6 colunas) ao norte e ao sul.
    for (let r = PLAT.r0; r <= PLAT.r1; r++) for (let c = PLAT.c0; c <= PLAT.c1; c++) tr.setBase(tr.idx(c, r), T.STONE, 2.5);
    for (let c = STAIR[0]; c <= STAIR[1]; c++) {
      tr.setBase(tr.idx(c, PLAT.r0 - 2), T.STONE, 1.5); tr.setBase(tr.idx(c, PLAT.r0 - 1), T.STONE, 2);
      tr.setBase(tr.idx(c, PLAT.r1 + 2), T.STONE, 1.5); tr.setBase(tr.idx(c, PLAT.r1 + 1), T.STONE, 2);
    }
    // Cobertura sólida (fora das pontes e escadas) e um farol por ilha de canto.
    B.sym4([[240, 76, 6], [130, 172, 6], [420, 200, 6]], (x, y, r) => w.addObstacle('pillar', x, y, r));
    B.sym4([[212, 176, 8], [470, 160, 8]], (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym4([[96, 70, 9]], (x, y, r) => w.addObstacle('lighthouse', x, y, r));
    // Gêiseres no centro.
    w.hazards = [];
    for (const x of [392, 632]) w.hazards.push(new Geyser(w, x, 288));
    w.decor = [{ kind: 'waterfall', x: 492, y: 0, w: 40, h: 26 }, { kind: 'waterfall', x: 24, y: 0, w: 24, h: 18 }, { kind: 'waterfall', x: 976, y: 0, w: 24, h: 18 }];
    B.each((i, x, y) => { if (tr.type[i] === T.DEEP && y < 60) tr.flowY[i] = 30; });
    w.platform = { x: PLAT.c0 * TILE, y: PLAT.r0 * TILE, w: (PLAT.c1 - PLAT.c0 + 1) * TILE, h: (PLAT.r1 - PLAT.r0 + 1) * TILE };
  },
};
