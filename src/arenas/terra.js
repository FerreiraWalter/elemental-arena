import { WORLD_W, WORLD_H } from '../config.js';
import { T } from '../sim/tiles.js';
import { RisingWall } from '../sim/arenaevents.js';

// Terra Rachada (1024×576): arena de terra batida, aberta no começo, que vai se FECHANDO. Rachaduras laranja avisam
// 2,5 s antes e blocos de terra sobem do chão e viram paredes (cobertura nova, rotas cortadas). Tudo espelhado
// (esquerda/direita e cima/baixo): nenhum lado ganha parede mais perto. Sem buracos: o chão só cresce para cima.
const SPAWNS_FFA = [{ x: 110, y: 150 }, { x: 914, y: 426 }, { x: 914, y: 150 }, { x: 110, y: 426 }];

// Blocos (x, y, largura, profundidade, altura aparente, segundo em que sobe); `m` = também do outro lado (espelho).
const WALLS = [
  { x: 476, y: 256, w: 72, h: 64, H: 30, at: 14 }, // bloco central
  { x: 324, y: 108, w: 56, h: 28, H: 22, at: 34, m: 1 }, { x: 324, y: 440, w: 56, h: 28, H: 22, at: 36, m: 1 },
  { x: 224, y: 248, w: 30, h: 80, H: 26, at: 52, m: 1 }, // paredes laterais (barram a linha reta até o centro)
  { x: 468, y: 60, w: 88, h: 28, H: 22, at: 70 }, { x: 468, y: 488, w: 88, h: 28, H: 22, at: 72 },
  { x: 160, y: 100, w: 32, h: 28, H: 18, at: 86, m: 1 }, { x: 160, y: 448, w: 32, h: 28, H: 18, at: 88, m: 1 },
];

export default {
  id: 'terra',
  name: 'Terra Rachada',
  subtitle: 'O chão se fecha durante a luta',
  description: 'Arena de terra que se fecha: rachaduras laranja avisam e blocos de terra sobem do chão no meio da partida, virando paredes. Saia de cima quando o chão rachar!',
  features: ['Paredes de terra sobem no meio da partida', 'Rachaduras avisam 2,5 s antes (sair de cima!)', 'Quem fica em cima é arremessado e atordoado', 'Começa aberta; termina cheia de cobertura'],
  spawns: [{ x: 96, y: 288 }, { x: 928, y: 288 }],
  spawnsFFA: SPAWNS_FFA,
  relics: [[512, 150], [512, 426]],
  waterHeal: 1,
  style: {
    ambient: 'dust', bg: '#3a2a1c', noMoss: true,
    palette: { sand: ['#664428', '#6b4a2e', '#7a5838', '#826040'], dirt: ['#4a3420', '#55391f', '#5f4128', '#6a4a2e'], stone: ['#3a2a1c', '#46321f', '#4f3a26', '#5a4430', '#6a5038'] },
  },
  build(w, B) {
    const tr = w.terrain;
    B.each((i, x, y) => {
      const n = B.noise(x, y, 30) * 18;
      const edge = x < 20 + n * 0.4 || x > WORLD_W - 20 - n * 0.4 || y < 18 + n * 0.3 || y > WORLD_H - 18 - n * 0.3;
      tr.setBase(i, edge ? T.STONE : B.noise(x, y, 16, 3) > 0.72 ? T.DIRT : T.SAND);
    });
    // Tufos de mato seco espalhados (queimam) e manchas de pedra.
    B.sym4([[200, 160, 14, 9], [420, 200, 10, 7]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.WEEDS, undefined, 0.5));
    B.sym4([[300, 280, 12, 8]], (x, y, rx, ry) => B.blob(x, y, rx, ry, T.STONE, undefined, 0.4));
    B.sym4([[372, 214, 9], [130, 288, 8]], (x, y, r) => w.addObstacle('rock', x, y, r));
    B.sym4([[260, 380, 7]], (x, y, r) => w.addObstacle('crate', x, y, r));
    w.hazards = [];
    for (const d of WALLS) {
      w.hazards.push(new RisingWall({ x: d.x, y: d.y, w: d.w, h: d.h }, d.at, d.H));
      if (d.m) w.hazards.push(new RisingWall({ x: WORLD_W - d.x - d.w, y: d.y, w: d.w, h: d.h }, d.at + 0.5, d.H));
    }
    w.walls = [];
    w.decor = [];
  },
};
