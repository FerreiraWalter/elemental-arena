// Vale ASCII: o mundo desenhado em TEXTO. Fonte de pixels 3×5 em células de 4×6 px (do mundo), pintura do chão
// caractere a caractere (clareira escura no centro, anel de traços diagonais, "montanhas" de #%X nas bordas), pedras e
// caixotes de texto, moldura nas bordas, capinzal balançando, a linha da VARREDURA e uma chuva de caracteres ao fundo.
// Os monstros continuam coloridos: no monocromático eles saltam aos olhos.
import { hash2, valueNoise } from '../core/math.js';
import { rgba, makeCanvas } from './pixel.js';
import { WORLD_W, WORLD_H } from '../config.js';
import { props, T } from '../sim/tiles.js';

// Fonte 3×5 ('#' = aceso). Só os caracteres que a arena usa.
const FONT_SRC = {
  '.': ['...', '...', '...', '...', '.#.'], ',': ['...', '...', '...', '.#.', '#..'], '`': ['#..', '.#.', '...', '...', '...'],
  "'": ['.#.', '.#.', '...', '...', '...'], ':': ['...', '.#.', '...', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
  '=': ['...', '###', '...', '###', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], '\\': ['#..', '#..', '.#.', '..#', '..#'],
  '|': ['.#.', '.#.', '.#.', '.#.', '.#.'], '#': ['#.#', '###', '#.#', '###', '#.#'], '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], o: ['...', '.#.', '#.#', '.#.', '...'], O: ['###', '#.#', '#.#', '#.#', '###'],
  '@': ['###', '#.#', '#.#', '#..', '###'], '+': ['...', '.#.', '###', '.#.', '...'], '*': ['#.#', '.#.', '###', '.#.', '#.#'],
  '~': ['...', '.#.', '#.#', '...', '...'], '"': ['#.#', '#.#', '...', '...', '...'], '^': ['.#.', '#.#', '...', '...', '...'],
  v: ['...', '...', '#.#', '#.#', '.#.'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], '[': ['##.', '#..', '#..', '#..', '##.'],
  ']': ['.##', '..#', '..#', '..#', '.##'], '>': ['#..', '.#.', '..#', '.#.', '#..'], '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
};
const FONT = {};
for (const ch in FONT_SRC) FONT[ch] = FONT_SRC[ch].map((row) => [...row].map((p) => p === '#'));
export const CW = 4, CH = 6; // célula: 3×5 + 1 px de espaço
export const glyphOn = (ch, gx, gy) => gx < 3 && gy < 5 && !!FONT[ch]?.[gy][gx];

const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const BG = [14, 14, 17];
const pack = (r, g, b) => ((255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;

// Caractere e brilho de uma célula do chão (a partir do tile embaixo dela e da distância ao centro).
function cellOf(world, cx, cy) {
  const tr = world.terrain, seed = world.seed;
  const px = cx * CW + 1, py = cy * CH + 2;
  const i = tr.at(px, py);
  const h = hash2(cx, cy, seed + 3);
  const ty = i >= 0 ? tr.type[i] : T.SAND;
  // Estados do chão: molhado vira ondinhas, queimado vira % cor de brasa apagada, fuligem escurece.
  if (i >= 0 && tr.wet[i] > 0 && !props(ty).water) return ['~', [96, 140, 170]];
  if (ty === T.SCORCHED) return [h > 0.5 ? '%' : '.', [120, 66, 52]];
  if (ty === T.WEEDS) return [h > 0.35 ? '"' : "'", [150, 150, 112]];
  if (ty === T.STONE) return [h > 0.6 ? ':' : '.', [110, 110, 116]];
  // Montanhas: faixa recortada junto às bordas, com picos irregulares (mais densa e clara perto da borda).
  const n = valueNoise(px / 40, py / 40, seed + 5);
  const edge = Math.min(px - 16, WORLD_W - 16 - px, py - 24, WORLD_H - 24 - py);
  const peak = 26 + valueNoise(px / 22, py / 22, seed + 21) * 40 + (hash2(cx >> 1, cy >> 2, seed + 6) - 0.5) * 8;
  if (edge < peak) {
    const set = ['#', '%', 'X', '=', '/', '\\', '*', '+'];
    const ch = h < 0.07 ? null : edge > peak - 6 ? (hash2(cx, cy, seed + 4) > 0.5 ? '/' : '\\') : set[(hash2(cx, cy, seed + 9) * set.length) | 0];
    const v = 120 + (1 - edge / peak) * 100 + n * 30;
    return [ch, [v, v, v + 4]];
  }
  // Clareira escura no centro (d < 1) e o anel de traços diagonais em volta (como o arco da referência).
  const dx = (px - WORLD_W / 2) / 400, dy = (py - WORLD_H / 2) / 214, d = Math.sqrt(dx * dx + dy * dy) + (n - 0.5) * 0.12;
  if (d < 1) {
    const ch = h > 0.93 ? '.' : h > 0.9 ? ',' : h > 0.885 ? '`' : h > 0.88 ? "'" : null;
    const k = 0.5 + d * 0.35;
    return [ch, [70 * k + 20, 70 * k + 20, 76 * k + 22]];
  }
  const k = Math.min(1, (d - 1) / 0.5);
  const ch = h < 0.06 ? null : h < 0.1 ? '/' : '\\';
  const v = 70 + k * 60 + (hash2(cx >> 2, cy, seed + 8) - 0.5) * 16;
  return [ch, [v, v, v + 6]];
}

// Pixel do chão (chamado por terrainpaint.paintTile em arenas com style.ascii).
export function asciiPixel(world, i, x, y) {
  const cx = (x / CW) | 0, cy = (y / CH) | 0, gx = x - cx * CW, gy = y - cy * CH;
  const [ch, col] = cellOf(world, cx, cy);
  let c = BG;
  if (ch && glyphOn(ch, gx, gy)) c = col;
  else if (((x * 7 + y * 13) & 63) === 0) c = [22, 22, 26]; // grão do fundo
  const soot = world.terrain.soot[i];
  if (soot > 0) c = mix(c, [10, 8, 8], soot * 0.6);
  return pack(c[0], c[1], c[2]);
}

// Bordas: moldura de texto "+=====+" / "|" clara sobre fundo escuro (o limite do mundo é inconfundível).
export function paintGlyphWall(base, w) {
  const bg = rgba('#0a0a0c'), fg = rgba('#d8d8dc'), dim = rgba('#7a7a80');
  base.rect(w.x, w.y, w.w, w.h, bg);
  const horiz = w.w >= w.h;
  for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) {
    const cx = ((x - w.x) / CW) | 0, cy = ((y - w.y) / CH) | 0, gx = (x - w.x) % CW, gy = (y - w.y) % CH;
    const ncx = Math.ceil(w.w / CW) - 1, ncy = Math.ceil(w.h / CH) - 1;
    const corner = (cx === 0 || cx === ncx) && (cy === 0 || cy === ncy);
    const ch = corner ? '+' : horiz ? (cy === 0 || cy === ncy ? '=' : (cx + cy) % 2 ? '#' : '%') : (cx === 0 || cx === ncx ? '|' : (cx + cy) % 2 ? '#' : '%');
    if (glyphOn(ch, gx, gy)) base.set(x, y, corner || ch === '=' || ch === '|' ? fg : dim);
  }
}

// Sprites dos obstáculos em texto: pedra = bolota de @ O o; caixote = [#] com cantos +; arbusto = tufo de * " (queima).
function stamp(img, W, ch, cx, cy, col) {
  const [r, g, b] = col;
  for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) if (glyphOn(ch, gx, gy)) {
    const x = cx * CW + gx, y = cy * CH + gy, k = (y * W + x) * 4;
    if (x < 0 || y < 0 || x >= W || k >= img.data.length) continue;
    img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
}
const SPRITES = new Map();
export function asciiObstacle(o) {
  const key = `${o.kind}:${Math.round(o.r)}:${o.id % 4}:${o.burning > 0 ? 1 : 0}`;
  let cv = SPRITES.get(key);
  if (cv) return cv;
  const cols = Math.max(3, Math.round((o.r * 2 + 4) / CW)), rows = Math.max(2, Math.round((o.r * 2 + 2) / CH));
  const W = cols * CW, H = rows * CH;
  cv = makeCanvas(W, H);
  const g = cv.getContext('2d'), img = g.createImageData(W, H);
  // Fundo escuro por dentro (o objeto tapa o chão), com contorno de 1 px.
  const inside = (c, r) => { const dx = (c + 0.5 - cols / 2) / (cols / 2), dy = (r + 0.5 - rows / 2) / (rows / 2); return o.kind === 'crate' || dx * dx + dy * dy <= 1.05; };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (inside(c, r)) {
    for (let y = r * CH; y < r * CH + CH; y++) for (let x = c * CW; x < c * CW + CW; x++) { const k = (y * W + x) * 4; img.data[k] = 12; img.data[k + 1] = 12; img.data[k + 2] = 15; img.data[k + 3] = 255; }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!inside(c, r)) continue;
    const h = hash2(c, r, o.id * 7);
    if (o.kind === 'crate') {
      const edgeX = c === 0 || c === cols - 1, edgeY = r === 0 || r === rows - 1;
      const ch = edgeX && edgeY ? '+' : edgeY ? '=' : edgeX ? '|' : h > 0.5 ? '#' : 'X';
      stamp(img, W, ch, c, r, edgeX || edgeY ? [230, 210, 160] : [170, 140, 96]); // caixote: única cor quente (madeira)
    } else if (o.kind === 'bush' || o.kind === 'hedge') {
      const ch = h > 0.6 ? '*' : h > 0.3 ? '"' : '%';
      stamp(img, W, ch, c, r, o.burning > 0 ? [255, 150, 70] : [150, 186, 140]);
    } else {
      const dx = (c + 0.5 - cols / 2) / (cols / 2), dy = (r + 0.5 - rows / 2) / (rows / 2), d = Math.hypot(dx, dy);
      const ch = d < 0.45 ? '@' : d < 0.8 ? (h > 0.5 ? 'O' : '0') : 'o';
      const v = 235 - d * 90 - (dx + dy) * 20; // luz de cima à esquerda
      stamp(img, W, ch, c, r, [v, v, v + 6]);
    }
  }
  g.putImageData(img, 0, 0);
  SPRITES.set(key, cv);
  if (SPRITES.size > 200) SPRITES.delete(SPRITES.keys().next().value);
  return cv;
}

// ───────────── Por quadro ─────────────
const C = { white: rgba('#ffffff'), lite: rgba('#d8ffe8'), mid: rgba('#7affb0'), dim: rgba('#2a8a5a'), grass: rgba('#a8c8a0'), grassD: rgba('#5e7a5a'), grey: rgba('#8a8a90'), rain: rgba('#3a3a42'), rainHi: rgba('#6a6a74') };
function glyphAt(g, ch, x, y, col) { for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) if (glyphOn(ch, gx, gy)) g.set(x + gx, y + gy, col); }

// Capinzal: barras / | \ balançando ao vento (onda que atravessa o campo); ficam mais fortes enquanto alguém está dentro.
export function drawBrush(g, f, t, busy) {
  const R = f.r, c0 = Math.floor((f.x - R) / CW), c1 = Math.ceil((f.x + R) / CW), r0 = Math.floor((f.y - R) / CH), r1 = Math.ceil((f.y + R) / CH);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const x = c * CW, y = r * CH, dx = (x + 1 - f.x) / R, dy = ((y + 2 - f.y) * 1.25) / R, d = dx * dx + dy * dy;
    if (d > 1) continue;
    if (hash2(c, r, 77) < 0.12 + d * 0.25) continue; // bordas ralas
    const w = Math.sin(t * 2.4 - x * 0.06 + y * 0.02);
    const ch = w > 0.35 ? '/' : w < -0.35 ? '\\' : '|';
    glyphAt(g, ch, x, y, d < 0.55 || busy ? C.grass : C.grassD);
  }
}

// Linha da VARREDURA: faixa de caracteres brilhantes correndo, com um rastro "redesenhando" atrás; no aviso, setas
// piscando na borda de onde ela vai sair.
export function drawScan(r, h, world, t) {
  const g = r.fxT;
  if (h.phase === 'warn') {
    const sw = h.sweepAt(world.time), down = sw.k % 2 === 0;
    const y = down ? 8 : WORLD_H - 14, on = Math.floor(t * 8) % 2;
    for (let x = 24; x < WORLD_W - 24; x += CW * 3) glyphAt(g, down ? 'v' : '^', x, y, on ? C.mid : C.dim);
    return;
  }
  if (h.phase !== 'active') return;
  const sw = h.sweepAt(world.time), down = sw.k % 2 === 0, y = Math.round(h.y);
  const ph = Math.floor(t * 20);
  for (let x = 0; x < WORLD_W; x += CW) {
    const ch = '=#0=1%#='[(x / CW + ph) & 7];
    glyphAt(g, ch, x, y - 3, (x / CW + ph) % 9 === 0 ? C.white : C.lite);
  }
  for (let x = 0; x < WORLD_W; x++) { g.set(x, y - 5, C.mid); g.set(x, y + 3, C.mid); }
  // Rastro: algumas linhas de caracteres verdes que somem atrás da linha.
  for (let k = 1; k <= 4; k++) {
    const yy = y + (down ? -1 : 1) * (6 + k * CH);
    for (let x = (k * 3) % 8; x < WORLD_W; x += CW * (2 + k)) if (hash2(x, k, ph) > 0.35 + k * 0.1) glyphAt(g, hash2(x, k, 3) > 0.5 ? '1' : '0', x, yy, k < 2 ? C.mid : C.dim);
  }
}

// Chuva de caracteres ao fundo (algumas colunas caindo devagar, bem apagadas), por baixo de tudo.
export function drawRain(g, t, seed) {
  for (let k = 0; k < 22; k++) {
    const x = Math.floor(hash2(k, 1, seed) * (WORLD_W / CW)) * CW, sp = 20 + hash2(k, 2, seed) * 30, len = 4 + ((hash2(k, 3, seed) * 6) | 0);
    const head = ((t * sp + hash2(k, 4, seed) * WORLD_H) % (WORLD_H + len * CH)) | 0;
    for (let j = 0; j < len; j++) {
      const y = Math.floor((head - j * CH) / CH) * CH;
      if (y < 0 || y >= WORLD_H) continue;
      glyphAt(g, '01:|.'[(k + j + Math.floor(t * 3)) % 5], x, y, j === 0 ? C.rainHi : C.rain);
    }
  }
}
