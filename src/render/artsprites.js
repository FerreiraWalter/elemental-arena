import { PixelBuf, rgba } from './pixel.js';
import { hash2 } from '../core/math.js';

// Sprites dos monstros a partir da arte do usuário (assets/monsters/*.png, extraídos por tools/extract_sprites.py).
// Cada arte é um quadro estático; a animação é procedural e acontece pixel a pixel:
// respiração, passos (pernas alternadas), inclinação nos ataques, achatamento, e pixels "vivos"
// classificados pela cor: chamas tremulam, folhagem balança, água cintila.

const FLAME = [rgba('#fff7c2'), rgba('#ffd84a'), rgba('#ff9a1f'), rgba('#f2541b'), rgba('#b3200f')];
const WHITE = rgba('#ffffff');
// Suba quando trocar algum PNG de assets/monsters (força o navegador a baixar de novo).
const ART_VERSION = 14;

// Direção para onde a arte original olha (-1 esquerda, 0 frente, 1 direita). O renderer espelha a arte
// para que o monstro sempre olhe para a mira; sprite que olha para a esquerda precisa de -1 aqui.
const FACES = {
  fire_1: -1, fire_2: 0, fire_3: 0,
  forge_1: 1, forge_3: 0, // Brasalinha (punho em brasa à direita) e Fornalhonte (dragão alado, de frente)
  water_1: 1, water_2: 0, water_3: 0,
  plant_1: 0, plant_2: 0, plant_3: 0, // plant_1: Brotossauro original (golem de pedra e musgo)
  hedgehog_1: 1, hedgehog_3: 1,
  octo_1: 0, octo_3: 0,
  mantis_1: 1, mantis_3: -1, // Silvamante: cabeça e garras à esquerda, folhas para trás
  brawler_1: 1, brawler_3: 1, // Pugilar e Lutapacho olham para a direita
  cat_1: 1, cat_3: 0, // Raiolua (de lado) e Trovogato (de frente)
  frog_1: 0, frog_3: 0, // Sapomental e Sapofilósofo (meditando, de frente)
  bird_1: 1, bird_3: -1, // Araralvo olha para a direita; Araravento vira a cabeça para a esquerda
};

// Braços que socam (coordenadas na arte original, que olha para a direita). L = mão esquerda do personagem (o braço do
// lado direito da imagem, o da frente), R = mão direita (o do lado esquerdo da imagem, que cruza o corpo no soco).
// reach = quanto o punho avança (px); lift = sobe/desce junto. O braço avança com um rastro curto de 2 px.
const ARMS = {
  brawler_1: { L: { x0: 25, y0: 11, x1: 35, y1: 24, reach: 7, lift: 0 }, R: { x0: 8, y0: 12, x1: 16, y1: 25, reach: 15, lift: 0, keep: true } }, // braço sobre o peito: fica, escurecido
  brawler_3: { L: { x0: 50, y0: 19, x1: 62, y1: 45, reach: 8, lift: 0 }, R: { x0: 0, y0: 13, x1: 15, y1: 51, reach: 18, lift: -0.15 } },
};

// Escala de desenho por arte (1 = tamanho do PNG). Os gatos de chapéu ficavam grandes demais perto dos outros.
const SIZE = { cat_1: 0.82, cat_3: 0.8 };

function classify(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (r > 200 && g > 150 && b < 130 && r - b > 100) return 'flame'; // só o amarelo-alaranjado brilhante
  if (b > 170 && g > 150 && b >= r + 30) return 'glow';
  if (g > r + 12 && g > b + 8 && max > 70 && max - min > 25) return 'leaf';
  return 'solid';
}

export class ArtSprites {
  constructor() {
    this.models = {};
    this.ready = false;
    this.bufs = new Map();
  }

  async load(names, base = 'assets/monsters/') {
    await Promise.all(names.map((name) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data;
        const px = new Uint32Array(img.width * img.height);
        const kind = new Uint8Array(img.width * img.height);
        const K = { solid: 0, flame: 1, glow: 2, leaf: 3 };
        for (let i = 0; i < px.length; i++) {
          const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
          if (a < 128) continue;
          px[i] = ((255 << 24) | (b << 16) | (gg << 8) | r) >>> 0;
          kind[i] = K[classify(r, gg, b)];
        }
        this.models[name] = { name, w: img.width, h: img.height, px, kind, faces: FACES[name] ?? 0, img: c };
        resolve();
      };
      img.onerror = () => resolve();
      img.src = base + name + '.png?v=' + ART_VERSION; // versão: o navegador não fica com o sprite antigo em cache
    })));
    this.ready = names.every((n) => this.models[n]);
    return this.ready;
  }

  has(name) { return !!this.models[name]; }

  // Desenha o modelo num buffer próprio do monstro com a pose atual. Retorna { canvas, w, h, ax, ay }.
  render(key, name, pose) {
    const M = this.models[name];
    const pad = 10;
    const W = M.w + pad * 2, H = M.h + pad * 2;
    let pb = this.bufs.get(key);
    if (!pb || pb.w !== W || pb.h !== H) { pb = new PixelBuf(W, H); this.bufs.set(key, pb); }
    pb.clear();
    const t = pose.t;
    const ax = M.w / 2, ay = M.h; // âncora: pés no centro da base
    const dax = W / 2, day = M.h + pad;
    // Corpo: respiração, passos, preparação (agacha), avanço, investida (estica) e morte.
    const breathe = 1 + Math.sin(t * 3.2 + pose.seed) * 0.025 * (1 - pose.moving);
    const size = SIZE[name] || 1;
    const sx = (1 + pose.dash * 0.18 + pose.crouch * 0.06 - pose.dead * 0.1) * (pose.scale || 1) * size;
    // pose.lean vem suavizado pelo renderer (molas); sem ele, a inclinação é calculada aqui.
    const sy = (breathe - pose.crouch * 0.08 - pose.dash * 0.1 - pose.dead * 0.35) * (pose.scale || 1) * size;
    const bob = Math.abs(Math.sin(pose.walk)) * 1.4 * pose.moving;
    const lean = pose.lean ?? (pose.lunge * 0.22 - pose.crouch * 0.08 + pose.dead * 0.25);
    const legZone = M.h * 0.72;
    const step = Math.sin(pose.walk) * 1.6 * pose.moving;
    const arm = pose.punch && ARMS[name]?.[pose.punch.side];
    const pd = arm ? Math.round(Math.max(0, Math.min(1, pose.punch.k)) * arm.reach) : 0;
    for (let dy = 0; dy < H; dy++) {
      const ry = dy - day + bob;
      const syf = ay + ry / sy;
      if (syf < -1 || syf >= M.h + 1) continue;
      for (let dx = 0; dx < W; dx++) {
        const rx = dx - dax;
        let sxf = ax + (rx + lean * ry) / sx;
        // Pernas: metade esquerda e direita da parte de baixo se alternam.
        if (syf > legZone) sxf -= (sxf < ax ? step : -step) * ((syf - legZone) / (M.h - legZone));
        // Folhagem balança na parte de cima.
        const srow = Math.round(syf);
        let scol = Math.round(sxf);
        // Soco: o braço estica para a frente (procura, do punho para o ombro, um pixel do braço deslocado até aqui).
        if (pd > 0) {
          let hit = -1;
          for (let o = pd; o >= Math.max(1, pd - 2) && hit < 0; o--) { // punho + 2 px de rastro (sem faixa atravessando o corpo)
            const ax2 = scol - o, ay2 = srow - Math.round(o * arm.lift);
            if (ax2 >= arm.x0 && ax2 <= arm.x1 && ay2 >= arm.y0 && ay2 <= arm.y1 && M.px[ay2 * M.w + ax2]) hit = ay2 * M.w + ax2;
          }
          if (hit >= 0) { pb.px[dy * W + dx] = M.px[hit]; continue; }
          // De onde o braço saiu: preenche com o corpo vizinho (lado de dentro), senão fica um braço duplicado.
          if (pd >= 2 && arm.keep && scol >= arm.x0 && scol <= arm.x1 && srow >= arm.y0 && srow <= arm.y1 && M.px[srow * M.w + scol]) {
            const c0 = M.px[srow * M.w + scol];
            pb.px[dy * W + dx] = (c0 & 0xff000000) | ((((c0 >> 16) & 255) * 0.62) << 16) | ((((c0 >> 8) & 255) * 0.62) << 8) | ((c0 & 255) * 0.62);
            continue;
          }
          if (pd >= 2 && scol >= arm.x0 && scol <= arm.x1 && srow >= arm.y0 && srow <= arm.y1 && M.px[srow * M.w + scol]) {
            // Só tapa se o braço estava SOBRE o corpo (há corpo dos dois lados nesta linha); fora do corpo fica vazio.
            const inX = pose.punch.side === 'L' ? arm.x0 - 1 : arm.x1 + 1, outX = pose.punch.side === 'L' ? arm.x1 + 1 : arm.x0 - 1;
            const midRow = (arm.y0 + arm.y1) >> 1; // uma cor só de pelo (cor por linha fazia listras)
            const fc = inX >= 0 && inX < M.w && M.px[srow * M.w + inX] ? M.px[midRow * M.w + inX + (pose.punch.side === 'L' ? -1 : 1)] || M.px[midRow * M.w + inX] : 0;
            const other = outX >= 0 && outX < M.w ? M.px[srow * M.w + outX] : 0;
            if (fc && other) pb.px[dy * W + dx] = fc;
            continue;
          }
        }
        if (srow < 0 || srow >= M.h || scol < 0 || scol >= M.w) continue;
        let k = M.kind[srow * M.w + scol];
        if (k === 3 && srow < M.h * 0.6) {
          const sway = Math.round(Math.sin(t * 2.6 + srow * 0.35 + pose.seed) * (1 - srow / M.h) * 1.5);
          const s2 = scol - sway;
          if (s2 >= 0 && s2 < M.w && M.px[srow * M.w + s2]) { scol = s2; k = M.kind[srow * M.w + scol]; }
        }
        let c = M.px[srow * M.w + scol];
        if (!c) continue;
        if (k === 1) {
          // Chamas: a cor sobe e desce na rampa de fogo, com ruído no tempo.
          const n = hash2(scol, srow + Math.floor(t * 14), 7);
          const idx = Math.max(0, Math.min(4, Math.floor(n * 3 + (srow / M.h) * 2.2 - pose.power)));
          c = FLAME[idx];
          if (n > 0.93) continue; // pixels que somem: borda viva da chama
        } else if (k === 2 && hash2(scol, srow + Math.floor(t * 6), 3) > 0.9) {
          c = WHITE; // brilho na água
        }
        pb.px[dy * W + dx] = c;
      }
    }
    // Línguas de fogo extras subindo das áreas em chamas (só nos monstros de fogo).
    if (pose.flames) {
      const n = pose.flames;
      for (let j = 0; j < n; j++) {
        const fx = Math.round(dax + (hash2(j, 1, pose.seed) - 0.5) * M.w * 0.7);
        const top = Math.round(day - M.h * (0.75 + hash2(j, 2, pose.seed) * 0.25) - bob);
        const h = 2 + Math.round((Math.sin(t * (9 + j) + j * 2) * 0.5 + 0.5) * (3 + pose.power * 4));
        for (let s = 0; s < h; s++) {
          const x = fx + Math.round(Math.sin(t * 8 + s + j) * (s / h));
          pb.set(x, top - s, FLAME[Math.min(4, Math.floor((s / h) * 5))]);
        }
      }
    }
    if (pose.flash) pb.fill(WHITE);
    if (pose.tint) pb.tint(pose.tint[0], pose.tint[1]);
    return { canvas: pb.commit(), w: W, h: H, ax: dax, ay: day, faces: M.faces, top: Math.round(M.h * size) };
  }
}
