import { PixelBuf, ramp, rgba } from './pixel.js';
import { hash2 } from '../core/math.js';

// Sprites procedurais em pixel art, montados parte por parte a cada quadro para animar
// membros, cauda, cabeça e efeitos de pose (preparação, investida, dano, morte).

const FIRE = {
  body: ramp('#5a1408', '#9c2a10', '#d4471a', '#f0702a', '#ffa04a'),
  dark: ramp('#3f0e06', '#6e1c0b', '#9a2c12', '#c0461c', '#d8622a'),
  belly: ramp('#8a4a20', '#d89a52', '#f2c97a', '#ffe6a8', '#fff4d0'),
  outline: rgba('#240806'),
  flame: [rgba('#fff7c2'), rgba('#ffd84a'), rgba('#ff9a1f'), rgba('#f2541b'), rgba('#b3200f')],
};
const WATER = {
  body: ramp('#123a6b', '#1f62a8', '#3a8fd6', '#6cbcf0', '#a6e0ff'),
  dark: ramp('#0c2a52', '#164a85', '#2468b0', '#3a86cc', '#5aa6e0'),
  shell: ramp('#0e2a3a', '#1c4f63', '#2b7488', '#3f9aa8', '#6cc4c4'),
  plate: ramp('#16404f', '#2f7f8c', '#4fb0b0', '#7fd6cc', '#b0f0e0'),
  belly: ramp('#6a6a4a', '#c7c08a', '#e8e0aa', '#f8f2cc', '#ffffe8'),
  outline: rgba('#081626'),
  frill: [rgba('#e8fbff'), rgba('#9fe6ff'), rgba('#4fc0f0')],
};
const WHITE = rgba('#ffffff');
const EYE_DARK = rgba('#14100e');

function flamePixels(pb, x, y, t, h, seed) {
  for (let k = 0; k < h; k++) {
    const sway = Math.round(Math.sin(t * 13 + k * 0.9 + seed) * (k / h) * 1.4);
    const w = k < h * 0.35 ? 2 : 1;
    const ci = Math.min(4, Math.floor((k / h) * 4.5));
    for (let i = 0; i < w; i++) pb.set(x + sway + i - (w > 1 ? 1 : 0), y - k, FIRE.flame[ci]);
  }
}

export function drawBrasalisco(pb, s) {
  pb.clear();
  const ox = 24, oy = 38;
  const t = s.t;
  const walkS = Math.sin(s.walk), walkC = Math.cos(s.walk);
  const bob = Math.round(s.moving * Math.abs(walkS) * 1.2 + (1 - s.moving) * (Math.sin(t * 3.2) * 0.6 + 0.4));
  const cr = s.crouch, lu = s.lunge;
  const sx = 1 + s.dash * 0.25 - cr * 0.05, sy = 1 - s.dash * 0.15 + cr * -0.08;
  const by = oy - 9 - bob + cr * 2;
  // Cauda com chama na ponta.
  const wag = Math.sin(t * 4 + s.walk) * 1.2;
  const tail = [[ox - 8, by + 1, 3.3], [ox - 12, by - 2 + wag * 0.5, 2.7], [ox - 15, by - 6 + wag, 2.1]];
  for (const [x, y, r] of tail) pb.ellipse(x, y, r * sx, r, FIRE.body);
  // Pernas do lado de lá.
  const sw = s.moving * 2;
  pb.ellipse(ox - 4 + walkC * sw, oy - 3 - Math.max(0, walkS) * 1.5, 2.2, 3, FIRE.dark);
  pb.ellipse(ox + 5 - walkC * sw, oy - 3 - Math.max(0, -walkS) * 1.5, 2.2, 3, FIRE.dark);
  // Corpo e barriga.
  pb.ellipse(ox - 1, by, 7.6 * sx, 6 * sy, FIRE.body);
  pb.ellipse(ox + 1.5, by + 2, 4.4 * sx, 3.6 * sy, FIRE.belly, { shift: 0.1 });
  // Pernas do lado de cá, com garras.
  for (const [lx, ph] of [[-5, 1], [5, -1]]) {
    const fx = ox + lx - walkC * sw * ph + (lx > 0 ? lu * 2 : 0), fy = oy - 2 - Math.max(0, walkS * ph) * 1.6;
    pb.ellipse(fx, fy, 2.5, 3.3, FIRE.body);
    pb.set(fx + 2, fy + 3, FIRE.belly[3]);
    pb.set(fx + 1, fy + 3, FIRE.belly[3]);
  }
  // Cabeça.
  const hx = ox + 7 + lu * 3 + s.dash * 2, hy = by - 7 + cr * 2;
  pb.ellipse(hx, hy, 6.2, 5.3, FIRE.body);
  pb.ellipse(hx + 4.5, hy + 2, 3.6, 2.7, FIRE.body, { shift: 0.08 });
  // Boca (abre na preparação de ataques de fogo).
  const open = Math.round(s.open * 3);
  if (open > 0) {
    for (let k = 0; k <= open; k++) pb.line(hx + 3, hy + 3 + k, hx + 7, hy + 3 + k, k === 0 || k === open ? FIRE.dark[1] : FIRE.flame[k % 3]);
  } else pb.line(hx + 3, hy + 3, hx + 7, hy + 3, FIRE.dark[0]);
  pb.set(hx + 7, hy + 1, FIRE.dark[0]);
  // Olho.
  const blink = (Math.floor(t * 10 + s.seed) % 40) === 0;
  if (s.dead > 0.2) { pb.line(hx, hy - 2, hx + 2, hy, EYE_DARK); pb.line(hx + 2, hy - 2, hx, hy, EYE_DARK); }
  else if (blink) pb.line(hx, hy - 1, hx + 2, hy - 1, EYE_DARK);
  else {
    pb.rect(hx, hy - 2, 3, 3, WHITE);
    pb.rect(hx + 1, hy - 2, 2, 2, EYE_DARK);
    pb.set(hx + 1, hy - 2, WHITE);
    pb.line(hx - 1, hy - 4, hx + 3, hy - 3, FIRE.dark[0]);
  }
  pb.outline(FIRE.outline);
  // Crista e espinhos de fogo (sem contorno, brilhantes).
  if (s.dead < 0.5) {
    const fl = 1 + (s.power || 0);
    flamePixels(pb, hx - 1, hy - 5, t, Math.round((4 + Math.sin(t * 11) * 1.2) * fl), 1);
    flamePixels(pb, hx + 2, hy - 5, t, Math.round((3 + Math.sin(t * 9 + 2) * 1) * fl), 2);
    flamePixels(pb, ox - 4, by - 6, t, Math.round(2 + Math.sin(t * 10 + 3)), 3);
    flamePixels(pb, ox - 1, by - 6, t, Math.round(3 + Math.sin(t * 12 + 1)), 4);
    const [tx, ty] = tail[2];
    flamePixels(pb, tx - 1, ty - 2, t, Math.round((6 + Math.sin(t * 14) * 1.5) * fl), 5);
    flamePixels(pb, tx + 1, ty - 2, t, Math.round((4 + Math.sin(t * 12 + 1) * 1.2) * fl), 6);
  }
}

export function drawHidrocasco(pb, s) {
  pb.clear();
  const ox = 24, oy = 38;
  const t = s.t;
  const walkS = Math.sin(s.walk), walkC = Math.cos(s.walk);
  const bob = Math.round(s.moving * Math.abs(walkS) * 1 + (1 - s.moving) * (Math.sin(t * 2.6) * 0.6 + 0.4));
  const cr = s.crouch, lu = s.lunge;
  if (s.spin > 0) {
    // Recolhido no casco (rolagem / redemoinho).
    const sy = oy - 8 - bob;
    pb.ellipse(ox, sy, 9, 7.5, WATER.shell);
    const a = s.spin * 6;
    for (let k = 0; k < 3; k++) {
      const ang = a + (k * Math.PI * 2) / 3;
      pb.ellipse(ox + Math.cos(ang) * 4, sy + Math.sin(ang) * 3, 2.6, 2, WATER.plate);
    }
    pb.ellipse(ox, sy, 2.6, 2.2, WATER.plate);
    pb.outline(WATER.outline);
    return;
  }
  const by = oy - 7 - bob + cr * 2;
  const sx = 1 + s.dash * 0.2;
  // Cauda-barbatana.
  const wag = Math.sin(t * 5 + s.walk) * 1.5;
  pb.ellipse(ox - 10, by + 1 + wag * 0.3, 3.2, 2.2, WATER.body);
  pb.ellipse(ox - 13, by - 1 + wag, 2.2, 3, WATER.dark);
  const sw = s.moving * 1.8;
  pb.ellipse(ox - 5 + walkC * sw, oy - 2 - Math.max(0, walkS) * 1.3, 2.4, 2.8, WATER.dark);
  pb.ellipse(ox + 5 - walkC * sw, oy - 2 - Math.max(0, -walkS) * 1.3, 2.4, 2.8, WATER.dark);
  pb.ellipse(ox + 1, by + 1, 8 * sx, 5, WATER.body);
  pb.ellipse(ox + 4, by + 2, 4, 3, WATER.belly, { shift: 0.1 });
  // Casco com placas.
  const shy = by - 5;
  pb.ellipse(ox - 2, shy, 9.2 * sx, 7.4, WATER.shell);
  pb.ellipse(ox - 2, shy - 1.5, 3.4, 2.6, WATER.plate);
  pb.ellipse(ox - 7, shy + 0.5, 2.3, 2.4, WATER.plate);
  pb.ellipse(ox + 3, shy + 0.5, 2.3, 2.4, WATER.plate);
  pb.ellipse(ox - 2, shy + 4, 2.6, 1.6, WATER.plate);
  for (let x = -9; x <= 6; x++) pb.set(ox + x, Math.round(shy + 6.3 - Math.abs(x + 1.5) * 0.12), WATER.belly[2]);
  // Pernas da frente.
  for (const [lx, ph] of [[-5, 1], [6, -1]]) {
    const fx = ox + lx - walkC * sw * ph + (lx > 0 ? lu * 2 : 0), fy = oy - 1 - Math.max(0, walkS * ph) * 1.4;
    pb.ellipse(fx, fy, 2.6, 3, WATER.body);
  }
  // Cabeça com guelras.
  const hx = ox + 10 + lu * 3 + s.dash * 2, hy = by - 5 + cr;
  pb.ellipse(hx, hy, 5.6, 4.9, WATER.body);
  const open = Math.round(s.open * 3);
  if (open > 0) {
    for (let k = 0; k <= open; k++) pb.line(hx + 1, hy + 2 + k, hx + 5, hy + 2 + k, k === 0 || k === open ? WATER.dark[0] : WATER.frill[k % 2]);
  } else { pb.line(hx + 1, hy + 2, hx + 4, hy + 2, WATER.dark[0]); pb.set(hx + 5, hy + 1, WATER.dark[0]); }
  const blink = (Math.floor(t * 10 + s.seed) % 46) === 0;
  if (s.dead > 0.2) { pb.line(hx, hy - 3, hx + 2, hy - 1, EYE_DARK); pb.line(hx + 2, hy - 3, hx, hy - 1, EYE_DARK); }
  else if (blink) pb.line(hx, hy - 1, hx + 2, hy - 1, EYE_DARK);
  else {
    pb.rect(hx, hy - 3, 3, 4, WHITE);
    pb.rect(hx + 1, hy - 2, 2, 3, EYE_DARK);
    pb.set(hx + 1, hy - 2, WHITE);
  }
  pb.set(hx - 2, hy + 1, rgba('#ff9ab8'));
  pb.outline(WATER.outline);
  // Guelras ondulando (sem contorno).
  for (let k = 0; k < 3; k++) {
    const gx = hx - 4 - k, gy = hy - 3 + k * 2;
    for (let j = 0; j < 4; j++) {
      const wv = Math.round(Math.sin(t * 7 + k + j * 0.8) * 0.8);
      pb.set(gx - j, gy - Math.round(j * 0.6) + wv, WATER.frill[Math.min(2, j)]);
    }
  }
}

const PLANT = {
  body: ramp('#1e4a1a', '#2f7426', '#47a034', '#6cc448', '#a2e070'),
  dark: ramp('#163814', '#245a1e', '#357a2a', '#4c9a38', '#6cb84c'),
  moss: ramp('#1c3a20', '#2a5a30', '#3c7a3c', '#55a04a', '#7cc060'),
  leaf: ramp('#1f5a1c', '#2f8a28', '#4cb83a', '#7ad85a', '#b4f08a'),
  belly: ramp('#6a6a3a', '#b8c07a', '#d8e0a0', '#eef2c4', '#ffffe0'),
  petal: [rgba('#ff7ab0'), rgba('#ffb0d0'), rgba('#ffe066')],
  outline: rgba('#0c1e0a'),
};

// Folha (elipse inclinada) desenhada pixel a pixel.
function leafShape(pb, x, y, len, ang, r) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let s = 0; s <= len; s += 0.5) {
    const w = Math.sin((s / len) * Math.PI) * len * 0.3;
    for (let q = -w; q <= w; q += 0.5) {
      const edge = Math.abs(q) > w - 0.7;
      pb.set(Math.round(x + ca * s - sa * q), Math.round(y + sa * s + ca * q), edge ? r[1] : q < 0 ? r[4] : r[3]);
    }
  }
  for (let s = 1; s < len - 1; s++) pb.set(Math.round(x + ca * s), Math.round(y + sa * s), r[2]);
}

export function drawBrotossauro(pb, s) {
  pb.clear();
  const ox = 24, oy = 38;
  const t = s.t;
  const walkS = Math.sin(s.walk), walkC = Math.cos(s.walk);
  const bob = Math.round(s.moving * Math.abs(walkS) * 1.1 + (1 - s.moving) * (Math.sin(t * 2.2) * 0.6 + 0.4));
  const cr = s.crouch, lu = s.lunge;
  const sx = 1 + s.dash * 0.25;
  const by = oy - 8 - bob + cr * 2;
  // Cauda com folha na ponta.
  const wag = Math.sin(t * 3 + s.walk) * 1.4;
  pb.ellipse(ox - 9, by + 1, 3, 2.4, PLANT.body);
  pb.ellipse(ox - 12, by - 1 + wag * 0.4, 2.2, 1.9, PLANT.body);
  const sw = s.moving * 1.9;
  pb.ellipse(ox - 5 + walkC * sw, oy - 2 - Math.max(0, walkS) * 1.4, 2.5, 3, PLANT.dark);
  pb.ellipse(ox + 5 - walkC * sw, oy - 2 - Math.max(0, -walkS) * 1.4, 2.5, 3, PLANT.dark);
  pb.ellipse(ox, by, 8.4 * sx, 6.4, PLANT.body);
  pb.ellipse(ox + 2, by + 2.5, 4.6, 3, PLANT.belly, { shift: 0.1 });
  // Dorso musgoso.
  pb.ellipse(ox - 1.5, by - 3, 6.4 * sx, 3.6, PLANT.moss, { shift: 0.05 });
  for (const [lx, ph] of [[-5, 1], [6, -1]]) {
    const fx = ox + lx - walkC * sw * ph + (lx > 0 ? lu * 2 : 0), fy = oy - 1 - Math.max(0, walkS * ph) * 1.5;
    pb.ellipse(fx, fy, 2.7, 3.1, PLANT.body);
  }
  // Cabeça arredondada.
  const hx = ox + 9 + lu * 3 + s.dash * 2, hy = by - 5 + cr;
  pb.ellipse(hx, hy, 6, 5.2, PLANT.body);
  pb.ellipse(hx + 3.5, hy + 1.8, 3.2, 2.4, PLANT.body, { shift: 0.1 });
  const open = Math.round(s.open * 2);
  if (open > 0) for (let k = 0; k <= open; k++) pb.line(hx + 2, hy + 3 + k, hx + 6, hy + 3 + k, k === open ? PLANT.dark[0] : rgba('#7a2a2a'));
  else pb.line(hx + 2, hy + 3, hx + 5, hy + 3, PLANT.dark[0]);
  const blink = (Math.floor(t * 10 + s.seed) % 44) === 0;
  if (s.dead > 0.2) { pb.line(hx - 1, hy - 3, hx + 1, hy - 1, EYE_DARK); pb.line(hx + 1, hy - 3, hx - 1, hy - 1, EYE_DARK); }
  else if (blink) pb.line(hx - 1, hy - 1, hx + 1, hy - 1, EYE_DARK);
  else { pb.rect(hx - 1, hy - 3, 3, 3, WHITE); pb.rect(hx, hy - 2, 2, 2, EYE_DARK); pb.set(hx, hy - 3, WHITE); }
  pb.outline(PLANT.outline);
  // Folhas nas costas balançando + flor na cabeça (sem contorno externo).
  if (s.dead < 0.6) {
    const grow = 1 + (s.power || 0) * 0.4;
    const sway = Math.sin(t * 3.5) * 0.15;
    leafShape(pb, ox - 2, by - 6, 7 * grow, -1.9 + sway, PLANT.leaf);
    leafShape(pb, ox - 1, by - 6, 8 * grow, -1.25 + sway * 1.3, PLANT.leaf);
    leafShape(pb, ox - 3, by - 5, 6 * grow, -2.6 + sway, PLANT.leaf);
    leafShape(pb, ox - 12, by - 1 + wag * 0.4, 5, Math.PI + 0.5 + sway, PLANT.leaf);
    const fx = hx - 1, fy = hy - 6;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pb.set(fx + dx, fy + dy, PLANT.petal[0]);
    pb.set(fx - 1, fy - 1, PLANT.petal[1]); pb.set(fx + 1, fy - 1, PLANT.petal[1]);
    pb.set(fx, fy, PLANT.petal[2]);
  }
}

// ───────────── Obstáculos (pré-renderizados) ─────────────
export function rockSprite(r, seed) {
  const size = Math.ceil(r * 2 + 8);
  const pb = new PixelBuf(size, size);
  const c = size / 2;
  const R = ramp('#3a3a40', '#5c5a5e', '#858186', '#aaa6a6', '#cfcbc4');
  pb.ellipse(c, c + 1, r, r * 0.82, R);
  pb.ellipse(c - r * 0.3, c - r * 0.2, r * 0.55, r * 0.45, R, { shift: 0.12 });
  pb.ellipse(c + r * 0.35, c + r * 0.15, r * 0.5, r * 0.4, R, { shift: -0.05 });
  const MOSS = [rgba('#4f7a2f'), rgba('#6c9a3a'), rgba('#8cbc4a')];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!pb.get(x, y)) continue;
    const n = hash2(x, y, seed);
    if (y < c && n > 0.82) pb.set(x, y, MOSS[(n * 30) % 3 | 0]);
    else if (n < 0.04) pb.set(x, y, R[1]);
  }
  pb.outline(rgba('#1c1a1e'));
  return pb.commit();
}

export function crateSprite(char = 0) {
  const pb = new PixelBuf(18, 20);
  const W = ramp('#4a2a12', '#7a4a22', '#a5672e', '#c8874a', '#e0a868');
  const k = (i) => W[Math.max(0, Math.min(4, i - Math.round(char * 2)))];
  pb.rect(2, 2, 14, 5, k(4));
  pb.rect(2, 7, 14, 11, k(3));
  for (const y of [9, 12, 15]) pb.rect(2, y, 14, 1, k(2));
  pb.rect(2, 7, 14, 1, k(1));
  pb.line(3, 8, 14, 16, k(1));
  pb.rect(2, 7, 1, 11, k(1)); pb.rect(15, 7, 1, 11, k(1));
  pb.rect(4, 3, 10, 1, k(3));
  if (char > 0.3) for (let i = 0; i < 18 * char; i++) pb.set(2 + ((i * 7) % 14), 2 + ((i * 11) % 16), rgba('#2a1a12'));
  pb.outline(rgba('#1e1008'));
  return pb.commit();
}

export function bushSprite(r, seed, char = 0) {
  const size = Math.ceil(r * 2 + 10);
  const pb = new PixelBuf(size, size);
  const c = size / 2;
  const G = char > 0.5 ? ramp('#1e1a16', '#2e2620', '#3e342a', '#4e4234', '#5e5040') : ramp('#1f4a1c', '#2e6b26', '#3f8a2e', '#5aa83c', '#84c858');
  const blobs = [[0, 1, 1], [-0.5, -0.1, 0.6], [0.5, 0, 0.6], [0, -0.45, 0.55], [-0.35, 0.45, 0.5], [0.4, 0.4, 0.5]];
  for (const [dx, dy, s] of blobs) pb.ellipse(c + dx * r, c + dy * r * 0.8, r * s, r * s * 0.85, G, { edge: false });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!pb.get(x, y)) continue;
    const n = hash2(x, y, seed);
    if (n > 0.9) pb.set(x, y, G[4]);
    else if (n < 0.1) pb.set(x, y, G[1]);
  }
  if (char > 0 && char <= 0.5) pb.tint('#3a2a1a', char * 1.2);
  pb.outline(rgba('#0f200c'));
  return pb.commit();
}

export function stumpSprite() {
  const pb = new PixelBuf(12, 10);
  const W = ramp('#1a1210', '#2e221c', '#463428', '#5a4434', '#6e5440');
  pb.ellipse(6, 5, 4, 3, W);
  pb.set(5, 4, rgba('#ff7a2a'));
  pb.outline(rgba('#0c0806'));
  return pb.commit();
}

// Boneco de pano de treino: estaca de madeira, saco de juta costurado com um alvo no peito, braços de pau com
// palha nas pontas e cabeça de pano com olhos em X. Balança quando apanha (s.wobble).
const BURLAP = ramp('#5a4228', '#8a6a42', '#b8945e', '#d6b67e', '#ecd6a4');
const WOOD = ramp('#2e1c0e', '#4a2e16', '#6e4626', '#8e6034', '#a87a44');
const STRAW = [rgba('#c8a040'), rgba('#e8c860'), rgba('#f8e898')];
export function drawDummy(pb, s) {
  pb.clear();
  const ox = 24, oy = 38, t = s.t;
  const wob = s.wobble || 0;
  const lean = Math.sin(t * 22) * wob * 3.2; // inclinação no topo (pixels)
  const at = (y) => Math.round(lean * Math.max(0, (oy - y) / 30)); // quanto cada altura se desloca
  // Base em cruz e estaca.
  pb.rect(ox - 6, oy - 1, 13, 2, WOOD[1]);
  pb.rect(ox - 1, oy - 3, 3, 3, WOOD[2]);
  for (let y = oy - 4; y >= oy - 30; y--) { pb.set(ox + at(y), y, WOOD[2]); pb.set(ox + 1 + at(y), y, WOOD[3]); }
  // Braços: travessa de madeira com tufos de palha.
  const ay = oy - 19;
  for (let x = -11; x <= 11; x++) { pb.set(ox + x + at(ay), ay, WOOD[3]); pb.set(ox + x + at(ay), ay + 1, WOOD[1]); }
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) pb.set(ox + sx * (12 + (k % 2)) + at(ay), ay - 2 + k, STRAW[k % 3]);
  // Corpo: saco de juta com costuras.
  const by = oy - 13;
  pb.ellipse(ox + at(by), by, 6.5, 8, BURLAP, { shift: 0.15 });
  for (let y = by - 7; y <= by + 7; y += 2) pb.set(ox - 4 + at(y), y, BURLAP[0]);
  for (let k = 0; k < 4; k++) pb.set(ox - 5 + k * 3 + at(by + 8), by + 8, STRAW[k % 3]); // palha saindo embaixo
  // Alvo no peito.
  const tx = ox + 1 + at(by - 1), ty = by - 1;
  pb.ellipse(tx, ty, 4, 4, [rgba('#8a1414'), rgba('#c82828'), rgba('#c82828'), rgba('#e84040'), rgba('#e84040')], { edge: false });
  pb.ellipse(tx, ty, 2.6, 2.6, [rgba('#e8e0d0'), rgba('#f4ecd8'), rgba('#f4ecd8'), rgba('#ffffff'), rgba('#ffffff')], { edge: false });
  pb.ellipse(tx, ty, 1.2, 1.2, [rgba('#c82828'), rgba('#e84040'), rgba('#e84040'), rgba('#ff5050'), rgba('#ff5050')], { edge: false });
  // Pescoço amarrado e cabeça de pano com olhos em X.
  const hy = oy - 26;
  pb.rect(ox - 2 + at(hy + 4), hy + 4, 5, 1, WOOD[0]);
  pb.ellipse(ox + at(hy), hy, 4.6, 4.2, BURLAP, { shift: 0.2 });
  for (const ex of [-2, 2]) { const x0 = ox + ex + at(hy); pb.set(x0 - 1, hy - 1, WOOD[0]); pb.set(x0 + 1, hy + 1, WOOD[0]); pb.set(x0 + 1, hy - 1, WOOD[0]); pb.set(x0 - 1, hy + 1, WOOD[0]); pb.set(x0, hy, WOOD[0]); }
  for (let k = 0; k < 3; k++) pb.set(ox - 1 + k + at(hy - 5), hy - 5, STRAW[k]); // palha no topo
  pb.outline(rgba('#1a0e06'));
  void hash2;
}
