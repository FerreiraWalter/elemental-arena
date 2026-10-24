import { WORLD_W, WORLD_H, TILE } from '../config.js';
import { T } from '../sim/tiles.js';
import { Scanline } from '../sim/arenaevents.js';

// Vale ASCII (1024×576): um mundo desenhado em TEXTO (ver render/asciifx.js). Clareira escura no centro, anel de
// traços diagonais e montanhas de caracteres nas bordas; os monstros coloridos saltam aos olhos.
// Jogabilidade:
//  · CAPINZAL ( / | \ ): quatro campos de capim de texto; quem fica dentro some para o inimigo até atacar.
//  · VARREDURA: de tempos em tempos uma linha de luz atravessa a arena (avisa com setas na borda). Quem é pego leva
//    dano e fica CORROMPIDO (lento); a esquiva passa por ela. Por onde passa, o mundo é "redesenhado" e os capinzais
//    trocam de lugar (dois arranjos espelhados) — esconderijos e rotas mudam durante a luta.
// Tudo espelhado nos 4 quadrantes (1v1, 2v2 e 1v1v1v1 justos).
const SPAWNS_FFA = [{ x: 120, y: 120 }, { x: 904, y: 456 }, { x: 904, y: 120 }, { x: 120, y: 456 }];
const ROCKS = [[380, 220, 12], [190, 170, 9], [440, 100, 8]]; // pedras de @ (cobertura permanente)
const CRATES = [[300, 288, 7], [250, 420, 7]]; // caixotes [#] (quebram e queimam)
const BUSHES = [[150, 360, 9], [420, 380, 8]]; // tufos * " (queimam)
const WEEDS = [[226, 230, 3.2, 2.2], [470, 196, 2.6, 2]]; // mato seco " (queima e vira %)

export default {
  id: 'ascii',
  name: 'Vale ASCII',
  subtitle: 'Um mundo feito de texto',
  description: 'Um vale desenhado em caracteres. Esconda-se no CAPINZAL ( / | \\ ) para sumir da vista do inimigo e cuidado com a VARREDURA: a linha de luz atravessa a arena, corrompe quem pega e redesenha o mundo por onde passa.',
  features: ['Capinzal: dentro dele você some para o inimigo até atacar', 'Varredura: linha de luz que corrompe (dano + lento); esquive no tempo certo', 'A varredura muda os capinzais de lugar', 'Mato seco queima e vira cinza de %'],
  spawns: [{ x: 110, y: 288 }, { x: 914, y: 288 }],
  spawnsFFA: SPAWNS_FFA,
  relics: [[512, 200], [512, 376]],
  waterHeal: 1,
  style: { ascii: true, ambient: null, bg: '#0e0e11' },
  build(w, B) {
    const tr = w.terrain;
    B.fill(T.SAND);
    B.sym4(WEEDS, (x, y, rx, ry) => B.blob(x, y, rx * TILE, ry * TILE, T.WEEDS, undefined, 0.5));
    // Moldura de texto nas quatro bordas (sólida).
    w.walls = [
      { x: 0, y: 0, w: WORLD_W, h: 24, kind: 'glyph' }, { x: 0, y: WORLD_H - 24, w: WORLD_W, h: 24, kind: 'glyph' },
      { x: 0, y: 24, w: 16, h: WORLD_H - 48, kind: 'glyph' }, { x: WORLD_W - 16, y: 24, w: 16, h: WORLD_H - 48, kind: 'glyph' },
    ];
    for (const wall of w.walls) {
      for (let r = Math.floor(wall.y / TILE); r < Math.ceil((wall.y + wall.h) / TILE); r++)
        for (let c = Math.floor(wall.x / TILE); c < Math.ceil((wall.x + wall.w) / TILE); c++) tr.setBase(tr.idx(c, r), T.BLOCK);
    }
    B.sym4(ROCKS, (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym4(CRATES, (x, y, r) => w.addObstacle('crate', x, y, r));
    B.sym4(BUSHES, (x, y, r) => w.addObstacle('bush', x, y, r));
    w.hazards = [new Scanline()];
    w.decor = [];
  },
};
