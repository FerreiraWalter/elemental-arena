import { PixelBuf, ramp, rgba, makeCanvas } from './pixel.js';
import { hash2 } from '../core/math.js';
import { TILE, COLS } from '../config.js';

// Cenário em pixel art procedural: obstáculos novos, decoração, perigos e ambientação de cada arena.

const STONE = ramp('#3a3a42', '#55555e', '#70707a', '#8c8c96', '#adadb6');
const MOSS = [rgba('#3f6a2c'), rgba('#5a8c3a'), rgba('#7aac50')];
const BARK = ramp('#2a1a10', '#40281a', '#5a3a24', '#74502e', '#8e6a40');
const LEAF = ramp('#16321a', '#1f4a22', '#2c6a2c', '#3f8a38', '#62ae4e');
const LEAF_DRY = ramp('#2a2014', '#3c2e1c', '#4e3c24', '#605030', '#72603c');

function mossify(pb, seed, amount = 0.85) {
  for (let y = 0; y < pb.h; y++) for (let x = 0; x < pb.w; x++) {
    if (!pb.get(x, y)) continue;
    const n = hash2(x, y, seed);
    if (y < pb.h * 0.55 && n > amount) pb.set(x, y, MOSS[(n * 31) % 3 | 0]);
  }
}

export function pillarSprite(r, seed) {
  const W = Math.ceil(r * 2 + 6), H = Math.ceil(r * 2 + 16);
  const pb = new PixelBuf(W, H);
  const cx = W / 2;
  // Fuste (face frontal) e topo circular.
  for (let y = r + 3; y < H - 3; y++) for (let x = Math.round(cx - r); x < Math.round(cx + r); x++) {
    const f = (x - (cx - r)) / (2 * r);
    pb.set(x, y, STONE[Math.max(1, Math.min(4, Math.round(1 + f * 2.2 + (x % 3 === 0 ? -0.6 : 0))))]);
  }
  pb.ellipse(cx, H - 4, r + 1, r * 0.45, STONE);
  pb.ellipse(cx, r + 3, r, r * 0.7, STONE, { shift: 0.15 });
  for (let k = 0; k < 3; k++) pb.line(Math.round(cx - r / 2 + hash2(k, 1, seed) * r), r + 6 + k * 3, Math.round(cx - r / 2 + hash2(k, 2, seed) * r), r + 9 + k * 3, STONE[0]);
  mossify(pb, seed, 0.8);
  pb.outline(rgba('#16161c'));
  return pb.commit();
}

export function statueSprite(seed) {
  const pb = new PixelBuf(22, 30);
  pb.rect(4, 20, 14, 8, STONE[2]);
  pb.rect(4, 20, 14, 2, STONE[4]);
  pb.rect(4, 27, 14, 1, STONE[0]);
  pb.ellipse(11, 14, 5, 7, STONE, { shift: 0.1 }); // corpo encapuzado
  pb.ellipse(11, 7, 3.5, 3.5, STONE, { shift: 0.15 }); // cabeça
  pb.set(10, 7, STONE[0]); pb.set(12, 7, STONE[0]);
  pb.line(6, 13, 4, 18, STONE[1]); pb.line(16, 13, 18, 18, STONE[1]);
  mossify(pb, seed, 0.78);
  pb.outline(rgba('#16161c'));
  return pb.commit();
}

function leafyBlob(pb, cx, cy, r, R, seed, shapes) {
  for (const [dx, dy, s] of shapes) pb.ellipse(cx + dx * r, cy + dy * r * 0.8, r * s, r * s * 0.85, R, { edge: false });
  for (let y = 0; y < pb.h; y++) for (let x = 0; x < pb.w; x++) {
    if (!pb.get(x, y)) continue;
    const n = hash2(x, y, seed);
    if (n > 0.9) pb.set(x, y, R[4]);
    else if (n < 0.1) pb.set(x, y, R[1]);
  }
}

export function hedgeSprite(r, seed, char = 0) {
  const W = Math.ceil(r * 2 + 8), H = Math.ceil(r * 2 + 10);
  const pb = new PixelBuf(W, H);
  leafyBlob(pb, W / 2, H / 2 + 1, r, char > 0.5 ? LEAF_DRY : LEAF, seed, [[-0.45, 0.1, 0.7], [0.45, 0.1, 0.7], [0, -0.25, 0.75], [0, 0.35, 0.7]]);
  if (char > 0 && char <= 0.5) pb.tint('#3a2a1a', char * 1.2);
  pb.outline(rgba('#0c1a0a'));
  return pb.commit();
}

export function thicketSprite(r, seed, char = 0) {
  const W = Math.ceil(r * 2 + 8), H = Math.ceil(r * 2 + 12);
  const pb = new PixelBuf(W, H);
  leafyBlob(pb, W / 2, H / 2 + 2, r, char > 0.5 ? LEAF_DRY : ramp('#1a2a14', '#26401c', '#335a24', '#467a30', '#5e9a40'), seed, [[-0.4, 0.2, 0.6], [0.4, 0.2, 0.6], [0, -0.3, 0.6], [0, 0.3, 0.55]]);
  // Galhos e espinhos.
  for (let k = 0; k < 5; k++) {
    const a = hash2(k, 1, seed) * 6.28, l = r * (0.6 + hash2(k, 2, seed) * 0.6);
    const x0 = W / 2, y0 = H / 2 + 2;
    pb.line(x0, y0, Math.round(x0 + Math.cos(a) * l), Math.round(y0 + Math.sin(a) * l * 0.8), BARK[2]);
    pb.set(Math.round(x0 + Math.cos(a) * l), Math.round(y0 + Math.sin(a) * l * 0.8) - 1, rgba('#e8dcc0'));
  }
  if (char > 0 && char <= 0.5) pb.tint('#3a2a1a', char * 1.2);
  pb.outline(rgba('#0a1408'));
  return pb.commit();
}

export function giantFlowerSprite(r, seed, char = 0) {
  const W = Math.ceil(r * 3 + 8), H = Math.ceil(r * 3 + 10);
  const pb = new PixelBuf(W, H);
  const cx = W / 2, cy = H / 2;
  const hue = hash2(seed, 3, 9);
  const P = char > 0.5 ? LEAF_DRY : hue > 0.5 ? ramp('#6a1a4a', '#a8306e', '#d85a96', '#f08cbc', '#ffc0dc') : ramp('#6a2a0a', '#b04a14', '#e07a28', '#f8a848', '#ffd890');
  pb.ellipse(cx - r * 0.9, cy + r * 0.7, r * 0.8, r * 0.4, LEAF);
  pb.ellipse(cx + r * 0.9, cy + r * 0.8, r * 0.8, r * 0.4, LEAF);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + hue;
    pb.ellipse(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.6, r * 0.6, r * 0.5, P);
  }
  pb.ellipse(cx, cy, r * 0.42, r * 0.36, ramp('#6a4a0a', '#a07a14', '#d8b030', '#f8d860', '#fff4a8'));
  if (char > 0 && char <= 0.5) pb.tint('#3a2a1a', char * 1.2);
  pb.outline(rgba('#1a0a14'));
  return pb.commit();
}

export function trunkSprite(r, seed) {
  const W = Math.ceil(r * 3 + 6), H = Math.ceil(r * 2.4 + 10);
  const pb = new PixelBuf(W, H);
  const cx = W / 2, cy = H / 2 + 2;
  // Raízes se espalhando.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + hash2(k, 4, seed);
    pb.ellipse(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.55, r * 0.45, r * 0.3, BARK);
  }
  pb.ellipse(cx, cy, r, r * 0.8, BARK, { shift: 0.05 });
  for (let k = 0; k < 7; k++) pb.line(Math.round(cx - r * 0.7 + k * r * 0.23), Math.round(cy - r * 0.5), Math.round(cx - r * 0.7 + k * r * 0.23 + 1), Math.round(cy + r * 0.6), BARK[1]);
  mossify(pb, seed, 0.86);
  pb.outline(rgba('#140c06'));
  return pb.commit();
}

export function canopySprite(R, seed) {
  const W = Math.ceil(R * 2 + 8), H = Math.ceil(R * 1.8 + 8);
  const pb = new PixelBuf(W, H);
  const shapes = [];
  for (let k = 0; k < 9; k++) {
    const a = hash2(k, 1, seed) * 6.28, d = 0.15 + hash2(k, 2, seed) * 0.45;
    shapes.push([Math.cos(a) * d, Math.sin(a) * d, 0.42 + hash2(k, 3, seed) * 0.25]);
  }
  shapes.push([0, 0, 0.6]);
  leafyBlob(pb, W / 2, H / 2, R, LEAF, seed, shapes);
  // Luz vinda de cima à esquerda.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!pb.get(x, y)) continue;
    const lit = (x - W / 2) * -0.5 + (y - H / 2) * -0.8;
    if (lit > R * 0.35 && hash2(x, y, seed + 5) > 0.4) pb.set(x, y, LEAF[4]);
    else if (lit < -R * 0.4 && hash2(x, y, seed + 6) > 0.3) pb.set(x, y, LEAF[0]);
  }
  pb.outline(rgba('#0a160a'));
  return pb.commit();
}

export function logSprite(len, seed, char = 0) {
  const W = Math.ceil(len), H = 13;
  const pb = new PixelBuf(W, H);
  const B = char > 0.4 ? ramp('#120c08', '#1e140e', '#2a1e16', '#3a2a1e', '#4a3626') : BARK;
  for (let x = 2; x < W - 2; x++) for (let y = 1; y < H - 1; y++) {
    const f = (y - 1) / (H - 3);
    let c = B[Math.max(1, Math.min(4, Math.round(4 - Math.abs(f - 0.3) * 5)))];
    if (hash2(x, y >> 1, seed) > 0.85) c = B[1];
    pb.set(x, y, c);
  }
  for (const ex of [2, W - 3]) {
    pb.ellipse(ex, H / 2, 2.5, 5.5, ramp('#5a3a1a', '#9a6a36', '#c89a5a', '#e0bc80', '#f0d8a0'));
  }
  mossify(pb, seed, 0.9);
  pb.outline(rgba('#140c06'));
  return pb.commit();
}

export function mushroomSprite(seed) {
  const pb = new PixelBuf(10, 10);
  const glow = hash2(seed, 1, 1) > 0.5;
  const cap = glow ? ramp('#1a3a6a', '#2a6ab0', '#4aa0e8', '#8ad0ff', '#d0f0ff') : ramp('#5a0a0a', '#a01a1a', '#d83a2a', '#f06a4a', '#ff9a7a');
  pb.rect(4, 5, 2, 4, rgba('#e8dcc0'));
  pb.ellipse(5, 4, 4, 2.6, cap, { shift: 0.1 });
  if (!glow) { pb.set(3, 3, rgba('#fff8f0')); pb.set(6, 2, rgba('#fff8f0')); }
  pb.outline(rgba('#1a0e0a'));
  return { canvas: pb.commit(), glow };
}

// Detalhes estáticos pintados no chão ao montar a arena (flores, trepadeiras nos muros).
export function paintDecorBase(base, world) {
  for (const d of world.decor) {
    if (d.kind === 'flower') {
      const cols = [rgba('#ff6a8a'), rgba('#ffe066'), rgba('#f4f0ff'), rgba('#c08aff')];
      for (let k = 0; k < 7; k++) {
        const x = Math.round(d.x + (hash2(k, 1, d.x) - 0.5) * 14), y = Math.round(d.y + (hash2(k, 2, d.y) - 0.5) * 10);
        const c = cols[(hash2(k, 3, d.x + d.y) * 4) | 0];
        base.set(x, y, c); base.set(x + 1, y, c); base.set(x, y + 1, c); base.set(x + 1, y + 1, rgba('#fff6a0'));
      }
    } else if (d.kind === 'vines') {
      for (let x = d.x; x < d.x + d.w; x++) {
        if (hash2(x, 5, d.y) < 0.55) continue;
        const L = 2 + ((hash2(x, 6, d.y) * 7) | 0);
        for (let s = 0; s < L; s++) base.set(x, d.y - 4 + s, MOSS[(s + x) % 3]);
      }
    }
  }
}

// Perigos: respiros de raízes e gêiseres, com telegrafia clara.
export function drawHazard(h, fxG, fxT, t, dot) {
  const blink = Math.floor(t * 12) % 2;
  if (h.kind === 'rootVent') {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      fxG.set(Math.round(h.x + Math.cos(a) * 5), Math.round(h.y + Math.sin(a) * 4), rgba('#3a2412', 220));
    }
    fxG.set(h.x, h.y, rgba('#1a0e06'));
    if (h.phase === 'warn') {
      dot(fxG, h.x, h.y, h.r, rgba(blink ? '#c8ff80' : '#5aa83c', 230), t * 2, 3);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + t;
        const rr = h.r * (0.3 + 0.6 * ((t * 2 + k * 0.13) % 1));
        const x = Math.round(h.x + Math.cos(a) * rr), y = Math.round(h.y + Math.sin(a) * rr * 0.85);
        fxG.set(x, y, rgba('#6e4624')); fxG.set(x, y - 1, rgba('#84c858'));
      }
    }
  } else if (h.kind === 'geyser') {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + t * 1.5;
      const rr = 3 + Math.sin(t * 4 + k) * 1.2;
      fxG.set(Math.round(h.x + Math.cos(a) * rr), Math.round(h.y + Math.sin(a) * rr * 0.8), rgba('#cfefff', 200));
    }
    if (h.phase === 'warn') {
      dot(fxG, h.x, h.y, h.r, rgba(blink ? '#e8f8ff' : '#3a9ae8', 230), -t * 3, 3);
      for (let k = 0; k < 10; k++) {
        const a = hash2(k, Math.floor(t * 8), 3) * 6.28, rr = hash2(k, Math.floor(t * 8), 4) * h.r;
        fxG.set(Math.round(h.x + Math.cos(a) * rr), Math.round(h.y + Math.sin(a) * rr * 0.8), rgba('#ffffff', 220));
      }
    } else if (h.phase === 'active') {
      const cols = [rgba('#ffffff'), rgba('#c8f0ff'), rgba('#7cd0ff'), rgba('#3a9ae8')];
      for (let y = 0; y < 34; y++) {
        const w = 3 + Math.sin(y * 0.6 - t * 30) * 1.2 + (y > 26 ? (y - 26) * 0.7 : 0);
        for (let x = -w; x <= w; x++) fxT.set(Math.round(h.x + x), Math.round(h.y - y), cols[Math.min(3, Math.floor(Math.abs(x) / (w + 0.01) * 3 + (hash2(x | 0, y, Math.floor(t * 20)) > 0.7 ? 1 : 0)))]);
      }
    }
  }
}

// Correnteza: riscos claros deslizando na direção do fluxo.
export function drawCurrents(world, fxG, t) {
  const tr = world.terrain;
  for (let i = 0; i < tr.flowX.length; i++) {
    const fx = tr.flowX[i], fy = tr.flowY[i];
    if (!fx && !fy) continue;
    const x0 = (i % COLS) * TILE, y0 = ((i / COLS) | 0) * TILE;
    const off = (t * Math.hypot(fx, fy) * 0.6) % 8;
    for (let k = 0; k < 2; k++) {
      const sx = x0 + ((hash2(i, k, 7) * 8) | 0), sy = y0 + ((hash2(i, k, 8) * 8) | 0);
      const px = fx ? (sx + off * Math.sign(fx)) : sx, py = fy ? (y0 + ((sy - y0 + off * Math.sign(fy) + 16) % 8)) : sy;
      fxG.set(Math.round(px), Math.round(py), rgba('#bfe6f6', 150));
      fxG.set(Math.round(px), Math.round(py - Math.sign(fy || 0)), rgba('#bfe6f6', 90));
    }
  }
}

export function drawWaterfall(d, fxT, t) {
  const cols = [rgba('#ffffff'), rgba('#d8f2ff'), rgba('#8ad0f0'), rgba('#4aa0d8')];
  for (let x = d.x; x < d.x + d.w; x++) for (let y = d.y; y < d.y + d.h; y++) {
    const v = hash2(x, Math.floor(y - t * 60), 13);
    fxT.set(x, y, cols[v > 0.8 ? 0 : v > 0.5 ? 1 : v > 0.2 ? 2 : 3]);
  }
  for (let x = d.x - 2; x < d.x + d.w + 2; x++) if (hash2(x, Math.floor(t * 10), 14) > 0.4) fxT.set(x, d.y + d.h + ((hash2(x, Math.floor(t * 10), 15) * 3) | 0), cols[0]);
}

// Ambientação por arena (partículas puramente visuais).
export function ambient(world, particles, dt) {
  const kind = world.arenaDef?.style?.ambient;
  const r = Math.random;
  if (kind === 'pollen' && r() < dt * 6) particles.add({ ramp: 'pollen', x: r() * 640, y: r() * 360, z: 10 + r() * 20, vx: 6 + r() * 6, vy: -2, vz: -1, drag: 0, life: 4 + r() * 3 });
  else if (kind === 'mist' && r() < dt * 5) particles.add({ ramp: 'steam', x: r() * 640, y: r() * 360, z: 2, vx: 8, drag: 0, life: 4, size: 3, grow: 2, alpha: 0.18 });
  else if (kind === 'leaves' && r() < dt * 4) particles.add({ ramp: 'leafFall', x: r() * 640, y: r() * 360, z: 50 + r() * 30, vx: 10 + r() * 8, vy: 3, vz: -14, drag: 0, life: 5 });
  else if (kind === 'dust' && r() < dt * 2) particles.add({ ramp: 'dust', x: r() * 640, y: r() * 360, z: 4, vx: 10, drag: 0, life: 2.5, alpha: 0.5 });
  if (kind === 'mist') for (const d of world.decor) if (d.kind === 'waterfall' && r() < dt * 12) particles.add({ ramp: 'steam', x: d.x + r() * d.w, y: d.y + d.h + 2, z: 4, vx: (r() - 0.5) * 16, vy: 10, vz: 10, life: 1.2, size: 2, grow: 3, alpha: 0.5 });
}

export { makeCanvas };

// Broto Sentinela (Brotossauro): bulbo com folhas e uma vagem-canhão; o Guardião Ancestral é maior e espinhoso.
const POD = ramp('#1c3a14', '#2c5a1e', '#3f7e2a', '#5aa83c', '#84d058');
export function sentrySprite(big, seed, char = 0) {
  const W = big ? 22 : 16, H = big ? 26 : 20;
  const pb = new PixelBuf(W, H);
  const cx = W / 2, base = H - 3;
  // Bulbo/raiz na base.
  pb.ellipse(cx, base - 1, big ? 6 : 4.5, big ? 3 : 2.4, BARK, { shift: 0.1 });
  // Caule.
  for (let y = base - 3; y > base - (big ? 13 : 9); y--) { pb.set(Math.round(cx), y, POD[1]); pb.set(Math.round(cx) - 1, y, POD[2]); }
  // Folhas laterais.
  const lf = big ? 6 : 4;
  for (let k = 0; k < lf; k++) { pb.set(Math.round(cx) - 2 - k, base - 5 - Math.round(k * 0.5), POD[3 - (k > lf / 2 ? 1 : 0)]); pb.set(Math.round(cx) + 1 + k, base - 6 - Math.round(k * 0.4), POD[3]); }
  // Cabeça: vagem com boca escura.
  const hy = base - (big ? 16 : 11), hr = big ? 5.5 : 4;
  pb.ellipse(cx, hy, hr, hr * 0.85, POD, { shift: 0.2 });
  pb.ellipse(cx + hr * 0.5, hy + 0.5, hr * 0.4, hr * 0.4, ramp('#0a1406', '#122a0c', '#183a10', '#1c4012', '#20461a'));
  pb.set(Math.round(cx - hr * 0.3), Math.round(hy - hr * 0.4), rgba('#e8ffd0'));
  if (big) for (let k = 0; k < 6; k++) { const a = -2.6 + k * 0.55; pb.set(Math.round(cx + Math.cos(a) * (hr + 1)), Math.round(hy + Math.sin(a) * (hr + 1)), rgba('#e8dcc0')); }
  if (char > 0) pb.tint('#3a2a1a', Math.min(0.8, char * 1.1));
  pb.outline(rgba('#0c1a0a'));
  void seed;
  return pb.commit();
}
