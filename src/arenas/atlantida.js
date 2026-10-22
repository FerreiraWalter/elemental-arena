import { WORLD_W, WORLD_H } from '../config.js';
import { T } from '../sim/tiles.js';
import { Tsunami, Kraken } from '../sim/arenaevents.js';

// Atlântida: a última maré (1024×576). Fase que ANDA da esquerda para a direita: todos nascem na ponta esquerda das
// ruínas de mármore e a TSUNAMI vem logo atrás, sem parar, alagando o chão (vira água funda: só nadadores) e
// derrubando as colunas. A câmera rola junto (`scroll`). O KRAKEN, no poço do meio do coliseu, arremessa coisas em
// todo mundo desde o começo. No fim sobra a SUPER ARENA: o coliseu inteiro (raio 236), com o Kraken no centro.
// Espaço aberto de propósito: pouca cobertura, fácil de ler no celular. Sem degraus.
export const KR = { x: 790, y: 288 }; // centro do coliseu e do poço do Kraken
const COL_R = 236; // raio do chão do coliseu (a super arena do final)
// Todos começam na ponta esquerda (mesma distância da onda).
const SPAWNS_FFA = [{ x: 110, y: 120 }, { x: 110, y: 456 }, { x: 330, y: 120 }, { x: 330, y: 456 }];
// Onda: começa aos 10 s, anda 7 px/s e para no portão do coliseu (x 556) por volta de 1:30.
const WAVE = { start: 10, speed: 7, end: 556, warn: 4, dmg: 8 };

export default {
  id: 'atlantida',
  name: 'Atlântida',
  subtitle: 'A última maré: tsunami e Kraken',
  description: 'Fase que anda: a tsunami persegue da esquerda e alaga a arena. O KRAKEN ataca todos desde o começo; no fim sobra a super arena do coliseu. Golpe final no Kraken dá vida e energia.',
  features: ['Fase que anda: a tsunami persegue da esquerda até o coliseu', 'Kraken neutro arremessa água, pedras e tentáculos desde o início', 'No fim: super arena com o Kraken no centro', 'Golpe final no Kraken: +35% de vida e energia', 'Monstros de água nadam na parte alagada'],
  // Os dois lados na ponta esquerda, espelhados em cima/embaixo: a onda chega igual para os dois.
  spawns: [{ x: 100, y: 160 }, { x: 100, y: 416 }],
  scroll: true, // a câmera acompanha a corrida (não mostra a arena inteira)
  spawnsFFA: SPAWNS_FFA,
  asymmetric: true, // corrida da esquerda (onda) para a direita (coliseu)
  relics: [[330, 96], [330, 480], [700, 140], [700, 436]],
  waterHeal: 1,
  style: {
    ambient: 'mist', bg: '#1d6f94', noMoss: true,
    palette: { stone: ['#a89f8a', '#c0b8a4', '#cfc9b8', '#d8d2c2', '#e8e2d0'], sand: ['#c8b27a', '#d4bd86', '#dcc68e', '#e8d49e'], deep: ['#14587a', '#186284', '#1d6f94', '#237c9e'] },
  },
  // Quem entra (troca) nunca nasce na parte já alagada.
  shiftSpawn(w, p) {
    const tsu = w.hazards.find((h) => h.kind === 'tsunami');
    const minX = (tsu ? tsu.frontAt(w.time) : 0) + 60;
    return p.x >= minX ? p : w.safeSpot(Math.min(minX, KR.x - 160), p.y, 13, 0, true);
  },
  build(w, B) {
    const tr = w.terrain;
    B.fill(T.DEEP, 0);
    // Ruínas: faixa larga de mármore (lajotas) com areia nas bordas.
    B.where((x, y) => x < 600 && y > 66 + (B.noise(x, y, 20) - 0.5) * 10 && y < WORLD_H - 66 - (B.noise(x, y, 20, 3) - 0.5) * 10, T.STONE, 0);
    B.each((i, x, y, c, r) => {
      if (tr.type[i] !== T.STONE) return;
      for (const [dx, dy] of [[0, 1], [0, -1], [0, 2], [0, -2]]) { const j = tr.idx(c + dx, r + dy); if (j >= 0 && tr.type[j] === T.DEEP) { tr.setBase(i, T.SAND, 0); return; } }
    });
    // Musgo nas lajotas.
    B.each((i, x, y) => { if (tr.type[i] === T.STONE && B.noise(x, y, 14, 9) > 0.8) tr.setBase(i, T.MOSS, 0); });
    // Coliseu: chão de areia em círculo, poço do Kraken no meio (água funda com margem rasa).
    B.where((x, y) => Math.hypot(x - KR.x, y - KR.y) < COL_R, T.SAND, 0);
    B.where((x, y) => { const d = Math.hypot(x - KR.x, y - KR.y); return d >= COL_R && d < COL_R + 10 && x > KR.x - 120; }, T.STONE, 0);
    // Anel de lajotas no meio da areia (marca a arena interna) e o poço do Kraken.
    B.where((x, y) => { const d = Math.hypot(x - KR.x, y - KR.y); return d > 120 && d < 132; }, T.STONE, 0);
    B.where((x, y) => Math.hypot(x - KR.x, y - KR.y) < 58, T.WATER, 0);
    B.where((x, y) => Math.hypot(x - KR.x, y - KR.y) < 44, T.DEEP, 0);
    // Colunas em volta do coliseu (com a entrada larga a oeste) e algumas nas ruínas, em pares simétricos (cima/baixo).
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, x = KR.x + Math.cos(a) * (COL_R - 6), y = KR.y + Math.sin(a) * (COL_R - 6);
      if (Math.cos(a) < -0.6 || x > 1000 || y < 40 || y > WORLD_H - 40) continue; // portão oeste largo; o resto a borda fecha
      w.addObstacle('pillar', x, y, 7);
    }
    // Colunas quebradas no anel interno: cobertura contra os arremessos do Kraken (pares cima/baixo).
    for (const a of [0.55, 1.6, 2.6]) for (const s of [1, -1]) w.addObstacle('pillar', KR.x + Math.cos(a) * 170, KR.y + s * Math.sin(a) * 170, 8);
    for (const [x, y, r] of [[150, 150, 7], [240, 250, 7], [380, 120, 7], [470, 220, 7]]) {
      w.addObstacle('pillar', x, y, r);
      w.addObstacle('pillar', x, WORLD_H - y, r);
    }
    for (const [x, y] of [[300, 200], [460, 160]]) { w.addObstacle('crate', x, y, 7); w.addObstacle('crate', x, WORLD_H - y, 7); } // ânforas (quebram)
    w.addObstacle('rock', 120, 288, 10); w.addObstacle('rock', 430, 288, 9);
    w.hazards = [new Tsunami(WAVE), new Kraken(w, KR.x, KR.y)];
    w.walls = [];
    w.decor = [];
    void WORLD_W;
  },
};
