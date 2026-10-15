import { TILE, COLS } from '../config.js';
import { hash2, valueNoise } from '../core/math.js';
import { T, props } from '../sim/tiles.js';
import { COURT } from '../arenas/quadra.js';
import { rgba } from './pixel.js';

// Pintura pixel a pixel do chão de cada arena: tipo de tile + paleta da arena + alturas
// (penhascos com face de rocha, sombras e bordas), pontes, escadas, umidade e fuligem.

const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const pal = (...h) => h.map(rgb);
export const pack = (r, g, b, a = 255) => ((a << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;

const DEFAULT = {
  sand: pal('#cdb07a', '#d6bb86', '#dfc592', '#e6cf9e'),
  grass: pal('#3e7a2c', '#4b8c33', '#579c3b', '#66ad45', '#80c458'),
  weed: pal('#8f7a34', '#a68f40', '#bba44e', '#cfba62', '#e0cf7a'),
  scorch: pal('#2a221e', '#352a24', '#40332a', '#4c3e33', '#6a625a'),
  water: pal('#1f5f9e', '#2a70b2', '#3683c2', '#7cc4e4'),
  deep: pal('#0b2240', '#0e2a4e', '#12335c', '#1a4470'),
  stone: pal('#6e6a62', '#7e7a70', '#8c877c', '#9d978a', '#b2ab9c'),
  moss: pal('#2c4a22', '#35582a', '#3f6632', '#4c763c'),
  dirt: pal('#5a4230', '#664b36', '#72553d', '#806146'),
  leaves: pal('#7a3e1a', '#9a5422', '#b8702c', '#d49a3e', '#e8c058'),
  under: pal('#1c3a18', '#24481e', '#2e5826', '#3c6c30', '#5a8c44'),
  wood: pal('#4a2e18', '#6a4424', '#87592f', '#a0703c'),
  cliff: pal('#2a2c34', '#3a3c46', '#4a4c58', '#5c5e6a'),
};
const LINE = rgb('#eef2ee');
const FLOWER = pal('#ff5a6e', '#ffd84a', '#f4f0ff', '#ff8ad0', '#b07aff', '#ff9a3a');

export function paletteFor(world) {
  const p = { ...DEFAULT };
  const o = world.arenaDef?.style?.palette || {};
  for (const k in o) p[k] = o[k].map(rgb);
  if (world.arenaId === 'abismo') p.stone = pal('#4c5462', '#58606e', '#646c7a', '#727a88', '#848c9a');
  if (world.arenaId === 'jardim') p.stone = pal('#7a7468', '#8a8476', '#989282', '#a8a190', '#bdb5a2');
  return p;
}

function courtLine(x, y) {
  const C = COURT;
  const inY = y >= C.y && y <= C.y + C.h, inX = x >= C.x && x <= C.x + C.w;
  if (inY && (Math.abs(x - C.x) < 1.2 || Math.abs(x - C.x - C.w) < 1.2 || Math.abs(x - C.cx) < 1)) return true;
  if (inX && (Math.abs(y - C.y) < 1.2 || Math.abs(y - C.y - C.h) < 1.2)) return true;
  const d = Math.hypot(x - C.cx, y - C.cy);
  if (Math.abs(d - C.circleR) < 1 || Math.abs(d - C.dotR) < 0.9) return true;
  const dl = Math.hypot(x - C.x, y - C.cy), dr = Math.hypot(x - C.x - C.w, y - C.cy);
  return (x < C.x && Math.abs(dl - C.semiR) < 1) || (x > C.x + C.w && Math.abs(dr - C.semiR) < 1);
}

function wetPixel(tr, i, x, y, h) {
  const c0 = i % COLS, r0 = (i / COLS) | 0, lx = x % TILE, ly = y % TILE;
  const dry = (dx, dy) => { const j = tr.idx(c0 + dx, r0 + dy); return j >= 0 && tr.wet[j] <= 0 && !props(tr.type[j]).water; };
  let edge = 9;
  if (dry(-1, 0)) edge = Math.min(edge, lx);
  if (dry(1, 0)) edge = Math.min(edge, 7 - lx);
  if (dry(0, -1)) edge = Math.min(edge, ly);
  if (dry(0, 1)) edge = Math.min(edge, 7 - ly);
  return edge > 2 || h < edge * 0.3 + 0.15;
}

function shoreDist(tr, i, x, y, isSame) {
  const c0 = i % COLS, r0 = (i / COLS) | 0, lx = x % TILE, ly = y % TILE;
  const other = (dx, dy) => { const j = tr.idx(c0 + dx, r0 + dy); return j >= 0 && !isSame(tr.type[j]); };
  return Math.min(other(-1, 0) ? lx : 9, other(1, 0) ? 7 - lx : 9, other(0, -1) ? ly : 9, other(0, 1) ? 7 - ly : 9);
}

// Tipos "macios" (vegetação e chão) se misturam nas bordas com pontilhado, sem degraus de 8×8.
const BLENDS = new Set([T.SAND, T.GRASS, T.WEEDS, T.MOSS, T.DIRT, T.LEAVES, T.UNDERGROWTH, T.FLOWERS, T.THORNS, T.SCORCHED]);

export function paintTile(world, P, i, x, y) {
  const tr = world.terrain;
  const seed = world.seed;
  const h = hash2(x, y, seed), n = valueNoise(x / 11, y / 11, seed) * 0.65 + h * 0.35;
  let ty = tr.type[i];
  if (BLENDS.has(ty)) {
    const lx = x % TILE, ly = y % TILE, c0 = i % COLS, r0 = (i / COLS) | 0;
    const near = [[lx, -1, 0], [7 - lx, 1, 0], [ly, 0, -1], [7 - ly, 0, 1]].sort((a, b) => a[0] - b[0])[0];
    if (near[0] < 3) {
      const j = tr.idx(c0 + near[1], r0 + near[2]);
      if (j >= 0 && tr.type[j] !== ty && BLENDS.has(tr.type[j]) && hash2(x, y, seed + 99) < (3 - near[0]) / 6.5) ty = tr.type[j];
    }
  }
  const style = world.arenaDef?.style || {};
  let c;
  switch (ty) {
    case T.SAND: case T.BLOCK: {
      c = P.sand[Math.min(3, (n * 4) | 0)];
      if (h > 0.985) c = rgb('#a08660');
      if (Math.abs(valueNoise(x / 17, y / 17, seed + 5) - 0.5) < 0.012) c = rgb('#b09466');
      if (style.court && courtLine(x, y) && hash2(x >> 1, y >> 1, seed + 9) > 0.12) c = LINE;
      break;
    }
    case T.GRASS: case T.FLOWERS: {
      c = P.grass[Math.min(3, (n * 3.6) | 0)];
      const blade = hash2(x, (y + ((hash2(x, 0, seed) * 4) | 0)) >> 2, seed + 2);
      if (blade > 0.86) c = P.grass[4];
      else if (blade < 0.08) c = P.grass[0];
      if (ty === T.FLOWERS) {
        // Canteiro: flores de 2×2 com miolo.
        const fx = x >> 1, fy = y >> 1;
        const f = hash2(fx, fy, seed + 17);
        if (f > 0.72) c = FLOWER[(hash2(fx >> 1, fy >> 1, seed + 18) * FLOWER.length) | 0];
        if (f > 0.97) c = rgb('#fff6a0');
      }
      break;
    }
    case T.WEEDS: {
      const col = hash2(x, 0, seed + 4);
      const stalk = col > 0.45 && ((y + ((col * 8) | 0)) % 5) < 3;
      c = P.weed[stalk ? (col > 0.8 ? 4 : 3) : Math.min(2, (n * 3) | 0)];
      if (h < 0.06) c = P.weed[0];
      break;
    }
    case T.THORNS: {
      c = P.under[Math.min(2, (n * 3) | 0)];
      const v = valueNoise(x / 3, y / 3, seed + 23);
      if (Math.abs(v - 0.5) < 0.07) c = rgb('#5a3420');
      if (Math.abs(v - 0.5) < 0.07 && h > 0.8) c = rgb('#d8d0b0');
      if (h > 0.97) c = rgb('#c0283a');
      break;
    }
    case T.WATER: {
      const d = shoreDist(tr, i, x, y, (t) => t === T.WATER);
      c = P.water[Math.min(2, (n * 3) | 0)];
      if (d === 0) c = rgb('#e0d6b0'); else if (d === 1) c = P.water[3];
      break;
    }
    case T.DEEP: {
      c = P.deep[Math.min(3, (valueNoise(x / 20, y / 20, seed + 3) * 4) | 0)];
      const d = shoreDist(tr, i, x, y, (t) => t === T.DEEP);
      if (d === 0 && h > 0.3) c = rgb('#9fd8e8'); else if (d <= 1 && h > 0.6) c = P.water[2];
      break;
    }
    case T.STONE: {
      // Lajotas desencontradas com rejunte e rachaduras.
      const row = (y / 8) | 0, ox = row % 2 ? 4 : 0;
      const lx = (x + ox) % 10, ly = y % 8;
      const slab = hash2(((x + ox) / 10) | 0, row, seed + 31);
      c = P.stone[Math.min(4, 1 + ((slab * 3) | 0))];
      if (lx === 0 || ly === 0) c = P.stone[0];
      else if (h > 0.96) c = P.stone[0];
      else if (lx === 1 || ly === 1) c = P.stone[Math.min(4, 2 + ((slab * 3) | 0))];
      if (world.arenaId !== 'abismo' && valueNoise(x / 6, y / 6, seed + 7) > 0.74) c = P.grass[1];
      break;
    }
    case T.BRIDGE: {
      const up = tr.type[tr.idx(i % COLS, ((i / COLS) | 0) - 1)] !== T.BRIDGE;
      const down = tr.type[tr.idx(i % COLS, ((i / COLS) | 0) + 1)] !== T.BRIDGE;
      c = P.wood[1 + ((hash2((x / 4) | 0, 0, seed + 41) * 3) | 0)];
      if (x % 4 === 0) c = P.wood[0];
      if ((up && y % TILE === 0) || (down && y % TILE === 7)) c = rgb('#2a1a0e');
      if ((up && y % TILE === 1) || (down && y % TILE === 6)) c = P.wood[3];
      break;
    }
    case T.MOSS: {
      c = P.moss[Math.min(3, (n * 4) | 0)];
      if (h > 0.95) c = rgb('#6a9a4c');
      break;
    }
    case T.LEAVES: {
      c = P.dirt[Math.min(3, (n * 3) | 0)];
      const lf = hash2(x >> 1, y >> 1, seed + 51);
      if (lf > 0.45) c = P.leaves[(hash2(x >> 1, y >> 1, seed + 52) * 5) | 0];
      break;
    }
    case T.UNDERGROWTH: {
      const v = valueNoise(x / 4, y / 4, seed + 61);
      c = P.under[Math.min(4, (v * 5) | 0)];
      if (h > 0.93) c = P.under[4];
      break;
    }
    case T.DIRT: {
      c = P.dirt[Math.min(3, (n * 4) | 0)];
      if (h > 0.975) c = rgb('#9a8466');
      break;
    }
    default: {
      c = P.scorch[Math.min(3, (n * 4) | 0)];
      if (h > 0.93) c = P.scorch[4];
      if (props(tr.base[i]).fuel && h < 0.05) c = rgb('#1a1412');
    }
  }
  let [r, g, b] = c;
  // Alturas: faces de penhasco abaixo de tiles mais altos, sombras e bordas iluminadas.
  if (world.arena.heights) {
    const hh = tr.height[i];
    let face = false;
    for (let d = 1; d <= 16; d++) {
      const up = tr.heightAt(x, y - d);
      if (up > hh + 0.25) {
        if (d <= Math.round((up - hh) * 8)) {
          face = true;
          const k = d / ((up - hh) * 8);
          const cl = P.cliff[Math.min(3, Math.floor((1 - k) * 3.5 + (hash2(x, (y / 2) | 0, seed + 71) > 0.8 ? 0.6 : 0)))];
          [r, g, b] = cl;
          if ((y + ((hash2(x >> 2, 0, seed) * 3) | 0)) % 4 === 0) { r *= 0.8; g *= 0.8; b *= 0.8; }
        }
        break;
      }
    }
    if (!face) {
      const sh = tr.heightAt(x - 5, y - 5) - hh;
      if (sh > 0.25) { const k = sh > 1 ? 0.6 : 0.75; r *= k; g *= k; b *= k * 1.05; } // sombra projetada
      const lower = (dx, dy) => tr.heightAt(x + dx, y + dy) < hh - 0.25;
      if (lower(0, 1) || lower(-1, 0) || lower(1, 0) || lower(0, -1)) { r = r * 0.5 + 20; g = g * 0.5 + 18; b = b * 0.5 + 18; } // contorno da borda
      else if (lower(0, 2) || lower(-2, 0) || lower(2, 0) || lower(0, -2)) { r = r * 0.7 + 70; g = g * 0.7 + 68; b = b * 0.7 + 60; } // luz na quina
      if ((hh === 1.5 || hh === 2) && ty === T.STONE && y % 3 === 0) { r *= 0.6; g *= 0.6; b *= 0.6; } // degraus
      if (hh >= 2.5) { r = r * 1.05 + 30; g = g * 1.05 + 24; b = b * 1.02 + 12; } // topo da plataforma, mais claro e quente
    }
  }
  const soot = tr.soot[i];
  if (soot > 0 && !props(ty).water) {
    const k = 1 - soot * 0.5 * (0.55 + 0.45 * valueNoise(x / 3, y / 3, seed + 13));
    r *= k; g *= k * 0.96; b *= k * 0.92;
  }
  if (tr.wet[i] > 0 && !props(ty).water && wetPixel(tr, i, x, y, h)) {
    r = r * 0.7; g = g * 0.62; b = b * 0.56 + 6;
    if (h > 0.955) { r = 170; g = 214; b = 236; }
    else if (h > 0.93) { r += 14; g += 22; b += 34; }
  }
  return pack(r, g, b);
}

// Muros: arquibancadas (quadra) e ruínas de pedra com musgo (jardim).
export function paintWalls(base, world) {
  const wood = [rgba('#4a2a12'), rgba('#7a4a22'), rgba('#a5672e')];
  for (const w of world.walls) {
    if (w.kind === 'bleacher') {
      base.rect(w.x, w.y, w.w, w.h, wood[1]);
      for (let k = 0; k < 4; k++) {
        const y = w.y + 6 + k * 7;
        base.rect(w.x + 8, y, w.w - 16, 6, rgba(k % 2 ? '#a8a8a8' : '#c4c4c4'));
        base.rect(w.x + 8, y + 5, w.w - 16, 1, rgba('#7a7a7a'));
      }
      base.rect(w.x, w.y, w.w, 4, wood[2]);
      base.rect(w.x, w.y + w.h - 2, w.w, 2, wood[0]);
      for (const sx of [w.x, w.x + w.w - 8]) {
        base.rect(sx, w.y + 4, 8, w.h - 4, rgba('#6a6a6e'));
        for (let y = w.y + 6; y < w.y + w.h - 2; y += 3) base.rect(sx + 1, y, 6, 1, rgba('#4a4a4e'));
      }
      for (let x = w.x; x < w.x + w.w; x++) { base.set(x, w.y, wood[0]); base.set(x, w.y + w.h, rgba('#3a2a1a')); }
    } else {
      // Ruína: tijolos de pedra, topo claro, face escura e musgo.
      const S = ['#4a4640', '#5e5850', '#746c60', '#8a8274', '#a29a8a'].map((h) => rgba(h));
      const M = ['#3a5a2a', '#4c7034', '#64904a'].map((h) => rgba(h));
      for (let y = w.y - 6; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) {
        const top = y < w.y + 2;
        const brick = ((y >> 2) % 2 ? (x + 3) : x) % 6 === 0 || (y % 4 === 0);
        const hsh = hash2(x, y, 91);
        let c = top ? S[4] : brick ? S[0] : S[1 + ((hash2(x >> 2, y >> 2, 92) * 3) | 0)];
        if (y >= w.y + w.h - 2) c = S[0];
        if (hsh > 0.82 && (top || y < w.y + 4)) c = M[(hsh * 7) % 3 | 0];
        base.set(x, y, c);
      }
      for (let x = w.x - 1; x <= w.x + w.w; x++) base.set(x, w.y + w.h, rgba('#1e1a16', 160));
    }
  }
}
