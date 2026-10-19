import { WORLD_W, WORLD_H, TILE, COLS, SWITCH, EVOLUTION } from '../config.js';
import { hash2, valueNoise, clamp } from '../core/math.js';
import { props } from '../sim/tiles.js';
import { PixelBuf, rgba, makeCanvas } from './pixel.js';
import { drawBrasalisco, drawHidrocasco, drawBrotossauro, drawDummy, rockSprite, crateSprite, bushSprite, stumpSprite } from './sprites.js';
import { ArtSprites } from './artsprites.js';
import { paintTile, paintWalls, paletteFor } from './terrainpaint.js';
import { pillarSprite, rootSprite, lighthouseSprite, statueSprite, hedgeSprite, thicketSprite, giantFlowerSprite, trunkSprite, canopySprite, logSprite, mushroomSprite, paintDecorBase, drawHazard, drawCurrents, drawWaterfall, ambient, sentrySprite } from './scenery.js';
import { Particles } from './particles.js';
import { drawHud } from './hud.js';

const SPRITE_FN = { brasalisco: drawBrasalisco, hidrocasco: drawHidrocasco, brotossauro: drawBrotossauro, dummy: drawDummy };
export const ART_NAMES = ['fire_1', 'fire_3', 'water_1', 'water_3', 'plant_1', 'plant_3', 'hedgehog_1', 'hedgehog_3', 'octo_1', 'octo_3', 'mantis_1', 'mantis_3'];
const EVO_COLOR = { fire: '#ffb040', water: '#7ad8ff', plant: '#a8f070' };
export const TEAM_COLOR = ['#ffd23a', '#ff4a5a'];
// Cor do seu lado é sempre dourada (no online, quem joga no lado B vê as cores trocadas).
export function setPerspective(side) { TEAM_COLOR[0] = side === 0 ? '#ffd23a' : '#ff4a5a'; TEAM_COLOR[1] = side === 0 ? '#ff4a5a' : '#ffd23a'; }
export const ELEMENT_COLOR = { fire: '#ff8a3a', water: '#46b4ff', plant: '#7ad84a', neutral: '#d8c08a' };
const ROOT = [rgba('#4a2e16'), rgba('#6e4624'), rgba('#94653a'), rgba('#5aa83c'), rgba('#84c858')];
const FLAME = ['#fff7c2', '#ffd84a', '#ff9a1f', '#f2541b', '#b3200f'].map((h) => rgba(h));
const EMBER = [rgba('#7a1e0a', 200), rgba('#b3300f', 220), rgba('#e0561a', 230), rgba('#ff8a2a', 240)];
// Cores das mecânicas próprias (usadas no mundo e no HUD).
export const SIG_COLOR = { heat: '#ff9a3a', overheat: '#ffd84a', exhaust: '#9a8a7a', momentum: '#ffe066', guard: '#8fd8ff', sentry: '#9ae070', decoy: '#b8a0ff', marks: '#b4f08a' };


function glowSprite(color, size = 32) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.low = makeCanvas(WORLD_W, WORLD_H);
    this.l = this.low.getContext('2d');
    this.base = new PixelBuf(WORLD_W, WORLD_H);
    this.fxG = new PixelBuf(WORLD_W, WORLD_H, true);
    this.fxT = new PixelBuf(WORLD_W, WORLD_H, true);
    // Brilho aditivo em meia resolução (é um borrão: ninguém nota a diferença; custa 1/4 dos pixels).
    this.glow = makeCanvas(WORLD_W / 2, WORLD_H / 2);
    this.gl = this.glow.getContext('2d');
    this.gl.setTransform(0.5, 0, 0, 0.5, 0, 0);
    this.glows = { fire: glowSprite('rgba(255,140,40,0.55)'), blue: glowSprite('rgba(90,180,255,0.5)'), white: glowSprite('rgba(255,250,220,0.8)') };
    this.particles = new Particles();
    this.debug = false;
    this.time = 0;
    this.art = new ArtSprites();
    this.shakeEnabled = true;
    this.showNumbers = true;
  }

  // Estado visual de cada monstro (criado sob demanda: bonecos de treino entram depois do início).
  ms(m) {
    let st = this.mon.get(m.id);
    if (!st) { st = { pb: new PixelBuf(48, 48), walk: 0, lagHp: m.hp, ghosts: [], ghostT: 0, seed: m.id * 7, top: 30, wob: 0 }; this.mon.set(m.id, st); }
    return st;
  }

  // Carrega a arte dos monstros (assets/monsters). Se falhar, usa os sprites procedurais.
  loadArt() { return this.art.load(ART_NAMES); }

  reset(world) {
    this.world = world;
    this.particles = new Particles();
    this.nums = [];
    this.texts = [];
    this.rings = [];
    this.shake = 0;
    this.hitstop = 0;
    this.excite = 0.2;
    this.flash = 0;
    this.mon = new Map();
    this.denyFlash = 0;
    this.denySlot = null;
    this.decoySt = new Map();
    this.rootFx = []; // jaulas de raízes (Brotossauro)
    this.tentFx = []; // tentáculos do abismo (Leviapus)
    for (const m of world.roster) this.ms(m);
    this.palette = paletteFor(world);
    this.obsSprites = new Map();
    this.obsDeco = new Map(); // sombra + anel de hitbox por obstáculo (estáticos)
    this.stump = stumpSprite();
    this.groups = new Map();
    for (const o of world.obstacles) if (o.group) { if (!this.groups.has(o.group)) this.groups.set(o.group, []); this.groups.get(o.group).push(o); }
    this.canopies = world.decor.filter((d) => d.kind === 'canopy').map((d) => ({ ...d, img: canopySprite(d.r, Math.round(d.x * 7 + d.y)) }));
    this.mushrooms = world.decor.filter((d) => d.kind === 'mushroom').flatMap((d) => [0, 1, 2].map((k) => ({ x: Math.round(d.x + (hash2(k, 1, d.x) - 0.5) * 14), y: Math.round(d.y + (hash2(k, 2, d.y) - 0.5) * 10), ...mushroomSprite(Math.round(d.x + d.y * 3 + k)) })));
    this.deepTiles = [];
    for (let i = 0; i < world.terrain.type.length; i++) if (props(world.terrain.type[i]).deep) this.deepTiles.push(i);
    this.crowd = [];
    const shirts = ['#d84a4a', '#4a7ad8', '#e8c040', '#5ab05a', '#c060c0', '#f0f0f0', '#e07a30', '#40b0b0'];
    const skins = ['#f0c8a0', '#d8a070', '#a87048', '#704a30'];
    for (const w of world.walls.filter((wl) => wl.kind === 'bleacher')) for (let row = 0; row < 4; row++) for (let x = w.x + 8; x < w.x + w.w - 8; x += 5 + ((hash2(x, row, 9) * 3) | 0)) {
      if (hash2(x, row, 3) < 0.25) continue;
      this.crowd.push({ x, y: w.y + 9 + row * 7, shirt: shirts[(hash2(x, row, 5) * shirts.length) | 0], skin: skins[(hash2(x, row, 6) * skins.length) | 0], ph: hash2(x, row, 7) * 6, team: x < WORLD_W / 2 ? 0 : 1 });
    }
    this.paintBase(true);
  }

  // Sprite de cada obstáculo e o ponto do sprite que fica sobre a posição do obstáculo (âncora).
  obstacleSprite(o, char) {
    const c = (img, ay) => ({ img, ax: img.width / 2, ay: ay ?? img.height / 2 });
    switch (o.kind) {
      case 'rock': { const img = rockSprite(o.r, o.id); return c(img, img.height / 2 + 1); }
      case 'crate': { const img = crateSprite(char); return c(img, img.height / 2 + 4); }
      case 'pillar': { const img = pillarSprite(o.r, o.id); return c(img, img.height - 5); }
      case 'root': { const img = rootSprite(o.r, o.id); return c(img, img.height / 2 + 1); }
      case 'lighthouse': { const img = lighthouseSprite(o.r, o.id); return c(img, img.height - 5); }
      case 'statue': { const img = statueSprite(o.id); return c(img, img.height - 4); }
      case 'hedge': { const img = hedgeSprite(o.r, o.id, char); return c(img, img.height / 2 + 2); }
      case 'thicket': { const img = thicketSprite(o.r, o.id, char); return c(img, img.height / 2 + 3); }
      case 'giantFlower': { const img = giantFlowerSprite(o.r, o.id, char); return c(img, img.height / 2 + 2); }
      case 'tree': { const img = trunkSprite(o.r, o.id); return c(img, img.height / 2 + 2); }
      case 'log': return c(logSprite(12, o.id, char));
      case 'sentry': case 'ancientSentry': { const img = sentrySprite(o.kind === 'ancientSentry', o.id, char); return c(img, img.height - 3); }
      default: { const img = bushSprite(o.r, o.id, char); return c(img, img.height / 2 + 3); }
    }
  }

  // ───────────── Terreno base (pixel a pixel, redesenhado só onde muda) ─────────────
  paintBase(all) {
    const tr = this.world.terrain;
    const list = all ? Array.from({ length: tr.type.length }, (_, i) => i) : [...tr.dirty];
    if (!all && !list.length) return;
    let x0 = WORLD_W, y0 = WORLD_H, x1 = 0, y1 = 0;
    const px = this.base.px;
    for (const i of list) {
      if (props(tr.type[i]).solid && !all) continue;
      const tx = (i % COLS) * TILE, ty = ((i / COLS) | 0) * TILE;
      for (let y = ty; y < ty + TILE; y++) for (let x = tx; x < tx + TILE; x++) px[y * WORLD_W + x] = paintTile(this.world, this.palette, i, x, y);
      x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx + TILE); y1 = Math.max(y1, ty + TILE);
    }
    tr.dirty.clear();
    if (all) { paintWalls(this.base, this.world); paintDecorBase(this.base, this.world); x0 = 0; y0 = 0; x1 = WORLD_W; y1 = WORLD_H; }
    this.base.ctx.putImageData(this.base.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }

  // ───────────── Eventos → efeitos visuais ─────────────
  consume(events) {
    const P = this.particles;
    for (const e of events) {
      this.sfx?.event(e, this.world);
      switch (e.type) {
        case 'shoot':
          if (e.kind === 'ember') P.burst(e.x, e.y, 6, { ramp: 'spark', speed: 50, life: 0.25, add: true });
          else if (e.kind === 'seed' || e.kind === 'thorn') P.burst(e.x, e.y, 5, { ramp: 'leaf', speed: 40, life: 0.3 });
          else if (e.kind === 'magma') P.burst(e.x, e.y, 10, { ramp: 'fire', speed: 50, life: 0.4, add: true, vz: 20 });
          else if (e.kind === 'wave') { P.burst(e.x, e.y, 18, { ramp: 'water', speed: 70, life: 0.5, vz: 50, g: 200 }); this.shake = Math.max(this.shake, 2); }
          else if (e.kind === 'roots') break;
          else if (e.kind === 'waterBolt') P.burst(e.x, e.y, 6, { ramp: 'water', speed: 45, life: 0.3 });
          else P.burst(e.x, e.y, 14, { ramp: 'fire', speed: 40, life: 0.5, add: true, vz: 40 });
          break;
        case 'hit': {
          const fire = e.element === 'fire';
          if (e.m?.dummy) { const st = this.ms(e.m); st.wob = Math.min(1.4, st.wob + (e.dot ? 0.05 : e.big ? 1 : 0.6)); }
          if (!this.showNumbers) { if (e.dot) break; } else this.nums.push({ x: e.m.x + (Math.random() - 0.5) * 8, y: e.m.y - 22, v: e.amount, t: 0, color: e.blocked ? '#c8e8ff' : fire ? '#ffb347' : e.element === 'water' ? '#8fd8ff' : e.element === 'plant' ? '#a8f080' : '#ffffff', small: e.dot || e.blocked, big: !e.dot && e.amount >= 14 });
          if (!e.dot) {
            P.burst(e.x, e.y - 4, e.big ? 18 : 9, { ramp: fire ? 'spark' : e.element === 'plant' ? 'leaf' : 'water', speed: e.big ? 90 : 60, life: 0.35, add: fire });
            this.rings.push({ x: e.x, y: e.y - 4, r: 2, max: e.big ? 16 : 9, t: 0, color: fire ? '#fff2a0' : '#e0f6ff' });
            this.shake = Math.max(this.shake, e.big ? 4 : 1.5);
            this.hitstop = Math.max(this.hitstop, e.big ? 0.07 : 0.035);
            this.excite = Math.min(1, this.excite + (e.big ? 0.25 : 0.08));
          }
          break;
        }
        case 'impact':
          if (e.kind === 'ember') P.burst(e.x, e.y, 10, { ramp: 'fire', speed: 55, life: 0.4, add: true, vz: 30 });
          else if (e.kind === 'seed' || e.kind === 'thorn') P.burst(e.x, e.y, 7, { ramp: e.kind === 'thorn' ? 'leaf' : 'dust', speed: 40, life: 0.35 });
          else if (e.kind === 'magma') { P.burst(e.x, e.y, 18, { ramp: 'fire', speed: 70, life: 0.6, add: true, vz: 40, size: 2 }); P.burst(e.x, e.y, 6, { ramp: 'smoke', speed: 20, life: 1, size: 2, grow: 3, alpha: 0.5 }); }
          else if (e.kind === 'wave') { P.burst(e.x, e.y, 26, { ramp: 'water', speed: 90, life: 0.6, vz: 70, g: 200, size: 2 }); this.rings.push({ x: e.x, y: e.y, r: 4, max: 20, t: 0, color: '#c8f0ff', thick: true }); }
          else P.burst(e.x, e.y, 12, { ramp: 'water', speed: 60, life: 0.4, vz: 50, g: 200 });
          if (e.obstacle) P.burst(e.x, e.y, 4, { ramp: e.obstacle.kind === 'rock' ? 'rock' : 'wood', speed: 50, life: 0.5, vz: 60, g: 240 });
          break;
        case 'ignite':
          P.burst(e.x, e.y, 4, { ramp: 'spark', speed: 25, life: 0.3, add: true, vz: 40 });
          break;
        case 'extinguish':
          for (let k = 0; k < 3; k++) P.add({ ramp: 'steam', x: e.x + (Math.random() - 0.5) * 6, y: e.y, vz: 18 + Math.random() * 14, vx: (Math.random() - 0.5) * 8, life: 0.9, size: 2, grow: 2, alpha: 0.75, drag: 1 });
          break;
        case 'clash':
          P.burst(e.x, e.y, 16, { ramp: 'steam', speed: 50, life: 0.7, size: 2, grow: 3, alpha: 0.8 });
          this.rings.push({ x: e.x, y: e.y, r: 2, max: 14, t: 0, color: '#ffffff' });
          this.addText({ x: e.x, y: e.y - 10, text: 'VAPOR!', t: 0, color: '#e8f6ff' });
          break;
        case 'explosion':
          P.burst(e.x, e.y, 46, { ramp: 'fire', speed: 120, life: 0.7, add: true, vz: 60, size: 2 });
          P.burst(e.x, e.y, 18, { ramp: 'smoke', speed: 40, life: 1.4, vz: 30, size: 3, grow: 3, alpha: 0.7 });
          P.burst(e.x, e.y, 12, { ramp: 'rock', speed: 90, life: 0.8, vz: 90, g: 260 });
          this.rings.push({ x: e.x, y: e.y, r: 4, max: e.r + 6, t: 0, color: '#fff2a0', thick: true });
          this.shake = Math.max(this.shake, 6);
          this.flash = 0.12;
          this.excite = 1;
          break;
        case 'dig':
          P.burst(e.x, e.y, 3, { ramp: 'dust', speed: 30, life: 0.5, vz: 24, g: 120, size: 2 });
          if (Math.random() < 0.5) P.burst(e.x, e.y, 1, { ramp: 'fire', speed: 10, life: 0.4, add: true, vz: 20 });
          break;
        case 'burrowEruption':
          P.burst(e.x, e.y, 36, { ramp: 'dust', speed: 90, life: 0.8, vz: 150, g: 260, size: 2 });
          P.burst(e.x, e.y, 22, { ramp: 'fire', speed: 80, life: 0.7, vz: 120, add: true });
          P.burst(e.x, e.y, 10, { ramp: 'rock', speed: 70, life: 0.9, vz: 160, g: 280 });
          this.rings.push({ x: e.x, y: e.y, r: 4, max: e.r + 10, t: 0, color: '#ffb040', thick: true });
          this.shake = Math.max(this.shake, 7);
          this.hitstop = Math.max(this.hitstop, 0.08);
          this.addText({ x: e.x, y: e.y - 30, text: 'ERUPÇÃO!', t: 0, color: '#ffb040' });
          break;
        case 'leapLand':
          P.burst(e.x, e.y, 14, { ramp: 'dust', speed: 70, life: 0.5, vz: 30 });
          P.burst(e.x, e.y, 8, { ramp: 'leafFall', speed: 50, life: 0.7, vz: 40, g: 80 });
          this.rings.push({ x: e.x, y: e.y, r: 3, max: e.r, t: 0, color: '#b4f08a' });
          break;
        case 'ink':
          P.burst(e.x, e.y, 14, { ramp: 'ink', speed: 40, life: 0.8, size: 3, grow: 3, alpha: 0.8 });
          break;
        case 'grow':
          P.burst(e.x, e.y, e.big ? 12 : 3, { ramp: 'leaf', speed: e.big ? 50 : 20, life: 0.5, vz: 25, g: 80 });
          break;
        case 'wither':
          P.burst(e.x, e.y, 10, { ramp: 'leafFall', speed: 30, life: 0.8, vz: 20, g: 60 });
          break;
        case 'geyser':
          P.burst(e.x, e.y, 30, { ramp: 'water', speed: 60, life: 0.9, vz: 140, g: 240, size: 2 });
          this.rings.push({ x: e.x, y: e.y, r: 4, max: e.r + 8, t: 0, color: '#e8f8ff', thick: true });
          this.shake = Math.max(this.shake, 2.5);
          break;
        case 'shield':
          this.addText({ x: e.x, y: e.y - 30, text: 'BOLHA!', t: 0, color: '#8fd8ff' });
          this.rings.push({ x: e.x, y: e.y - 6, r: 4, max: 18, t: 0, color: '#8fd8ff', thick: true });
          break;
        case 'shieldHit':
          P.burst(e.x, e.y - 8, 6, { ramp: 'water', speed: 40, life: 0.3 });
          break;
        case 'shieldBreak':
          P.burst(e.x, e.y - 8, 20, { ramp: 'water', speed: 80, life: 0.5, vz: 40, g: 120 });
          this.addText({ x: e.x, y: e.y - 30, text: 'BOLHA ESTOUROU', t: 0, color: '#8fd8ff' });
          break;
        case 'evolveStart':
          this.addText({ x: e.x, y: e.y - 36, text: 'EVOLUINDO...', t: 0, color: EVO_COLOR[e.m.element] });
          this.rings.push({ x: e.x, y: e.y - 6, r: 30, max: 2, t: 0, color: EVO_COLOR[e.m.element], thick: true });
          this.excite = 1;
          break;
        case 'evolveSwap': {
          const el = e.m.element;
          P.burst(e.x, e.y - 10, 50, { ramp: el === 'fire' ? 'fire' : el === 'water' ? 'water' : 'leaf', speed: 120, life: 0.9, vz: 80, size: 2, add: el === 'fire' });
          this.rings.push({ x: e.x, y: e.y, r: 4, max: 44, t: 0, color: '#ffffff', thick: true });
          this.addText({ x: e.x, y: e.y - 46, text: e.m.name.toUpperCase() + '!', t: 0, color: EVO_COLOR[el] });
          this.flash = 0.18;
          this.shake = Math.max(this.shake, 6);
          this.hitstop = Math.max(this.hitstop, 0.15);
          break;
        }
        case 'evolveEnd':
          this.rings.push({ x: e.x, y: e.y, r: 6, max: e.r, t: 0, color: EVO_COLOR[e.m.element], thick: true });
          P.burst(e.x, e.y, 24, { ramp: e.m.element === 'fire' ? 'spark' : e.m.element === 'water' ? 'water' : 'leaf', speed: 140, life: 0.5, add: e.m.element === 'fire' });
          break;
        case 'evolveDenied':
          this.evoDeny = 0.6;
          break;
        case 'bubbleBurst':
          P.burst(e.x, e.y, 26, { ramp: 'water', speed: 90, life: 0.5, vz: 60, g: 200, size: 2 });
          this.rings.push({ x: e.x, y: e.y, r: 4, max: e.r + 4, t: 0, color: '#c8f0ff', thick: true });
          this.shake = Math.max(this.shake, 2);
          break;
        case 'bubblePop':
          P.burst(e.x, e.y - 8, 18, { ramp: 'water', speed: 70, life: 0.4, vz: 40, g: 160 });
          this.rings.push({ x: e.x, y: e.y - 8, r: 6, max: 16, t: 0, color: '#ffffff' });
          break;
        case 'tentacleSlam':
          this.tentFx.push({ x: e.x, y: e.y, r: e.r, big: e.big, t: 0, seed: Math.random() * 6 });
          P.burst(e.x, e.y, e.big ? 34 : 18, { ramp: 'water', speed: 100, life: 0.6, vz: 120, g: 240, size: 2 });
          P.burst(e.x, e.y, e.big ? 12 : 6, { ramp: 'ink', speed: 40, life: 0.8, size: 3, grow: 2, alpha: 0.7 });
          this.shake = Math.max(this.shake, e.big ? 6 : 3);
          if (e.big) this.hitstop = Math.max(this.hitstop, 0.06);
          break;
        case 'waveCrash':
          if (e.small) { P.burst(e.x, e.y, 14, { ramp: 'water', speed: 90, life: 0.45, vz: 70, g: 220 }); break; } // onda curta do golpe básico: só respingo
          P.burst(e.x, e.y, 44, { ramp: 'water', speed: 150, life: 0.7, vz: 120, g: 240, size: 2 });
          P.burst(e.x + Math.cos(e.ang) * 10, e.y + Math.sin(e.ang) * 10, 16, { ramp: 'steam', speed: 60, life: 0.8, size: 3, grow: 3, alpha: 0.7 });
          this.rings.push({ x: e.x, y: e.y, r: 6, max: e.r + 6, t: 0, color: '#e8f8ff', thick: true });
          this.rings.push({ x: e.x, y: e.y, r: 4, max: e.r - 4, t: 0, color: '#5ab4ff', thick: true });
          this.shake = Math.max(this.shake, 5);
          break;
        case 'splash':
          // Estouro do golpe básico em arco: água (bolha) ou folhas e terra (semente).
          P.burst(e.x, e.y, e.water ? 22 : 16, e.water ? { ramp: 'water', speed: 90, life: 0.45, vz: 70, g: 220 } : { ramp: 'dust', speed: 70, life: 0.45, vz: 40, g: 160 });
          if (!e.water) P.burst(e.x, e.y, 10, { ramp: 'leafFall', speed: 60, life: 0.6, vz: 50, g: 120 });
          this.rings.push({ x: e.x, y: e.y, r: 3, max: e.r, t: 0, color: e.water ? '#bfe8ff' : '#a8d860' });
          break;
        case 'whirlBurst':
          P.burst(e.x, e.y, 34, { ramp: 'water', speed: 140, life: 0.5, vz: 50, g: 200, size: 2 });
          this.rings.push({ x: e.x, y: e.y, r: 8, max: e.r + 8, t: 0, color: '#e8f8ff', thick: true });
          this.shake = Math.max(this.shake, 3);
          break;
        case 'burrowOut':
          P.burst(e.x, e.y, e.big ? 26 : 16, { ramp: 'dust', speed: e.big ? 80 : 60, life: 0.6, vz: 70, g: 220, size: 2 });
          P.burst(e.x, e.y - 6, e.big ? 18 : 8, { ramp: 'leafFall', speed: 60, life: 0.9, vz: 50, g: 80 });
          if (e.big) this.rings.push({ x: e.x, y: e.y, r: 4, max: 26, t: 0, color: '#9ae070', thick: true });
          break;
        case 'rootsErupt':
          this.rootFx.push({ x: e.x, y: e.y, r: e.r, t: 0, dur: e.dur || 1.5, seed: Math.random() * 6 });
          P.burst(e.x, e.y, 26, { ramp: 'dust', speed: 70, life: 0.6, vz: 50, g: 220 });
          P.burst(e.x, e.y, 14, { ramp: 'leaf', speed: 50, life: 0.7, vz: 60, g: 160 });
          this.rings.push({ x: e.x, y: e.y, r: 3, max: e.r + 4, t: 0, color: '#9ae070', thick: true });
          this.shake = Math.max(this.shake, 2.5);
          break;
        case 'rooted':
          this.addText({ x: e.x, y: e.y - 26, text: 'PRESO!', t: 0, color: '#a8f080' });
          break;
        case 'recall':
          this.rings.push({ x: e.x, y: e.y - 6, r: 14, max: 2, t: 0, color: TEAM_COLOR[e.m.team], thick: true });
          P.burst(e.x, e.y - 6, 10, { ramp: 'steam', speed: 30, life: 0.4, vz: 30 });
          if (e.m.slot === this.world.playerTeam || this.world.playerTeam === null) this.addText({ x: e.x, y: e.y - 30, text: 'VOLTA!', t: 0, color: TEAM_COLOR[e.m.team] });
          break;
        case 'enter':
          this.rings.push({ x: e.x, y: e.y, r: 2, max: 20, t: 0, color: TEAM_COLOR[e.m.team], thick: true });
          P.burst(e.x, e.y, 14, { ramp: 'dust', speed: 60, life: 0.5 });
          if (e.reason !== 'start') {
            this.addText({ x: e.x, y: e.y - 30, text: `VAI, ${e.m.name.toUpperCase()}!`, t: 0, color: TEAM_COLOR[e.m.team] });
            this.excite = Math.min(1, this.excite + 0.3);
          }
          break;
        case 'entered':
          P.burst(e.x, e.y - 6, 10, { ramp: 'spark', speed: 50, life: 0.35, add: true });
          break;
        case 'switchDenied':
          if (e.team === this.world.playerTeam) this.denyFlash = 0.6;
          break;
        case 'dodge':
          P.burst(e.x, e.y + 4, 8, { ramp: 'dust', speed: 40, life: 0.4 });
          break;
        case 'evaded':
          this.addText({ x: e.x, y: e.y - 26, text: 'ESQUIVOU!', t: 0, color: '#ffffff' });
          this.rings.push({ x: e.x, y: e.y - 6, r: 3, max: 14, t: 0, color: '#ffffff' });
          break;
        case 'interrupt':
          this.addText({ x: e.x, y: e.y - 26, text: 'INTERROMPIDO', t: 0, color: '#ffe066' });
          break;
        case 'slam':
          P.burst(e.x, e.y, 10, { ramp: 'dust', speed: 60, life: 0.5 });
          this.shake = Math.max(this.shake, 3);
          break;
        case 'obstacleIgnite':
          P.burst(e.x, e.y, 14, { ramp: 'fire', speed: 50, life: 0.5, add: true, vz: 40 });
          break;
        case 'obstacleBreak':
          P.burst(e.x, e.y, 22, { ramp: e.kind === 'crate' ? 'wood' : 'leaf', speed: 90, life: 0.8, vz: 80, g: 260, size: 2 });
          if (e.burning) P.burst(e.x, e.y, 20, { ramp: 'fire', speed: 70, life: 0.6, add: true, vz: 50 });
          this.shake = Math.max(this.shake, 3);
          break;
        case 'death':
          if (e.m.element === 'fire') {
            P.burst(e.x, e.y, 30, { ramp: 'ash', speed: 50, life: 1.4, vz: 30, size: 2 });
            P.burst(e.x, e.y, 20, { ramp: 'smoke', speed: 20, life: 1.8, vz: 25, size: 3, grow: 4, alpha: 0.6 });
          } else if (e.m.element === 'plant') {
            P.burst(e.x, e.y, 30, { ramp: 'leafFall', speed: 70, life: 1.2, vz: 40, g: 80, size: 2 });
            P.burst(e.x, e.y, 14, { ramp: 'wood', speed: 60, life: 0.9, vz: 60, g: 220 });
          } else P.burst(e.x, e.y, 40, { ramp: 'water', speed: 90, life: 0.9, vz: 80, g: 200, size: 2 });
          this.shake = 8;
          this.hitstop = 0.25;
          this.excite = 1;
          break;
        case 'cast':
          if (e.kind !== 'projectile' && e.kind !== 'melee' && e.kind !== 'dodge') this.excite = Math.min(1, this.excite + 0.15);
          if (e.kind === 'dodge') P.burst(e.x, e.y + 4, 6, { ramp: 'dust', speed: 30, life: 0.35 });
          if (e.kind === 'guard') { this.rings.push({ x: e.x, y: e.y - 6, r: 4, max: 16, t: 0, color: SIG_COLOR.guard, thick: true }); }
          break;
        // ───── mecânicas próprias ─────
        case 'overheat':
          this.addText({ x: e.x, y: e.y - 34, text: 'SUPERAQUECIDO!', t: 0, color: SIG_COLOR.overheat, big: true });
          P.burst(e.x, e.y - 8, 30, { ramp: 'fire', speed: 90, life: 0.6, add: true, vz: 60, size: 2 });
          this.rings.push({ x: e.x, y: e.y, r: 4, max: 26, t: 0, color: SIG_COLOR.overheat, thick: true });
          this.shake = Math.max(this.shake, 3);
          break;
        case 'heatNova':
          P.burst(e.x, e.y, 40, { ramp: 'fire', speed: 150, life: 0.5, add: true, vz: 30, size: 2 });
          this.rings.push({ x: e.x, y: e.y, r: 6, max: e.r, t: 0, color: '#ffffff', thick: true });
          this.rings.push({ x: e.x, y: e.y, r: 4, max: e.r - 6, t: 0, color: '#ff7a1a', thick: true });
          this.shake = Math.max(this.shake, 6); this.flash = 0.08;
          break;
        case 'exhaust':
          this.addText({ x: e.x, y: e.y - 30, text: 'EXAUSTO', t: 0, color: '#d8ccb8' });
          P.burst(e.x, e.y - 10, 16, { ramp: 'smoke', speed: 30, life: 1.2, vz: 30, size: 2, grow: 3, alpha: 0.7 });
          break;
        case 'charged':
          this.addText({ x: e.x, y: e.y - 30, text: 'DISPARADA!', t: 0, color: SIG_COLOR.momentum });
          P.burst(e.x, e.y - 4, 14, { ramp: 'spark', speed: 70, life: 0.4, add: true });
          break;
        case 'empowered':
          this.addText({ x: e.x, y: e.y - 34, text: 'GOLPE CHEIO!', t: 0, color: SIG_COLOR.momentum, big: true });
          this.rings.push({ x: e.x, y: e.y - 4, r: 4, max: 22, t: 0, color: '#ffffff', thick: true });
          this.hitstop = Math.max(this.hitstop, 0.09); this.shake = Math.max(this.shake, 5);
          break;
        case 'thorns':
          P.burst(e.x, e.y - 6, 8, { ramp: 'spark', speed: 60, life: 0.3, add: true });
          this.addText({ x: e.x, y: e.y - 24, text: 'ESPINHOS', t: 0, color: '#ffb070' });
          break;
        case 'block':
          this.addText({ x: e.x, y: e.y - 28, text: 'BLOQUEOU', t: 0, color: SIG_COLOR.guard });
          P.burst(e.x, e.y - 6, 8, { ramp: 'water', speed: 60, life: 0.3 });
          break;
        case 'counter':
          this.addText({ x: e.x, y: e.y - 36, text: 'CONTRA-ATAQUE!', t: 0, color: '#ffffff', big: true });
          P.burst(e.x + Math.cos(e.ang) * 12, e.y + Math.sin(e.ang) * 12, 26, { ramp: 'water', speed: 120, life: 0.5, vz: 50, g: 200, size: 2 });
          this.rings.push({ x: e.x, y: e.y - 4, r: 6, max: 30, t: 0, color: SIG_COLOR.guard, thick: true });
          this.hitstop = Math.max(this.hitstop, 0.1); this.shake = Math.max(this.shake, 5);
          break;
        case 'reflect':
          this.addText({ x: e.x, y: e.y - 18, text: 'DEVOLVEU!', t: 0, color: SIG_COLOR.guard });
          P.burst(e.x, e.y, 10, { ramp: 'water', speed: 70, life: 0.3 });
          this.rings.push({ x: e.x, y: e.y, r: 2, max: 10, t: 0, color: '#ffffff' });
          break;
        case 'decoy':
          P.burst(e.x, e.y - 4, 8, { ramp: 'ink', speed: 30, life: 0.5, size: 2, grow: 2, alpha: 0.7 });
          break;
        case 'decoyPop':
          P.burst(e.x, e.y - 6, 22, { ramp: 'ink', speed: 70, life: 0.7, size: 3, grow: 3, alpha: 0.85 });
          this.addText({ x: e.x, y: e.y - 26, text: 'CÓPIA!', t: 0, color: SIG_COLOR.decoy });
          break;
        case 'decoyFade':
          P.burst(e.x, e.y - 6, 8, { ramp: 'ink', speed: 20, life: 0.6, size: 2, grow: 2, alpha: 0.5 });
          break;
        case 'cloak': case 'uncloak':
          P.burst(e.x, e.y - 8, 10, { ramp: 'ink', speed: 40, life: 0.4, size: 2, alpha: 0.6 });
          break;
        case 'marked':
          P.burst(e.x, e.y - 18, 4 + e.n * 2, { ramp: 'leaf', speed: 30, life: 0.35 });
          break;
        case 'execute':
          this.addText({ x: e.x, y: e.y - 38, text: 'EXECUÇÃO!', t: 0, color: SIG_COLOR.marks, big: true });
          P.burst(e.x, e.y - 8, 30, { ramp: 'leaf', speed: 130, life: 0.6, vz: 40, size: 2 });
          this.slashes = this.slashes || [];
          this.slashes.push({ x: e.x, y: e.y - 8, t: 0 });
          this.hitstop = Math.max(this.hitstop, 0.12); this.shake = Math.max(this.shake, 6);
          break;
        case 'sentryGrow':
          P.burst(e.x, e.y, e.big ? 18 : 12, { ramp: 'leaf', speed: 50, life: 0.5, vz: 40, g: 120 });
          this.rings.push({ x: e.x, y: e.y, r: 2, max: e.big ? 14 : 10, t: 0, color: SIG_COLOR.sentry, thick: true });
          break;
        case 'sentryShot':
          P.burst(e.x + Math.cos(e.ang) * 6, e.y + Math.sin(e.ang) * 6, 4, { ramp: 'leaf', speed: 40, life: 0.25 });
          break;
        case 'suddenDeath':
          this.addText({ x: WORLD_W / 2, y: 120, text: 'MORTE SÚBITA!', t: 0, color: '#ff6a6a', big: true });
          this.flash = 0.1; this.excite = 1;
          break;
        case 'devolve':
          this.addText({ x: e.x, y: e.y - 34, text: 'FORMA BASE', t: 0, color: '#e8b8ff' });
          this.rings.push({ x: e.x, y: e.y, r: 20, max: 4, t: 0, color: '#e8b8ff', thick: true });
          break;
        case 'dummyShot':
          P.burst(e.x, e.y - 8, 4, { ramp: 'dust', speed: 30, life: 0.3 });
          break;
        case 'castDenied':
          if (e.m === this.world.active) this.denySlot = { slot: e.slot, reason: e.reason, t: 0.45 };
          break;
        case 'nearMiss':
          // Seu tiro passou raspando: diz que errou por pouco (só no jogo local; online não é enviado).
          if (e.p?.owner && e.p.owner === this.world.active && e.m?.alive) this.addText({ x: e.m.x, y: e.m.y - 22, text: 'QUASE!', t: 0, color: '#b8b0a0' });
          break;
      }
    }
  }

  // Texto flutuante sem poluir: o mesmo aviso no mesmo lugar não se repete em sequência e há no máximo 7 na tela.
  addText(o) {
    for (const t of this.texts) if (t.text === o.text && t.t < 0.45 && Math.abs(t.x - o.x) < 24 && Math.abs(t.y - o.y) < 24) return;
    // Avisos próximos sobem um pouco para não sobrepor.
    for (const t of this.texts) if (t.t < 0.4 && Math.abs(t.x - o.x) < 30 && Math.abs(t.y - o.y) < 8) o.y -= 9;
    this.texts.push(o);
    if (this.texts.length > 7) this.texts.shift();
  }

  // ───────────── Quadro ─────────────
  render(world, alpha, dt, ui) {
    this.time += dt;
    const t = this.time;
    this.consume(world.drainEvents());
    if (world.terrain.dirty.size) this.paintBase(false);
    this.particles.update(dt);
    this.shake *= Math.exp(-10 * dt);
    this.excite = Math.max(0.15, this.excite - dt * 0.25);
    this.denyFlash = Math.max(0, this.denyFlash - dt);
    this.evoDeny = Math.max(0, (this.evoDeny || 0) - dt);
    if (this.denySlot) { this.denySlot.t -= dt; if (this.denySlot.t <= 0) this.denySlot = null; }
    if (dt > 0) ambient(world, this.particles, dt);
    this.flash = Math.max(0, this.flash - dt);
    this.updateObstacleSprites(world);

    const l = this.l;
    l.imageSmoothingEnabled = false;
    l.drawImage(this.base.canvas, 0, 0);
    this.fxG.clear();
    this.fxT.clear();
    this.drawTerrainFx(world, t);
    for (const h of world.hazards) drawHazard(h, this.fxG, this.fxT, t, this.dotCircle.bind(this));
    this.toDrawn(world, alpha, true);
    this.drawTelegraphs(world, t);
    this.drawGroundAbilityFx(world, t, dt);
    this.toDrawn(world, alpha, false);
    l.drawImage(this.fxG.commit(), 0, 0);
    this.drawGroundDecor(world);
    this.drawCrowd(t);

    // Entidades ordenadas por profundidade (y).
    const ents = [];
    for (const o of world.obstacles) ents.push({ y: o.y, o });
    for (const m of world.monsters) ents.push({ y: m.y + (m.alive ? 0 : -20), m });
    for (const d of world.decoys) ents.push({ y: d.y, d });
    ents.sort((a, b) => a.y - b.y);
    for (const m of world.monsters) this.drawShadowRing(m, alpha);
    this.drawSentryLinks(world, t);
    for (const e of ents) e.o ? this.drawObstacle(e.o, t) : e.d ? this.drawDecoy(e.d, alpha, dt, t) : this.drawMonster(e.m, alpha, dt, t);
    this.drawProjectiles(world, alpha, t);
    this.toDrawn(world, alpha, true);
    this.drawAbilityFx(world, t);
    this.toDrawn(world, alpha, false);
    for (const f of this.rootFx) { this.drawRootCage(f, t, true); f.t += dt; }
    this.rootFx = this.rootFx.filter((f) => f.t < f.dur);
    this.drawTentacles(dt, t);
    for (const d of world.decor) if (d.kind === 'waterfall') drawWaterfall(d, this.fxT, t);
    l.drawImage(this.fxT.commit(), 0, 0);
    this.drawCanopies(world);
    this.particles.draw(l, false);
    this.drawSteam(world, t);
    this.drawGlow(world, t);
    this.particles.draw(l, true);
    this.drawRings(dt);
    for (const m of world.monsters) this.drawOverhead(m, alpha, dt);
    for (const d of world.decoys) this.drawDecoyOverhead(d, alpha);
    this.drawSlashes(dt);
    this.drawReticle(world, t);
    if (this.flash > 0) { l.fillStyle = `rgba(255,240,200,${this.flash * 3})`; l.fillRect(0, 0, WORLD_W, WORLD_H); }

    // Composição na tela com escala e tremor.
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const dpr = ui.dpr;
    // Escala da interface (cartões, barra de habilidades): cresce com a altura da janela para continuar legível.
    const hs = this.hudScale = Math.max(1, Math.min(2, H / dpr / 500, W / dpr / 680));
    const top = 66 * dpr * hs, bottom = (world.playerTeam !== null ? 80 : 24) * dpr * hs;
    let S = Math.min(W / WORLD_W, (H - top - bottom) / WORLD_H);
    if (S >= 2) S = Math.floor(S);
    const ox = Math.round((W - WORLD_W * S) / 2), oy = Math.round(top + (H - top - bottom - WORLD_H * S) / 2);
    c.fillStyle = '#14100e';
    c.fillRect(0, 0, W, H);
    if (ui.embedded) { this.view = { ox, oy, S, dpr }; return; }
    c.imageSmoothingEnabled = false;
    const sh = (this.shakeEnabled ? this.shake : 0) * S * 0.5;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    c.drawImage(this.low, ox + sx, oy + sy, WORLD_W * S, WORLD_H * S);
    c.strokeStyle = '#3a2a20';
    c.lineWidth = 2 * dpr;
    c.strokeRect(ox - dpr, oy - dpr, WORLD_W * S + 2 * dpr, WORLD_H * S + 2 * dpr);
    this.view = { ox, oy, S, dpr };
    this.drawFloaters(dt);
    if (this.debug) this.drawDebug(world);
    drawHud(c, this, world, ui);
  }

  updateObstacleSprites(world) {
    for (const o of world.obstacles) {
      const char = o.hp === Infinity ? 0 : Math.round((1 - o.hp / o.maxHp) * 4) / 4;
      if (o._char !== char || !this.obsSprites.has(o.id)) { o._char = char; this.obsSprites.set(o.id, this.obstacleSprite(o, char)); }
    }
  }

  // Decoração de chão: sombras das copas e cogumelos.
  drawGroundDecor(world) {
    const l = this.l;
    for (const c of this.canopies) {
      l.globalAlpha = 0.22;
      l.fillStyle = '#000';
      l.beginPath();
      l.ellipse(Math.round(c.x + 8), Math.round(c.y + 14), c.r * 0.95, c.r * 0.6, 0, 0, Math.PI * 2);
      l.fill();
    }
    l.globalAlpha = 1;
    for (const m of this.mushrooms) l.drawImage(m.canvas, m.x - 5, m.y - 8);
  }

  // Copas das árvores por cima de tudo; ficam translúcidas quando há um monstro embaixo.
  drawCanopies(world) {
    const l = this.l;
    for (const c of this.canopies) {
      const under = world.monsters.some((m) => m.alive && Math.hypot(m.x - c.x, m.y - (c.y + 4)) < c.r * 0.9);
      c.alpha = (c.alpha ?? 0.95) + ((under ? 0.4 : 0.95) - (c.alpha ?? 0.95)) * 0.15;
      l.globalAlpha = c.alpha;
      l.drawImage(c.img, Math.round(c.x - c.img.width / 2), Math.round(c.y - c.img.height / 2 - 6));
    }
    l.globalAlpha = 1;
  }

  drawTerrainFx(world, t) {
    const tr = world.terrain, fx = this.fxG;
    // Água animada.
    const ft = Math.floor(t * 8);
    // Água animada: o ruído por pixel só é recalculado 10×/s; nos outros quadros repetimos os pixels guardados.
    const wf = Math.floor(t * 10);
    if (this._waterF !== wf || this._waterW !== world) {
      this._waterF = wf; this._waterW = world;
      const tw = wf / 10, hi = [], lo = [];
      for (const i of world.waterTiles) {
        const tx = (i % COLS) * TILE, ty = ((i / COLS) | 0) * TILE;
        for (let y = ty; y < ty + TILE; y++) for (let x = tx; x < tx + TILE; x++) {
          const v = valueNoise(x / 7 + tw * 0.7, y / 3.5 - tw * 0.25, 77);
          if (v > 0.74) hi.push(x, y); else if (v > 0.68) lo.push(x, y);
        }
      }
      this._waterHi = hi; this._waterLo = lo;
    }
    { const H = rgba('#a8e0f8', 200), L = rgba('#5aa6dc', 150), hi = this._waterHi, lo = this._waterLo;
      for (let k = 0; k < hi.length; k += 2) fx.set(hi[k], hi[k + 1], H);
      for (let k = 0; k < lo.length; k += 2) fx.set(lo[k], lo[k + 1], L); }
    for (const i of this.deepTiles) {
      const hh = hash2(i, Math.floor(t * 3 + (i % 7)), 6);
      if (hh > 0.7) fx.set((i % COLS) * TILE + ((hh * 61) % 8 | 0), ((i / COLS) | 0) * TILE + ((hh * 37) % 8 | 0), rgba(hh > 0.9 ? '#7fc0e0' : '#2e5e90', 200));
    }
    drawCurrents(world, fx, t);
    // Brasas em áreas recém-queimadas.
    for (const i of tr.scorchedSet) {
      if (tr.soot[i] < 0.75) continue;
      const hh = hash2(i, ft >> 1, 5);
      if (hh > 0.8) fx.set((i % COLS) * TILE + ((hh * 97) % 8 | 0), ((i / COLS) | 0) * TILE + ((hh * 53) % 8 | 0), EMBER[(hh * 40) % 4 | 0]);
    }
    // Raízes da planta: tramas marrons com brotos verdes; crescem ao surgir e somem ao secar.
    for (const i of tr.rootSet) {
      const tx = (i % COLS) * TILE, ty = ((i / COLS) | 0) * TILE;
      const left = tr.roots[i];
      const dens = left > 4.6 ? (5 - left) / 0.4 : Math.min(1, left / 1);
      for (let y = ty; y < ty + TILE; y++) for (let x = tx; x < tx + TILE; x++) {
        const v = valueNoise(x / 3.2, y / 3.2, 21);
        const h = hash2(x, y, 22);
        if (Math.abs(v - 0.5) < 0.09 && h < dens) fx.set(x, y, ROOT[v > 0.5 ? 2 : 1]);
        else if (Math.abs(v - 0.5) < 0.13 && h < dens * 0.6) fx.set(x, y, ROOT[0]);
        else if (h > 0.965 && dens > 0.5) fx.set(x, y - Math.round(Math.sin(t * 3 + x) * 0.6), ROOT[h > 0.985 ? 4 : 3]);
      }
    }
    // Fogo: chão incandescente + línguas de chama.
    const burning = [...tr.burning].sort((a, b) => a - b);
    if (this._ember && this._ember.size > burning.length * 2 + 64) for (const k of this._ember.keys()) if (!tr.burning.has(k)) this._ember.delete(k);
    for (const i of burning) {
      const tx = (i % COLS) * TILE, ty = ((i / COLS) | 0) * TILE;
      const fuelFire = !!props(tr.type[i]).fuel;
      const k = fuelFire ? 0.65 + 0.35 * Math.sin(Math.PI * clamp(1 - tr.fire[i] / tr.fireMax[i], 0, 1)) : clamp(tr.fire[i] / 1.5, 0.25, 0.8);
      // Brasas do tile: o padrão só muda 4×/s; guardado por tile e repetido nos quadros seguintes.
      const ec = this._ember || (this._ember = new Map());
      const kq = Math.round(k * 8);
      let e = ec.get(i);
      if (!e || e.f !== (ft >> 1) || e.k !== kq) {
        const px = [];
        for (let y = ty; y < ty + TILE; y++) for (let x = tx; x < tx + TILE; x++) {
          const h = hash2(x, y + (ft >> 1), 3);
          if (h < 0.22 * k) px.push(x, y, (h * 13) % 3 | 0);
          else if (h < 0.5 * k) px.push(x, y, -1);
        }
        e = { f: ft >> 1, k: kq, px };
        ec.set(i, e);
      }
      const SOOT = rgba('#3a120a', 120);
      for (let q = 0; q < e.px.length; q += 3) fx.set(e.px[q], e.px[q + 1], e.px[q + 2] < 0 ? SOOT : EMBER[e.px[q + 2]]);
      const tongues = fuelFire ? 2 : 1;
      for (let j = 0; j < tongues; j++) {
        const cx = tx + 2 + j * 4 + ((hash2(i, j, 1) * 3) | 0) - (tongues === 1 ? -1 : 0);
        const by = ty + 7 - ((hash2(i, j + 5, 1) * 2) | 0);
        // Chamas de vegetação são altas; o chão em brasa de ataques é baixo (não esconde os monstros).
        const h = Math.round((fuelFire ? 4 + 9 * k : 3 + 4 * k) * (0.6 + 0.4 * Math.sin(t * (8 + j * 2.3) + i * 1.7 + j * 2)));
        this.flame(fx, cx, by, h, 1 + (k > 0.6 ? 1 : 0), t + i * 0.37);
      }
      if (Math.random() < 0.035 * k) this.particles.add({ ramp: 'spark', x: tx + Math.random() * 8, y: ty + 4, vz: 30 + Math.random() * 30, vx: (Math.random() - 0.5) * 10, life: 0.6, add: true });
      if (fuelFire && Math.random() < 0.025) this.particles.add({ ramp: 'smoke', x: tx + 4, y: ty + 2, z: 8, vz: 14, vx: 4, life: 1.6, size: 2, grow: 2.5, alpha: 0.35, drag: 0.5 });
    }
    // Vegetação aquecendo (prestes a pegar fogo): fumacinha de aviso.
    for (const i of tr.heated) {
      if (tr.heat[i] > 0.5 && Math.random() < 0.02) this.particles.add({ ramp: 'smoke', x: tr.cx(i), y: tr.cy(i), vz: 10, life: 1, size: 1, grow: 1.5, alpha: 0.45, drag: 0.5 });
    }
  }

  // Língua de fogo em forma de gota: borda vermelha, miolo amarelo e base quase branca.
  flame(pb, cx, by, h, halfW, t) {
    for (let s = 0; s < h; s++) {
      const f = s / h;
      const sway = Math.round(Math.sin(t * 9 + s * 0.6) * f * 1.6);
      const w = Math.max(0, Math.round(halfW * (f < 0.35 ? 1 : (1 - f) / 0.65 * 1.1)));
      for (let q = -w; q <= w; q++) {
        const edge = Math.abs(q) === w && w > 0;
        let ci = Math.min(4, Math.floor(f * 4.2) + (edge ? 1 : 0));
        if (s < 2 && !edge) ci = 0;
        pb.set(cx + q + sway, by - s, FLAME[ci]);
      }
    }
  }

  dotCircle(pb, x, y, r, c, phase = 0, step = 4) {
    const n = Math.max(8, Math.round((Math.PI * 2 * r) / step));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + phase;
      pb.set(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.85), c);
    }
  }

  drawTelegraphs(world, t) {
    const g = this.fxG;
    for (const p of world.projectiles) {
      if (!p.lob) continue;
      const k = p.t / p.flight;
      if (p.kind === 'sentrySeed') continue;
      if (p.kind === 'roots') { this.drawRootRune(g, p.tx, p.ty, p.radius, k, t); continue; }
      if (p.kind === 'bubble') {
        const c = rgba(Math.floor(t * 12) % 2 ? '#e8f8ff' : '#5ab4ff', 230);
        this.dotCircle(g, p.tx, p.ty, p.radius, c, t * 3, 3);
        this.dotCircle(g, p.tx, p.ty, p.radius * (1 - k), rgba('#8fd8ff', 200), -t * 4, 4);
        continue;
      }
      if (p.kind === 'tentacle') {
        // Água escura borbulhando onde o tentáculo vai subir (ondas que se fecham no centro).
        const R = p.radius;
        this.dotCircle(g, p.tx, p.ty, R, rgba(Math.floor(t * 14) % 2 ? '#8a7ad0' : '#3a2a6a', 230), t * 2, 3);
        for (let q = 0; q < 3; q++) { const rr = R * (((1 - k) + q / 3) % 1); this.dotCircle(g, p.tx, p.ty, Math.max(2, rr), rgba('#2a1e52', 180), q, 4); }
        for (let y = -R; y <= R; y += 2) for (let x = -R; x <= R; x += 2) if (x * x + (y / 0.85) * (y / 0.85) < R * R * 0.5 && hash2(x + 7, y, Math.floor(t * 8)) < 0.18 * k) g.set(p.tx + x, p.ty + y, rgba('#1a1236', 170));
        continue;
      }
      const blink = Math.floor(t * (8 + k * 14)) % 2;
      const c = rgba(blink ? '#ff3a1a' : '#ffd84a', 230);
      this.dotCircle(g, p.tx, p.ty, p.radius, c, t * 2, 3);
      this.dotCircle(g, p.tx, p.ty, p.radius * k, rgba('#ff7a2a', 180), -t * 3, 4);
      for (let y = -p.radius; y <= p.radius; y += 2) for (let x = -p.radius; x <= p.radius; x += 2) {
        if (x * x + (y / 0.85) * (y / 0.85) < p.radius * p.radius && hash2(x + 99, y, 1) < 0.25 * k) g.set(p.tx + x + ((y >> 1) & 1), p.ty + y, rgba('#ff4a1a', 90));
      }
    }
    for (const m of world.monsters) {
      const a = m.action;
      if (!m.alive || !a) continue;
      const ab = a.ab;
      if (a.phase === 'windup') {
        const k = a.t / ab.windup;
        const blink = Math.floor(t * 20) % 2;
        if (ab.kind === 'cone') {
          const c = rgba(blink ? '#ffcf4a' : '#ff6a2a', 200);
          for (let s = 8; s <= ab.len; s += 3) for (const sgn of [-1, 1]) {
            const ang = a.aim + sgn * ab.half;
            g.set(m.x + Math.cos(ang) * s, m.y + Math.sin(ang) * s, c);
          }
          for (let q = -ab.half; q <= ab.half; q += 0.06) g.set(m.x + Math.cos(a.aim + q) * ab.len, m.y + Math.sin(a.aim + q) * ab.len, c);
          for (let q = -ab.half; q <= ab.half; q += 0.08) g.set(m.x + Math.cos(a.aim + q) * ab.len * k, m.y + Math.sin(a.aim + q) * ab.len * k, rgba('#ff4a1a', 160));
        } else if (ab.kind === 'beam') {
          const L = world.raycast(m.x, m.y, a.aim, ab.range).len;
          const c = rgba(blink ? '#e8f8ff' : '#4fb0ff', 200);
          for (let s = 10; s < L; s += 4) g.set(m.x + Math.cos(a.aim) * s, m.y + Math.sin(a.aim) * s - 3, c);
        } else if (ab.kind === 'aoe') {
          this.dotCircle(g, m.x, m.y, ab.radius, rgba('#7cd0ff', 200), t * 4, 4);
          this.dotCircle(g, m.x, m.y, ab.radius * (1 - k), rgba('#e0f6ff', 220), -t * 6, 3);
        } else if (ab.kind === 'dash') {
          const c = rgba(blink ? '#ffd84a' : '#ff6a2a', 220);
          const L = a.leapDist ?? ab.range ?? 110;
          for (let s = 12; s < L; s += 5) g.set(m.x + Math.cos(a.aim) * s, m.y + Math.sin(a.aim) * s, c);
          // Salto: círculo onde vai cair (a área do impacto).
          if (ab.leap && ab.landR) {
            const lx = m.x + Math.cos(a.aim) * L, ly = m.y + Math.sin(a.aim) * L;
            this.dotCircle(g, lx, ly, ab.landR, rgba(blink ? '#c8ff6a' : '#5ad84a', 210), t * 3, 3);
            this.dotCircle(g, lx, ly, ab.landR * k, rgba('#ffffff', 150), -t * 4, 4);
          }
          // Ponta da seta: onde a investida termina.
          for (const sg of [-1, 1]) for (let q = 1; q <= 4; q++) g.set(m.x + Math.cos(a.aim) * (L - q * 1.5) + Math.cos(a.aim + sg * 1.6) * q, m.y + Math.sin(a.aim) * (L - q * 1.5) + Math.sin(a.aim + sg * 1.6) * q, c);
        } else if (ab.kind === 'melee' && ab.reach && (ab.windup >= 0.2 || ab.superArmor)) {
          // Golpe corpo a corpo forte: mostra o arco exato que vai acertar.
          const c = rgba(ab.superArmor ? (blink ? '#ffd84a' : '#ff9a1a') : (blink ? '#ffffff' : '#c8c8c8'), 200);
          const R = m.r + ab.reach;
          for (let q = -ab.arc / 2; q <= ab.arc / 2; q += 0.05) g.set(m.x + Math.cos(a.aim + q) * R, m.y + Math.sin(a.aim + q) * R, c);
          for (const sg of [-1, 1]) for (let s2 = m.r + 3; s2 < R; s2 += 3) g.set(m.x + Math.cos(a.aim + sg * ab.arc / 2) * s2, m.y + Math.sin(a.aim + sg * ab.arc / 2) * s2, c);
        }
      }
      // Mergulho Vulcânico: tremor de aviso em volta do montinho de terra.
      if (ab.burrow && a.phase === 'active') {
        const pulse = 10 + Math.sin(t * 18) * 3;
        this.dotCircle(g, m.x, m.y, pulse, rgba(Math.floor(t * 12) % 2 ? '#ff4a1a' : '#ffb040', 230), t * 3, 3);
      }
    }
    // Sementes de sentinela em voo: círculo verde onde vão brotar.
    for (const p of world.projectiles) if (p.kind === 'sentrySeed') this.dotCircle(g, p.tx, p.ty, 9, rgba(Math.floor(t * 10) % 2 ? '#c8ff80' : '#4aa83a', 230), t * 2, 3);
  }

  drawCrowd(t) {
    const l = this.l;
    const ex = this.excite;
    for (const p of this.crowd) {
      const jump = ex > 0.35 && Math.sin(t * (10 + p.ph) + p.ph * 3) > 0.2 ? 1 : 0;
      const y = p.y - jump;
      l.fillStyle = p.shirt;
      l.fillRect(p.x - 1, y + 2, 3, 3);
      l.fillStyle = p.skin;
      l.fillRect(p.x - 1, y, 2, 2);
      if (ex > 0.7 && jump) { l.fillRect(p.x - 2, y - 1, 1, 2); l.fillRect(p.x + 2, y - 1, 1, 2); }
      if (ex > 0.5 && (p.ph * 10 | 0) % 7 === 0) { l.fillStyle = TEAM_COLOR[p.team]; l.fillRect(p.x, y - 3 - jump, 1, 3); l.fillRect(p.x + 1, y - 3 - jump, 2, 2); }
    }
  }

  // Online o próprio monstro é desenhado adiantado (predição): setas, áreas e efeitos das habilidades dele
  // são desenhados a partir de onde ele aparece, não da posição atrasada do servidor.
  toDrawn(world, alpha, on) {
    if (on) {
      const m = world.active;
      if (!m || !m.lead) return;
      const p = this.lerpPos(m, alpha);
      this._drawnShift = { m, x: m.x, y: m.y };
      m.x = p.x; m.y = p.y;
    } else if (this._drawnShift) {
      const s = this._drawnShift;
      s.m.x = s.x; s.m.y = s.y;
      this._drawnShift = null;
    }
  }

  // alpha > 1 = extrapolação (snapshot atrasado no online). Saltos grandes (entrada em campo, teleporte) não se extrapolam.
  lerpPos(m, alpha) {
    const l = m.lead;
    const a = alpha > 1 && Math.abs(m.x - m.px) + Math.abs(m.y - m.py) > 24 ? 1 : alpha;
    return { x: m.px + (m.x - m.px) * a + (l ? l.x : 0), y: m.py + (m.y - m.py) * a + (l ? l.y : 0) };
  }

  drawShadowRing(m, alpha) {
    if (m.status.cloak > 0 && this.isFoe(m)) return; // camuflado não denuncia a posição pela sombra
    const l = this.l;
    const p = this.lerpPos(m, alpha);
    const fade = m.alive ? 1 : Math.max(0, 1 - m.deathT / 1.5);
    if (fade <= 0) return;
    l.globalAlpha = 0.35 * fade;
    l.fillStyle = '#000';
    l.beginPath();
    l.ellipse(Math.round(p.x), Math.round(p.y + 2), m.r + 1, (m.r + 1) * 0.45, 0, 0, Math.PI * 2);
    l.fill();
    l.globalAlpha = 0.9 * fade;
    l.fillStyle = TEAM_COLOR[m.team];
    const n = 18;
    for (let k = 0; k < n; k++) {
      if (k % 3 === 0) continue;
      const a = (k / n) * Math.PI * 2 + this.time * 0.8;
      l.fillRect(Math.round(p.x + Math.cos(a) * (m.r + 3)), Math.round(p.y + 2 + Math.sin(a) * (m.r + 3) * 0.45), 1, 1);
    }
    l.globalAlpha = 1;
  }

  pose(m, st, t) {
    if (!m.def) return {};
    const a = m.action;
    const sp = Math.hypot(m.vx, m.vy);
    const ab = a?.ab;
    const ph = a?.phase;
    const pose = { t, walk: st.walk, moving: clamp(sp / m.def.speed, 0, 1), crouch: 0, lunge: 0, open: 0, dash: 0, spin: 0, dead: m.alive ? 0 : Math.min(1, m.deathT / 0.6), seed: st.seed, power: 0 };
    if (a) {
      if (ph === 'windup') pose.crouch = Math.min(1, a.t / Math.max(0.05, ab.windup));
      if (ph === 'active' && ab.kind === 'melee') pose.lunge = 1 - a.t / ab.active;
      if (ph === 'recovery' && ab.kind === 'melee') pose.lunge = 0.3;
      const mouth = ['projectile', 'cone', 'beam', 'lob'].includes(ab.kind);
      if (mouth && ph !== 'recovery') pose.open = ph === 'active' ? 1 : Math.min(1, a.t / ab.windup);
      if (ph === 'active' && ab.kind === 'dash') pose.dash = 1;
      if ((ab.id === 'shellRoll' || ab.id === 'abyssCurrent') && ph === 'active') pose.spin = t * 3 + 1;
      if (ab.id === 'whirlpool' && ph !== 'windup') pose.spin = t * 4 + 1;
      if (ab.kind === 'dodge' && ph === 'active' && !pose.spin) pose.dash = 0.6;
      if ((ab.kind === 'cone' || ab.kind === 'aoe') && ph === 'active') pose.power = 0.6;
    }
    const tr = this.world.terrain;
    if (m.element === 'fire' && tr.fire[tr.at(m.x, m.y)] > 0) pose.power = Math.max(pose.power, 0.4);
    if (m.status.overheat > 0) pose.power = Math.max(pose.power, 1);
    if (m.dummy) pose.wobble = st.wob;
    if (m.status.exhaust > 0) pose.crouch = Math.max(pose.crouch, 0.5);
    if (a?.ab.kind === 'guard' && ph === 'active') pose.crouch = 1;
    return pose;
  }

  drawMonster(m, alpha, dt, t) {
    const st = this.ms(m);
    const l = this.l;
    const p = this.lerpPos(m, alpha);
    st.walk += Math.hypot(m.vx, m.vy) * dt * 0.28;
    if (st.wob > 0) st.wob = Math.max(0, st.wob - dt * 1.6);
    const pose = this.pose(m, st, t);
    // Evolução: brilho pulsante antes da troca de forma; depois a forma nova cresce do clarão.
    let evoK = -1;
    if (m.evolveT > 0) {
      evoK = 1 - m.evolveT / EVOLUTION.transformTime;
      const swapK = EVOLUTION.swapAt / EVOLUTION.transformTime;
      if (evoK < swapK) { pose.flash = Math.sin(t * (12 + evoK * 50)) > 0.2 - evoK; pose.scale = 1 + Math.sin(t * 30) * 0.05 * evoK; }
      else { const g = (evoK - swapK) / (1 - swapK); pose.scale = 0.7 + 0.3 * g; pose.flash = g < 0.4; }
      this.evolveParticles(m, evoK, t);
    }
    if (m.hitFlash > 0 && Math.floor(t * 30) % 2 === 0) pose.flash = true;
    if (!m.alive) pose.tint = [m.element === 'fire' ? '#5a5250' : m.element === 'plant' ? '#6a7a4a' : '#9ac8e8', Math.min(0.8, m.deathT)];
    // Troca: saída vira um feixe de luz e some; entrada surge do feixe e cresce.
    let wScale = 1, hScale = 1, beam = 0;
    if (m.switchState === 'exiting') {
      const k = 1 - m.switchT / SWITCH.exitTime;
      if (k > 0.2) pose.flash = true;
      wScale = Math.max(0.05, 1 - k * 0.95); hScale = 1 + k * 0.5; beam = k;
    } else if (m.switchState === 'entering') {
      const k = 1 - m.switchT / SWITCH.enterTime;
      const g = Math.max(0, (k - 0.35) / 0.65);
      if (g < 0.6) pose.flash = true;
      wScale = Math.max(0.02, g); hScale = 1.4 - 0.4 * g; beam = 1 - k;
    }
    if (evoK >= 0) beam = Math.max(beam, Math.sin(evoK * Math.PI) * 0.9);
    // Mergulho Vulcânico: o monstro some sob a terra, deixando só um montinho se movendo.
    if (m.alive && m.action && m.action.ab.burrowDodge && m.action.phase === 'active') { this.drawBurrowDodge(m, p, t); return; }
    if (m.alive && m.action && m.action.ab.burrow && m.action.phase === 'active') {
      const bx = Math.round(p.x), by = Math.round(p.y);
      l.fillStyle = '#3a2818'; l.beginPath(); l.ellipse(bx, by + 1, 9, 4, 0, 0, 6.3); l.fill();
      l.fillStyle = '#5a4028'; l.beginPath(); l.ellipse(bx, by, 7, 3, 0, 0, 6.3); l.fill();
      this.particles.add({ ramp: 'dust', x: bx + (Math.random() - 0.5) * 8, y: by, z: 2, vz: 30, vx: (Math.random() - 0.5) * 20, life: 0.4, g: 100 });
      return;
    }
    const frame = this.monsterFrame(m, st, pose);
    st.top = frame.top;
    // Olha para a mira. Com a mira quase na vertical, mantém o lado anterior (evita o sprite piscar de lado).
    const cf = Math.cos(m.facing);
    if (cf > 0.12) st.faceDir = 1;
    else if (cf < -0.12) st.faceDir = -1;
    else st.faceDir ??= cf >= 0 ? 1 : -1;
    const face = st.faceDir * (frame.faces === -1 ? -1 : 1);
    const x = Math.round(p.x), y = Math.round(p.y);
    let fade = 1;
    if (!m.alive) fade = Math.max(0, 1 - Math.max(0, m.deathT - 1) / 1.2);
    if (fade <= 0) return;
    // Rastros (afterimages) em investidas e esquivas.
    const dashing = m.action && m.action.phase === 'active' && m.action.ab.dash;
    st.ghostT -= dt;
    if (dashing && st.ghostT <= 0) {
      st.ghostT = 0.035;
      const g = makeCanvas(frame.w, frame.h);
      g.getContext('2d').drawImage(frame.canvas, 0, 0);
      st.ghosts.push({ frame: { ...frame, canvas: g }, x, y, face, life: 0.25 });
    }
    for (const g of st.ghosts) {
      g.life -= dt;
      l.globalAlpha = Math.max(0, g.life / 0.25) * 0.45;
      this.blitFrame(g.frame, g.x, g.y, g.face, 1, 1, 0);
    }
    st.ghosts = st.ghosts.filter((g) => g.life > 0);
    l.globalAlpha = fade * (m.status.invuln > 0 && Math.floor(t * 24) % 2 ? 0.55 : 1);
    // Camuflado (tinta): o inimigo quase não o vê; o próprio time vê translúcido.
    if (m.status.cloak > 0) l.globalAlpha *= this.isFoe(m) ? 0.12 + (Math.floor(t * 10) % 7 === 0 ? 0.12 : 0) : 0.45;
    const lift = m.lift > 0 ? Math.sin(Math.PI * (1 - m.lift / m.liftMax)) * 18 : 0; // erguido no ar
    this.blitFrame(frame, x, y - lift, face, hScale, wScale, pose.spin ? pose.spin * 6 : 0);
    l.globalAlpha = 1;
    if (beam > 0.05) {
      const g = this.fxT;
      const col = [rgba('#ffffff'), rgba(evoK >= 0 ? EVO_COLOR[m.element] : TEAM_COLOR[m.team])];
      const w = Math.round(1 + beam * (evoK >= 0 ? 4 : 2));
      for (let yy = y - 90; yy <= y + 2; yy++) for (let q = -w; q <= w; q++) {
        if (Math.random() > beam) continue;
        g.set(x + q, yy, col[Math.abs(q) >= w - 1 ? 1 : 0]);
      }
    }
    // Bolha Prisão: o alvo flutua dentro de uma bolha até ela estourar.
    if (m.alive && m.status.bubble > 0) {
      const g = this.fxT, R = m.r + 8, cy = y - frame.top * 0.45 - 2;
      const wob = Math.sin(t * 9) * 0.8;
      const Rx = R + wob, Ry = R - wob;
      // Interior azul translúcido (o monstro aparece "dentro" da água), borda grossa e brilhos.
      for (let dy = -Math.ceil(Ry); dy <= Ry; dy++) for (let dx = -Math.ceil(Rx); dx <= Rx; dx++) {
        const d = Math.sqrt((dx * dx) / (Rx * Rx) + (dy * dy) / (Ry * Ry));
        if (d > 1) continue;
        const px = Math.round(x + dx), py = Math.round(cy + dy);
        if (d > 1 - 2 / R) g.set(px, py, (Math.floor((Math.atan2(dy, dx) + t * 2) * 5) % 4) ? rgba('#bfe8ff', 235) : rgba('#ffffff', 245));
        else if (d > 0.8) g.set(px, py, rgba('#5ab4ff', 95));
        else if ((dx + dy + Math.floor(t * 4)) % 3 === 0) g.set(px, py, rgba('#8fd8ff', 60));
      }
      for (let q = 0; q < 9; q++) { const an = -2.5 + q * 0.11; g.set(Math.round(x + Math.cos(an) * (R - 3)), Math.round(cy + Math.sin(an) * (R - 3)), rgba('#ffffff', 240)); }
      g.set(Math.round(x + R * 0.45), Math.round(cy + R * 0.4), rgba('#ffffff', 220));
      if (Math.random() < 0.15) this.particles.add({ ramp: 'water', x: x + (Math.random() - 0.5) * R, y: cy + R * 0.6, vz: 15, life: 0.5 });
    }
    // Casco Reflexo: domo d'água em volta durante o bloqueio.
    if (m.alive && m.action?.ab.kind === 'guard' && m.action.phase === 'active') {
      const g = this.fxT, R = m.r + 5;
      const k = 1 - m.action.t / m.action.ab.active;
      for (let q = 0; q < 56; q++) {
        const an = (q / 56) * Math.PI * 2;
        const c = (q + Math.floor(t * 16)) % 4 === 0 ? rgba('#ffffff', 240) : rgba('#5ab4ff', 200);
        g.set(Math.round(x + Math.cos(an) * R), Math.round(y - frame.top * 0.4 + Math.sin(an) * R * 0.9), c);
        if (q % 2 === 0) g.set(Math.round(x + Math.cos(an) * (R - 1)), Math.round(y - frame.top * 0.4 + Math.sin(an) * (R - 1) * 0.9), rgba('#8fd8ff', 120 + Math.round(k * 100)));
      }
    }
    // Ímpeto cheio: faíscas e rastro.
    if (m.alive && m.charged && Math.random() < 0.6) this.particles.add({ ramp: 'spark', x: x + (Math.random() - 0.5) * m.r * 2, y: y - Math.random() * 6, vz: 20, vx: -m.vx * 0.2, life: 0.35, add: true });
    // Superaquecido: mais fogo; exausto: fumaça.
    if (m.alive && m.status.overheat > 0 && Math.random() < 0.7) this.particles.add({ ramp: 'fire', x: x + (Math.random() - 0.5) * m.r * 2, y: y - Math.random() * frame.top * 0.6, vz: 40, life: 0.45, add: true, size: 2 });
    if (m.alive && m.status.exhaust > 0 && Math.random() < 0.25) this.particles.add({ ramp: 'smoke', x: x + (Math.random() - 0.5) * 8, y: y - frame.top * 0.7, vz: 18, life: 1, size: 2, grow: 2, alpha: 0.55 });
    // Bolha protetora.
    if (m.alive && m.status.shield > 0 && m.shieldHp > 0) {
      const g = this.fxT, R = m.r + 7;
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2 + t;
        const c = (k + Math.floor(t * 10)) % 5 === 0 ? rgba('#ffffff', 230) : rgba('#8fd8ff', 170);
        g.set(Math.round(x + Math.cos(a) * R), Math.round(y - frame.top * 0.45 + Math.sin(a) * R * 0.95), c);
      }
    }
    // Auras permanentes das formas evoluídas.
    if (m.alive && m.evolved && Math.random() < 0.35) {
      if (m.element === 'fire') this.particles.add({ ramp: 'spark', x: x + (Math.random() - 0.5) * m.r * 2, y: y - Math.random() * frame.top, vz: 25, vy: -6, life: 0.7, add: true });
      else if (m.element === 'water') this.particles.add({ ramp: 'water', x: x + (Math.random() - 0.5) * m.r * 2.4, y, z: Math.random() * frame.top, vz: -4, life: 0.6 });
      else this.particles.add({ ramp: 'leafFall', x: x + (Math.random() - 0.5) * m.r * 2.4, y, z: frame.top * 0.8, vz: -10, vx: 6, life: 1.2 });
    }
    if (m.alive && m.status.root > 0) {
      const g = this.fxT;
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const h = 2 + ((k * 5) % 4) + Math.round(Math.sin(t * 6 + k) * 0.6);
        const bx = Math.round(x + Math.cos(a) * (m.r - 1)), byy = Math.round(y + 2 + Math.sin(a) * (m.r - 1) * 0.45);
        for (let s = 0; s < h; s++) g.set(bx + Math.round(Math.sin(k + s) * 0.7), byy - s, ROOT[s === h - 1 ? 3 : 1 + (s % 2)]);
      }
    }
    // Status visíveis: queimando e molhado.
    if (m.alive && m.status.burn > 0 && Math.random() < 0.5) this.particles.add({ ramp: 'fire', x: x + (Math.random() - 0.5) * 12, y: y - 4, z: Math.random() * 10, vz: 30, life: 0.4, add: true });
    if (m.alive && m.status.wet > 0 && m.element === 'fire' && Math.random() < 0.25) this.particles.add({ ramp: 'water', x: x + (Math.random() - 0.5) * 12, y, z: 14, vz: -10, g: 100, life: 0.5 });
    if (m.alive && m.status.wet > 0 && m.element === 'fire' && Math.random() < 0.08) this.particles.add({ ramp: 'steam', x, y, z: 16, vz: 14, life: 0.9, size: 2, grow: 2, alpha: 0.6 });
  }

  // Quadro do monstro: arte do usuário (se carregada) ou sprite procedural de reserva.
  monsterFrame(m, st, pose) {
    if (this.art.has(m.def.sprite)) {
      pose.flames = m.element === 'fire' ? (m.status.exhaust > 0 ? 0 : (m.evolved ? 6 : 3) + (m.status.overheat > 0 ? 4 : 0)) : 0;
      return this.art.render(m.id, m.def.sprite, pose);
    }
    const pb = st.pb;
    SPRITE_FN[m.def.line || m.def.key](pb, pose);
    if (pose.flash) pb.fill(rgba('#ffffff'));
    if (pose.tint) pb.tint(pose.tint[0], pose.tint[1]);
    return { canvas: pb.commit(), w: 48, h: 48, ax: 24, ay: 38, faces: 1, top: m.dummy ? 32 : 26 };
  }

  blitFrame(f, x, y, face, hScale, wScale, rot) {
    const l = this.l;
    const w = Math.max(1, Math.round(f.w * wScale)), h = Math.max(1, Math.round(f.h * hScale));
    l.save();
    l.translate(x, y + 3);
    if (face < 0) l.scale(-1, 1);
    if (rot) { l.translate(0, -f.top * 0.4); l.rotate(rot); l.translate(0, f.top * 0.4); }
    l.drawImage(f.canvas, -f.ax * wScale, -f.ay * hScale, w, h);
    l.restore();
  }

  // Partículas da transformação, diferentes para cada elemento.
  evolveParticles(m, k, t) {
    const P = this.particles;
    const n = 2 + Math.floor(k * 4);
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2, r = 26 * (1 - k) + 6;
      const x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r * 0.6;
      if (m.element === 'fire') P.add({ ramp: 'fire', x, y, vx: -Math.cos(a) * 30, vy: -Math.sin(a) * 18, vz: 40 + Math.random() * 40, life: 0.6, add: true, size: 2 });
      else if (m.element === 'water') P.add({ ramp: 'water', x, y, vx: -Math.cos(a) * 30, vy: -Math.sin(a) * 18, vz: 70, g: 60, life: 0.7, size: 2 });
      else P.add({ ramp: Math.random() < 0.5 ? 'leaf' : 'leafFall', x, y, vx: -Math.sin(a) * 50, vy: Math.cos(a) * 30, vz: 30, life: 0.8, size: 2 });
    }
    void t;
  }

  blit(img, x, y, face, squash, wScale = 1) {
    const l = this.l;
    const h = Math.round(48 * squash);
    const w = Math.max(1, Math.round(48 * wScale));
    if (face > 0) l.drawImage(img, x - w / 2, y + 3 - 38 + (48 - h) * 0.8, w, h);
    else {
      l.save();
      l.translate(x, 0);
      l.scale(-1, 1);
      l.drawImage(img, -w / 2, y + 3 - 38 + (48 - h) * 0.8, w, h);
      l.restore();
    }
  }

  drawObstacle(o, t) {
    const l = this.l;
    if (o.destroyed) {
      if (o.kind === 'bush') l.drawImage(this.stump, Math.round(o.x - 6), Math.round(o.y - 5));
      else { l.fillStyle = '#2a1a12'; for (let k = 0; k < 6; k++) l.fillRect(Math.round(o.x - 6 + hash2(o.id, k, 1) * 12), Math.round(o.y - 3 + hash2(o.id, k, 2) * 6), 2, 1); }
      return;
    }
    const spr = this.obsSprites.get(o.id) || this.obstacleSprite(o, 0);
    // Sombra de contato + anel de base (= hitbox real: contínuo e escuro = sólido permanente; tracejado dourado =
    // destrutível). Nunca mudam: ficam numa imagem pronta por obstáculo (1 desenho em vez de ~30 por quadro).
    let deco = this.obsDeco.get(o.id);
    if (!deco) {
      const R = Math.ceil(o.r) + 2, W = R * 2 + 2, H = R * 2 + 4;
      const cvs = makeCanvas(W, H), g = cvs.getContext('2d');
      const cx = R + 1, cy = R + 2;
      g.globalAlpha = 0.3; g.fillStyle = '#000';
      g.beginPath(); g.ellipse(cx, cy + Math.round(o.r * 0.55) - 1, o.r, o.r * 0.4, 0, 0, Math.PI * 2); g.fill();
      if (!o.sentry && o.kind !== 'thicket') {
        const perm = o.hp === Infinity, ry = o.r * 0.55;
        g.globalAlpha = perm ? 0.55 : 0.8;
        g.fillStyle = perm ? '#0e0e14' : '#e8c860';
        for (let k = 0; k < 28; k++) {
          if (!perm && k % 2) continue;
          const an = (k / 28) * Math.PI * 2;
          g.fillRect(Math.round(cx + Math.cos(an) * o.r), Math.round(cy + Math.sin(an) * ry), 1, 1);
        }
      }
      deco = { cvs, ox: cx, oy: cy - 1 };
      this.obsDeco.set(o.id, deco);
    }
    l.globalAlpha = 1;
    l.drawImage(deco.cvs, Math.round(o.x) - deco.ox, Math.round(o.y) - deco.oy);
    l.globalAlpha = o.life !== undefined && o.life < 1.5 ? Math.max(0.2, o.life / 1.5) : 1;
    if (o.hitFlash > 0) l.filter = 'brightness(2)';
    if (o.sentry && o.team !== undefined) {
      // Anel do time na base da sentinela (sabe-se de quem é) e vida em uma barrinha.
      l.fillStyle = TEAM_COLOR[o.team];
      for (let k = 0; k < 12; k++) { if (k % 2) continue; const an = (k / 12) * Math.PI * 2 + t; l.fillRect(Math.round(o.x + Math.cos(an) * (o.r + 2)), Math.round(o.y + 1 + Math.sin(an) * (o.r + 2) * 0.45), 1, 1); }
    }
    if (o.kind === 'log') this.drawLog(o, spr);
    else l.drawImage(spr.img, Math.round(o.x - spr.ax), Math.round(o.y - spr.ay));
    if (o.sentry && o.hp !== Infinity) {
      const bx = Math.round(o.x - 6), by = Math.round(o.y - spr.ay - 3);
      l.globalAlpha = 1;
      l.fillStyle = '#140c0a'; l.fillRect(bx - 1, by - 1, 14, 3);
      l.fillStyle = TEAM_COLOR[o.team ?? 0]; l.fillRect(bx, by, Math.round(12 * Math.max(0, o.hp) / o.maxHp), 1);
      if (o.life !== undefined) { l.fillStyle = '#9ae070'; l.fillRect(bx, by + 1, Math.round(12 * Math.min(1, o.life / 12)), 1); }
    }
    l.filter = 'none';
    l.globalAlpha = 1;
    if (o.burning > 0) {
      const g = this.fxT;
      for (let j = 0; j < 5; j++) {
        const fx0 = Math.round(o.x - o.r + 2 + j * (o.r * 2 - 4) / 4);
        const by = Math.round(o.y - (o.kind === 'crate' ? 6 : 2));
        const h = Math.round(6 + 7 * (0.55 + 0.45 * Math.sin(t * (10 + j * 1.7) + j * 2)));
        this.flame(g, fx0, by, h, 1 + (j % 2), t + j);
      }
      if (Math.random() < 0.15) this.particles.add({ ramp: 'smoke', x: o.x, y: o.y - 8, z: 6, vz: 16, vx: 4, life: 1.8, size: 2, grow: 3, alpha: 0.4, drag: 0.4 });
      if (Math.random() < 0.2) this.particles.add({ ramp: 'spark', x: o.x + (Math.random() - 0.5) * o.r * 2, y: o.y - 6, vz: 40, life: 0.6, add: true });
    }
  }

  // Tronco caído: inteiro enquanto todos os pedaços existem; senão, só os pedaços restantes.
  drawLog(o, spr) {
    const l = this.l;
    const group = this.groups.get(o.group) || [o];
    const whole = group.every((g) => !g.destroyed);
    if (whole && o.seg !== 0) return;
    let img = spr.img, cx = o.x, cy = o.y;
    if (whole) {
      const a = group[0], b = group[group.length - 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) + 16;
      const char = Math.max(...group.map((g) => g._char || 0));
      const key = 'log:' + len.toFixed(0) + ':' + char;
      this.logCache ||= new Map();
      if (!this.logCache.has(key)) this.logCache.set(key, logSprite(len, o.id, char));
      img = this.logCache.get(key);
      cx = (a.x + b.x) / 2; cy = (a.y + b.y) / 2;
    }
    l.save();
    l.translate(Math.round(cx), Math.round(cy) - 3);
    l.rotate(o.ang || 0);
    l.drawImage(img, -img.width / 2, -img.height / 2);
    l.restore();
  }

  drawProjectiles(world, alpha, t) {
    const g = this.fxT;
    for (const p of world.projectiles) {
      const x = p.lob ? p.x : p.px + (p.x - p.px) * alpha, y = p.lob ? p.y : p.py + (p.y - p.py) * alpha;
      if (p.kind === 'ember') {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const d = Math.hypot(dx, dy);
          if (d <= 2.3) g.set(x + dx, y + dy, FLAME[Math.min(4, Math.floor(d * 1.4 + (Math.sin(t * 30) > 0 ? 0.3 : 0)))]);
        }
        this.particles.add({ ramp: 'fire', x: x - p.vx * 0.01, y, vx: -p.vx * 0.1 + (Math.random() - 0.5) * 20, vy: -p.vy * 0.1 + (Math.random() - 0.5) * 20, life: 0.3, add: true });
      } else if (p.kind === 'magma') {
        const M = [rgba('#fff7c2'), rgba('#ffb040'), rgba('#e05a1a'), rgba('#7a1e0a'), rgba('#2a0c06')];
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const d = Math.hypot(dx, dy);
          if (d <= 3.8) g.set(x + dx, y + dy, M[Math.min(4, Math.floor(d + (hash2(dx, dy, Math.floor(t * 12)) > 0.7 ? 1 : 0)))]);
        }
        this.particles.add({ ramp: 'fire', x, y, vx: -p.vx * 0.1 + (Math.random() - 0.5) * 20, vy: -p.vy * 0.1 + (Math.random() - 0.5) * 20, life: 0.4, add: true, size: 2 });
        if (Math.random() < 0.3) this.particles.add({ ramp: 'smoke', x, y, z: 2, vz: 10, life: 0.8, size: 2, grow: 2, alpha: 0.4 });
      } else if (p.kind === 'wave') {
        this.drawWave(g, p, x, y, t);
      } else if (p.kind === 'thorn') {
        const an = Math.atan2(p.vy, p.vx), ca = Math.cos(an), sa = Math.sin(an);
        const S = [rgba('#2a1a0a'), rgba('#5a3a1a'), rgba('#c8b890'), rgba('#7ad84a')];
        for (let q = -3; q <= 3; q++) g.set(x + ca * q, y + sa * q, S[q > 1 ? 2 : 1]);
        g.set(x - sa, y + ca, S[0]); g.set(x + sa, y - ca, S[0]); g.set(x - ca * 4, y - sa * 4, S[3]);
      } else if (p.kind === 'seed') {
        const S = [rgba('#3a2a12'), rgba('#7a5a2a'), rgba('#b8904a'), rgba('#7ad84a')];
        const an = Math.atan2(p.vy, p.vx), ca = Math.cos(an), sa = Math.sin(an);
        for (let q = -2; q <= 2; q++) for (let w = -1; w <= 1; w++) {
          const ci = Math.abs(w) === 1 || Math.abs(q) === 2 ? 0 : q > 0 ? 2 : 1;
          g.set(x + ca * q - sa * w, y + sa * q + ca * w, S[ci]);
        }
        g.set(x - ca * 3, y - sa * 3, S[3]);
        if (Math.random() < 0.5) this.particles.add({ ramp: 'leaf', x, y, vx: -p.vx * 0.08, vy: -p.vy * 0.08 + (Math.random() - 0.5) * 10, life: 0.35 });
      } else if (p.kind === 'roots') {
        continue;
      } else if (p.kind === 'waterBolt') {
        const W = [rgba('#ffffff'), rgba('#c8f0ff'), rgba('#5ab4ff'), rgba('#1f62c0')];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const d = Math.hypot(dx + 0.5, dy + 0.5);
          if (d <= 2.6) g.set(x + dx, y + dy, W[Math.min(3, Math.floor(d))]);
        }
        this.particles.add({ ramp: 'water', x, y, vx: -p.vx * 0.12 + (Math.random() - 0.5) * 16, vy: -p.vy * 0.12 + (Math.random() - 0.5) * 16, life: 0.3 });
      } else if (p.kind === 'splashSeed') {
        // Semente Explosiva em voo: sombra no chão + semente verde e marrom girando.
        const l = this.l, k = p.t / p.flight;
        l.globalAlpha = 0.35; l.fillStyle = '#0a1a08';
        l.beginPath(); l.ellipse(Math.round(x), Math.round(y), 2 + k * 3, 1 + k * 2, 0, 0, Math.PI * 2); l.fill(); l.globalAlpha = 1;
        const hy = y - p.h, sp = Math.floor(t * 12) % 2;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > 3.2) continue;
          g.set(x + dx, hy + dy, d > 2.3 ? rgba('#2a3a10') : (dx + dy + sp) % 3 === 0 ? rgba('#c8e070') : rgba(dy < 0 ? '#7ab040' : '#5a3a1a'));
        }
      } else if (p.kind === 'bubble' || p.kind === 'splashBubble') {
        const l = this.l, k = p.t / p.flight;
        l.globalAlpha = 0.35; l.fillStyle = '#0a1a30';
        l.beginPath(); l.ellipse(Math.round(x), Math.round(y), 3 + k * 4, 2 + k * 2, 0, 0, Math.PI * 2); l.fill(); l.globalAlpha = 1;
        const hy = y - p.h;
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > 5.2) continue;
          if (d > 4.2) g.set(x + dx, hy + dy, rgba('#8fd8ff', 230));
          else if (dx < -1 && dy < -1 && d > 2) g.set(x + dx, hy + dy, rgba('#ffffff', 220));
          else g.set(x + dx, hy + dy, rgba('#3a8ad8', 90));
        }
        if (Math.random() < 0.4) this.particles.add({ ramp: 'water', x, y: hy, vz: 10, life: 0.3 });
      } else if (p.kind === 'meteor') {
        const l = this.l;
        l.globalAlpha = 0.4;
        l.fillStyle = '#000';
        l.beginPath();
        l.ellipse(Math.round(x), Math.round(y), 3 + (p.t / p.flight) * 4, 2 + (p.t / p.flight) * 2, 0, 0, Math.PI * 2);
        l.fill();
        l.globalAlpha = 1;
        const hy = y - p.h;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const d = Math.hypot(dx, dy);
          if (d <= 4.2) g.set(x + dx, hy + dy, FLAME[Math.min(4, Math.floor(d * 0.9))]);
        }
        for (let k = 0; k < 3; k++) this.particles.add({ ramp: 'fire', x: x + (Math.random() - 0.5) * 6, y: hy + (Math.random() - 0.5) * 6, vy: -10, life: 0.4, add: true, size: 2 });
        if (Math.random() < 0.4) this.particles.add({ ramp: 'smoke', x, y: hy, life: 0.8, size: 2, grow: 3, alpha: 0.5 });
      }
    }
  }

  drawAbilityFx(world, t) {
    const g = this.fxT;
    for (const m of world.monsters) {
      const a = m.action;
      if (!m.alive || !a) continue;
      const ab = a.ab;
      if (ab.id === 'hydroBeam' && a.phase === 'active' && a.data.beam) {
        const b = a.data.beam;
        const L = Math.hypot(b.ex - b.ox, b.ey - b.oy);
        const ca = (b.ex - b.ox) / (L || 1), sa = (b.ey - b.oy) / (L || 1);
        const cols = [rgba('#1f5fd6'), rgba('#3f90f0'), rgba('#9ad8ff'), rgba('#ffffff')];
        const fade = Math.min(1, (ab.active - a.t) / 0.15);
        for (let s = 0; s <= L; s += 0.7) {
          const wob = Math.sin(s * 0.25 - t * 30) * 1.2;
          const W = (4 + Math.sin(s * 0.5 - t * 40) * 0.8) * fade;
          for (let q = -W; q <= W; q += 0.7) {
            const ci = Math.min(3, Math.floor((1 - Math.abs(q) / (W + 0.01)) * 4));
            g.set(b.ox + ca * s - sa * (q + wob), b.oy + sa * s + ca * (q + wob), cols[ci]);
          }
        }
        this.particles.burst(b.ex, b.ey, 3, { ramp: 'water', speed: 70, life: 0.35, vz: 40, g: 200 });
        if (Math.random() < 0.5) this.particles.add({ ramp: 'water', x: b.ox + ca * L * Math.random(), y: b.oy + sa * L * Math.random(), vx: -sa * 40 * (Math.random() - 0.5), vy: ca * 40 * (Math.random() - 0.5), life: 0.3 });
      } else if (ab.id === 'hydroBeam' && a.phase === 'windup') {
        const r = 1 + (a.t / ab.windup) * 3;
        const x = m.x + Math.cos(a.aim) * (m.r + 3), y = m.y + Math.sin(a.aim) * (m.r + 3) - 3;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (Math.hypot(dx, dy) <= r) g.set(x + dx, y + dy, Math.hypot(dx, dy) < r * 0.5 ? rgba('#ffffff') : rgba('#5ab4ff'));
        if (Math.random() < 0.6) { const an = Math.random() * 6.28; this.particles.add({ ramp: 'water', x: x + Math.cos(an) * 14, y: y + Math.sin(an) * 14, vx: -Math.cos(an) * 60, vy: -Math.sin(an) * 60, life: 0.22, drag: 0 }); }
      } else if (ab.id === 'whirlpool' && a.phase === 'active') {
        // Crista de espuma na metade da frente (o redemoinho envolve o monstro) e respingos jogados de lado.
        const R = a.data.R || 4;
        for (let q = 0; q <= Math.PI; q += 0.035) {
          const an = q + t * 7;
          const front = Math.sin(an);
          if (front < 0) continue;
          const wob = Math.sin(an * 5 - t * 20) * 1.2;
          g.set(m.x + Math.cos(an) * (R + wob), m.y + front * (R + wob) * 0.8 - 1, (Math.floor(an * 6) % 3) ? rgba('#e8f8ff', 230) : rgba('#7cc8f0', 200));
        }
        for (let k = 0; k < 2; k++) if (Math.random() < 0.9) { const an = Math.random() * 6.28, rr = R * (0.6 + Math.random() * 0.4); this.particles.add({ ramp: 'water', x: m.x + Math.cos(an) * rr, y: m.y + Math.sin(an) * rr * 0.8, vx: -Math.sin(an) * 110, vy: Math.cos(an) * 80, vz: 30 + Math.random() * 30, g: 160, life: 0.45 }); }
      } else if (ab.kind === 'cone' && a.phase === 'active') {
        const ox = m.x + Math.cos(a.aim) * m.r, oy = m.y + Math.sin(a.aim) * m.r - 3;
        for (let k = 0; k < 9; k++) {
          const ang = a.aim + (Math.random() - 0.5) * ab.half * 2;
          const sp = 90 + Math.random() * 70;
          this.particles.add({ ramp: m.element === 'plant' ? 'leaf' : m.element === 'water' ? 'water' : 'fire', x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, drag: 1.5, life: 0.45, add: m.element === 'fire', size: 1 + (Math.random() < 0.4 ? 1 : 0), grow: 3 });
        }
      } else if (ab.vine && a.phase !== 'windup') {
        const k = a.phase === 'active' ? Math.min(1, a.t / (ab.active * 0.6)) : Math.max(0, 1 - a.t / ab.recovery);
        const L = (m.r + ab.range) * k;
        const ca = Math.cos(a.aim), sa = Math.sin(a.aim);
        for (let s = 4; s < L; s += 0.5) {
          const wv = Math.sin(s * 0.45 - t * 25) * 1.6 * (s / (L + 1));
          const x = m.x + ca * s - sa * wv, y = m.y - 4 + sa * s + ca * wv;
          g.set(x, y, ROOT[3]); g.set(x, y + 1, rgba('#2f7426'));
          if ((s | 0) % 6 === 0) g.set(x - sa * 2, y + ca * 2, ROOT[4]);
        }
      } else if (ab.kind === 'aoe' && ab.harmless && a.phase !== 'recovery') {
        const k = a.phase === 'windup' ? a.t / ab.windup : 1;
        this.dotCircle(g, m.x, m.y, ab.radius * k, rgba('#9ae070', 210), t * 3, 4);
        if (a.phase === 'active' && Math.random() < 0.9) {
          const an = Math.random() * 6.28, r = Math.random() * ab.radius;
          this.particles.add({ ramp: 'leaf', x: m.x + Math.cos(an) * r, y: m.y + Math.sin(an) * r * 0.8, vz: 30, g: 40, life: 0.7 });
        }
      } else if (ab.kind === 'melee' && a.phase === 'active' && !ab.vine) {
        // O rastro do golpe cobre exatamente o alcance e o arco que acertam (sem acertar "fora do desenho").
        const k = Math.min(1, a.t / (ab.active * 0.8));
        const fire = m.element === 'fire';
        const cols = fire ? [rgba('#ffffff'), rgba('#ffd84a'), rgba('#ff7a1a')] : m.element === 'plant' ? [rgba('#ffffff'), rgba('#b4f08a'), rgba('#3f8a38')] : [rgba('#ffffff'), rgba('#9ad8ff'), rgba('#3a9ae8')];
        const arc = ab.arc || 2, reach = ab.reach || 16;
        const r0 = m.r + 3, r1 = m.r + reach;
        for (let line = 0; line < 3; line++) {
          const r = r1 - line * Math.max(2, (r1 - r0) / 3);
          for (let q = -arc / 2; q <= -arc / 2 + arc * k; q += 0.035) g.set(m.x + Math.cos(a.aim + q) * r, m.y + Math.sin(a.aim + q) * r - 3, cols[line]);
        }
      }
    }
  }

  drawSteam(world, t) {
    const l = this.l;
    for (const s of world.steam) {
      l.globalAlpha = Math.min(0.38, s.density * 0.42) * Math.min(1, s.life);
      l.fillStyle = s.ink ? '#2a1e42' : '#eef6fa';
      if (s.ink) l.globalAlpha = Math.min(0.7, s.density * 0.8) * Math.min(1, s.life);
      for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + t * 0.6;
        l.beginPath();
        l.arc(Math.round(s.x + Math.cos(a) * s.r * 0.4), Math.round(s.y - 4 + Math.sin(a) * s.r * 0.3), Math.max(2, s.r * 0.55), 0, Math.PI * 2);
        l.fill();
      }
    }
    l.globalAlpha = 1;
  }

  drawGlow(world, t) {
    const g = this.gl;
    g.clearRect(0, 0, WORLD_W, WORLD_H);
    const tr = world.terrain;
    // Um halo por bloco de 2×2 tiles em chamas (antes: um a cada dois tiles; incêndios grandes pesavam muito).
    const blocks = this._glowBlocks || (this._glowBlocks = new Map());
    blocks.clear();
    for (const i of tr.burning) {
      const key = ((((i / COLS) | 0) >> 1) << 8) | ((i % COLS) >> 1);
      blocks.set(key, (blocks.get(key) || 0) + 1);
    }
    for (const [key, n] of blocks) {
      const bx = (key & 255) * 16 + 8, by = (key >> 8) * 16 + 8;
      const fl = 0.75 + 0.25 * Math.sin(t * 13 + key);
      g.globalAlpha = Math.min(0.5, 0.16 * n) * fl;
      g.drawImage(this.glows.fire, bx - 18, by - 22, 36, 36);
    }
    for (const o of world.obstacles) if (o.burning > 0 && !o.destroyed) { g.globalAlpha = 0.9; g.drawImage(this.glows.fire, o.x - 24, o.y - 30, 48, 48); }
    for (const mu of this.mushrooms) if (mu.glow) { g.globalAlpha = 0.45 + Math.sin(t * 2 + mu.x) * 0.15; g.drawImage(this.glows.blue, mu.x - 10, mu.y - 14, 20, 20); }
    if (world.decor.some((d) => d.kind === 'lightshafts')) {
      g.globalAlpha = 1;
      for (let k = 0; k < 4; k++) {
        const x0 = 80 + k * 165 + Math.sin(t * 0.2 + k) * 20;
        g.fillStyle = `rgba(255,236,170,${0.05 + 0.02 * Math.sin(t * 0.5 + k * 2)})`;
        g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + 40, 0); g.lineTo(x0 + 140, WORLD_H); g.lineTo(x0 + 90, WORLD_H); g.closePath(); g.fill();
      }
    }
    for (const h of world.hazards) if (h.kind === 'geyser' && h.phase === 'active') { g.globalAlpha = 0.6; g.drawImage(this.glows.blue, h.x - 20, h.y - 40, 40, 50); }
    for (const p of world.projectiles) {
      g.globalAlpha = 0.9;
      if (p.kind === 'wave') { g.globalAlpha = 0.6; g.drawImage(this.glows.blue, p.x - p.r * 1.6, p.y - p.r * 1.6 - 6, p.r * 3.2, p.r * 3.2); }
      else if (p.kind === 'waterBolt') g.drawImage(this.glows.blue, p.x - 9, p.y - 9, 18, 18);
      else if (p.kind === 'seed' || p.kind === 'thorn' || p.kind === 'roots') continue;
      else g.drawImage(this.glows.fire, p.x - 10, (p.lob ? p.y - p.h : p.y) - 10, 20, 20);
    }
    for (const m of world.monsters) {
      if (!m.alive) continue;
      const R = m.evolved ? 30 : 18;
      if (m.element === 'fire') { g.globalAlpha = m.evolved ? 0.5 : 0.35; g.drawImage(this.glows.fire, m.x - R, m.y - R - 12, R * 2, R * 2); }
      else if (m.evolved && m.element === 'water') { g.globalAlpha = 0.3; g.drawImage(this.glows.blue, m.x - R, m.y - R - 10, R * 2, R * 2); }
      if (m.evolveT > 0) { g.globalAlpha = 0.8; g.drawImage(this.glows.white, m.x - 40, m.y - 60, 80, 80); }
      const a = m.action;
      if (a?.ab.id === 'hydroBeam' && a.phase === 'active' && a.data.beam) {
        const b = a.data.beam;
        g.globalAlpha = 0.5;
        for (let s = 0; s <= 1; s += 0.1) g.drawImage(this.glows.blue, b.ox + (b.ex - b.ox) * s - 12, b.oy + (b.ey - b.oy) * s - 12, 24, 24);
      }
      if (a?.ab.kind === 'cone' && a.phase === 'active' && m.element === 'fire') { g.globalAlpha = 0.8; g.drawImage(this.glows.fire, m.x + Math.cos(a.aim) * 36 - 40, m.y + Math.sin(a.aim) * 36 - 40, 80, 80); }
    }
    g.globalAlpha = 1;
    const l = this.l;
    l.globalCompositeOperation = 'lighter';
    l.drawImage(this.glow, 0, 0, WORLD_W, WORLD_H);
    l.globalCompositeOperation = 'source-over';
  }

  drawRings(dt) {
    const l = this.l;
    for (const r of this.rings) {
      r.t += dt;
      r.r += (r.max - r.r) * Math.min(1, dt * 14);
      const a = 1 - r.t / 0.35;
      if (a <= 0) continue;
      l.globalAlpha = a;
      l.fillStyle = r.color;
      const n = Math.max(10, Math.round(r.r * 3));
      for (let k = 0; k < n; k++) {
        const an = (k / n) * Math.PI * 2;
        const s = r.thick ? 2 : 1;
        l.fillRect(Math.round(r.x + Math.cos(an) * r.r), Math.round(r.y + Math.sin(an) * r.r * 0.8), s, s);
      }
    }
    l.globalAlpha = 1;
    this.rings = this.rings.filter((r) => r.t < 0.35);
  }

  drawOverhead(m, alpha, dt) {
    const st = this.ms(m);
    st.lagHp += (m.hp - st.lagHp) * Math.min(1, dt * 3);
    if (!m.alive) return;
    if (m.status.cloak > 0 && this.isFoe(m)) return; // camuflado: sem barra de vida para o inimigo
    const l = this.l;
    const p = this.lerpPos(m, alpha);
    const x = Math.round(p.x) - 10, y = Math.round(p.y) - Math.max(26, st.top + 2);
    // Energia de evolução (barrinha roxa; brilha quando pronta).
    if (m.def.evolvesTo && !m.evolved) {
      l.fillStyle = '#140c0a';
      l.fillRect(x - 1, y + 2, 22, 2);
      l.fillStyle = m.canEvolve ? (Math.floor(this.time * 8) % 2 ? '#ffffff' : '#e8b8ff') : '#a070d8';
      l.fillRect(x, y + 2, Math.round((m.energy / EVOLUTION.threshold) * 20), 1);
    }
    const w = this.world;
    if (m === w.active) {
      const by = y - 7 + Math.round(Math.sin(this.time * 6) * 1.2);
      l.fillStyle = '#140c0a';
      l.fillRect(x + 6, by - 1, 9, 6);
      l.fillStyle = '#ffe066';
      for (let k = 0; k < 4; k++) l.fillRect(x + 7 + k, by + k, 7 - k * 2, 1);
    }

    l.fillStyle = '#140c0a';
    l.fillRect(x - 1, y - 1, 22, 4);
    l.fillStyle = '#5a1a14';
    l.fillRect(x, y, 20, 2);
    l.fillStyle = '#ffffff';
    l.fillRect(x, y, Math.round((st.lagHp / m.maxHp) * 20), 2);
    l.fillStyle = TEAM_COLOR[m.team];
    l.fillRect(x, y, Math.round((m.hp / m.maxHp) * 20), 2);
    // Ícones de status: chama (queimando) / gota (molhado) / raiz (preso) / estrelas (atordoado).
    let ix = x + 22;
    if (m.status.burn > 0) { l.fillStyle = '#ff7a1a'; l.fillRect(ix, y - 1, 2, 3); l.fillStyle = '#ffd84a'; l.fillRect(ix, y, 1, 2); ix += 3; }
    if (m.status.wet > 0) { l.fillStyle = '#5ab4ff'; l.fillRect(ix, y, 2, 2); l.fillRect(ix, y - 1, 1, 1); ix += 3; }
    if (m.status.root > 0) { l.fillStyle = '#7ad84a'; l.fillRect(ix, y - 1, 1, 3); l.fillRect(ix + 1, y + 1, 1, 1); ix += 3; }
    if (m.status.stun > 0) {
      for (let k = 0; k < 3; k++) { const an = this.time * 6 + k * 2.1; l.fillStyle = '#ffe066'; l.fillRect(Math.round(x + 10 + Math.cos(an) * 7), Math.round(y - 5 + Math.sin(an) * 2), 1, 1); }
    }
    // Barra da mecânica própria (para os dois lados lerem): calor laranja, ímpeto amarelo.
    const kind = m.def.sig?.kind;
    let sy = y + 3;
    if (kind === 'heat' && (m.heat > 0 || m.status.exhaust > 0)) {
      l.fillStyle = '#140c0a'; l.fillRect(x - 1, sy, 22, 3);
      const full = m.status.overheat > 0;
      l.fillStyle = m.status.exhaust > 0 ? '#6a6058' : full ? (Math.floor(this.time * 10) % 2 ? '#ffffff' : SIG_COLOR.overheat) : SIG_COLOR.heat;
      l.fillRect(x, sy + 1, Math.round((m.status.exhaust > 0 ? m.status.exhaust / (m.def.sig.exhaust ?? 2.2) : m.heat / 100) * 20), 1);
      sy += 3;
    } else if (kind === 'momentum' && m.momentum > 0) {
      l.fillStyle = '#140c0a'; l.fillRect(x - 1, sy, 22, 3);
      l.fillStyle = m.charged ? (Math.floor(this.time * 10) % 2 ? '#ffffff' : SIG_COLOR.momentum) : '#b89a30';
      l.fillRect(x, sy + 1, Math.round((m.momentum / 100) * 20), 1);
      sy += 3;
    }
    // Marcas de caça recebidas (Mantifolha): folhas verdes acima da vida; 3 = pronto para a execução.
    if (m.marks?.n > 0) {
      for (let k = 0; k < 3; k++) {
        const on = k < m.marks.n;
        l.fillStyle = on ? (m.marks.n >= 3 && Math.floor(this.time * 8) % 2 ? '#ffffff' : SIG_COLOR.marks) : '#2a3a20';
        l.fillRect(x + 4 + k * 5, y - 5, 3, 2); l.fillRect(x + 5 + k * 5, y - 6, 1, 1);
      }
    }
    // Barra de preparação: dourada = IMPARÁVEL (não é interrompido por dano), branca = pode ser interrompido.
    const a = m.action;
    if (a && a.phase === 'windup' && (a.ab.windup >= 0.25 || a.ab.superArmor)) {
      l.fillStyle = '#140c0a';
      l.fillRect(x - 1, sy, 22, 3);
      l.fillStyle = a.ab.superArmor ? '#ffb020' : '#ffffff';
      l.fillRect(x, sy + 1, Math.round((a.t / a.ab.windup) * 20), 1);
      if (a.ab.superArmor) { l.fillStyle = '#ffb020'; l.fillRect(x - 4, sy, 2, 3); l.fillRect(x - 5, sy + 1, 4, 1); }
    }
    // Recuperação longa depois de um golpe forte: janela de contra-ataque (gotas de suor).
    if (a && a.phase === 'recovery' && a.ab.recovery >= 0.4 && a.ab.kind !== 'dodge') {
      l.fillStyle = '#c8e8ff';
      const k = Math.floor(this.time * 6) % 2;
      l.fillRect(x + 21, y - 8 + k, 1, 2); l.fillRect(x + 23, y - 6 - k, 1, 2);
    }
  }

  isFoe(m) {
    const w = this.world;
    if (w.playerTeam === null) return false;
    return m.team !== w.teams[w.playerTeam].side;
  }

  // ───────── Ilusões de tinta: desenhadas como o dono (o inimigo não distingue) ─────────
  drawDecoy(d, alpha, dt, t) {
    const owner = d.owner;
    if (!owner || !owner.def) return;
    let st = this.decoySt.get(d.id);
    if (!st) { st = { walk: 0, seed: d.id * 13 }; this.decoySt.set(d.id, st); if (this.decoySt.size > 40) this.decoySt.delete(this.decoySt.keys().next().value); }
    st.walk += Math.hypot(d.vx, d.vy) * dt * 0.28;
    const x = Math.round((d.px ?? d.x) + (d.x - (d.px ?? d.x)) * alpha), y = Math.round((d.py ?? d.y) + (d.y - (d.py ?? d.y)) * alpha);
    const l = this.l;
    // Sombra + anel do time, como um monstro de verdade.
    l.globalAlpha = 0.35; l.fillStyle = '#000';
    l.beginPath(); l.ellipse(x, y + 2, owner.r + 1, (owner.r + 1) * 0.45, 0, 0, Math.PI * 2); l.fill();
    const foe = this.isFoe(owner);
    l.globalAlpha = foe ? 0.9 : 0.4;
    l.fillStyle = TEAM_COLOR[owner.team];
    for (let k = 0; k < 18; k++) { if (k % 3 === 0) continue; const an = (k / 18) * Math.PI * 2 + this.time * 0.8; l.fillRect(Math.round(x + Math.cos(an) * (owner.r + 3)), Math.round(y + 2 + Math.sin(an) * (owner.r + 3) * 0.45), 1, 1); }
    const pose = { t, walk: st.walk, moving: 1, crouch: 0, lunge: 0, open: d.atk > 0 ? 1 : 0, dash: 0, spin: 0, dead: 0, seed: st.seed, power: 0 };
    if (!this.art.has(owner.def.sprite)) { l.globalAlpha = 1; return; }
    const f = this.art.render('decoy:' + (d.id % 8), owner.def.sprite, pose);
    const face = (Math.cos(d.facing) >= 0 ? 1 : -1) * (f.faces === -1 ? -1 : 1);
    const fade = Math.min(1, d.life / 0.3);
    l.globalAlpha = (foe ? 1 : 0.5) * fade;
    this.blitFrame(f, x, y, face, 1, 1, 0);
    l.globalAlpha = 1;
    d._top = f.top;
  }

  drawDecoyOverhead(d, alpha) {
    const owner = d.owner;
    if (!owner || !this.isFoe(owner)) return;
    const l = this.l;
    const px = (d.px ?? d.x) + (d.x - (d.px ?? d.x)) * alpha, py = (d.py ?? d.y) + (d.y - (d.py ?? d.y)) * alpha;
    const x = Math.round(px) - 10, y = Math.round(py) - Math.max(26, (d._top || 24) + 2);
    // A cópia mostra a mesma vida do dono: de longe, não há como saber qual é a verdadeira.
    l.fillStyle = '#140c0a'; l.fillRect(x - 1, y - 1, 22, 4);
    l.fillStyle = '#5a1a14'; l.fillRect(x, y, 20, 2);
    l.fillStyle = TEAM_COLOR[owner.team]; l.fillRect(x, y, Math.round((owner.hp / owner.maxHp) * 20), 2);
  }

  // Círculo rúnico das Raízes: anel duplo com runas girando; rachaduras avançam para o centro e brotos
  // aparecem na borda pouco antes de as raízes subirem.
  drawRootRune(g, x, y, R, k, t) {
    const glow = Math.floor(t * (8 + k * 16)) % 2;
    // Área marcada: verde translúcido que fica mais forte até as raízes subirem.
    const fill = rgba('#5aa83c', Math.round(35 + 85 * k));
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const ey = dy / 0.85; if (dx * dx + ey * ey <= R * R) g.set(x + dx, y + dy, fill); }
    this.dotCircle(g, x, y, R, rgba(glow ? '#e8ffb0' : '#6ac84a', 250), t * 1.5, 1);
    this.dotCircle(g, x, y, R - 1, rgba('#2f6a26', 230), t * 1.5, 2);
    this.dotCircle(g, x, y, R * 0.72, rgba(glow ? '#a8f070' : '#3f8a38', 220), -t * 2.2, 2);
    // Runas: pequenos símbolos em 6 pontos do anel, girando devagar.
    for (let q = 0; q < 6; q++) {
      const an = q * (Math.PI / 3) + t * 0.8;
      const cx = Math.round(x + Math.cos(an) * R * 0.86), cy = Math.round(y + Math.sin(an) * R * 0.86 * 0.85);
      const c = rgba(k > 0.5 && glow ? '#ffffff' : '#d8ff90', 250);
      for (const [dx, dy] of [[0, 0], [1, -1], [-1, -1], [0, -2], [0, 1], [2, 0], [-2, 0]]) g.set(cx + dx, cy + dy, c);
    }
    // Rachaduras de terra do anel para dentro.
    for (let q = 0; q < 8; q++) {
      const an = q * (Math.PI / 4) + 0.3;
      const len = R * k;
      for (let s2 = 0; s2 < len; s2 += 1.2) {
        const jag = Math.sin(s2 * 0.9 + q * 3) * 1.2;
        const rr = R - s2;
        g.set(x + Math.cos(an) * rr - Math.sin(an) * jag, y + (Math.sin(an) * rr + Math.cos(an) * jag) * 0.85, rgba('#3a2414', 200));
      }
    }
    // Pontas de raiz saindo da borda.
    if (k > 0.55) for (let q = 0; q < 8; q++) {
      const an = q * (Math.PI / 4) + 0.3;
      const bx = Math.round(x + Math.cos(an) * R * 0.95), by = Math.round(y + Math.sin(an) * R * 0.95 * 0.85);
      const h = Math.round((k - 0.55) / 0.45 * 4);
      for (let s2 = 0; s2 <= h; s2++) g.set(bx, by - s2, s2 === h ? rgba('#84c858') : ROOT[1]);
    }
  }

  // Efeitos de chão (por baixo dos monstros): redemoinho, anel de raízes e poça escura dos tentáculos.
  drawGroundAbilityFx(world, t, dt) {
    const g = this.fxG;
    for (const m of world.monsters) {
      const a = m.action;
      if (!m.alive || !a || a.ab.id !== 'whirlpool' || a.phase !== 'active') continue;
      const R = a.data.R || 4;
      const RR = R * R;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const ey = dy / 0.8;
        const r2 = dx * dx + ey * ey;
        if (r2 > RR) continue;
        const r = Math.sqrt(r2), th = Math.atan2(ey, dx);
        // Espiral logarítmica girando: faixas de espuma, água clara e azul profundo; olho escuro no centro.
        const v = Math.sin(3 * th + 7 * Math.log(1 + r / 5) - t * 11);
        const edge = r / R;
        let c;
        if (r < R * 0.18) c = rgba('#0e2a5a', 220);
        else if (v > 0.72 && edge > 0.3) c = rgba('#f0fbff', 230);
        else if (v > 0.25) c = rgba('#7cc8f0', 150 + Math.round(70 * (1 - edge)));
        else if (v > -0.35) c = rgba('#3a8ad8', 130 + Math.round(70 * (1 - edge)));
        else c = rgba('#1f5cb0', 120 + Math.round(60 * (1 - edge)));
        if (edge > 0.93 && (Math.floor(th * 9 + t * 14) & 1)) c = rgba('#ffffff', 220);
        g.set(m.x + dx, m.y + dy, c);
      }
    }
    // Jaulas de raízes: anel rachado no chão + raízes de trás (as da frente vão por cima do monstro).
    for (const f of this.rootFx) this.drawRootCage(f, t, false);
    // Poça escura dos tentáculos.
    for (const f of this.tentFx) {
      const k = Math.min(1, f.t / 0.15), fade = Math.max(0, 1 - Math.max(0, f.t - 0.9) / 0.3);
      const R = f.r * 0.8 * k;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const ey = dy / 0.75;
        if (dx * dx + ey * ey > R * R) continue;
        if (hash2(dx + 40, dy, Math.floor(t * 10)) > 0.6 * fade + 0.2) continue;
        g.set(f.x + dx, f.y + dy, rgba(dx * dx + ey * ey > R * R * 0.7 ? '#5a4aa0' : '#1a1236', 170));
      }
    }
    void dt;
  }

  // Raízes da jaula: sobem da borda do círculo curvando para o centro, balançam e afundam no fim.
  drawRootCage(f, t, front) {
    const g = front ? this.fxT : this.fxG;
    const n = Math.max(7, Math.min(12, Math.round(f.r / 3)));
    const H = 12 + f.r * 0.45;
    const rise = f.t < 0.12 ? (f.t / 0.12) * 1.1 : f.t < 0.22 ? 1.1 - ((f.t - 0.12) / 0.1) * 0.1 : 1;
    const sink = Math.max(0, Math.min(1, (f.dur - f.t) / 0.3));
    const grow = Math.min(rise, sink);
    if (grow <= 0) return;
    if (!front) {
      // Anel de terra rachada sob a jaula.
      this.dotCircle(g, f.x, f.y, f.r * 0.95, rgba('#2a1a10', 220), 0, 2);
      this.dotCircle(g, f.x, f.y, f.r * 0.8, rgba('#4a2e16', 160), 0.5, 3);
    }
    for (let i = 0; i < n; i++) {
      const an = (i / n) * Math.PI * 2 + f.seed;
      const isFront = Math.sin(an) >= 0;
      if (isFront !== front) continue;
      const bx = f.x + Math.cos(an) * f.r * 0.95, by = f.y + Math.sin(an) * f.r * 0.95 * 0.8;
      const h = H * (0.8 + 0.4 * hash2(i, 3, Math.round(f.seed * 10)));
      const tx = f.x + Math.cos(an) * f.r * 0.25 + Math.sin(t * 3 + i) * 1.2, ty = f.y + Math.sin(an) * f.r * 0.2 - h;
      const cx = bx + (tx - bx) * 0.15, cy = by - h * 1.05;
      const steps = 22;
      for (let k2 = 0; k2 <= steps * grow; k2++) {
        const s2 = k2 / steps, u = 1 - s2;
        const px = u * u * bx + 2 * u * s2 * cx + s2 * s2 * tx, py = u * u * by + 2 * u * s2 * cy + s2 * s2 * ty;
        const w = 2 * (1 - s2) + 0.6;
        for (let oy = -w; oy <= w; oy += 1) for (let ox = -w; ox <= w; ox += 1) {
          const d = Math.hypot(ox, oy);
          if (d > w) continue;
          g.set(px + ox, py + oy, d > w - 0.9 ? rgba('#2a1a0c') : ox < 0 ? ROOT[2] : ROOT[1]);
        }
        if (k2 % 5 === 2) { g.set(px + w + 1, py, rgba('#e8dcc0')); }
        if (k2 % 7 === 4) { g.set(px - w - 1, py - 1, ROOT[3]); g.set(px - w - 2, py - 1, ROOT[4]); }
      }
    }
  }

  // Esquiva enterrada do Brotossauro: montinho de terra andando com uma flor vermelha (ou uma arvorezinha).
  drawBurrowDodge(m, p, t) {
    const l = this.l, g = this.fxT;
    const x = Math.round(p.x), y = Math.round(p.y);
    const tree = m.action.ab.burrowDodge === 'tree';
    const mw = tree ? 10 : 8;
    // Monte de terra elevado: sombra no chão, domo com brilho no topo e torrões.
    l.globalAlpha = 0.35; l.fillStyle = '#000'; l.beginPath(); l.ellipse(x, y + 2, mw + 2, 3.5, 0, 0, 6.3); l.fill(); l.globalAlpha = 1;
    for (let row = 0; row <= 4; row++) {
      const half = Math.round(mw * Math.sqrt(1 - (row / 5) ** 2));
      l.fillStyle = row === 0 ? '#4a301a' : row >= 3 ? '#8a6038' : '#6e4a2a';
      l.fillRect(x - half, y + 1 - row, half * 2 + 1, 1);
    }
    l.fillStyle = '#a07848';
    for (let k = 0; k < 4; k++) l.fillRect(x - mw + 3 + ((k * 4 + Math.floor(t * 6)) % (mw * 2 - 5)), y - 1 - (k % 3), 1, 1);
    l.fillStyle = '#3a2414';
    for (let k = 0; k < 3; k++) l.fillRect(x - mw + 2 + ((k * 6 + Math.floor(t * 9)) % (mw * 2 - 3)), y + 1, 2, 1);
    const sway = Math.round(Math.sin(t * 7) * 1);
    if (!tree) {
      // Caule com folha e uma flor vermelha cheia (quatro pétalas 2x2 e miolo amarelo).
      for (let s2 = 0; s2 < 7; s2++) g.set(x + (s2 > 4 ? sway : 0), y - 3 - s2, rgba(s2 % 2 ? '#3f8a38' : '#4a9a3e'));
      g.set(x - 1, y - 5, rgba('#5aa83c')); g.set(x - 2, y - 6, rgba('#84c858')); g.set(x + 1, y - 7, rgba('#5aa83c'));
      const fx = x + sway, fy = y - 12;
      for (const [dx, dy] of [[-1, -3], [1, -1], [-1, 1], [-3, -1]]) {
        g.set(fx + dx, fy + dy, rgba('#e8303a')); g.set(fx + dx + 1, fy + dy, rgba('#ff5a5a'));
        g.set(fx + dx, fy + dy + 1, rgba('#b01a24')); g.set(fx + dx + 1, fy + dy + 1, rgba('#e8303a'));
      }
      g.set(fx, fy, rgba('#ffd23a')); g.set(fx - 1, fy, rgba('#ffb020')); g.set(fx, fy - 1, rgba('#ffe066')); g.set(fx - 1, fy - 1, rgba('#ffd23a'));
    } else {
      // Arvorezinha: tronco, copa redonda com brilho e frutinhas vermelhas.
      for (let s2 = 0; s2 < 8; s2++) { g.set(x, y - 1 - s2, rgba('#5a3a1a')); g.set(x + 1, y - 1 - s2, rgba('#74502e')); }
      const cx = x + sway, cy = y - 13;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -7; dx <= 7; dx++) {
        const d = (dx * dx) / 49 + (dy * dy) / 25;
        if (d > 1) continue;
        g.set(cx + dx, cy + dy, d > 0.75 ? rgba('#1f4a22') : dx < -2 && dy < -1 ? rgba('#62ae4e') : rgba('#3f8a38'));
      }
      for (const [dx, dy] of [[-3, 1], [2, -2], [4, 2]]) g.set(cx + dx, cy + dy, rgba('#e8303a'));
      if (Math.random() < 0.08) this.particles.add({ ramp: 'leafFall', x: cx + (Math.random() - 0.5) * 10, y: cy, z: 4, vz: -6, vx: 6, life: 1 });
    }
    if (Math.random() < 0.5) this.particles.add({ ramp: 'dust', x: x + (Math.random() - 0.5) * mw * 2, y, z: 1, vz: 20, vx: (Math.random() - 0.5) * 20, life: 0.35, g: 90 });
  }

  // Maré Esmagadora: onda alta em 3/4. Corpo em degradê (fundo escuro → crista clara), lábio de espuma que
  // enrola para a frente, sombra molhada no chão e borrifos. Cresce junto com o raio da onda.
  drawWave(g, p, x, y, t) {
    const ang = Math.atan2(p.vy, p.vx), ca = Math.cos(ang), sa = Math.sin(ang);
    const R = p.r, bend = R * 0.85, thick = 6 + R * 0.45;
    const DEEP = rgba('#174e9e'), MID = rgba('#2f7fd0'), LIGHT = rgba('#6cc0f0'), PALE = rgba('#bfe8ff'), FOAM = rgba('#ffffff');
    const P = (s2, q, c, lift = 0) => g.set(x + ca * s2 - sa * q, y + sa * s2 + ca * q - lift, c);
    for (let q = -R; q <= R; q += 0.5) {
      const a2 = Math.abs(q) / R, taper = Math.sqrt(Math.max(0, 1 - a2 * a2));
      // Meia-lua bem curvada: o centro vai na frente; a espessura afina até zero nas pontas.
      const front = bend * taper - bend * 0.4, th = thick * Math.pow(taper, 0.7), back = front - th;
      // Esteira: água espalhada atrás da onda, sumindo aos poucos.
      for (let s2 = back - R * 0.9; s2 < back; s2 += 1) {
        const f = (back - s2) / (R * 0.9);
        if (hash2((s2 * 2) | 0, (q * 2) | 0, Math.floor(t * 10)) < 0.55 * (1 - f) * taper) P(s2, q, f < 0.4 ? rgba('#3a8ad8', 170) : rgba('#7cc8f0', 110));
      }
      for (let s2 = back; s2 <= front; s2 += 0.5) {
        const k = (s2 - back) / (th || 1);
        const stripe = Math.sin(s2 * 0.6 + q * 0.35 - t * 14);
        let c;
        if (k > 0.82) c = FOAM;
        else if (k > 0.62) c = stripe > 0.1 ? FOAM : PALE;
        else if (k > 0.35) c = stripe > 0 ? LIGHT : MID;
        else c = stripe > 0.45 ? MID : DEEP;
        P(s2, q, c, Math.round(taper * 2 * Math.sin(k * Math.PI)));
      }
      // Espuma estourando logo à frente da crista.
      for (let d = 1; d <= 3; d++) if (hash2((q * 5) | 0, d, Math.floor(t * 16)) > 0.6 - d * 0.08) P(front + d, q, d === 1 ? FOAM : PALE);
    }
    // Borrifos da crista.
    for (let k = 0; k < 2; k++) {
      const q = (Math.random() - 0.5) * R * 1.4;
      this.particles.add({ ramp: 'water', x: x + ca * bend * 0.5 - sa * q, y: y + sa * bend * 0.5 + ca * q, z: 4, vx: ca * 70 + (Math.random() - 0.5) * 30, vy: sa * 70 + (Math.random() - 0.5) * 20, vz: 30 + Math.random() * 40, g: 200, life: 0.45 });
    }
  }

  // Tentáculo do abismo: sobe rápido, balança curvando a ponta e afunda.
  drawTentacles(dt, t) {
    const g = this.fxT;
    for (const f of this.tentFx) {
      f.t += dt;
      const up = f.t < 0.15 ? f.t / 0.15 : f.t > 0.9 ? Math.max(0, 1 - (f.t - 0.9) / 0.3) : 1;
      if (up <= 0) continue;
      const H = (f.big ? 44 : 28) * up, W = f.big ? 6.5 : 4.2, A = f.big ? 5 : 3.5;
      // Ponta enrolando: a curva aumenta no fim e balança com o tempo.
      const curl = (f.big ? 10 : 6) * (0.7 + 0.3 * Math.sin(t * 4 + f.seed));
      const steps = f.big ? 46 : 32;
      let prevX = f.x;
      for (let k = 0; k <= steps; k++) {
        const s2 = k / steps;
        const body = Math.sin(s2 * Math.PI * 1.3 + t * 3.5 + f.seed) * A * s2;
        const hook = s2 > 0.72 ? curl * Math.pow((s2 - 0.72) / 0.28, 2) : 0;
        const px = f.x + body + hook;
        const py = f.y - s2 * H + (s2 > 0.85 ? (s2 - 0.85) * H * 0.9 : 0);
        const w = Math.max(1, W * (1 - s2 * 0.82));
        const lean = px - prevX; prevX = px;
        for (let ox = -w; ox <= w; ox += 1) {
          const e = Math.abs(ox) > w - 1;
          g.set(px + ox, py, e ? rgba('#22163f') : ox < -w * 0.3 ? rgba('#9a8ae0') : ox < w * 0.4 ? rgba('#5a4aa8') : rgba('#3e2f86'));
        }
        // Ventosas no lado de dentro.
        if (k % 3 === 1 && s2 < 0.8 && w > 2) { g.set(px + w - 1.5, py, rgba('#f0d8ff')); g.set(px + w - 2.5, py, rgba('#c8a8f0')); }
        void lean;
      }
      if (Math.random() < 0.3) this.particles.add({ ramp: 'water', x: f.x + (Math.random() - 0.5) * 8, y: f.y, z: H * 0.8, vz: -20, g: 160, life: 0.5 });
    }
    this.tentFx = this.tentFx.filter((f) => f.t < 1.25);
  }

  // Raízes que ligam a sentinela ao dono quando ele está perto (cura).
  drawSentryLinks(world, t) {
    const g = this.fxT;
    for (const o of world.obstacles) {
      if (!o.sentry || o.destroyed || !o.owner || !o.owner.alive || !o.owner.onField) continue;
      const m = o.owner, d = Math.hypot(m.x - o.x, m.y - o.y);
      const R = o.def?.healR ?? 46;
      if (d > R) continue;
      const n = Math.floor(d / 3);
      for (let k = 1; k < n; k++) {
        if ((k + Math.floor(t * 8)) % 3 === 0) continue;
        const f = k / n;
        g.set(Math.round(o.x + (m.x - o.x) * f), Math.round(o.y + (m.y - o.y) * f + Math.sin(f * Math.PI) * 3), rgba(k % 2 ? '#9ae070' : '#5aa83c', 200));
      }
    }
  }

  // Corte em X da execução (Mantifolha).
  drawSlashes(dt) {
    if (!this.slashes?.length) return;
    const g = this.fxT;
    for (const s of this.slashes) {
      s.t += dt;
      const k = Math.min(1, s.t / 0.12), L = 16 * k;
      for (let q = -L; q <= L; q += 0.6) {
        g.set(Math.round(s.x + q), Math.round(s.y + q * 0.8), rgba('#ffffff'));
        g.set(Math.round(s.x + q), Math.round(s.y - q * 0.8), rgba('#b4f08a'));
      }
    }
    this.slashes = this.slashes.filter((s) => s.t < 0.3);
  }

  // Mira: linha pontilhada do monstro ativo até o cursor e retícula (vermelha fora do alcance do tiro principal).
  drawReticle(world, t) {
    const m = world.active;
    if (!m || !m.alive || world.over) return;
    const l = this.l;
    const { x: ax, y: ay } = world.input.aim;
    const ang = Math.atan2(ay - m.y, ax - m.x);
    const range = m.ability(m.def.controls.primary).range;
    const d = Math.min(range, Math.hypot(ax - m.x, ay - m.y));
    l.fillStyle = TEAM_COLOR[m.team];
    l.globalAlpha = 0.55;
    for (let s = m.r + 6; s < d; s += 5) l.fillRect(Math.round(m.x + Math.cos(ang) * s), Math.round(m.y - 3 + Math.sin(ang) * s), 1, 1);
    l.globalAlpha = 1;
    const rx = Math.round(ax), ry = Math.round(ay);
    const pulse = Math.floor(t * 4) % 2;
    l.fillStyle = '#140c0a';
    l.fillRect(rx - 5, ry - 1, 11, 3); l.fillRect(rx - 1, ry - 5, 3, 11);
    l.fillStyle = Math.hypot(ax - m.x, ay - m.y) > range ? '#ff8a8a' : '#ffffff';
    l.fillRect(rx - 4 - pulse, ry, 3, 1); l.fillRect(rx + 2 + pulse, ry, 3, 1);
    l.fillRect(rx, ry - 4 - pulse, 1, 3); l.fillRect(rx, ry + 2 + pulse, 1, 3);
  }

  drawFloaters(dt) {
    const c = this.ctx, { ox, oy, S, dpr } = this.view;
    c.textAlign = 'center';
    for (const n of this.nums) {
      n.t += dt;
      const k = n.t / 0.9;
      const sx = ox + n.x * S, sy = oy + (n.y - n.t * 22) * S;
      c.globalAlpha = Math.max(0, 1 - k * k);
      c.font = `${(n.small ? 9 : n.big ? 15 : 12) * dpr * (this.hudScale || 1) * 0.9}px "Press Start 2P", monospace`;
      c.lineWidth = 3 * dpr;
      c.strokeStyle = '#140c0a';
      const s = Math.max(1, Math.round(n.v)).toString();
      c.strokeText(s, sx, sy);
      c.fillStyle = n.color;
      c.fillText(s, sx, sy);
    }
    for (const n of this.texts) {
      n.t += dt;
      const sx = ox + n.x * S, sy = oy + (n.y - n.t * 14) * S;
      c.globalAlpha = Math.max(0, 1 - n.t / 1.1);
      c.font = `${(n.big ? 11 : 8) * dpr * (this.hudScale || 1) * 0.9}px "Press Start 2P", monospace`;
      c.lineWidth = 3 * dpr;
      c.strokeStyle = '#140c0a';
      c.strokeText(n.text, sx, sy);
      c.fillStyle = n.color;
      c.fillText(n.text, sx, sy);
    }
    c.globalAlpha = 1;
    this.nums = this.nums.filter((n) => n.t < 0.9);
    this.texts = this.texts.filter((n) => n.t < 1.1);
  }

  drawDebug(world) {
    const c = this.ctx, { ox, oy, S, dpr } = this.view;
    const X = (x) => ox + x * S, Y = (y) => oy + y * S;
    c.font = `${9 * dpr}px monospace`;
    c.textAlign = 'center';
    for (const m of world.monsters) {
      if (!m.alive) continue;
      const b = m.ai;
      const col = TEAM_COLOR[m.team];
      // Raios de steering: comprimento = pontuação de cada direção.
      for (let i = 0; i < 16; i++) {
        const s = b.debug.scores[i];
        const a = (i / 16) * Math.PI * 2;
        const L = 6 + Math.max(-1, Math.min(1.5, s)) * 14;
        c.strokeStyle = i === b.debug.pick ? '#ffffff' : s > 0 ? '#6f6' : '#f55';
        c.lineWidth = (i === b.debug.pick ? 2 : 1) * dpr;
        c.beginPath();
        c.moveTo(X(m.x), Y(m.y));
        c.lineTo(X(m.x + Math.cos(a) * Math.max(2, L)), Y(m.y + Math.sin(a) * Math.max(2, L)));
        c.stroke();
      }
      if (b.target) {
        const mem = b.mem.get(b.target.id);
        c.setLineDash([4 * dpr, 4 * dpr]);
        c.strokeStyle = mem.visible ? col : '#888';
        c.lineWidth = dpr;
        c.beginPath(); c.moveTo(X(m.x), Y(m.y)); c.lineTo(X(mem.x), Y(mem.y)); c.stroke();
        c.setLineDash([]);
      }
      if (b.debug.goal) { c.strokeStyle = '#ff0'; c.strokeRect(X(b.debug.goal.x) - 3 * dpr, Y(b.debug.goal.y) - 3 * dpr, 6 * dpr, 6 * dpr); }
      for (const th of b.threats) if (th.kind === 'proj') { c.strokeStyle = '#f0f'; c.beginPath(); c.arc(X(th.p.x), Y(th.p.y), 5 * dpr, 0, 7); c.stroke(); }
      c.fillStyle = '#fff';
      c.strokeStyle = '#000';
      c.lineWidth = 3 * dpr;
      const label = `${b.state}${m.action ? ':' + m.action.ab.id + '/' + m.action.phase : ''} [${b.mode}]`;
      c.strokeText(label, X(m.x), Y(m.y + 22));
      c.fillText(label, X(m.x), Y(m.y + 22));
    }
    const tr = world.terrain;
    c.fillStyle = 'rgba(255,0,0,0.25)';
    for (const i of tr.heated) if (tr.heat[i] > 0.3) c.fillRect(X(tr.cx(i) - 4), Y(tr.cy(i) - 4), TILE * S, TILE * S);
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    for (const s of world.steam) if (s.density > 0.55) { c.beginPath(); c.arc(X(s.x), Y(s.y), s.r * 0.6 * S, 0, 7); c.stroke(); }
  }
}
