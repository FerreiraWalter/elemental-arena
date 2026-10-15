import { T } from '../sim/tiles.js';
import { RootVent } from '../sim/hazards.js';

// Jardim Selvagem: jardim botânico antigo tomado por plantas gigantes, ruínas cobertas de musgo e raízes.
export default {
  id: 'jardim',
  name: 'Jardim Selvagem',
  subtitle: 'Ruínas tomadas pela vegetação',
  description: 'Um jardim botânico em ruínas. Caminhos de pedra cruzam canteiros, sebes e espinheiros; raízes irrompem do chão.',
  features: [
    'Raízes irrompem do chão e prendem (a planta é imune)',
    'Espinheiros ferem quem não é planta',
    'Sebes bloqueiam a passagem, mas queimam',
    'Mato seco pega fogo; o chafariz cura a água',
  ],
  spawns: [{ x: 120, y: 180 }, { x: 520, y: 180 }],
  waterHeal: 1,
  style: { ambient: 'pollen', bg: '#2f5a26', palette: { grass: ['#2f6a2a', '#3a7c30', '#468c38', '#55a042', '#77bf58'] } },
  build(w, B) {
    const tr = w.terrain;
    // Gramado com manchas de musgo.
    B.each((i, x, y) => tr.setBase(i, B.noise(x, y, 30, 3) > 0.68 ? T.MOSS : T.GRASS));
    // Caminhos de pedra em cruz e praça central com chafariz.
    B.path([[0, 180], [640, 180]], 18, T.STONE, undefined, 0.15);
    B.path([[320, 0], [320, 360]], 18, T.STONE, undefined, 0.15);
    B.blob(320, 180, 52, 48, T.STONE, undefined, 0.1);
    B.blob(320, 180, 22, 20, T.WATER, undefined, 0.05);
    w.addObstacle('statue', 320, 178, 6);
    // Canteiros floridos, mato seco e espinheiros.
    B.sym([[70, 70, 64, 22], [228, 34, 48, 20], [70, 280, 40, 20]], (x, y, ww, hh) => B.rect(x - ww / 2, y - hh / 2, ww, hh, T.FLOWERS));
    B.sym([[160, 118, 22, 16], [250, 262, 20, 16], [460, 140, 14, 12]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.WEEDS, undefined, 0.5, 21));
    B.sym([[118, 300, 20, 12], [236, 92, 14, 12], [92, 140, 10, 16]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.THORNS, undefined, 0.45, 31));
    // Lagos nos cantos.
    B.sym([[30, 330, 26, 22]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.WATER, undefined, 0.3));
    // Ruínas: muros quebrados (bloqueiam passagem, tiros e visão) com piso de pedra ao redor.
    const walls = [
      { x: 96, y: 76, w: 8, h: 52 }, { x: 180, y: 300, w: 64, h: 8 }, { x: 200, y: 40, w: 8, h: 40 },
    ];
    w.walls = [];
    for (const wl of walls) {
      for (const r of [wl, { x: 640 - wl.x - wl.w, y: 360 - wl.y - wl.h, w: wl.w, h: wl.h }]) {
        w.walls.push({ ...r, kind: 'ruin' });
        B.blob(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 12, r.h / 2 + 12, T.STONE, undefined, 0.5, 41);
      }
    }
    for (const wl of w.walls) B.rect(wl.x, wl.y, wl.w, wl.h, T.BLOCK);
    // Colunas da praça, sebes (vegetação que obstrui e queima) e flores gigantes.
    B.sym([[270, 130, 6], [370, 130, 6]], (x, y, r) => w.addObstacle('pillar', x, y, r));
    B.sym([[190, 132], [190, 146], [190, 160], [258, 226], [272, 226], [286, 226], [150, 236], [164, 236]], (x, y) => w.addObstacle('hedge', x, y, 7));
    B.sym([[44, 196, 8], [262, 316, 8]], (x, y, r) => w.addObstacle('giantFlower', x, y, r));
    // Respiros de raízes (perigo cíclico).
    w.hazards = [];
    B.sym([[230, 180], [320, 96]], (x, y) => w.hazards.push(new RootVent(w, x, y)));
    // Decoração.
    w.decor = [];
    B.sym([[60, 120], [140, 40], [250, 140], [380, 300], [30, 230], [210, 210]], (x, y) => w.decor.push({ kind: 'flower', x, y, c: B.hash(x, y) }));
    for (const wl of w.walls) w.decor.push({ kind: 'vines', x: wl.x, y: wl.y, w: wl.w, h: wl.h });
  },
};
