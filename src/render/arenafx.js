// Desenho dos eventos de arena (ver sim/arenaevents.js): paredes de terra que sobem, tsunami e Kraken.
// Tudo é barato por quadro: a parede só é animada durante a subida (depois vira parte do chão pintado, ver
// paintWalls 'earth'); a tsunami desenha só a crista e a linha de aviso; o Kraken são algumas dezenas de retângulos.
import { hash2 } from '../core/math.js';
import { rgba } from './pixel.js';
import { WORLD_H } from '../config.js';
import { drawScan } from './asciifx.js';

const EARTH = { top: rgba('#9a7a54'), hi: rgba('#c4a074'), lip: rgba('#7a5a3a'), face: rgba('#5a4030'), brick: rgba('#44301f'), foot: rgba('#2a1c10'), crack: rgba('#1a0f08'), glow: rgba('#ff9f43') };
const SEA = { foam: rgba('#ffffff'), light: rgba('#bfe9f5'), mid: rgba('#7ac8e8'), deep: rgba('#1f6aa8'), dark: rgba('#14507e') };

export const ARENA_HAZARDS = new Set(['earthWall', 'tsunami', 'kraken', 'scanline']);

export function drawHazard(r, h, world, t) {
  if (h.kind === 'earthWall') drawEarthWall(r, h, world, t);
  else if (h.kind === 'tsunami') drawTsunami(r, h, world, t);
  else if (h.kind === 'scanline') drawScan(r, h, world, t);
}

// Rachaduras pulsando no chão (aviso) e o bloco subindo com tremor e poeira.
function drawEarthWall(r, h, world, t) {
  const g = r.fxG, R = h.rect;
  if (h.phase === 'warn') {
    const a = 0.5 + 0.5 * Math.sin(t * 14);
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) {
      const edge = x === R.x || y === R.y || x === R.x + R.w - 1 || y === R.y + R.h - 1;
      if (edge && ((x + y + Math.floor(t * 10)) & 3) === 0) g.set(x, y, EARTH.glow);
      else if (!edge && ((x * 5 + y * 3) % 23 === 0 || (y - R.y) % 9 === 0 && (x * 7) % 5 === 0)) g.set(x, y, a > 0.5 ? EARTH.crack : EARTH.glow);
    }
    return;
  }
  const wl = h.wall;
  if (!wl || h.phase !== 'active') return;
  const e = world.time - wl.at;
  if (e < 0 || e >= wl.rise) return;
  const u = e / wl.rise, k = u * u * (3 - 2 * u);
  const Hh = Math.round(wl.H * k), jx = Math.round(Math.sin(t * 60) * (1 - k) * 1.5);
  drawBlock(r.fxT, R.x + jx, R.y, R.w, R.h, Hh);
  if (Math.random() < 0.6) r.particles.add({ ramp: 'dust', x: R.x + Math.random() * R.w, y: R.y + R.h, vz: 30, life: 0.5, size: 2 });
}

// Bloco de terra: tampo claro (sobe Hh px) e face frontal com fiadas de tijolo. Também usado pelo chão pintado.
export function drawBlock(b, x, y, w, h, Hh) {
  const top = y - Hh, faceY = y + h - Hh;
  for (let yy = faceY; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const row = ((yy - faceY) / 3) | 0, brick = (yy - faceY) % 3 === 0 || ((xx - x + (row % 2) * 3) % 6 === 0);
    b.set(xx, yy, yy === y + h - 1 ? EARTH.foot : brick ? EARTH.brick : EARTH.face);
  }
  for (let yy = top; yy < faceY; yy++) for (let xx = x; xx < x + w; xx++) {
    const n = hash2(xx, yy, 41);
    b.set(xx, yy, yy === top ? EARTH.hi : yy === faceY - 1 ? EARTH.lip : n > 0.85 ? EARTH.hi : n < 0.12 ? EARTH.lip : EARTH.top);
  }
}

// Crista branca da onda (só enquanto ela avança) e, no aviso, uma linha de espuma até onde a próxima onda vai chegar.
function drawTsunami(r, h, world, t) {
  const g = r.fxT, front = h.frontAt(world.time);
  if (h.phase === 'warn') {
    const blink = Math.floor(t * 8) % 2;
    for (let y = 2; y < WORLD_H; y += 3) g.set(4 + Math.round(Math.sin(y * 0.3 + t * 6) * 3), y, blink ? SEA.foam : SEA.mid);
    // A maré recua: espuma tremendo na borda atual.
    for (let y = 0; y < WORLD_H; y += 2) if (hash2(y, Math.floor(t * 10), 3) > 0.6) g.set(front + 2 + Math.round(Math.sin(y + t * 9) * 2), y, SEA.light);
    return;
  }
  if (h.phase !== 'active' || front < 2) return;
  for (let y = 0; y < WORLD_H; y++) {
    const o = Math.round(Math.sin(y * 0.5 + t * 8) * 2 + Math.sin(y * 0.17 + t * 3) * 3), x = Math.round(front + o);
    for (let k = 0; k < 4; k++) g.set(x + k, y, SEA.foam);
    for (let k = 1; k <= 6; k++) g.set(x - k, y, SEA.mid);
    for (let k = 7; k <= 20; k += 2) g.set(x - k, y, (y + k) & 1 ? SEA.deep : SEA.dark);
    if (y % 3 === 0) g.set(x + 4 + ((y * 7 + Math.floor(t * 10)) % 5), y, SEA.foam);
  }
  if (Math.random() < 0.8) r.particles.add({ ramp: 'water', x: front, y: Math.random() * WORLD_H, vx: 60 + Math.random() * 60, vz: 60, g: 200, life: 0.5 });
}

// Kraken no poço: manto alto com manchas e coroa de cracas, olhos enormes (vermelhos na fúria), bico, e oito
// tentáculos grossos com ventosas que saem do poço por cima da areia; o que vai atacar se ergue e brilha.
// Dormindo (só nos primeiros segundos): só o topo da cabeça e os olhos fora d'água.
const KCOL = {
  out: '#1a0a26', dark: '#3a1a52', mid: '#5a2a7a', body: '#7a3aa0', hi: '#9a5ac0', top: '#c08ae0', spot: '#2a1040',
  suck: '#f0b8e8', suckD: '#b07ab0', crown: '#d8c890', crownD: '#8a7a50', beak: '#2a2018', eye: '#ffe83a', eyeR: '#ff3a3a',
};
export function drawKraken(r, o, t) {
  const l = r.l, h = o.hazard, X = Math.round(o.x), Y = Math.round(o.y);
  if (o.destroyed) {
    for (let k = 0; k < 8; k++) { l.fillStyle = 'rgba(207,238,255,0.6)'; l.fillRect(X + Math.round(Math.cos(t + k) * 20), Y + Math.round(Math.sin(t * 1.3 + k) * 14), 2, 2); }
    return;
  }
  const awake = h?.awake, wind = h?.phase === 'warn', rage = o.hp < o.maxHp * 0.5;
  const C = rage ? { ...KCOL, body: '#9a2a6a', mid: '#7a1a52', hi: '#c04a8a', top: '#e07ab0' } : KCOL;
  // Ondas no poço.
  l.globalAlpha = 0.45; l.fillStyle = '#cfeeff';
  for (let k = 0; k < 3; k++) { const R = 30 + ((t * 10 + k * 8) % 24); for (let a = 0; a < 64; a++) if ((a + k) % 3) l.fillRect(Math.round(X + Math.cos(a * 0.098) * R), Math.round(Y + Math.sin(a * 0.098) * R * 0.75), 1, 1); }
  l.globalAlpha = 1;
  const aim = h?.aim ?? t * 0.4;
  const box = (x, y, sz, c) => { l.fillStyle = c; l.fillRect(Math.round(x - sz), Math.round(y - sz), sz * 2, sz * 2); };
  if (awake) {
    // Tentáculos de trás primeiro (metade de cima), depois os da frente.
    const order = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i * 0.785 + 0.39).sort((a, b) => Math.sin(a) - Math.sin(b));
    for (const a0 of order) {
      const lift = wind && Math.abs(Math.atan2(Math.sin(a0 - aim), Math.cos(a0 - aim))) < 0.5 ? 1 : 0;
      const len = 58 + lift * 14 + Math.sin(t * 1.3 + a0 * 3) * 6;
      for (let s2 = 0; s2 <= 1.0001; s2 += 0.045) {
        const curl = s2 > 0.75 ? (s2 - 0.75) * 4 * 1.2 : 0; // a ponta enrola
        const an = a0 + 0.38 * Math.sin(t * 1.7 + a0 * 2 + s2 * 3.2) + curl * Math.sin(a0 * 5);
        const rad = 18 + len * s2, sz = Math.max(1, Math.round(6.5 - 5.5 * s2 + lift));
        const cx = X + Math.cos(an) * rad, cy = Y + Math.sin(an) * rad * 0.8 - lift * Math.sin(s2 * Math.PI) * 10;
        box(cx + 1, cy + 1, sz, C.out);
        box(cx, cy, sz, lift ? C.hi : C.body);
        if (sz >= 2) box(cx - 1, cy - 1, Math.max(1, sz - 2), lift ? C.top : C.mid);
        if (s2 > 0.12 && Math.round(s2 * 22) % 3 === 0) { l.fillStyle = C.suck; l.fillRect(Math.round(cx), Math.round(cy + sz - 1), 1, 1); l.fillStyle = C.suckD; l.fillRect(Math.round(cx + 1), Math.round(cy + sz - 1), 1, 1); }
      }
    }
  }
  const dot = (a, b, rx, ry, c) => { l.fillStyle = c; for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry))); l.fillRect(X + a - w, Y + b + dy, w * 2 + 1, 1); } };
  if (!awake) {
    dot(0, 2, 13, 8, C.out); dot(0, 1, 12, 7, C.dark); dot(-2, -1, 8, 4, C.mid);
    for (const sx of [-6, 6]) { dot(sx, 2, 3, 2, KCOL.eye); l.fillStyle = '#000'; l.fillRect(X + sx, Y + 1, 1, 3); }
    return;
  }
  const bob = Math.round(Math.sin(t * 2) * 1.5), hy = -14 + bob;
  // Manto (cabeça alta) com sombra, brilho e manchas.
  dot(1, hy + 2, 21, 25, C.out);
  dot(0, hy, 20, 24, o.hitFlash > 0 ? '#ffffff' : C.dark);
  dot(-1, hy - 2, 17, 21, C.mid);
  dot(-3, hy - 5, 13, 16, C.body);
  dot(-6, hy - 11, 6, 8, C.hi);
  dot(-8, hy - 15, 2, 3, C.top);
  for (const [a, b, rr] of [[8, -20, 3], [-10, -4, 2], [12, -6, 2], [3, -28, 2], [-4, -18, 2], [10, -30, 1]]) dot(a, hy + b + 14, rr, rr, C.spot);
  // Coroa de cracas/espinhos no topo.
  for (let k = -3; k <= 3; k++) {
    const cx = X + k * 5, cy = Y + hy - 22 + Math.abs(k) * 2;
    l.fillStyle = C.out; l.fillRect(cx - 2, cy - 1, 5, 4);
    l.fillStyle = KCOL.crownD; l.fillRect(cx - 1, cy, 3, 3);
    l.fillStyle = KCOL.crown; l.fillRect(cx - 1, cy - 2 - (k % 2 ? 0 : 2), 2, 3);
  }
  // Olhos enormes com pupila em fenda seguindo a mira; na fúria ficam vermelhos.
  const ex = Math.cos(aim) * 2, ey = Math.sin(aim) * 1.5, eyeC = rage ? KCOL.eyeR : KCOL.eye;
  for (const sx of [-8, 8]) {
    dot(sx, hy + 10, 6, 5, C.out);
    dot(sx, hy + 10, 5, 4, wind && Math.floor(t * 12) % 2 ? '#ffffff' : eyeC);
    l.fillStyle = '#000'; l.fillRect(Math.round(X + sx + ex), Math.round(Y + hy + 7 + ey), 1, 7);
    l.fillStyle = '#fff'; l.fillRect(X + sx - 3, Y + hy + 7, 2, 1);
    l.fillStyle = C.out; l.fillRect(X + sx - 6, Y + hy + 3 + (sx < 0 ? 1 : 0), 12, 2); // sobrancelha brava
  }
  // Bico.
  dot(0, hy + 20, 4, 4, C.out); dot(0, hy + 20, 3, 3, KCOL.beak);
  l.fillStyle = '#6a5a48'; l.fillRect(X - 1, Y + hy + 18, 2, 2);
  if (rage && Math.random() < 0.4) r.particles.add({ ramp: 'smoke', x: X + (Math.random() - 0.5) * 30, y: Y + hy - 10, vz: 20, life: 0.8, size: 2, grow: 2, alpha: 0.4 });
  // Vida do Kraken (grande, com o nome).
  const W = 84, bx = X - W / 2, by = Y + hy - 40, f = Math.max(0, o.hp / o.maxHp);
  l.fillStyle = '#140c0a'; l.fillRect(bx - 1, by - 1, W + 2, 6);
  l.fillStyle = '#2a1238'; l.fillRect(bx, by, W, 4);
  l.fillStyle = rage ? '#ff4aa0' : '#c070ff'; l.fillRect(bx, by, Math.round(W * f), 4);
  l.fillStyle = '#ffffff'; l.fillRect(bx, by, Math.round(W * f), 1);
}

// Arremessos do Kraken em voo: bola d'água (azul, brilho) ou pedra cinza; sombra crescendo no chão.
// O tentáculo (krakenArm) não voa: só a marca no chão avisa, e ele desce de uma vez (efeito tentacleSlam).
export function drawKrakenShot(r, g, p, x, y) {
  if (p.kind === 'krakenArm') return;
  const l = r.l, k = p.t / p.flight;
  l.globalAlpha = 0.35; l.fillStyle = '#000';
  l.beginPath(); l.ellipse(Math.round(x), Math.round(y), 3 + k * 4, 2 + k * 2, 0, 0, Math.PI * 2); l.fill(); l.globalAlpha = 1;
  const hy = y - p.h, rock = p.kind === 'krakenRock';
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const d = rock ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
    if (d > 5) continue;
    g.set(x + dx, hy + dy, rock ? rgba(d >= 4.5 ? '#3a3a42' : dx < 0 && dy < 0 ? '#b0b0b8' : '#7a7a82') : rgba(d > 4.2 ? '#1f7ab8' : dx < -1 && dy < -1 ? '#cfeeff' : '#4ab8f0'));
  }
  if (!rock && Math.random() < 0.6) r.particles.add({ ramp: 'water', x, y: hy, vz: 10, life: 0.3 });
}

// Marca no chão onde o arremesso vai cair (água: azul; pedra: cinza), fechando conforme chega.
export function drawKrakenMark(r, g, p, t) {
  const k = p.t / p.flight, blink = Math.floor(t * (8 + k * 14)) % 2;
  const rock = p.kind === 'krakenRock', arm = p.kind === 'krakenArm';
  r.dotCircle(g, p.tx, p.ty, p.radius, rgba(arm ? (blink ? '#ff9ae6' : '#7a3aa0') : rock ? (blink ? '#ffffff' : '#8a8a96') : (blink ? '#e8fbff' : '#3a9ae8'), 230), t * 2, 3);
  r.dotCircle(g, p.tx, p.ty, p.radius * k, rgba(arm ? '#c08ae0' : rock ? '#c8c8d0' : '#8fd8ff', 190), -t * 3, 4);
}

// Eventos visuais (texto grande, tremor, respingos).
export function onEvent(r, e, P) {
  switch (e.type) {
    case 'wallRise': r.shake = Math.max(r.shake, 5); break;
    case 'tsunamiWarn': r.addText({ x: Math.max(120, e.x), y: 60, text: 'TSUNAMI!', t: 0, color: '#8fd8ff', big: true }); break;
    case 'tsunami': r.shake = Math.max(r.shake, 7); break;
    case 'krakenWake':
      r.addText({ x: e.x, y: e.y - 50, text: 'O KRAKEN DESPERTOU!', t: 0, color: '#d8a0ff', big: true });
      P.burst(e.x, e.y, 30, { ramp: 'water', speed: 120, life: 0.7, vz: 80, g: 200 });
      r.shake = Math.max(r.shake, 8);
      break;
    case 'krakenWindup': P.burst(e.x, e.y - 6, 6, { ramp: 'water', speed: 40, life: 0.4, vz: 50, g: 200 }); break;
    case 'krakenRage':
      r.addText({ x: e.x, y: e.y - 70, text: 'KRAKEN FURIOSO!', t: 0, color: '#ff6ad0', big: true });
      r.shake = Math.max(r.shake, 6);
      break;
    case 'krakenDown':
      r.addText({ x: e.x, y: e.y - 50, text: 'KRAKEN DERROTADO!', t: 0, color: '#d8a0ff', big: true });
      P.burst(e.x, e.y, 50, { ramp: 'water', speed: 160, life: 0.9, vz: 100, g: 200 });
      r.shake = Math.max(r.shake, 10); r.flash = 0.1;
      break;
  }
}
