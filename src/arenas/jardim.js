import { T } from '../sim/tiles.js';
import { RootVent } from '../sim/hazards.js';
import { WORLD_W, WORLD_H } from '../config.js';
import { treeHp } from './helpers.js';

// Jardim Selvagem (1024×576): um jardim botânico em ruínas sendo devorado pela natureza, em camadas:
//  · praça central de pedra com chafariz e estátua (marco que se vê de qualquer ponto);
//  · caminhos de pedra em cruz e trilhas diagonais ligando cada canto à praça;
//  · raízes gigantes e muros em ruínas (sólidos) formam a cobertura ao redor da praça; sebes e flores gigantes
//    bloqueiam mas queimam; árvores nas bordas (só o TRONCO é sólido; a copa é decoração translúcida);
//  · canteiros, mato seco, espinheiros (ferem) e lagos nos cantos; respiros de raízes prendem quem não é planta.
// Leitura: pedra/raiz/muro = sólido permanente (muro escuro com contorno e sombra) · árvore = sólida, mas tomba com dano ·
// sebe/flor gigante = sólido que queima · grama/flores = passável.
// O mapa é igual nos 4 quadrantes (espelhos): cada jogador tem a mesma cobertura perto do seu canto.
const SPAWNS_FFA = [{ x: 150, y: 124 }, { x: 874, y: 452 }, { x: 874, y: 124 }, { x: 150, y: 452 }];

// Tudo abaixo é descrito no quadrante noroeste (x < 512, y < 288) e espelhado nos outros três.
const ROOT_ARCS = [[[300, 232], [336, 208], [380, 202], [424, 218]]];
// Muros mais grossos e afastados de tudo (≥ 30 px de folga): ou se passa com folga, ou é parede de verdade.
const WALLS = [{ x: 212, y: 152, w: 12, h: 78 }, { x: 292, y: 78, w: 86, h: 12 }];
const TREES = [[48, 62, 13], [104, 34, 11], [40, 214, 11], [236, 36, 12]];

export default {
  id: 'jardim',
  name: 'Jardim Selvagem',
  subtitle: 'Ruínas devoradas pela natureza',
  description: 'Um jardim botânico em ruínas. Raízes gigantes e muros de pedra bloqueiam; sebes queimam; espinheiros ferem; respiros de raízes prendem quem não é planta. Praça central com chafariz.',
  features: [
    'Raízes gigantes e muros escuros: sólidos permanentes',
    'Árvores aguentam bastante, mas tombam com golpes e tiros',
    'Sebes e flores gigantes: bloqueiam, mas queimam',
    'Espinheiros ferem e atrasam quem não é planta',
    'Respiros de raízes irrompem do chão (avisam antes)',
  ],
  spawns: [{ x: 120, y: 288 }, { x: 904, y: 288 }],
  spawnsFFA: SPAWNS_FFA,
  // Relíquias de cura (simétricas: nenhum lado fica mais perto).
  relics: [[512, 96], [512, 480]],
  waterHeal: 1,
  style: { ambient: 'pollen', bg: '#2f5a26', palette: { grass: ['#2f6a2a', '#3a7c30', '#468c38', '#55a042', '#77bf58'] } },
  build(w, B) {
    const tr = w.terrain;
    B.each((i, x, y) => tr.setBase(i, B.noise(x, y, 34, 3) > 0.68 ? T.MOSS : T.GRASS));
    // Caminhos de pedra em cruz, trilhas diagonais dos cantos até a praça e praça central com chafariz.
    B.path([[0, 288], [WORLD_W, 288]], 26, T.STONE, undefined, 0.15);
    B.path([[512, 0], [512, WORLD_H]], 26, T.STONE, undefined, 0.15);
    for (const mir of [(p) => p, B.mirX, B.mirY, B.rot]) B.path([[176, 150], [300, 214], [420, 262], [512, 288]].map(mir), 14, T.STONE, undefined, 0.3);
    B.blob(512, 288, 104, 92, T.STONE, undefined, 0.1);
    B.blob(512, 288, 40, 34, T.WATER, undefined, 0.05);
    w.addObstacle('statue', 512, 288, 6);
    // Canteiros (passáveis), mato seco (inflamável), espinheiros (perigo, longe de rotas e nascimentos) e lagos nos cantos.
    B.sym4([[110, 62, 112, 34], [336, 60, 72, 24]], (x, y, ww, hh) => B.rect(x - ww / 2, y - hh / 2, ww, hh, T.FLOWERS));
    B.sym4([[300, 112, 26, 16], [446, 204, 18, 14]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.WEEDS, undefined, 0.5, 21));
    B.sym4([[318, 56, 18, 12], [62, 176, 10, 16]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.THORNS, undefined, 0.45, 31));
    B.sym4([[46, 540, 30, 24]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.WATER, undefined, 0.3));
    // Ruínas: muros quebrados sobre piso de pedra. Bloqueiam passagem, tiros e visão (hitbox = retângulo).
    w.walls = [];
    for (const wl of WALLS) {
      const seen = [];
      for (const r of [wl, { ...wl, x: WORLD_W - wl.x - wl.w }, { ...wl, y: WORLD_H - wl.y - wl.h }, { ...wl, x: WORLD_W - wl.x - wl.w, y: WORLD_H - wl.y - wl.h }]) {
        if (seen.some((s) => s.x === r.x && s.y === r.y)) continue;
        seen.push(r);
        w.walls.push({ ...r, kind: 'ruin' });
        // Base de terra batida (não de lajota): o piso de pedra nunca encosta no muro, para não confundir chão com parede.
        B.blob(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 7, r.h / 2 + 7, T.DIRT, undefined, 0.4, 41);
      }
    }
    for (const wl of w.walls) B.rect(wl.x, wl.y, wl.w, wl.h, T.BLOCK);
    // Raízes gigantes: fileiras de nós de raiz sólidos ao longo de um arco (cobertura em volta da praça).
    const mirrors = [(p) => p, (p) => B.mirX(p), (p) => B.mirY(p), (p) => B.rot(p)];
    for (const arc of ROOT_ARCS) for (const mir of mirrors) {
      const pts = arc.map(mir), group = {};
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
    // Colunas do santuário, sebes (vegetação que queima) em grupos de 3, flores gigantes e árvores de borda (tronco sólido).
    B.sym4([[462, 244, 6], [250, 262, 6]], (x, y, r) => w.addObstacle('pillar', x, y, r));
    B.sym4([[140, 216], [154, 216], [168, 216]], (x, y) => w.addObstacle('hedge', x, y, 7));
    B.sym4([[356, 128], [370, 128], [384, 128]], (x, y) => w.addObstacle('hedge', x, y, 7));
    B.sym4([[88, 168, 9], [330, 37, 9]], (x, y, r) => w.addObstacle('giantFlower', x, y, r));
    B.sym4(TREES, (x, y, r) => w.addObstacle('tree', x, y, r, { hp: treeHp(r) }));
    // Respiros de raízes (perigo cíclico com aviso).
    w.hazards = [];
    B.sym4([[400, 288], [512, 160]], (x, y) => w.hazards.push(new RootVent(w, x, y)));
    // Decoração (nunca sólida): copas das árvores, flores espalhadas e trepadeiras nos muros.
    w.decor = [];
    for (const o of w.obstacles) if (o.kind === 'tree') w.decor.push({ kind: 'canopy', x: o.x, y: o.y - 10, r: o.r * 2.4, o });
    B.sym4([[70, 130], [160, 50], [280, 150], [430, 100], [34, 250], [230, 230], [330, 270], [96, 96]], (x, y) => w.decor.push({ kind: 'flower', x, y, c: B.hash(x, y) }));
    for (const wl of w.walls) w.decor.push({ kind: 'vines', x: wl.x, y: wl.y, w: wl.w, h: wl.h });
  },
};
