import { SPECIES, ROSTER, formsOf } from '../sim/species.js';

import { ARENAS, ARENA_ORDER } from '../arenas/index.js';
import { ELEMENT_MULT, EVOLUTION, SWITCH, WORLD_W, WORLD_H, ROWS, FFA_COLORS } from '../config.js';
import { World } from '../sim/world.js';
import { Renderer, ELEMENT_COLOR, SIG_COLOR } from '../render/renderer.js';
import { makeCanvas, PixelBuf } from '../render/pixel.js';
import { drawProfessor } from '../render/sprites.js';
import { TUTORIAL_KEY } from '../sim/tutorial.js';
import { abilityIcon, statusIcon } from '../render/hud.js';
import { drawTail } from '../render/electricfx.js';

// Telas fora da batalha (menu, time, arena, bestiário, opções) e menus sobre a batalha (pausa, fim).
// Tudo desenhado no canvas no mesmo estilo pixel art; mouse e teclado funcionam em todas as telas.

const FONT = '"Press Start 2P", monospace';
const ELEMENT_NAME = { fire: 'Fogo', water: 'Água', plant: 'Planta', earth: 'Terra', electric: 'Elétrico', psychic: 'Psíquico', air: 'Voador', dark: 'Sombra' };
const KEY_LABEL = { primary: 'MOUSE E', melee: 'MOUSE D', q: 'Q', e: 'E', f: 'F', dodge: 'ESPAÇO' };
const TOUCH_LABEL = { primary: 'ATQ', melee: 'GOLPE', q: 'Q', e: 'E', f: 'F', dodge: 'ESQ' };
const DIFF_NAME = ['', 'fácil de jogar', 'médio', 'exige prática'];
// Dificuldade em losangos de pixel (a fonte não tem estrelas). Retorna a largura desenhada.
function diffMarks(c, n, x, y, u, align = 'left') {
  const s = 5 * u, gap = 2 * u, w = 3 * s + 2 * gap;
  let x0 = align === 'right' ? x - w : x;
  for (let k = 0; k < 3; k++) {
    const cx = x0 + s / 2 + k * (s + gap), cy = y - s / 2;
    c.beginPath(); c.moveTo(cx, cy - s / 2); c.lineTo(cx + s / 2, cy); c.lineTo(cx, cy + s / 2); c.lineTo(cx - s / 2, cy); c.closePath();
    c.fillStyle = k < n ? '#ffd23a' : '#3a302a'; c.fill();
  }
  return w;
}
const DIFFICULTY = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
const SETTINGS_KEY = 'elemental-arena-opcoes';

export function loadSettings() {
  const def = { shake: true, numbers: true, difficulty: 'normal', speed: 1, debug: false, sound: true, volume: 0.6, camera: 'auto', quality: 'auto' };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return def; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* armazenamento indisponível */ } }

function text(c, s, x, y, size, color, align = 'left', u = 1, stroke = true) {
  s = s.replace(/Í/g, 'I'); // a fonte não tem o Í maiúsculo (sairia minúsculo no meio da palavra)
  c.font = `${size * u}px ${FONT}`;
  c.textAlign = align;
  if (stroke) { c.lineWidth = 3 * u; c.strokeStyle = '#0c0806'; c.strokeText(s, x, y); }
  c.fillStyle = color;
  c.fillText(s, x, y);
}
function fitSize(c, s, size, maxW, u) {
  let sz = size;
  c.font = `${sz * u}px ${FONT}`;
  while (sz > 4 && c.measureText(s).width > maxW) { sz -= 0.5; c.font = `${sz * u}px ${FONT}`; }
  return sz;
}
function wrap(c, s, size, maxW, u) {
  c.font = `${size * u}px ${FONT}`;
  const words = s.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// Texto quebrado em linhas; devolve o y logo abaixo da última linha.
function para(c, s, x, y, size, maxW, color, align, u, lh = size + 3.5, max = 99) {
  for (const ln of wrap(c, s, size, maxW, u).slice(0, max)) { text(c, ln, x, y, size, color, align, u); y += lh * u; }
  return y;
}

// Escala da interface: 1 unidade = u px do canvas. No PC a tela lógica tem ~760×520. No celular (lado menor < 500 px
// CSS) a conta era só em px do canvas: com dpr 2 cada unidade virava meio pixel de tela e a letra 6 tinha 3 px no
// iPhone. Agora, em pé, a largura lógica é 340; deitado, a altura lógica é 360 (as telas têm layout próprio para isso).
export function uiScale(W, H, dpr = 1) {
  const phone = Math.min(W, H) / (dpr || 1) < 500, portrait = H > W * 1.05;
  let u = Math.max(1, Math.min(W / 760, H / 520));
  if (phone) u = portrait ? W / 340 : Math.min(W / 640, H / 360);
  return { u, phone, portrait };
}

function panel(c, x, y, w, h, u, border = '#5a4636', fill = 'rgba(18,12,10,0.92)') {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
  c.strokeStyle = border;
  c.lineWidth = 2 * u;
  c.strokeRect(x + u, y + u, w - 2 * u, h - 2 * u);
  c.fillStyle = 'rgba(255,255,255,0.06)';
  c.fillRect(x + 2 * u, y + 2 * u, w - 4 * u, 2 * u);
}
const matchText = (el) => {
  if (!ELEMENT_MULT[el]) return 'Neutro: sem vantagem nem fraqueza no triângulo';
  const strong = Object.keys(ELEMENT_MULT[el]).find((k) => ELEMENT_MULT[el][k] > 1);
  const weak = Object.keys(ELEMENT_MULT).find((k) => ELEMENT_MULT[k][el] > 1);
  const sTxt = strong ? `Forte contra ${ELEMENT_NAME[strong]}` : 'Sem vantagem de elemento';
  return weak ? `${sTxt} · fraco contra ${ELEMENT_NAME[weak]}` : sTxt;
};


export class UI {
  constructor(canvas, art, hooks) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.art = art;
    this.hooks = hooks; // { startBattle(cfg), applySettings(s) }
    this.settings = loadSettings();
    this.screen = 'menu';
    this.time = 0;
    this.mouse = { x: -1, y: -1 };
    this.buttons = [];
    this.focus = 0;
    this.fade = 1;
    this.team = [];
    this.arena = null;
    this.bestiaryLine = ROSTER[0];
    this.previews = {};
    this.overlay = null; // 'pause' | 'end' durante a batalha
    this.demo = null;
    this.flow = 'local'; // 'local' (contra a IA) | 'mp' (online)
    // Estado do multiplayer (preenchido pelo main.js a partir das mensagens do servidor).
    this.mp = { room: null, myId: null, error: null, errorT: 0, busy: false, code: '', status: '' };
  }

  mpError(msg) { this.mp.error = msg; this.mp.errorT = 5; this.mp.busy = false; }

  go(screen) {
    if (this.screen === screen) return;
    this.screen = screen;
    this.fade = 1;
    this.focus = 0;
  }

  // Fundo animado: uma luta IA × IA de verdade numa arena aleatória. A próxima luta é montada aos poucos (alguns
  // ms por quadro) enquanto a atual continua; antes a montagem parava o menu de uma vez (no iPhone, meio segundo).
  ensureDemo() {
    if (this.demo && !this.demo.world.over && this.demo.world.time < 90) return;
    this.demoJob ??= this.demoSteps();
    const t0 = performance.now();
    while (this.demoJob && performance.now() - t0 < 6) if (this.demoJob.next().done) this.demoJob = null;
  }

  *demoSteps() {
    const arena = ARENA_ORDER[(Math.random() * 3) | 0];
    const world = World.match((Math.random() * 1e6) | 0, undefined, null, arena);
    yield;
    const r = new Renderer(makeCanvas(8, 8));
    r.art = this.art;
    r.shakeEnabled = false;
    r.reset(world, false);
    yield;
    for (let row = 0; row < ROWS; row += 2) { r.paintRows(row, Math.min(ROWS, row + 2)); yield; }
    r.paintBaseExtras();
    this.demo = { renderer: r, world };
  }

  // Prévias das arenas, montadas aos poucos (alguns ms por quadro) desde o menu: antes as 4 eram montadas de uma
  // vez no clique de confirmar o time (~1 s parado no PC, vários segundos no iPhone). A tela de arenas mostra
  // "carregando" no cartão que ainda não ficou pronto.
  buildPreviews(budgetMs = 6) {
    const t0 = performance.now();
    do {
      if (!this.previewJob) {
        const id = ARENA_ORDER.find((a) => !this.previews[a]);
        if (!id) { this.previewR = null; return; } // prontas: libera os buffers
        this.previewJob = this.previewSteps(id);
      }
      if (this.previewJob.next().done) this.previewJob = null;
    } while (performance.now() - t0 < budgetMs);
  }

  *previewSteps(id) {
    const world = World.match(7, undefined, null, id);
    yield;
    for (let k = 0; k < 30; k++) world.step(1 / 60);
    yield;
    const r = this.previewR || (this.previewR = new Renderer(makeCanvas(8, 8)));
    r.art = this.art;
    r.reset(world, false);
    yield;
    for (let row = 0; row < ROWS; row += 2) { r.paintRows(row, Math.min(ROWS, row + 2)); yield; }
    r.paintBaseExtras();
    r.render(world, 1, 1 / 60, { dpr: 1, embedded: true, speed: 1 });
    const img = makeCanvas(WORLD_W, WORLD_H);
    img.getContext('2d').drawImage(r.low, 0, 0);
    this.previews[id] = img;
  }

  // ───────────── Entrada ─────────────
  pointerMove(x, y) { this.mouse = { x, y }; }
  pointerDown(x, y) {
    this.mouse = { x, y };
    this.lastInput = this.time;
    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { if (!b.disabled) { this.hooks.sfx?.('click'); b.onClick(); } else this.hooks.sfx?.('deny'); return true; }
    }
    return false;
  }
  keyDown(code, key = '') {
    if (this.screen === 'mp') {
      if (/^[a-zA-Z0-9]$/.test(key) && !this.mp.busy) { if (this.mp.code.length < 4) this.mp.code += key.toUpperCase(); return true; }
      if (code === 'Backspace' && this.mp.code) { this.mp.code = this.mp.code.slice(0, -1); return true; }
      if (code === 'Enter' && this.mp.code.length === 4 && !this.mp.busy) { this.hooks.mpJoin(this.mp.code); return true; }
    }
    const list = this.buttons.filter((b) => !b.disabled && !b.noFocus);
    if (!list.length) return false;
    if (code === 'ArrowDown' || code === 'ArrowRight' || code === 'KeyS' || code === 'KeyD' || code === 'Tab') { this.focus = (this.focus + 1) % list.length; return true; }
    if (code === 'ArrowUp' || code === 'ArrowLeft' || code === 'KeyW' || code === 'KeyA') { this.focus = (this.focus - 1 + list.length) % list.length; return true; }
    if (code === 'Enter' || code === 'Space') { this.hooks.sfx?.('click'); list[Math.min(this.focus, list.length - 1)].onClick(); return true; }
    if (code === 'Escape' || code === 'Backspace') {
      const back = this.buttons.find((b) => b.back);
      if (back) { back.onClick(); return true; }
    }
    return false;
  }

  button(x, y, w, h, label, onClick, opts = {}) {
    const b = { x, y, w, h, label, onClick, ...opts };
    this.buttons.push(b);
    return b;
  }

  drawButtons(u) {
    const c = this.c;
    const focusable = this.buttons.filter((b) => !b.disabled && !b.noFocus);
    for (const b of this.buttons) {
      if (b.custom) continue;
      const hover = this.mouse.x >= b.x && this.mouse.x <= b.x + b.w && this.mouse.y >= b.y && this.mouse.y <= b.y + b.h;
      const focused = focusable[this.focus] === b;
      const on = (hover || focused) && !b.disabled;
      c.fillStyle = b.disabled ? 'rgba(30,24,20,0.8)' : on ? (b.color || '#ffd23a') : 'rgba(24,16,12,0.92)';
      c.fillRect(b.x, b.y, b.w, b.h);
      c.strokeStyle = b.disabled ? '#3a302a' : b.color || '#ffd23a';
      c.lineWidth = 2 * u;
      c.strokeRect(b.x + u, b.y + u, b.w - 2 * u, b.h - 2 * u);
      const sz = fitSize(c, b.label, b.size || 9, b.w - 16 * u, u);
      text(c, b.label, b.x + b.w / 2, b.y + b.h / 2 + sz * u * 0.45, sz, b.disabled ? '#665' : on ? '#140c08' : '#f4ead0', 'center', u, !on);
      if (on) text(c, '▶', b.x - 12 * u, b.y + b.h / 2 + 4 * u, 8, b.color || '#ffd23a', 'center', u);
    }
  }

  // Desenha a arte de uma forma, animada, com escala inteira.
  drawMonsterArt(def, x, y, scale, seed = 0, flip = false) {
    const c = this.c;
    if (!this.art.has(def.sprite)) return 0;
    const f = this.art.render('ui:' + def.key + ':' + seed, def.sprite, { t: this.time + seed, walk: 0, moving: 0, crouch: 0, lunge: 0, dash: 0, dead: 0, seed, power: 0, flames: def.element === 'fire' ? (def.stage > 1 ? 6 : 3) : 0 });
    c.save();
    c.imageSmoothingEnabled = false;
    c.translate(Math.round(x), Math.round(y));
    if (def.element === 'electric') {
      // Cauda de raio (a mesma do jogo), desenhada num buffer pequeno e ampliada atrás do gato.
      const tw = f.w + 60, th = f.h + 30;
      this.tailBuf ??= makeCanvas(tw, th);
      const tb = this.tailBuf;
      if (tb.width !== tw || tb.height !== th) { tb.width = tw; tb.height = th; }
      const g = tb.getContext('2d');
      g.clearRect(0, 0, tw, th);
      const big = def.stage > 1;
      drawTail(g, tw / 2, f.ay + 10 - f.top * (big ? 0.22 : 0.3), flip ? -1 : 1, big ? 1.1 : 0.85, this.time, seed + 3, 0, f.w * 0.25);
      c.drawImage(tb, -(tw / 2) * scale, -(f.ay + 10) * scale, tw * scale, th * scale);
    }
    if (flip) c.scale(-1, 1);
    c.drawImage(f.canvas, -f.ax * scale, -f.ay * scale, f.w * scale, f.h * scale);
    c.restore();
    return f.top * scale;
  }

  // Celular (lado menor da tela < 500 px CSS): escala maior e telas com layout compacto (ver uiScale).
  // Também usada pelos menus sobre a batalha (main.js), que não passam por render().
  scale(W, H, dpr) {
    const { u, phone, portrait } = uiScale(W, H, dpr);
    this.phone = phone; this.portrait = portrait;
    return u;
  }

  // ───────────── Quadro ─────────────
  render(dt, dpr) {
    this.time += dt;
    this.fade = Math.max(0, this.fade - dt * 4);
    const c = this.c, W = this.canvas.width, H = this.canvas.height;
    const u = this.scale(W, H, dpr);
    this.buttons = [];
    // Fundo: luta de demonstração escurecida.
    this.ensureDemo();
    // Aparelho lento no menu (média dos quadros acima de ~22 ms): fundo e prévias ficam ainda mais econômicos.
    this.slow = (this.slow ?? 0.016) * 0.95 + Math.min(0.1, dt) * 0.05;
    const lite = this.slow > 0.022;
    // Prévias das arenas: na escolha do time só quando ninguém está tocando (não engasga a escolha); na tela de
    // arenas, com mais tempo por quadro. No menu inicial não (era o que deixava o menu pesado no iPhone).
    if (this.screen === 'arena') this.buildPreviews(lite ? 8 : 12);
    else if (this.screen === 'team' && this.fade <= 0 && this.time - (this.lastInput ?? -9) > 1) this.buildPreviews(lite ? 2 : 4);
    const d = this.demo;
    if (d) {
      if (dt > 0) for (let k = 0; k < Math.round(dt * 60); k++) d.world.step(1 / 60);
      // A luta de fundo fica escurecida atrás do menu: redesenhada a 30 quadros/s (15 no aparelho lento).
      this.demoDt = (this.demoDt || 0) + dt;
      this.demoN = ((this.demoN || 0) + 1) % (lite ? 4 : 2);
      if (this.demoN === 0 || !d.drawn) { d.renderer.render(d.world, 1, this.demoDt, { dpr, embedded: true, speed: 1 }); this.demoDt = 0; d.drawn = true; }
      c.imageSmoothingEnabled = false;
      const S = Math.max(W / WORLD_W, H / WORLD_H);
      c.drawImage(d.renderer.low, (W - WORLD_W * S) / 2, (H - WORLD_H * S) / 2, WORLD_W * S, WORLD_H * S);
    } else { c.fillStyle = '#14100e'; c.fillRect(0, 0, W, H); } // primeira luta de fundo ainda montando
    const grd = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.9);
    grd.addColorStop(0, 'rgba(10,6,4,0.55)');
    grd.addColorStop(1, 'rgba(10,6,4,0.9)');
    c.fillStyle = grd;
    c.fillRect(0, 0, W, H);
    if (this.screen === 'menu') this.renderMenu(u, W, H);
    else if (this.screen === 'team') this.renderTeam(u, W, H);
    else if (this.screen === 'arena') this.renderArena(u, W, H);
    else if (this.screen === 'bestiary') this.renderBestiary(u, W, H);
    else if (this.screen === 'options') this.renderOptions(u, W, H);
    else if (this.screen === 'mp') this.renderMp(u, W, H);
    else if (this.screen === 'lobby') this.renderLobby(u, W, H);
    if (this.mp.errorT > 0 && this.mp.error) {
      this.mp.errorT -= dt;
      const sz = fitSize(this.c, this.mp.error, 7, W - 30 * u, u);
      this.c.fillStyle = 'rgba(80,10,16,0.92)';
      this.c.fillRect(0, H - 56 * u, W, 24 * u);
      text(this.c, this.mp.error, W / 2, H - 40 * u, sz, '#ffd0d0', 'center', u);
    }
    this.drawButtons(u);
    if (this.screen === 'menu' && this.newTag) {
      const { x, y } = this.newTag, b = Math.round(Math.sin(this.time * 6) * 1.5 * u);
      c.fillStyle = '#e8203a'; c.fillRect(x - 18 * u, y - 9 * u + b, 38 * u, 12 * u);
      text(c, 'NOVO!', x + u, y + b, 6, '#ffffff', 'center', u);
    }
    if (this.fade > 0) { c.fillStyle = `rgba(0,0,0,${this.fade})`; c.fillRect(0, 0, W, H); }
  }

  renderMenu(u, W, H) {
    const c = this.c;
    const cx = W / 2, t = this.time;
    // Fundo: a luta de demonstração fica escurecida por uma vinheta, com brilhos subindo nas cores dos elementos.
    const vg = c.createRadialGradient(cx, H * 0.45, H * 0.15, cx, H * 0.45, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(12,10,26,0.25)'); vg.addColorStop(1, 'rgba(6,4,14,0.9)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    const MOTE = ['#ff8a3a', '#46b4ff', '#7ad84a', '#d8a060', '#ffe24a', '#d07aff'];
    for (let k = 0; k < 46; k++) {
      const h1 = ((k * 97.3) % 1000) / 1000, h2 = ((k * 61.7) % 1000) / 1000;
      const x = h1 * W + Math.sin(t * 0.7 + k) * 10 * u;
      const y = H - ((t * (12 + h2 * 22) * u + h2 * H) % (H + 20 * u));
      c.globalAlpha = 0.25 + 0.45 * Math.abs(Math.sin(t * 1.5 + k));
      c.fillStyle = MOTE[k % MOTE.length];
      const sz = (k % 3 ? 1 : 2) * u;
      c.fillRect(Math.round(x), Math.round(y), sz, sz);
    }
    c.globalAlpha = 1;

    // Título: letras nas cores dos elementos, sombra funda e um brilho que passa por cima.
    const title = 'ELEMENTAL ARENA';
    const ts = Math.min(30, (W / u) / (this.phone && this.portrait ? 18 : 22));
    c.font = `${ts * u}px ${FONT}`;
    const tw = c.measureText(title).width;
    const ty = H * 0.13;
    const cols = ['#ff8a3a', '#ffb040', '#ffd860', '#ffe24a', '#8fd8ff', '#46b4ff', '#7ad84a', '#a8f070', '#d8a060', '#d07aff', '#ff9ae6'];
    const sweep = ((t * 0.35) % 1.6) - 0.3; // posição do brilho (0..1 = da esquerda à direita)
    let x = cx - tw / 2;
    for (let k = 0; k < title.length; k++) {
      const ch = title[k], y = ty + Math.sin(t * 2.4 + k * 0.5) * 2.5 * u;
      const cw = c.measureText(ch).width;
      text(c, ch, x + 3 * u, y + 3 * u, ts, '#120a1e', 'left', u, false);
      const shine = Math.abs((x + cw / 2 - (cx - tw / 2)) / tw - sweep) < 0.06;
      text(c, ch, x, y, ts, shine ? '#ffffff' : cols[Math.floor((k / title.length) * cols.length)], 'left', u);
      x += cw;
    }
    const tagline = `Duelo de monstros elementais em tempo real · ${ROSTER.length} monstros · 6 elementos · online até 4 jogadores`;
    para(c, tagline, cx, ty + 22 * u, this.phone ? 6.5 : 6, W - 24 * u, '#e8dcc0', 'center', u);

    // Palco giratório: os monstros num anel em perspectiva (os da frente maiores e mais claros).
    // Celular deitado (só 360 de altura lógica): palco à esquerda e botões numa coluna à direita.
    const side = this.phone && !this.portrait;
    const sx = side ? W * 0.3 : cx;
    const N = ROSTER.length, sy = H * (side ? 0.56 : 0.43), rx = Math.min(W * (side ? 0.22 : 0.36), 300 * u), ry = 34 * u;
    c.save();
    const pg = c.createRadialGradient(sx, sy, 4 * u, sx, sy, rx + 30 * u);
    pg.addColorStop(0, 'rgba(70,52,110,0.55)'); pg.addColorStop(1, 'rgba(20,14,36,0)');
    c.fillStyle = pg; c.beginPath(); c.ellipse(sx, sy, rx + 30 * u, ry + 14 * u, 0, 0, Math.PI * 2); c.fill();
    for (let k = 0; k < 64; k++) { // anel pontilhado girando nas cores dos elementos
      const a = (k / 64) * Math.PI * 2 + t * 0.25;
      c.fillStyle = MOTE[k % MOTE.length]; c.globalAlpha = 0.35 + 0.35 * Math.max(0, Math.cos(a));
      c.fillRect(Math.round(sx + Math.sin(a) * (rx + 12 * u)), Math.round(sy + Math.cos(a) * (ry + 6 * u)), 2 * u, u);
    }
    c.restore();
    const items = ROSTER.map((key, k) => {
      const a = t * 0.32 + (k / N) * Math.PI * 2;
      return { key, k, x: sx + Math.sin(a) * rx, depth: Math.cos(a), y: sy + Math.cos(a) * ry };
    }).sort((p, q) => p.depth - q.depth);
    const front = items[items.length - 1];
    for (const it of items) {
      const base = SPECIES[it.key], f = (it.depth + 1) / 2; // 0 = fundo, 1 = frente
      const scale = Math.max(1, Math.round((1.1 + 1.2 * f) * u));
      c.globalAlpha = 0.35 + 0.65 * f;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.beginPath(); c.ellipse(it.x, it.y + 2 * u, (10 + 8 * f) * u, (3 + 2 * f) * u, 0, 0, Math.PI * 2); c.fill();
      if (it === front) {
        // Destaque: a evolução aparece como um fantasma atrás, e um anel na cor do elemento no chão.
        const evo = SPECIES[base.evolvesTo];
        c.globalAlpha = 0.22;
        this.drawMonsterArt(evo, it.x + 26 * u, it.y - 10 * u, Math.max(1, Math.round(1.6 * u)), it.k + 20);
        c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        c.strokeStyle = ELEMENT_COLOR[base.element]; c.lineWidth = 1.5 * u;
        c.beginPath(); c.ellipse(it.x, it.y + 2 * u, 20 * u, 6 * u, 0, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
      }
      this.drawMonsterArt(base, it.x, it.y + Math.sin(t * 2 + it.k) * 1.5 * u * f, scale, it.k, it.x > sx + 4 * u);
      c.globalAlpha = 1;
    }
    // Ficha do monstro em destaque.
    {
      const def = SPECIES[front.key], col = ELEMENT_COLOR[def.element];
      const fy = sy + ry + 20 * u;
      text(c, def.name.toUpperCase(), sx, fy, 11, col, 'center', u);
      const sub = `${ELEMENT_NAME[def.element]} · ${def.profile.personality}${def.sig ? ` · ${def.sig.name}` : ''}`;
      text(c, sub, sx, fy + 12 * u, fitSize(c, sub, this.phone ? 7 : 6, side ? W * 0.56 : W - 24 * u, u), '#e8dcc0', 'center', u);
    }

    // Botões (embaixo do palco). No celular, mais altos (dedo).
    const bw = Math.min(230 * u, side ? W * 0.4 : W), bh = (this.phone ? 30 : 24) * u, gapB = 6 * u;
    const bx = side ? W * 0.76 : cx;
    let by = side ? Math.max(H * 0.2, (H - 6 * (bh + gapB)) / 2 + 24 * u) : Math.max(sy + ry + 44 * u, H - 6 * (bh + gapB) - 18 * u);
    // Tutorial: primeiro da lista e com selo NOVO! até ser concluído uma vez.
    let tutDone = true;
    try { tutDone = !!localStorage.getItem(TUTORIAL_KEY); } catch { /* sem armazenamento */ }
    const tutBtn = () => {
      this.button(bx - bw / 2, by, bw, bh, 'TUTORIAL', () => this.hooks.startTutorial(), { color: '#e8b8ff', size: tutDone ? 9 : 10 });
      if (!tutDone) {
        this.newTag = { x: bx + bw / 2 - 22 * u, y: by + 2 * u }; // selo desenhado depois dos botões (render)
      }
      by += bh + gapB;
    };
    this.newTag = null;
    if (!tutDone) tutBtn();
    this.button(bx - bw / 2, by, bw, bh, 'JOGAR CONTRA A IA', () => { this.team = []; this.flow = 'local'; this.go('team'); }, { size: 10 });
    by += bh + gapB;
    this.button(bx - bw / 2, by, bw, bh, 'MULTIPLAYER ONLINE', () => { this.team = this.team.length === 3 ? this.team : []; this.flow = 'mp'; this.go('team'); }, { color: '#ff8a3a', size: 10 });
    by += bh + gapB;
    this.button(bx - bw / 2, by, bw, bh, 'TREINAMENTO', () => { this.team = []; this.flow = 'training'; this.go('team'); }, { color: '#d8c08a' });
    by += bh + gapB;
    if (tutDone) tutBtn();
    this.button(bx - bw / 2, by, bw, bh, 'MONSTROS', () => this.go('bestiary'), { color: '#7ad84a' });
    by += bh + gapB;
    this.button(bx - bw / 2, by, bw, bh, 'OPÇÕES', () => this.go('options'), { color: '#46b4ff' });
    if (!this.touchMode) text(c, 'Mouse ou setas + Enter', cx, H - 8 * u, 5, '#887', 'center', u);
  }

  // Troca de time de dentro da sala: abre a montagem de time já preenchida; CONFIRMAR envia e volta para a sala.
  editRoomTeam(team) {
    this.team = Array.isArray(team) ? [...team] : [];
    this.flow = 'mpEdit';
    this.go('team');
  }

  renderTeam(u, W, H) {
    const c = this.c, cx = W / 2;
    const training = this.flow === 'training', editing = this.flow === 'mpEdit';
    // Saiu da sala (conexão caiu ou partida começou) enquanto editava: nada a confirmar.
    if (editing && !this.mp.room) { this.flow = 'mp'; this.go('menu'); return; }
    text(c, editing ? `TROCAR TIME · SALA ${this.mp.room.code}` : this.flow === 'mp' ? 'SEU TIME PARA O ONLINE' : training ? 'TREINAMENTO' : 'MONTE SEU TIME', cx, 30 * u, 13, '#ffe9b0', 'center', u);
    // Celular: cartões só com arte, nome e elemento (letra maior) e um painel embaixo com a mecânica do monstro
    // tocado. Antes os 10 cartões com todos os textos ficavam com letra de ~3 px num celular deitado.
    const compact = this.phone;
    if (!compact) text(c, training ? 'Escolha de 1 a 3 monstros para treinar contra bonecos de pano (troque com 1/2/3).' : `Escolha 3 dos ${ROSTER.length} monstros, na ordem em que vão entrar (o 1º começa em campo).`, cx, 46 * u, 6, '#d8ccb0', 'center', u);
    const gap = (compact ? 5 : 8) * u, top = (compact ? 40 : 56) * u, btnH = 28 * u, btnY = H - btnH - 10 * u, orderH = 30 * u;
    const detailH = compact ? (this.portrait ? 70 : 48) * u : 0;
    const avail = btnY - orderH - 10 * u - top - detailH;
    const COLS = compact && this.portrait ? (W / u < 420 ? 2 : 3) : ROSTER.length > 8 ? 5 : ROSTER.length > 6 ? 4 : 3, ROWS = Math.ceil(ROSTER.length / COLS);
    const focus = SPECIES[this.teamFocus] ? this.teamFocus : this.team[this.team.length - 1] || ROSTER[0];
    const ch = Math.floor((avail - gap * (ROWS - 1)) / ROWS);
    const cw = Math.min(Math.floor((W - 24 * u - gap * (COLS - 1)) / COLS), 240 * u);
    const x0 = cx - (cw * COLS + gap * (COLS - 1)) / 2;
    ROSTER.forEach((key, k) => {
      const def = SPECIES[key];
      const x = x0 + (k % COLS) * (cw + gap), y = top + Math.floor(k / COLS) * (ch + gap);
      const idx = this.team.indexOf(key);
      const hover = this.mouse.x >= x && this.mouse.x <= x + cw && this.mouse.y >= y && this.mouse.y <= y + ch;
      panel(c, x, y, cw, ch, u, idx >= 0 ? '#ffd23a' : hover || (compact && key === focus) ? ELEMENT_COLOR[def.element] : '#5a4636');
      if (compact) {
        this.teamCardCompact(def, key, k, x, y, cw, ch, idx, u);
        return;
      }
      const model = this.art.models[def.sprite];
      const scale = Math.max(1, Math.min(3, Math.floor((ch * 0.4) / (model ? model.h : 36))));
      const artH = (model ? model.h : 36) * scale;
      this.drawMonsterArt(def, x + cw / 2, y + 10 * u + artH, scale, k);
      let ly = y + 10 * u + artH + 14 * u;
      text(c, def.name.toUpperCase(), x + cw / 2, ly, fitSize(c, def.name.toUpperCase(), 8, cw - 14 * u, u), ELEMENT_COLOR[def.element], 'center', u);
      ly += 11 * u;
      text(c, `${ELEMENT_NAME[def.element]} · ${def.profile.personality}`, x + cw / 2, ly, fitSize(c, `${ELEMENT_NAME[def.element]} · ${def.profile.personality}`, 5, cw - 14 * u, u), '#bba', 'center', u);
      ly += 10 * u;
      if (def.sig) {
        const lbl = `MECÂNICA: ${def.sig.name.toUpperCase()}`;
        text(c, lbl, x + cw / 2, ly, fitSize(c, lbl, 5, cw - 14 * u, u), SIG_COLOR[def.sig.kind] || '#fff', 'center', u);
        ly += 10 * u;
      }
      for (const tr of def.traits) for (const line of wrap(c, '· ' + tr, 4.5, cw - 16 * u, u)) {
        if (ly > y + ch - 16 * u) break;
        text(c, line, x + 8 * u, ly, 4.5, '#e8dcc0', 'left', u);
        ly += 8.5 * u;
      }
      text(c, `Evolui: ${SPECIES[def.evolvesTo].name}`, x + cw / 2, y + ch - 7 * u, fitSize(c, `Evolui: ${SPECIES[def.evolvesTo].name}`, 4.5, cw - 10 * u, u), '#e8b8ff', 'center', u);
      if (idx >= 0) {
        c.fillStyle = '#ffd23a';
        c.fillRect(x + 6 * u, y + 6 * u, 20 * u, 20 * u);
        text(c, String(idx + 1), x + 16 * u, y + 21 * u, 10, '#140c08', 'center', u, false);
      }
      if (def.difficulty) diffMarks(c, def.difficulty, x + cw - 8 * u, y + 14 * u, u, 'right');
      if (hover && def.tips) {
        // Dica ao passar o mouse: como jogar contra (e com) este monstro.
        const lines = wrap(c, def.tips, 4.5, cw - 16 * u, u).slice(0, 3);
        c.fillStyle = 'rgba(10,6,4,0.92)'; c.fillRect(x + 4 * u, y + ch - 14 * u - lines.length * 8 * u, cw - 8 * u, lines.length * 8 * u + 4 * u);
        lines.forEach((ln, j) => text(c, ln, x + 8 * u, y + ch - 10 * u - (lines.length - 1 - j) * 8 * u - 2 * u, 4.5, '#ffe066', 'left', u));
      }
      this.button(x, y, cw, ch, '', () => {
        if (idx >= 0) this.team.splice(idx, 1);
        else if (this.team.length < 3) this.team.push(key);
      }, { custom: true });
    });
    // Ordem escolhida.
    const sy = top + ROWS * ch + (ROWS - 1) * gap + 8 * u;
    if (compact) this.teamDetail(SPECIES[focus], cx, sy + orderH, Math.min(W - 24 * u, 720 * u), detailH - 4 * u, u);
    for (let k = 0; k < 3; k++) {
      const key = this.team[k];
      const sw = Math.min(108 * u, (W - 32 * u) / 3 - 8 * u), x = cx + (k - 1) * (sw + 20 * u) - sw / 2;
      panel(c, x, sy, sw, 22 * u, u, key ? ELEMENT_COLOR[SPECIES[key].element] : '#3a302a');
      text(c, `${k + 1}º ${key ? SPECIES[key].name : '—'}`, x + sw / 2, sy + 15 * u, fitSize(c, `${k + 1}º ${key ? SPECIES[key].name : '—'}`, compact ? 7 : 6, sw - 8 * u, u), key ? '#fff' : '#776', 'center', u);
    }
    const bw = Math.min(150 * u, (W - 40 * u) / 3), bgap = Math.min(25 * u, (W - bw * 3) / 4);
    this.button(cx - bw * 1.5 - bgap, btnY, bw, btnH, editing ? 'CANCELAR' : 'VOLTAR', () => { if (editing) { this.flow = 'mp'; this.go('lobby'); } else this.go('menu'); }, { back: true, color: '#aa9' });
    this.button(cx - bw / 2, btnY, bw, btnH, 'ALEATÓRIO', () => { this.team = [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3); }, { color: '#e8b8ff' });
    const next = () => {
      if (editing) { this.hooks.mpSend({ t: 'team', team: [...this.team] }); this.flow = 'mp'; this.go('lobby'); }
      else this.go(this.flow === 'mp' ? 'mp' : 'arena');
    };
    this.button(cx + bw / 2 + bgap, btnY, bw, btnH, editing ? 'CONFIRMAR' : 'CONTINUAR', next, { disabled: training ? this.team.length < 1 : this.team.length !== 3 });
  }

  // Cartão compacto (celular): arte grande, nome, elemento e a ordem escolhida. Tocar escolhe/tira e mostra os
  // detalhes no painel de baixo.
  teamCardCompact(def, key, k, x, y, cw, ch, idx, u) {
    const c = this.c, model = this.art.models[def.sprite];
    const textH = 28 * u;
    const scale = Math.max(1, Math.min(3, Math.floor((ch - textH - 8 * u) / (model ? model.h : 36))));
    const artH = (model ? model.h : 36) * scale;
    this.drawMonsterArt(def, x + cw / 2, y + 4 * u + Math.min(artH, ch - textH - 4 * u), scale, k);
    const name = def.name.toUpperCase();
    text(c, name, x + cw / 2, y + ch - 16 * u, fitSize(c, name, 9, cw - 8 * u, u), ELEMENT_COLOR[def.element], 'center', u);
    const sub = `${ELEMENT_NAME[def.element]} · ${def.profile.personality}`;
    text(c, sub, x + cw / 2, y + ch - 6 * u, fitSize(c, sub, 6, cw - 8 * u, u), '#d8ccb0', 'center', u);
    if (idx >= 0) {
      c.fillStyle = '#ffd23a'; c.fillRect(x + 4 * u, y + 4 * u, 18 * u, 18 * u);
      text(c, String(idx + 1), x + 13 * u, y + 18 * u, 10, '#140c08', 'center', u, false);
    }
    if (def.difficulty) diffMarks(c, def.difficulty, x + cw - 6 * u, y + 12 * u, u, 'right');
    this.button(x, y, cw, ch, '', () => {
      this.teamFocus = key;
      if (idx >= 0) this.team.splice(idx, 1);
      else if (this.team.length < 3) this.team.push(key);
    }, { custom: true });
  }

  // Painel de detalhes do monstro tocado (celular): mecânica, como joga e o ponto fraco.
  teamDetail(def, cx, y, w, h, u) {
    const c = this.c, x = cx - w / 2;
    if (h < 20 * u) return;
    panel(c, x, y, w, h, u, ELEMENT_COLOR[def.element]);
    const head = `${def.name.toUpperCase()} → ${SPECIES[def.evolvesTo]?.name || ''}   ·   ${def.sig ? def.sig.name.toUpperCase() : ''}`;
    text(c, head, x + 8 * u, y + 13 * u, fitSize(c, head, 7, w - 16 * u, u), SIG_COLOR[def.sig?.kind] || '#ffe9b0', 'left', u);
    const body = def.sig?.desc || def.traits.join(' · ');
    const lines = wrap(c, body, 6, w - 16 * u, u);
    const room = Math.max(1, Math.floor((h - 18 * u) / (9 * u)));
    lines.slice(0, room).forEach((ln, j) => text(c, ln, x + 8 * u, y + 24 * u + j * 9 * u, 6, '#e8dcc0', 'left', u));
  }

  // ───────────── Multiplayer: criar / entrar em sala ─────────────
  renderMp(u, W, H) {
    const c = this.c, cx = W / 2, mp = this.mp;
    const tall = this.phone && this.portrait, sz = this.phone ? 7 : 6, maxW = W - 24 * u;
    text(c, 'MULTIPLAYER ONLINE', cx, 36 * u, fitSize(c, 'MULTIPLAYER ONLINE', 14, maxW, u), '#ffe9b0', 'center', u);
    const mine = 'Seu time: ' + this.team.map((k) => SPECIES[k].name).join(' · ');
    text(c, mine, cx, 54 * u, fitSize(c, mine, sz, maxW, u), '#d8ccb0', 'center', u);
    const bw = 250 * u, bh = (this.phone ? 32 : 30) * u;
    let y = (tall ? 86 : 82) * u;
    y = para(c, 'CRIAR UMA SALA (você recebe um código para os amigos)', cx, y, sz, maxW, '#e8dcc0', 'center', u) - (sz + 3.5) * u + 10 * u;
    const bw3 = Math.min(bw * 0.66, (W - 40 * u) / 3 - 6 * u);
    this.button(cx - bw3 * 1.5 - 6 * u, y, bw3, bh, 'SALA 1v1', () => this.hooks.mpCreate('1v1'), { color: '#ff8a3a', disabled: mp.busy });
    this.button(cx - bw3 / 2, y, bw3, bh, 'SALA 2v2', () => this.hooks.mpCreate('2v2'), { color: '#ff8a3a', disabled: mp.busy });
    this.button(cx + bw3 / 2 + 6 * u, y, bw3, bh, 'SALA 1v1v1v1', () => this.hooks.mpCreate('ffa'), { color: '#ff5a8a', disabled: mp.busy });
    y += bh + (tall ? 36 : 30) * u;
    const how = this.touchMode ? 'OU ENTRAR COM UM CÓDIGO (toque nos quadrados para digitar)' : 'OU ENTRAR COM UM CÓDIGO (4 caracteres, digite no teclado)';
    y = para(c, how, cx, y, sz, maxW, '#e8dcc0', 'center', u) - (sz + 3.5) * u + 12 * u;
    const bx = (tall ? 52 : 44) * u, gp = 8 * u, tot = bx * 4 + gp * 3;
    for (let k = 0; k < 4; k++) {
      const x = cx - tot / 2 + k * (bx + gp);
      panel(c, x, y, bx, bx, u, k === mp.code.length ? '#ffd23a' : '#5a4636');
      const ch = mp.code[k];
      if (ch) text(c, ch, x + bx / 2, y + bx * 0.66, 18, '#ffffff', 'center', u);
      else if (k === mp.code.length && Math.floor(this.time * 2) % 2 === 0) text(c, '_', x + bx / 2, y + bx * 0.7, 16, '#ffd23a', 'center', u);
    }
    // Toque nos quadrados: abre o teclado da tela (tablet/celular sem teclado físico).
    this.button(cx - tot / 2, y, tot, bx, '', () => this.hooks.mpFocusCode?.(), { custom: true, noFocus: true });
    y += bx + 12 * u;
    this.button(cx - 100 * u, y, 200 * u, bh, mp.busy ? 'CONECTANDO...' : 'ENTRAR NA SALA', () => this.hooks.mpJoin(mp.code), { color: '#7ad84a', disabled: mp.code.length !== 4 || mp.busy });
    y += bh + 14 * u;
    if (mp.status) para(c, mp.status, cx, y, sz, maxW, '#ffe066', 'center', u, sz + 3.5, 2);
    const backH = (this.phone ? 32 : 28) * u;
    const note = 'Todos precisam abrir o jogo pelo mesmo endereço do servidor.';
    if (this.phone) para(c, note, cx, H - backH - 30 * u, 6, maxW, '#887', 'center', u, 9, 2);
    else text(c, note, cx, H - backH - 22 * u, fitSize(c, note, 5, maxW, u), '#887', 'center', u);
    this.button(cx - 75 * u, H - backH - 10 * u, 150 * u, backH, 'VOLTAR', () => { this.go('team'); }, { back: true, color: '#aa9' });
  }

  // ───────────── Multiplayer: sala de espera ─────────────
  renderLobby(u, W, H) {
    const c = this.c, cx = W / 2, mp = this.mp;
    const room = mp.room;
    if (!room) { this.go('mp'); return; }
    // Celular em pé (340 de largura lógica): tudo numa coluna, com as vagas uma embaixo da outra.
    const tall = this.phone && this.portrait;
    const isHost = room.host === mp.myId;
    const me = room.players.find((p) => p.id === mp.myId);
    const copied = mp.copiedAt && performance.now() - mp.copiedAt < 2000;
    const copy = () => { this.hooks.mpCopyLink?.(room.code).then((ok) => { mp.copiedAt = ok ? performance.now() : 0; if (!ok) this.mpError('Não foi possível copiar. Passe o código: ' + room.code); }); };
    const hint = 'Passe o código (ou o link) aos amigos para eles entrarem.';
    let y;
    if (tall) {
      text(c, 'SALA', cx - 52 * u, 30 * u, 10, '#bba', 'center', u);
      text(c, room.code, cx + 24 * u, 32 * u, 22, '#ffe066', 'center', u);
      y = para(c, hint, cx, 48 * u, 6.5, W - 24 * u, '#d8ccb0', 'center', u);
      this.button(cx - 90 * u, y - 4 * u, 180 * u, 24 * u, copied ? 'LINK COPIADO!' : 'COPIAR LINK', copy, { color: '#46b4ff', size: 7 });
      y += 26 * u;
    } else {
      text(c, 'SALA', cx - 70 * u, 34 * u, 10, '#bba', 'center', u);
      text(c, room.code, cx + 20 * u, 36 * u, 22, '#ffe066', 'center', u);
      text(c, hint, cx, 52 * u, this.phone ? 6.5 : 6, '#d8ccb0', 'center', u);
      this.button(cx + 90 * u, 20 * u, 150 * u, 22 * u, copied ? 'LINK COPIADO!' : 'COPIAR LINK', copy, { color: '#46b4ff', size: 7 });
      y = 62 * u;
    }
    const arenaName = ARENAS[room.arena].name;
    // Configuração (só o anfitrião muda).
    const bw = tall ? (W - 30 * u) / 2 : 190 * u, bh = (this.phone ? 26 : 24) * u, bgap = (tall ? 5 : 6) * u;
    this.button(cx - bw - bgap, y, bw, bh, `MODO: ${room.mode === 'ffa' ? '1v1v1v1' : room.mode}`, () => this.hooks.mpSend({ t: 'config', mode: { '1v1': '2v2', '2v2': 'ffa', ffa: '1v1' }[room.mode] || '1v1' }), { disabled: !isHost, color: '#ff8a3a', size: 8 });
    const ai = ARENA_ORDER.indexOf(room.arena);
    this.button(cx + bgap, y, bw, bh, `ARENA: ${arenaName}`, () => this.hooks.mpSend({ t: 'config', arena: ARENA_ORDER[(ai + 1) % ARENA_ORDER.length] }), { disabled: !isHost, color: '#46b4ff', size: 7 });
    y += bh + 6 * u;
    // Robôs: dificuldade e completar as vagas livres.
    const LV = ['easy', 'normal', 'hard'], lvl = room.botLevel || 'normal';
    const free = room.seats - room.players.length;
    this.button(cx - bw - bgap, y, bw, bh, `ROBÔS: ${DIFFICULTY[lvl].toUpperCase()}`, () => this.hooks.mpSend({ t: 'config', botLevel: LV[(LV.indexOf(lvl) + 1) % 3] }), { disabled: !isHost, color: '#b8a0ff', size: 7 });
    this.button(cx + bgap, y, bw, bh, 'COMPLETAR COM ROBÔS', () => this.hooks.mpSend({ t: 'fillBots' }), { disabled: !isHost || free <= 0, color: '#b8a0ff', size: 7 });
    y += bh + 4 * u;
    const onlyHost = 'Só o anfitrião muda o modo, a arena e os robôs.';
    if (!isHost) text(c, onlyHost, cx, y + 6 * u, fitSize(c, onlyHost, this.phone ? 6 : 5, W - 24 * u, u), '#887', 'center', u);
    y += 12 * u;
    // Rodapé: em pé, SAIR e PRONTO numa linha e INICIAR PARTIDA embaixo, largo.
    const fbH = (this.phone ? 30 : 28) * u;
    const by = H - fbH - 10 * u, by1 = tall ? by - fbH - 6 * u : by;
    // Vagas por equipe (em pé: as duas equipes empilhadas).
    const half = room.seats / 2; // ffa: 4 vagas em 2×2 (cada vaga é um lado)
    const headH = 14 * u, heads = tall && room.mode !== 'ffa' ? 2 : 1;
    const sw = tall ? W - 24 * u : Math.min(250 * u, (W - 40 * u) / 2 - 6 * u);
    const sh = Math.min(54 * u, (by1 - 26 * u - y - heads * headH) / (tall ? room.seats : half) - 6 * u);
    const smH = (this.phone ? 20 : 16) * u, smSz = this.phone ? 6 : 5.5;
    const small = (x0, y0, w0, label, onClick, color) => this.button(x0, y0, w0, smH, label, onClick, { color, size: smSz });
    const tap = this.touchMode ? 'toque' : 'clique';
    let colY = y;
    for (let side = 0; side < 2; side++) {
      const x = tall ? cx - sw / 2 : cx + (side === 0 ? -sw - 6 * u : 6 * u);
      let sy0 = tall ? colY : y;
      if (room.mode === 'ffa') {
        const ffaTxt = 'TODOS CONTRA TODOS · último de pé vence';
        if (side === 0) { text(c, ffaTxt, cx, y + 8 * u, fitSize(c, ffaTxt, 8, W - 24 * u, u), '#ff9ab0', 'center', u); sy0 += headH; } else if (!tall) sy0 += headH;
      } else {
        text(c, side === 0 ? 'EQUIPE A' : 'EQUIPE B', x + sw / 2, sy0 + 8 * u, 8, side === 0 ? '#ffd23a' : '#ff4a5a', 'center', u);
        sy0 += headH;
      }
      for (let k = 0; k < half; k++) {
        const seat = side === 0 ? (room.mode === '1v1' ? 0 : k) : (room.mode === '1v1' ? 1 : half + k);
        const p = room.players.find((q) => q.seat === seat);
        const sy = sy0 + k * (sh + 6 * u);
        panel(c, x, sy, sw, sh, u, p ? (p.bot ? '#8a70d0' : p.ready ? '#7ad84a' : '#8a7a5a') : '#3a302a');
        if (room.mode === 'ffa') { c.fillStyle = FFA_COLORS[seat]; c.fillRect(x, sy, 4 * u, sh); text(c, 'J' + (seat + 1), x + sw - 6 * u, sy + sh - 5 * u, 6, FFA_COLORS[seat], 'right', u); }
        if (p && p.bot) {
          // Vaga de robô: IA do servidor. O anfitrião sorteia outro time ou remove; outros podem tomar a vaga.
          text(c, `${p.name} · IA`, x + 8 * u, sy + 14 * u, 7, '#d8c8ff', 'left', u);
          (p.team || []).forEach((key, i) => this.drawMonsterArt(SPECIES[key], x + 30 * u + i * 44 * u, sy + sh - 6 * u, 1, i + seat));
          if (isHost) {
            small(x + sw - 128 * u, sy + 5 * u, 58 * u, 'NOVO TIME', () => this.hooks.mpSend({ t: 'botTeam', seat }), '#b8a0ff');
            small(x + sw - 66 * u, sy + 5 * u, 58 * u, 'REMOVER', () => this.hooks.mpSend({ t: 'removeBot', seat }), '#ff8a8a');
          } else {
            text(c, `${tap} para ocupar`, x + sw - 8 * u, sy + 14 * u, this.phone ? 6 : 5, '#998', 'right', u);
            this.button(x, sy, sw, sh, '', () => this.hooks.mpSend({ t: 'seat', seat }), { custom: true });
          }
        } else if (p) {
          const who = p.name + (p.id === room.host ? ' ★' : '') + (p.id === mp.myId ? ' (você)' : '');
          text(c, who, x + 8 * u, sy + 14 * u, fitSize(c, p.name + ' (você) ★', 7, sw - 90 * u, u), p.connected ? '#fff' : '#888', 'left', u);
          text(c, p.ready ? 'PRONTO' : 'esperando...', x + sw - 8 * u, sy + 14 * u, 6, p.ready ? '#7ad84a' : '#bba', 'right', u);
          (p.team || []).forEach((key, i) => this.drawMonsterArt(SPECIES[key], x + 30 * u + i * 44 * u, sy + sh - 6 * u, 1, i + seat));
          if (!p.team) text(c, 'sem time', x + 8 * u, sy + sh - 10 * u, this.phone ? 6 : 5, '#887', 'left', u);
          // Seu lugar: troca o time sem sair da sala (volta para cá depois de confirmar).
          if (p.id === mp.myId) small(x + sw - (room.mode === 'ffa' ? 104 : 84) * u, sy + sh - smH - 4 * u, 78 * u, 'TROCAR TIME', () => this.editRoomTeam(p.team), '#ffd23a');
        } else if (isHost) {
          text(c, 'vaga livre', x + sw / 2, sy + sh / 2 - 6 * u, 7, '#776', 'center', u);
          small(x + sw / 2 - 98 * u, sy + sh / 2, 92 * u, 'SENTAR AQUI', () => this.hooks.mpSend({ t: 'seat', seat }), '#ffd23a');
          small(x + sw / 2 + 6 * u, sy + sh / 2, 92 * u, '+ ROBÔ', () => this.hooks.mpSend({ t: 'addBot', seat }), '#b8a0ff');
        } else {
          text(c, 'vaga livre', x + sw / 2, sy + sh / 2 - 2 * u, 7, '#776', 'center', u);
          text(c, `${tap} para sentar aqui`, x + sw / 2, sy + sh / 2 + 9 * u, this.phone ? 6 : 5, '#665', 'center', u);
          this.button(x, sy, sw, sh, '', () => this.hooks.mpSend({ t: 'seat', seat }), { custom: true });
        }
      }
      colY = sy0 + half * (sh + 6 * u);
    }
    if (!me?.team) text(c, 'Escolha seu time em TROCAR TIME', cx, by1 - 18 * u, this.phone ? 6.5 : 6, '#ff9a6a', 'center', u);
    const allReady = room.players.length === room.seats && room.players.every((p) => p.team && (p.ready || p.id === room.host));
    const leave = () => this.hooks.mpLeave(), ready = () => this.hooks.mpSend({ t: 'ready', ready: !me?.ready }), start = () => this.hooks.mpSend({ t: 'start' });
    if (tall) {
      const hw = (W - 30 * u) / 2;
      this.button(cx - hw - 5 * u, by1, hw, fbH, 'SAIR', leave, { back: true, color: '#aa9' });
      this.button(cx + 5 * u, by1, hw, fbH, me?.ready ? 'DESMARCAR' : 'PRONTO', ready, { color: '#7ad84a', disabled: !me?.team });
      this.button(cx - hw - 5 * u, by, hw * 2 + 10 * u, fbH, 'INICIAR PARTIDA', start, { disabled: !isHost || !allReady, color: '#ff8a3a' });
    } else {
      this.button(cx - 270 * u, by, 120 * u, fbH, 'SAIR', leave, { back: true, color: '#aa9' });
      this.button(cx - 130 * u, by, 150 * u, fbH, me?.ready ? 'DESMARCAR' : 'PRONTO', ready, { color: '#7ad84a', disabled: !me?.team });
      this.button(cx + 40 * u, by, 220 * u, fbH, 'INICIAR PARTIDA', start, { disabled: !isHost || !allReady, color: '#ff8a3a' });
    }
    const need = room.seats - room.players.length;
    const msg = need > 0 ? (isHost ? `Faltam ${need}: chame amigos ou use + ROBÔ` : `Aguardando ${need} jogador${need > 1 ? 'es' : ''}...`) : allReady ? 'Todos prontos!' : 'Aguardando todos ficarem prontos...';
    text(c, msg, cx, by1 - 8 * u, fitSize(c, msg, this.phone ? 6.5 : 6, W - 24 * u, u), '#ffe066', 'center', u);
  }

  renderArena(u, W, H) {
    const c = this.c, cx = W / 2, tr = this.flow === 'training';
    // Celular em pé: 2 colunas e o botão de modo embaixo do título (no canto ele ficava por cima do título).
    const stack = this.phone && this.portrait;
    text(c, 'ESCOLHA A ARENA', cx, (stack ? 26 : 30) * u, 13, '#ffe9b0', 'center', u);
    const ids = ARENA_ORDER;
    // Layout que sempre cabe: botões fixos no rodapé, descrição acima deles, cartões no espaço restante.
    const btnH = (this.phone ? 32 : 28) * u, btnY = H - btnH - 10 * u;
    const dsz = this.phone ? 7 : 5.5, dLines = stack ? 4 : 2;
    const descH = (dLines * (dsz + 3.5) + 8) * u;
    const top = (stack && !tr ? 70 : 44) * u, bottom = btnY - descH - 8 * u;
    const gap = 8 * u;
    const cols = stack ? 2 : ids.length > 4 ? 3 : 2, rows = Math.ceil(ids.length / cols);
    const chMax = Math.floor((bottom - top - gap * (rows - 1)) / rows);
    const cwMax = Math.floor((Math.min(W - 24 * u, 1100 * u) - gap * (cols - 1)) / cols);
    // Celular: só nome e subtítulo (maiores); os recursos ficavam com letra de ~2 px e vazavam do cartão.
    const textH = (this.phone ? 40 : rows > 2 ? 40 : 56) * u; // nome + subtítulo + linhas de recursos
    // Prévia 16:9 que cabe na altura e na largura do cartão.
    let ph = Math.min(chMax - textH - 8 * u, (cwMax - 12 * u) * 9 / 16);
    ph = Math.max(40 * u, ph);
    const pw = ph * 16 / 9;
    const cw = Math.min(cwMax, pw + 12 * u);
    // No celular o cartão tem só a altura do conteúdo (antes esticava até o rodapé e sobrava um vazio enorme).
    const ch = this.phone ? Math.min(chMax, ph + textH + 8 * u) : chMax;
    const x0 = cx - (cw * cols + gap * (cols - 1)) / 2;
    ids.forEach((id, k) => {
      const A = ARENAS[id];
      const x = x0 + (k % cols) * (cw + gap), y = top + Math.floor(k / cols) * (ch + gap);
      const sel = this.arena === id;
      const hover = this.mouse.x >= x && this.mouse.x <= x + cw && this.mouse.y >= y && this.mouse.y <= y + ch;
      panel(c, x, y, cw, ch, u, sel ? '#ffd23a' : hover ? '#c8b080' : '#5a4636');
      if (this.previews[id]) { c.imageSmoothingEnabled = false; c.drawImage(this.previews[id], x + (cw - pw) / 2, y + 6 * u, pw, ph); }
      else {
        c.fillStyle = 'rgba(10,8,6,0.7)'; c.fillRect(x + (cw - pw) / 2, y + 6 * u, pw, ph);
        text(c, 'CARREGANDO' + '.'.repeat(1 + (Math.floor(this.time * 3) % 3)), x + cw / 2, y + 6 * u + ph / 2, 6, '#bba', 'center', u);
      }
      const ty = y + ph + (this.phone ? 18 : 20) * u;
      text(c, A.name.toUpperCase(), x + 8 * u, ty, fitSize(c, A.name.toUpperCase(), this.phone ? 9 : 7, cw - 16 * u, u), sel ? '#ffd23a' : '#f4ead0', 'left', u);
      if (this.phone) para(c, A.subtitle, x + 8 * u, ty + 12 * u, 6.5, cw - 16 * u, '#bba', 'left', u, 9.5, 2);
      else text(c, A.subtitle, x + 8 * u, ty + 11 * u, fitSize(c, A.subtitle, 5, cw - 16 * u, u), '#bba', 'left', u);
      if (this.phone) { this.button(x, y, cw, ch, '', () => { this.arena = id; }, { custom: true }); return; }
      // Recursos em linhas curtas (cortadas ao espaço disponível).
      let ly = ty + 22 * u;
      for (const f of A.features) {
        if (ly > y + ch - 4 * u) break;
        text(c, '· ' + f, x + 8 * u, ly, fitSize(c, '· ' + f, 4.5, cw - 16 * u, u), '#e8dcc0', 'left', u);
        ly += 8.5 * u;
      }
      this.button(x, y, cw, ch, '', () => { this.arena = id; }, { custom: true });
    });
    const A = this.arena && ARENAS[this.arena];
    const desc = A ? A.description : this.touchMode ? 'Toque em uma arena para selecioná-la.' : 'Clique em uma arena para selecioná-la.';
    // Descrição logo abaixo dos cartões (no celular eles não vão mais até o rodapé).
    const dy = this.phone ? top + rows * ch + (rows - 1) * gap + 18 * u : bottom + 16 * u;
    para(c, desc, cx, dy, dsz, Math.min(W - 32 * u, 700 * u), '#e8dcc0', 'center', u, dsz + 3.5, dLines);
    const bw = Math.min(150 * u, (W - 36 * u) / 2);
    this.button(cx - bw - 10 * u, btnY, bw, btnH, 'VOLTAR', () => this.go('team'), { back: true, color: '#aa9' });
    if (!tr) {
      const [mx, my, mw, mh] = stack ? [cx - 150 * u, 36 * u, 300 * u, 26 * u] : [W - 214 * u, 12 * u, 202 * u, 22 * u];
      this.button(mx, my, mw, mh, this.ffaLocal ? 'MODO: 1v1v1v1 (você + 3 IAs)' : 'MODO: 1v1 (contra 1 IA)', () => { this.ffaLocal = !this.ffaLocal; }, { color: this.ffaLocal ? '#ff5a8a' : '#ff8a3a', size: this.phone ? 7 : 6 });
    }
    this.button(cx + 10 * u, btnY, bw, btnH, tr ? 'TREINAR!' : 'LUTAR!', () => this.hooks.startBattle({ team: [...this.team], arena: this.arena, training: tr, ffa: !tr && !!this.ffaLocal }), { disabled: !this.arena, color: tr ? '#d8c08a' : '#ff8a3a' });
  }

  // Celular: uma forma por vez (BASE / EVOLUÇÃO) num painel largo, com letra maior. Em pé, tudo numa coluna; deitado,
  // ficha e mecânica à esquerda e habilidades à direita. As duas formas lado a lado ficavam com letra de ~2 px.
  renderBestiaryPhone(u, W, H) {
    const c = this.c, cx = W / 2, tall = this.portrait;
    text(c, 'MONSTROS', cx, 26 * u, 12, '#ffe9b0', 'center', u);
    const cols = tall ? 3 : ROSTER.length, tg = 4 * u, th = 22 * u;
    const tw = (W - 24 * u - (cols - 1) * tg) / cols;
    ROSTER.forEach((key, k) => {
      const def = SPECIES[key], sel = this.bestiaryLine === key;
      this.button(12 * u + (k % cols) * (tw + tg), 34 * u + Math.floor(k / cols) * (th + tg), tw, th, sel ? '» ' + def.name.toUpperCase() + ' «' : def.name.toUpperCase(), () => { this.bestiaryLine = key; }, { color: ELEMENT_COLOR[def.element], size: 6.5 });
    });
    let y = 34 * u + Math.ceil(ROSTER.length / cols) * (th + tg) + 2 * u;
    const forms = formsOf(this.bestiaryLine), fi = this.bestiaryForm ? 1 : 0;
    const fw = (W - 30 * u) / 2;
    forms.forEach((d, k) => this.button(12 * u + k * (fw + 6 * u), y, fw, th, `${k ? 'EVOLUÇÃO' : 'BASE'}: ${d.name.toUpperCase()}`, () => { this.bestiaryForm = k; }, { color: k === fi ? ELEMENT_COLOR[d.element] : '#776', size: 6.5 }));
    y += th + 6 * u;
    const def = forms[fi], other = forms[1 - fi], col = ELEMENT_COLOR[def.element];
    const backH = 30 * u, x = 12 * u, pw = W - 24 * u, ph = H - y - backH - 18 * u;
    panel(c, x, y, pw, ph, u, col);
    const bottomY = y + ph - 8 * u;
    // Ficha: arte à esquerda; nome, título e atributos à direita dela.
    const mh = this.art.models?.[def.sprite]?.h || 40, box = 76 * u;
    this.drawMonsterArt(def, x + 42 * u, y + box + 4 * u, Math.max(1, Math.floor(Math.min(box, 2.4 * mh * u) / mh)), fi);
    const ix = x + 88 * u, iw = (tall ? pw : pw / 2) - 96 * u;
    text(c, def.name.toUpperCase(), ix, y + 18 * u, fitSize(c, def.name.toUpperCase(), 9, iw, u), col, 'left', u);
    const sub = `${def.title} · ${ELEMENT_NAME[def.element]} · ${def.profile.personality}`;
    text(c, sub, ix, y + 30 * u, fitSize(c, sub, 6, iw, u), '#bba', 'left', u);
    [['Vida', def.hp, 260, other.hp], ['Veloc.', def.speed, 80, other.speed], ['Tamanho', def.radius, 14, other.radius]].forEach(([name, v, max, ov], j) => {
      const sy = y + 40 * u + j * 13 * u;
      text(c, name, ix, sy + 7 * u, 6, '#e8dcc0', 'left', u);
      const bx = ix + 56 * u, bw = Math.max(20 * u, iw - 112 * u);
      c.fillStyle = '#2a201a'; c.fillRect(bx, sy, bw, 7 * u);
      c.fillStyle = col; c.fillRect(bx, sy, bw * Math.min(1, v / max), 7 * u);
      const diff = v - ov;
      text(c, `${v}${fi === 1 && diff ? (diff > 0 ? ' +' : ' ') + diff : ''}`, bx + bw + 4 * u, sy + 7 * u, 6, fi === 1 && diff ? (diff > 0 ? '#7ae07a' : '#ff8a8a') : '#fff', 'left', u);
    });
    // Mecânica e traços (em pé, embaixo da ficha; deitado, na coluna da esquerda).
    const lx = x + 10 * u, lw = (tall ? pw : pw / 2) - 20 * u;
    let ly = y + box + 20 * u;
    if (def.sig) {
      text(c, def.sig.name.toUpperCase(), lx, ly, fitSize(c, def.sig.name.toUpperCase(), 7, lw, u), SIG_COLOR[def.sig.kind] || '#fff', 'left', u);
      ly = para(c, def.sig.desc, lx, ly + 11 * u, 6, lw, '#f4ead0', 'left', u, 9, tall ? 6 : 8);
    }
    for (const tr of def.traits.slice(1)) ly = para(c, '· ' + tr, lx, ly, 6, lw, '#d8ccb0', 'left', u, 9, 2);
    if (!tall) {
      const tips = [def.tips, matchText(def.element)].filter(Boolean);
      ly += 2 * u;
      for (const tp of tips) if (ly < bottomY - 9 * u) ly = para(c, tp, lx, ly, 6, lw, tp === def.tips ? '#ffe066' : '#9ae070', 'left', u, 9, 3);
    }
    // Habilidades: em pé, embaixo; deitado, coluna da direita. A descrição usa as linhas que sobrarem.
    const ax = tall ? lx : x + pw / 2 + 6 * u, aw = (tall ? pw : pw / 2) - 20 * u;
    let ay = tall ? ly + 6 * u : y + 16 * u;
    text(c, 'HABILIDADES', ax, ay, 7, '#ffe9b0', 'left', u);
    ay += 12 * u;
    const entries = Object.entries(def.controls);
    const otherIds = new Set(other.abilities.map((a) => a.id));
    const descLines = Math.max(0, Math.min(3, Math.floor(((bottomY - ay) / entries.length - 12 * u) / (8.5 * u))));
    for (const [slot, id] of entries) {
      const ab = def.abilities.find((a) => a.id === id);
      if (ay > bottomY) break;
      const tag = fi === 1 && !otherIds.has(id) ? ' [NOVA]' : '';
      abilityIcon(c, ab.kind, ax, ay - 7 * u, 8 * u, col);
      const key = (this.touchMode ? TOUCH_LABEL : KEY_LABEL)[slot];
      text(c, key, ax + 12 * u, ay, 6, '#ffd23a', 'left', u);
      text(c, ab.name + tag, ax + 58 * u, ay, fitSize(c, ab.name + tag, 6.5, aw - 58 * u, u), tag ? '#e8b8ff' : '#fff', 'left', u);
      ay = para(c, ab.desc || '', ax + 12 * u, ay + 10 * u, 5.5, aw - 12 * u, '#bba', 'left', u, 8.5, descLines) + 3 * u;
    }
    this.button(cx - 75 * u, H - backH - 10 * u, 150 * u, backH, 'VOLTAR', () => this.go('menu'), { back: true, color: '#aa9' });
  }

  renderBestiary(u, W, H) {
    if (this.phone) { this.renderBestiaryPhone(u, W, H); return; }
    const c = this.c, cx = W / 2;
    text(c, 'MONSTROS', cx, 34 * u, 14, '#ffe9b0', 'center', u);
    // Abas das linhas evolutivas.
    ROSTER.forEach((key, k) => {
      const def = SPECIES[key];
      const bw = Math.min(112 * u, (W - 40 * u) / ROSTER.length - 4 * u);
      const b = this.button(cx + (k - (ROSTER.length - 1) / 2) * (bw + 4 * u) - bw / 2, 44 * u, bw, 22 * u, def.name.toUpperCase(), () => { this.bestiaryLine = key; }, { color: ELEMENT_COLOR[def.element], size: 6 });
      if (this.bestiaryLine === key) b.label = '» ' + b.label + ' «';
    });
    const [base, evo] = formsOf(this.bestiaryLine);
    const pw = Math.min(360 * u, (W - 40 * u) / 2 - 6 * u), ph = H - 130 * u;
    [base, evo].forEach((def, k) => {
      const x = cx + (k === 0 ? -pw - 6 * u : 6 * u), y = 74 * u;
      const other = k === 0 ? evo : base;
      panel(c, x, y, pw, ph, u, ELEMENT_COLOR[def.element]);
      // Escala limitada pela altura do modelo (os gatos de chapéu são altos e cortavam no topo do painel).
      const mh = this.art.models?.[def.sprite]?.h || 40;
      this.drawMonsterArt(def, x + 56 * u, y + 112 * u, Math.max(1, Math.min(Math.round((def.stage > 1 ? 1.8 : 2.6) * u), Math.floor((100 * u) / mh))), k);
      text(c, def.name.toUpperCase(), x + 112 * u, y + 20 * u, fitSize(c, def.name.toUpperCase(), 8, pw - 120 * u, u), ELEMENT_COLOR[def.element], 'left', u);
      text(c, `${def.title} · ${ELEMENT_NAME[def.element]} · ${def.profile.personality}`, x + 112 * u, y + 32 * u, fitSize(c, `${def.title} · ${ELEMENT_NAME[def.element]} · ${def.profile.personality}`, 5, pw - 120 * u, u), '#bba', 'left', u);
      // Atributos em barras, com a diferença para a outra forma.
      const stats = [['Vida', def.hp, 260, other.hp], ['Velocidade', def.speed, 80, other.speed], ['Tamanho', def.radius, 14, other.radius]];
      stats.forEach(([name, v, max, ov], j) => {
        const sy = y + 46 * u + j * 13 * u;
        text(c, name, x + 112 * u, sy + 6 * u, 5, '#e8dcc0', 'left', u);
        const bx = x + 180 * u, bw = pw - 230 * u;
        c.fillStyle = '#2a201a'; c.fillRect(bx, sy, bw, 7 * u);
        c.fillStyle = ELEMENT_COLOR[def.element]; c.fillRect(bx, sy, bw * Math.min(1, v / max), 7 * u);
        const diff = v - ov;
        text(c, `${v}${k === 1 && diff ? (diff > 0 ? ' +' : ' ') + diff : ''}`, bx + bw + 4 * u, sy + 6 * u, 5, k === 1 && diff ? (diff > 0 ? '#7ae07a' : '#ff8a8a') : '#fff', 'left', u);
      });
      let ly = y + 120 * u; // abaixo da arte do monstro
      if (def.sig) {
        const sz = fitSize(c, def.sig.name.toUpperCase(), 6, pw - 120 * u, u);
        text(c, def.sig.name.toUpperCase(), x + 10 * u, ly, sz, SIG_COLOR[def.sig.kind] || '#fff', 'left', u);
        if (def.difficulty) { c.font = `${sz * u}px ${FONT}`; const dx = x + 16 * u + c.measureText(def.sig.name.toUpperCase()).width; const wd = diffMarks(c, def.difficulty, dx, ly, u); text(c, DIFF_NAME[def.difficulty], dx + wd + 4 * u, ly, 4.5, '#bba', 'left', u); }
        ly += 9 * u;
        for (const line of wrap(c, def.sig.desc, 4.5, pw - 20 * u, u)) { text(c, line, x + 10 * u, ly, 4.5, '#f4ead0', 'left', u); ly += 8 * u; }
        ly += 2 * u;
      }
      for (const tr of def.traits.slice(1)) for (const line of wrap(c, '· ' + tr, 4.5, pw - 20 * u, u)) { text(c, line, x + 10 * u, ly, 4.5, '#d8ccb0', 'left', u); ly += 8 * u; }
      ly += 3 * u;
      text(c, 'HABILIDADES', x + 10 * u, ly, 6, '#ffe9b0', 'left', u);
      ly += 12 * u;
      const otherIds = new Set(other.abilities.map((a) => a.id));
      for (const [slot, id] of Object.entries(def.controls)) {
        const ab = def.abilities.find((a) => a.id === id);
        const tag = k === 1 && !otherIds.has(id) ? ' [NOVA]' : '';
        abilityIcon(c, ab.kind, x + 10 * u, ly - 6 * u, 7 * u, ELEMENT_COLOR[def.element]);
        text(c, `${(this.touchMode ? TOUCH_LABEL : KEY_LABEL)[slot]}`, x + 20 * u, ly, 5, '#ffd23a', 'left', u);
        text(c, ab.name + tag, x + 66 * u, ly, 5, tag ? '#e8b8ff' : '#fff', 'left', u);
        ly += 8 * u;
        for (const line of wrap(c, ab.desc || '', 4.5, pw - 76 * u, u)) { if (ly < y + ph - 24 * u) text(c, line, x + 66 * u, ly, 4.5, '#bba', 'left', u); ly += 8 * u; }
        ly += 2 * u;
      }
      if (def.tips) text(c, def.tips, x + pw / 2, y + ph - 20 * u, fitSize(c, def.tips, 4.5, pw - 16 * u, u), '#ffe066', 'center', u);
      text(c, matchText(def.element), x + pw / 2, y + ph - 10 * u, 5, '#9ae070', 'center', u);
    });
    const evoTxt = 'Evolução: cada ataque que acerta enche ~7% da barra (dano, esquivas e terreno também contam). Barra cheia: aperte G (uma vez por partida; a vida mantém a porcentagem).';
    text(c, evoTxt, cx, H - 44 * u, fitSize(c, evoTxt, 5, W - 30 * u, u), '#e8b8ff', 'center', u);
    this.button(cx - 75 * u, H - 34 * u, 150 * u, 26 * u, 'VOLTAR', () => this.go('menu'), { back: true, color: '#aa9' });
  }

  renderOptions(u, W, H) {
    const c = this.c, cx = W / 2;
    const S = this.settings;
    // Celular deitado (360 de altura lógica): as opções em duas colunas para sobrar espaço aos controles.
    const two = this.phone && !this.portrait;
    text(c, 'OPÇÕES', cx, (this.phone ? 30 : 40) * u, 14, '#ffe9b0', 'center', u);
    const pw = Math.min((two ? 760 : 520) * u, W - (this.phone ? 24 : 40) * u);
    const x = cx - pw / 2, colW = two ? (pw - 16 * u) / 2 : pw;
    const bw = Math.min(170 * u, colW * 0.48), rh = (this.phone ? 28 : 24) * u;
    const y0 = (this.phone ? 42 : 60) * u;
    let y = y0, n = 0;
    const set = (k, v) => { S[k] = v; saveSettings(S); this.hooks.applySettings(S); };
    const row = (label, value, onClick) => {
      const col = two ? n % 2 : 0, rx = x + col * (colW + 16 * u), ry = two ? y0 + Math.floor(n / 2) * (rh + 6 * u) : y;
      text(c, label, rx, ry + rh / 2 + 4 * u, fitSize(c, label, 7, colW - bw - 8 * u, u), '#f4ead0', 'left', u);
      this.button(rx + colW - bw, ry, bw, rh, value, onClick, { size: 7, color: '#46b4ff' });
      n++;
      y = two ? y0 + Math.ceil(n / 2) * (rh + 6 * u) : y + rh + 6 * u;
    };
    row('Tremor de tela', S.shake ? 'LIGADO' : 'DESLIGADO', () => set('shake', !S.shake));
    row('Números de dano', S.numbers ? 'LIGADO' : 'DESLIGADO', () => set('numbers', !S.numbers));
    const diffs = Object.keys(DIFFICULTY);
    row('Dificuldade da IA', DIFFICULTY[S.difficulty].toUpperCase(), () => set('difficulty', diffs[(diffs.indexOf(S.difficulty) + 1) % diffs.length]));
    const speeds = [0.5, 1, 1.5];
    row('Velocidade do jogo', `${S.speed}x`, () => set('speed', speeds[(speeds.indexOf(S.speed) + 1) % speeds.length]));
    // Câmera: automática aproxima e segue o seu monstro quando a arena inteira ficaria pequena (celular, notebook).
    const cams = ['auto', 'arena', 'perto'], camName = { auto: 'AUTOMÁTICA', arena: 'ARENA INTEIRA', perto: 'APROXIMADA' };
    row('Câmera', camName[S.camera] || camName.auto, () => set('camera', cams[(cams.indexOf(S.camera) + 1) % cams.length]));
    const qs = ['auto', 'alta', 'leve'], qName = { auto: 'AUTOMÁTICA', alta: 'ALTA', leve: 'LEVE (mais FPS)' };
    row('Qualidade gráfica', qName[S.quality] || qName.auto, () => set('quality', qs[(qs.indexOf(S.quality) + 1) % qs.length]));
    row('Visão da IA (depuração)', S.debug ? 'LIGADA' : 'DESLIGADA', () => set('debug', !S.debug));
    const vols = [0, 0.3, 0.6, 1];
    row('Som', !S.sound || S.volume <= 0 ? 'DESLIGADO' : `${Math.round(S.volume * 100)}%`, () => {
      const i = S.sound ? vols.indexOf(S.volume) : 0;
      const v = vols[(Math.max(0, i) + 1) % vols.length];
      S.sound = v > 0; set('volume', v);
    });
    y += 4 * u;
    const backH = (this.phone ? 30 : 28) * u, backY = H - backH - 12 * u;
    // Controles: os do toque no celular/tablet, os do teclado no PC.
    const ctl = this.touchMode ? [
      ['Analógico', 'mover'], ['ATQ', 'ataque à distância (segure para carregar)'], ['GOLPE', 'corpo a corpo'], ['Q / E / F', 'poderes especiais'],
      ['ESQ', 'esquiva (preso? quebra o combo)'], ['Arrastar botão', 'mirar o poder (volte ao botão para cancelar)'], ['1 2 3', `trocar monstro (recarga ${SWITCH.cooldown}s)`], ['EVO', 'evoluir (com a energia cheia)'],
    ] : [
      ['WASD / setas', 'mover'], ['Mouse', 'mirar'], ['Botão esquerdo', 'ataque à distância'], ['Botão direito', 'corpo a corpo'],
      ['Q / E / F', 'poderes especiais'], ['Espaço / Shift', 'esquiva (preso? quebra o combo: 35 de energia, recarga 14s)'], ['1 2 3 / Tab', `trocar monstro (recarga ${SWITCH.cooldown}s)`],
      ['G', 'evoluir (com a energia cheia)'], ['H', 'ajuda do monstro em campo'], ['P / Esc', 'pausar'], ['I', 'visão da IA'],
    ];
    const lh = (this.phone ? 11 : 13) * u, kw = (this.phone ? 104 : 156) * u;
    if (backY - 6 * u - y > 30 * u) {
      panel(c, x, y, pw, backY - 6 * u - y, u);
      let ly = y + 16 * u;
      for (const [k, v] of ctl) {
        if (ly > backY - 12 * u) break;
        text(c, k, x + 10 * u, ly, fitSize(c, k, 6, kw - 8 * u, u), '#ffd23a', 'left', u);
        ly = Math.max(ly + lh, para(c, v, x + 10 * u + kw, ly, 6, pw - kw - 20 * u, '#e8dcc0', 'left', u, 9, 2) + (lh - 9 * u));
      }
    }
    this.button(cx - 75 * u, backY, 150 * u, backH, 'VOLTAR', () => this.go('menu'), { back: true, color: '#aa9' });
  }

  // Painel do treino (tecla T): bonecos, bonecos que atiram, recargas, evolução e saída.
  renderTrainingPanel(u, W, H, world, actions) {
    const c = this.c, cx = W / 2;
    c.fillStyle = 'rgba(8,4,2,0.78)';
    c.fillRect(0, 0, W, H);
    const T = world.training, o = T.opts;
    const m = world.active;
    text(c, 'PAINEL DE TREINO', cx, H * 0.2, 14, '#ffe9b0', 'center', u);
    text(c, 'A partida fica pausada enquanto o painel está aberto.', cx, H * 0.2 + 16 * u, 5.5, '#bba', 'center', u);
    const bw = 300 * u, bh = 26 * u, x = cx - bw / 2;
    let y = H * 0.2 + 30 * u;
    // Bonecos: − n +
    text(c, `BONECOS DE PANO: ${o.dummies} / 3`, cx, y + 17 * u, 8, '#d8c08a', 'center', u);
    this.button(x, y, 40 * u, bh, '−', () => actions.trainingDummies(o.dummies - 1), { disabled: o.dummies <= 1, color: '#d8c08a' });
    this.button(x + bw - 40 * u, y, 40 * u, bh, '+', () => actions.trainingDummies(o.dummies + 1), { disabled: o.dummies >= 3, color: '#d8c08a' });
    y += bh + 8 * u;
    this.button(x, y, bw, bh, `BONECOS ATIRAM: ${o.shoot ? 'SIM' : 'NÃO'}`, () => actions.trainingToggle('shoot'), { color: '#46b4ff', size: 8 });
    y += bh + 8 * u;
    this.button(x, y, bw, bh, `RECARGAS: ${o.noCd ? 'INSTANTÂNEAS' : 'NORMAIS'}`, () => actions.trainingToggle('noCd'), { color: '#46b4ff', size: 8 });
    y += bh + 8 * u;
    if (m && m.def.evolvesTo && !m.evolved) this.button(x, y, bw, bh, `EVOLUIR ${m.name.toUpperCase()} (G)`, actions.trainingEvolve, { color: '#e8b8ff', size: 8, disabled: m.evolveT > 0 || !!m.switchState });
    else this.button(x, y, bw, bh, 'VOLTAR À FORMA BASE', actions.trainingDevolve, { color: '#e8b8ff', size: 8, disabled: !m || m.evolveT > 0 || !!m.switchState });
    y += bh + 14 * u;
    this.button(x, y, bw / 2 - 4 * u, bh, 'CONTINUAR (T)', actions.resume, { color: '#7ad84a' });
    this.button(x + bw / 2 + 4 * u, y, bw / 2 - 4 * u, bh, 'SAIR DO TREINO', actions.menu, { color: '#aa9' });
    y += bh + 14 * u;
    for (const ln of ['Os bonecos têm vida infinita e voltam ao lugar. Seus monstros não caem e se curam sozinhos.', 'No treino a energia fica sempre cheia: aperte G para evoluir a qualquer momento.', 'Atalhos: T painel · B número de bonecos · H ajuda do monstro · 1/2/3 trocar']) {
      text(c, ln, cx, y, fitSize(c, ln, 5.5, W - 30 * u, u), '#d8ccb0', 'center', u); y += 11 * u;
    }
    this.drawButtons(u);
  }

  // Ajuda durante a batalha (tecla H): mecânica do monstro em campo, cada botão e como ler a tela.
  renderHelp(u, W, H, world, actions) {
    const c = this.c, cx = W / 2;
    c.fillStyle = 'rgba(8,4,2,0.86)';
    c.fillRect(0, 0, W, H);
    const m = world.active || (world.playerTeam !== null ? world.fieldOf(world.playerTeam) : null);
    // Celular: textos quebrados em linhas (não encolhidos numa só) e letra maior; em pé, habilidades numa coluna.
    const ph = this.phone, one = ph && this.portrait;
    const sm = ph ? 6 : 5.5, tiny = ph ? 5.5 : 4.5, lh = 9;
    const pw = Math.min(W - (ph ? 20 : 30) * u, 720 * u), x = cx - pw / 2;
    let y = (ph ? 24 : 30) * u;
    text(c, actions.firstTime ? 'COMO JOGAR' : 'AJUDA', cx, y, 13, '#ffe9b0', 'center', u);
    y += 16 * u;
    const how = this.touchMode
      ? 'Analógico move · toque num botão = usa mirando no inimigo mais perto · ARRASTE do botão para mirar (volte ao botão para cancelar) · segure ATQ para carregar · 1/2/3 troca · EVO evolui'
      : 'WASD mover · mouse mirar · clique esquerdo/direito atacam · Q/E/F poderes · Espaço esquiva/quebra combo · 1/2/3 troca · G evolui';
    if (ph) y = para(c, how, cx, y, sm, pw, '#e8dcc0', 'center', u, lh) + 5 * u;
    else { text(c, how, cx, y, fitSize(c, how, 5.5, pw, u), '#e8dcc0', 'center', u); y += 14 * u; }
    if (m) {
      const def = m.def;
      panel(c, x, y, pw, 1, u, ELEMENT_COLOR[def.element]);
      y += 12 * u;
      text(c, `${def.name.toUpperCase()} · ${ELEMENT_NAME[def.element]}`, x + 8 * u, y, 8, ELEMENT_COLOR[def.element], 'left', u);
      if (def.sig) {
        y += 13 * u;
        text(c, def.sig.name.toUpperCase(), x + 8 * u, y, 7, SIG_COLOR[def.sig.kind] || '#fff', 'left', u);
        y += 4 * u;
        for (const ln of wrap(c, def.sig.desc, sm, pw - 16 * u, u)) { y += lh * u; text(c, ln, x + 8 * u, y, sm, '#f4ead0', 'left', u); }
      }
      y += 12 * u;
      const cols = one ? 1 : 2, colW = (pw - 16 * u) / cols, rowH = (one ? 27 : 30) * u;
      let k = 0;
      const y0 = y;
      for (const [slot, id] of Object.entries(def.controls)) {
        const ab = def.abilities.find((a) => a.id === id);
        const bx = x + 8 * u + (k % cols) * colW, by = y0 + Math.floor(k / cols) * rowH;
        abilityIcon(c, ab.kind, bx, by - 7 * u, 9 * u, ELEMENT_COLOR[def.element]);
        const kl = (this.touchMode ? TOUCH_LABEL : KEY_LABEL)[slot];
        text(c, `${kl} · ${ab.name}`, bx + 13 * u, by, fitSize(c, `${kl} · ${ab.name}`, sm, colW - 18 * u, u), '#ffd23a', 'left', u);
        wrap(c, ab.desc || '', tiny, colW - 18 * u, u).slice(0, 2).forEach((ln, j) => text(c, ln, bx + 13 * u, by + (9 + j * 8) * u, tiny, '#d8ccb0', 'left', u));
        k++;
      }
      y = y0 + Math.ceil(k / cols) * rowH;
      if (def.tips) {
        if (ph) y = para(c, def.tips, x + 8 * u, y, sm, pw - 16 * u, '#ffe066', 'left', u, lh, 3) + 3 * u;
        else { text(c, def.tips, x + 8 * u, y, fitSize(c, def.tips, 5, pw - 16 * u, u), '#ffe066', 'left', u); y += 12 * u; }
      }
    }
    // Como ler a tela.
    y += 4 * u;
    const legend = [['stun', 'atordoado'], ['root', 'preso'], ['burn', 'queimando'], ['wet', 'molhado'], ['slow', 'lento'], ['cloak', 'camuflado']];
    let lx = x + 8 * u;
    for (const [k2, name] of legend) { statusIcon(c, k2, lx, y - 6 * u, 8 * u); text(c, name, lx + 10 * u, y, ph ? 5.5 : 5, '#e8dcc0', 'left', u); lx += (ph ? 74 : 64) * u; if (lx > x + pw - (ph ? 70 : 60) * u) { lx = x + 8 * u; y += 12 * u; } }
    y += 14 * u;
    for (const ln of [
      'Barra DOURADA sobre a cabeça = golpe IMPARÁVEL (não é interrompido). Branca = acerte para interromper.',
      'Gotas azuis depois de um golpe forte = janela para contra-atacar. Arcos e setas no chão mostram onde o golpe vai pegar.',
      'Triângulo: Fogo > Planta > Água > Fogo (mais dano contra quem você vence). Troque de monstro para virar o confronto.',
    ]) { for (const l2 of wrap(c, ln, ph ? 5.5 : 5, pw - 16 * u, u)) { text(c, l2, x + 8 * u, y, ph ? 5.5 : 5, '#bba', 'left', u); y += 9 * u; } y += 2 * u; }
    const bw = 200 * u, bh = (ph ? 30 : 28) * u;
    this.button(cx - bw / 2, Math.min(H - bh - 10 * u, y + 6 * u), bw, bh, actions.firstTime ? 'ENTENDI, LUTAR!' : 'VOLTAR (H)', actions.closeHelp, { color: '#7ad84a' });
    this.drawButtons(u);
  }

  // ───────────── Tutorial (Professor Remendo) ─────────────
  // Retrato do professor (do capelo à cintura) num quadro, ampliado em pixels inteiros. talking mexe a boca.
  drawProfPortrait(x, y, s, talking, u, border = '#ffd23a') {
    const c = this.c;
    this.profPb ??= new PixelBuf(48, 48);
    drawProfessor(this.profPb, { t: this.time, hop: 0, talk: talking, blink: this.time % 3.1 < 0.12 });
    const cv = this.profPb.commit();
    c.fillStyle = '#2a3a5a'; c.fillRect(x, y, s, s);
    c.fillStyle = '#34486c'; c.fillRect(x, y + s * 0.62, s, s * 0.38);
    c.save();
    c.beginPath(); c.rect(x, y, s, s); c.clip();
    c.imageSmoothingEnabled = false;
    const k = Math.max(1, Math.round(s / 31));
    c.drawImage(cv, Math.round(x + s / 2 - 24.5 * k), Math.round(y + s / 2 - 20 * k), 48 * k, 48 * k);
    c.restore();
    c.strokeStyle = border; c.lineWidth = 2 * u; c.strokeRect(x + u, y + u, s - 2 * u, s - 2 * u);
  }

  // Linha com as palavras em MAIÚSCULAS destacadas em dourado; mostra só os primeiros `max` caracteres (máquina de escrever).
  richLine(ln, x, y, size, u, max = Infinity, color = '#f4ead0') {
    const c = this.c;
    c.font = `${size * u}px ${FONT}`;
    const sp = c.measureText(' ').width;
    let n = 0;
    for (const w of ln.split(' ')) {
      if (n >= max) break;
      const letters = w.replace(/[^A-Za-zÀ-ÿ]/g, '');
      const caps = letters.length >= 2 && letters === letters.toUpperCase();
      text(c, w.slice(0, Math.max(0, max - n)), x, y, size, caps ? '#ffd23a' : color, 'left', u);
      x += c.measureText(w).width + sp;
      n += w.length + 1;
    }
  }

  // Toque/clique/Enter durante a fala: completa o texto; se já estava completo, vai para a próxima fala.
  tutorialTap(tut) {
    if (!tut?.talking) return false;
    const st = this.tutT;
    if (st && st.key === tut.pageKey && !st.full) st.t = 99;
    else if (!st || st.key !== tut.pageKey || st.t > 0.25) { this.hooks.sfx?.('click'); tut.next(); }
    return true;
  }

  // Desenhado por cima da arena (main.js). area = { top, bottom } em px do canvas: faixa livre entre a HUD do alto e a
  // de baixo. Fala: caixa grande embaixo com o retrato e o texto aparecendo. Objetivo e elogio: cartão no alto.
  renderTutorial(u, W, H, world, area, dt) {
    const tut = world.tutorial, c = this.c, ph = this.phone;
    if (tut.talking) {
      if (this.tutT?.key !== tut.pageKey) this.tutT = { key: tut.pageKey, t: 0, full: false };
      const st = this.tutT;
      st.t += dt;
      const line = tut.line, shown = Math.min(line.length, Math.floor(st.t * 50));
      st.full = shown >= line.length;
      c.fillStyle = 'rgba(8,4,2,0.32)'; c.fillRect(0, 0, W, H);
      const bw = Math.min(W - 16 * u, 580 * u), ps = (ph ? 60 : 68) * u, pad = 8 * u;
      const tw = bw - ps - 3 * pad, sz = ph ? 7.5 : 7, lh = (ph ? 12.5 : 11.5) * u;
      const lines = wrap(c, line, sz, tw, u);
      const bh = Math.max(ps + 2 * pad + 4 * u, lines.length * lh + 30 * u + pad);
      const bx = Math.round((W - bw) / 2), by = Math.round(area.bottom - bh - 8 * u);
      panel(c, bx, by, bw, bh, u, '#ffd23a', 'rgba(22,14,10,0.97)');
      // Plaquinha com o nome, presa em cima da caixa.
      const name = 'PROF. REMENDO', nw = (ph ? 112 : 104) * u;
      panel(c, bx + pad, by - 13 * u, nw, 15 * u, u, '#ffd23a', '#3a2412');
      text(c, name, bx + pad + nw / 2, by - 2 * u, fitSize(c, name, 6.5, nw - 10 * u, u), '#ffe9b0', 'center', u);
      this.drawProfPortrait(bx + pad, by + pad + 4 * u, ps, !st.full, u);
      let left = shown, y = by + pad + 16 * u;
      const tx = bx + ps + 2 * pad;
      for (const ln of lines) { if (left <= 0) break; this.richLine(ln, tx, y, sz, u, left); left -= ln.length + 1; y += lh; }
      const pages = tut.pages().length;
      for (let k = 0; k < pages; k++) { c.fillStyle = k === tut.page ? '#ffd23a' : k < tut.page ? '#8a7a50' : '#3a302a'; c.fillRect(tx + k * 9 * u, by + bh - 11 * u, 6 * u, 4 * u); }
      if (st.full) {
        const last = tut.page === pages - 1;
        const hint = `${this.touchMode ? 'toque' : 'clique ou Enter'} ${last ? (tut.phase === 'end' ? '· terminar' : '· começar!') : '· continuar'}`;
        const bob = Math.floor(this.time * 3) % 2 ? u : 0;
        text(c, hint + ' >', bx + bw - pad, by + bh - 7 * u + bob, ph ? 6 : 5.5, last ? '#7ae07a' : '#d8c08a', 'right', u);
      }
      return;
    }
    // Cartão do objetivo (ou do elogio) no alto da arena.
    const praise = tut.praise, info = praise ? null : tut.goalInfo();
    if (!praise && !info) return;
    const cw = Math.min(W - 16 * u, (ph ? 340 : 400) * u), ps = (ph ? 34 : 32) * u, pad = 6 * u;
    const iw = cw - ps - 3 * pad, tsz = ph ? 7 : 6.5, tlh = (ph ? 10.5 : 9.5) * u;
    const body = wrap(c, praise || info.text, tsz, iw, u).slice(0, praise ? 3 : 2);
    let extra = 0;
    if (info?.items) extra = info.items.length * 11 * u + 2 * u;
    else if (info?.bar || info?.need) extra = 13 * u;
    const ch = Math.max(ps + 2 * pad, 14 * u + body.length * tlh + extra + pad);
    const x = Math.round((W - cw) / 2), y = Math.round(area.top + 6 * u);
    const col = praise ? '#7ae07a' : '#ffd23a';
    panel(c, x, y, cw, ch, u, col, 'rgba(22,14,10,0.9)');
    this.drawProfPortrait(x + pad, y + pad, ps, !!praise, u, col);
    const ix = x + ps + 2 * pad;
    const title = praise ? 'MUITO BEM!' : info.title;
    text(c, title, ix, y + pad + 7 * u, fitSize(c, title, praise ? 7 : 5.5, iw, u), col, 'left', u);
    let ty = y + pad + 7 * u + tlh + 1 * u;
    for (const ln of body) { this.richLine(ln, ix, ty, tsz, u, Infinity, praise ? '#e8ffe0' : '#ffffff'); ty += tlh; }
    if (info?.items) {
      for (const it of info.items) {
        const bs = 7 * u, by2 = ty - bs + u;
        c.fillStyle = it.done ? '#7ae07a' : '#1a1210'; c.fillRect(ix, by2, bs, bs);
        c.strokeStyle = it.done ? '#7ae07a' : '#d8c08a'; c.lineWidth = u; c.strokeRect(ix + 0.5 * u, by2 + 0.5 * u, bs - u, bs - u);
        if (it.done) { c.strokeStyle = '#0c2a08'; c.lineWidth = 1.5 * u; c.beginPath(); c.moveTo(ix + 1.5 * u, by2 + 3.5 * u); c.lineTo(ix + 3 * u, by2 + 5.5 * u); c.lineTo(ix + 6 * u, by2 + 1.5 * u); c.stroke(); }
        text(c, it.label, ix + bs + 5 * u, ty, fitSize(c, it.label, 6, iw - bs - 6 * u, u), it.done ? '#7ae07a' : '#e8dcc0', 'left', u);
        ty += 11 * u;
      }
    } else if (info?.bar) {
      const bw2 = iw, bh2 = 9 * u, by2 = ty - 7 * u;
      c.fillStyle = '#100a08'; c.fillRect(ix - u, by2 - u, bw2 + 2 * u, bh2 + 2 * u);
      c.fillStyle = '#3a1a14'; c.fillRect(ix, by2, bw2, bh2);
      c.fillStyle = '#e8403a'; c.fillRect(ix, by2, bw2 * Math.max(0, info.bar.k), bh2);
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(ix, by2, bw2 * Math.max(0, info.bar.k), 2 * u);
      text(c, info.bar.label, ix + bw2 / 2, by2 + bh2 - 1.5 * u, fitSize(c, info.bar.label, 5.5, bw2 - 8 * u, u), '#fff', 'center', u);
    } else if (info?.need) {
      const bs = 9 * u;
      for (let k = 0; k < info.need; k++) {
        const done = k < info.n;
        c.fillStyle = done ? '#7ae07a' : '#1a1210'; c.fillRect(ix + k * (bs + 4 * u), ty - bs + 2 * u, bs, bs);
        c.strokeStyle = done ? '#c8ffc0' : '#6a5a3a'; c.lineWidth = u; c.strokeRect(ix + k * (bs + 4 * u) + 0.5 * u, ty - bs + 2.5 * u, bs - u, bs - u);
      }
      text(c, `${info.n}/${info.need}`, ix + info.need * (bs + 4 * u) + 4 * u, ty + u, 6, '#ffe9b0', 'left', u);
    }
    if (tut.tip && !praise) {
      const tsz2 = ph ? 7 : 6;
      let yy = y + ch + 12 * u;
      for (const ln of wrap(c, tut.tip.text, tsz2, cw - 12 * u, u)) { text(c, ln, W / 2, yy, tsz2, Math.floor(this.time * 4) % 2 ? '#ffb04a' : '#ffd08a', 'center', u); yy += (tsz2 + 4) * u; }
    }
  }

  // Formatura: diploma com o professor e os próximos passos.
  renderTutorialEnd(u, W, H, actions) {
    const c = this.c, cx = W / 2, ph = this.phone, col = ph && this.portrait;
    c.fillStyle = 'rgba(8,4,2,0.8)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W - 20 * u, 460 * u), x = cx - pw / 2;
    const bh = (ph ? 30 : 26) * u, g = 8 * u;
    const btnH = col ? 3 * (bh + g) : bh;
    const dh = Math.min(H - btnH - 40 * u, 200 * u), y = Math.max(10 * u, (H - dh - btnH - 16 * u) / 2);
    panel(c, x, y, pw, dh, u, '#ffd23a', 'rgba(40,28,16,0.97)');
    c.strokeStyle = '#8a6a2a'; c.lineWidth = u; c.strokeRect(x + 6 * u, y + 6 * u, pw - 12 * u, dh - 12 * u);
    text(c, 'DIPLOMA', cx, y + 26 * u, 14, '#ffd23a', 'center', u);
    const sub = 'Escola de Monstros do Professor Remendo';
    text(c, sub, cx, y + 40 * u, fitSize(c, sub, 6, pw - 24 * u, u), '#e8dcc0', 'center', u);
    const ps = Math.min(70 * u, dh - 100 * u);
    if (ps > 30 * u) this.drawProfPortrait(cx - ps / 2, y + 48 * u, ps, false, u);
    const yy = y + 62 * u + Math.max(0, ps);
    para(c, 'Você aprendeu a andar, atirar, golpear, esquivar, usar poderes, evoluir e trocar de monstro.', cx, yy, ph ? 6.5 : 6, pw - 30 * u, '#f4ead0', 'center', u, ph ? 10 : 9, 3);
    const by = y + dh + 12 * u;
    const list = [['JOGAR CONTRA A IA', actions.tutorialPlay, { color: '#ff8a3a' }], ['TREINAMENTO', actions.tutorialTrain, { color: '#d8c08a' }], ['MENU PRINCIPAL', actions.menu, { color: '#aa9' }]];
    const bw = col ? Math.min(220 * u, W - 40 * u) : Math.min(150 * u, (W - 40 * u) / 3);
    list.forEach(([label, fn, opts], k) => {
      if (col) this.button(cx - bw / 2, by + k * (bh + g), bw, bh, label, fn, opts);
      else this.button(cx - (3 * bw + 2 * g) / 2 + k * (bw + g), by, bw, bh, label, fn, opts);
    });
    this.drawButtons(u);
  }

  // Menus sobre a batalha (pausa / fim de partida). Retorna true se algo foi desenhado.
  renderOverlay(kind, u, W, H, world, actions) {
    const c = this.c, cx = W / 2;
    this.buttons = [];
    const bw = 200 * u, bh = 28 * u;
    if (kind === 'pause') {
      c.fillStyle = 'rgba(8,4,2,0.7)';
      c.fillRect(0, 0, W, H);
      text(c, 'PAUSADO', cx, H * 0.32, 16, '#ffe9b0', 'center', u);
      let y = H * 0.4;
      this.button(cx - bw / 2, y, bw, bh, 'CONTINUAR', actions.resume); y += bh + 10 * u;
      if (world.tutorial) this.button(cx - bw / 2, y, bw, bh, world.tutorial.phase === 'end' ? 'ENCERRAR TUTORIAL' : 'PULAR LIÇÃO', actions.tutorialSkip, { color: '#d8c08a' });
      else if (world.training) this.button(cx - bw / 2, y, bw, bh, 'PAINEL DE TREINO (T)', actions.trainingPanel, { color: '#d8c08a' });
      else this.button(cx - bw / 2, y, bw, bh, 'REINICIAR PARTIDA', actions.rematch, { color: '#ff8a3a' });
      y += bh + 10 * u;
      this.button(cx - bw / 2, y, bw, bh, 'MENU PRINCIPAL', actions.menu, { color: '#aa9' });
    } else if (kind === 'online') {
      c.fillStyle = 'rgba(8,4,2,0.55)';
      c.fillRect(0, 0, W, H);
      text(c, 'MENU (a partida continua)', cx, H * 0.32, 12, '#ffe9b0', 'center', u);
      let y = H * 0.4;
      this.button(cx - bw / 2, y, bw, bh, 'CONTINUAR', actions.resume); y += bh + 10 * u;
      this.button(cx - bw / 2, y, bw, bh, 'SAIR DA PARTIDA', actions.leaveOnline, { color: '#ff8a3a' });
    } else if (kind === 'training') {
      this.renderTrainingPanel(u, W, H, world, actions);
      return;
    } else if (kind === 'tutorialEnd') {
      this.renderTutorialEnd(u, W, H, actions);
      return;
    } else if (kind === 'help') {
      this.renderHelp(u, W, H, world, actions);
      return;
    } else if (kind === 'end') {
      // Celular em pé: botões um embaixo do outro (lado a lado passavam da largura da tela).
      const col = this.phone && this.portrait;
      const list = actions.online
        ? [[actions.isHost() ? 'VOLTAR À SALA' : 'AGUARDANDO ANFITRIÃO', actions.backToRoom, { color: '#ff8a3a', disabled: !actions.isHost(), size: 7 }], ['SAIR DA SALA', actions.leaveOnline, { color: '#aa9' }]]
        : [['REVANCHE', actions.rematch, { color: '#ff8a3a' }], ['OUTRO TIME/ARENA', actions.reselect, { color: '#7ad84a' }], ['MENU PRINCIPAL', actions.menu, { color: '#aa9' }]];
      const g = (col ? 8 : actions.online ? 12 : 10) * u;
      list.forEach(([label, fn, opts], k) => {
        if (col) this.button(cx - bw / 2, H - (list.length - k) * (bh + g) - 8 * u, bw, bh, label, fn, opts);
        else this.button(cx - (list.length * bw + (list.length - 1) * g) / 2 + k * (bw + g), H * 0.66, bw, bh, label, fn, opts);
      });
    }
    this.drawButtons(u);
    void world;
  }
}
