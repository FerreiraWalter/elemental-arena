import { T } from '../sim/tiles.js';
import { RootVent } from '../sim/hazards.js';

// Jardim Selvagem: um jardim botânico em ruínas sendo devorado pela natureza.
// Raízes gigantes (sólidas) cruzam o cenário, ruínas com musgo abrigam santuários, espinheiros ferem quem
// atravessa e respiros de raízes prendem quem pisa neles (a planta é imune). Praça central aberta.
// Leitura: pedra/raiz/muro = sólido permanente · sebe/flor gigante = destrutível (queima) · grama/mato/flores = passável.
const ROOT_ARCS = [
  [[150, 150], [182, 128], [226, 122], [262, 140]], // raiz gigante a noroeste (e seu espelho)
  [[96, 276], [128, 300], [168, 308]],
];

export default {
  id: 'jardim',
  name: 'Jardim Selvagem',
  subtitle: 'Ruínas devoradas pela natureza',
  description: 'Um jardim botânico em ruínas. Raízes gigantes e muros de pedra bloqueiam; sebes queimam; espinheiros ferem; respiros de raízes prendem quem não é planta.',
  features: [
    'Raízes gigantes e muros: sólidos permanentes',
    'Sebes e flores gigantes: bloqueiam, mas queimam',
    'Espinheiros ferem e atrasam quem não é planta',
    'Respiros de raízes irrompem do chão (avisam antes)',
  ],
  spawns: [{ x: 120, y: 200 }, { x: 584, y: 200 }],
  waterHeal: 1,
  style: { ambient: 'pollen', bg: '#2f5a26', palette: { grass: ['#2f6a2a', '#3a7c30', '#468c38', '#55a042', '#77bf58'] } },
  build(w, B) {
    const tr = w.terrain;
    B.each((i, x, y) => tr.setBase(i, B.noise(x, y, 30, 3) > 0.7 ? T.MOSS : T.GRASS));
    // Caminhos de pedra em cruz e praça central com chafariz.
    B.path([[0, 200], [704, 200]], 20, T.STONE, undefined, 0.15);
    B.path([[352, 0], [352, 400]], 20, T.STONE, undefined, 0.15);
    B.blob(352, 200, 58, 52, T.STONE, undefined, 0.1);
    B.blob(352, 200, 22, 20, T.WATER, undefined, 0.05);
    w.addObstacle('statue', 352, 200, 6);
    // Canteiros (passáveis), mato seco (inflamável) e espinheiros (perigo, longe das rotas principais).
    B.sym([[84, 74, 64, 22], [250, 40, 48, 20], [84, 316, 40, 20]], (x, y, ww, hh) => B.rect(x - ww / 2, y - hh / 2, ww, hh, T.FLOWERS));
    B.sym([[190, 90, 22, 16], [270, 306, 20, 16], [500, 150, 14, 12]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.WEEDS, undefined, 0.5, 21));
    B.sym([[150, 336, 20, 12], [262, 66, 14, 12], [64, 160, 10, 16]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.THORNS, undefined, 0.45, 31));
    // Lagos nos cantos.
    B.sym([[36, 364, 26, 22]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.WATER, undefined, 0.3));
    // Ruínas: muros quebrados sobre piso de pedra. Bloqueiam passagem, tiros e visão.
    const walls = [{ x: 112, y: 84, w: 8, h: 52 }, { x: 214, y: 326, w: 64, h: 8 }, { x: 232, y: 44, w: 8, h: 40 }];
    w.walls = [];
    for (const wl of walls) {
      for (const r of [wl, { x: 704 - wl.x - wl.w, y: 400 - wl.y - wl.h, w: wl.w, h: wl.h }]) {
        w.walls.push({ ...r, kind: 'ruin' });
        B.blob(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 12, r.h / 2 + 12, T.STONE, undefined, 0.5, 41);
      }
    }
    for (const wl of w.walls) B.rect(wl.x, wl.y, wl.w, wl.h, T.BLOCK);
    // Raízes gigantes: fileiras de nós de raiz sólidos ao longo de um arco.
    for (const arc of ROOT_ARCS) for (const pts of [arc, arc.map(B.rot)]) {
      const group = {};
      let k = 0;
      for (let s = 0; s < pts.length - 1; s++) {
        const [x0, y0] = pts[s], [x1, y1] = pts[s + 1];
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10));
        for (let q = 0; q < n; q++) {
          const o = w.addObstacle('root', x0 + (x1 - x0) * (q + 0.5) / n, y0 + (y1 - y0) * (q + 0.5) / n, 6);
          o.group = group; o.seg = k++;
        }
      }
    }
    // Colunas do santuário na praça e sebes (vegetação que queima) em pequenos grupos de 3.
    B.sym([[300, 144, 6], [404, 144, 6]], (x, y, r) => w.addObstacle('pillar', x, y, r));
    B.sym([[220, 244], [234, 244], [248, 244]], (x, y) => w.addObstacle('hedge', x, y, 7));
    B.sym([[56, 214, 8], [296, 356, 8]], (x, y, r) => w.addObstacle('giantFlower', x, y, r));
    // Respiros de raízes (perigo cíclico com aviso).
    w.hazards = [];
    B.sym([[262, 200], [352, 108]], (x, y) => w.hazards.push(new RootVent(w, x, y)));
    w.decor = [];
    B.sym([[70, 130], [160, 50], [280, 150], [430, 340], [34, 250], [230, 230]], (x, y) => w.decor.push({ kind: 'flower', x, y, c: B.hash(x, y) }));
    for (const wl of w.walls) w.decor.push({ kind: 'vines', x: wl.x, y: wl.y, w: wl.w, h: wl.h });
  },
};
