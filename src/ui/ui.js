import { SPECIES, ROSTER, formsOf } from '../sim/species.js';

import { ARENAS, ARENA_ORDER } from '../arenas/index.js';
import { ELEMENT_MULT, EVOLUTION, SWITCH, WORLD_W, WORLD_H, FFA_COLORS } from '../config.js';
import { World } from '../sim/world.js';
import { Renderer, ELEMENT_COLOR, SIG_COLOR } from '../render/renderer.js';
import { makeCanvas } from '../render/pixel.js';
import { abilityIcon, statusIcon } from '../render/hud.js';
import { drawTail } from '../render/electricfx.js';

// Telas fora da batalha (menu, time, arena, bestiário, opções) e menus sobre a batalha (pausa, fim).
// Tudo desenhado no canvas no mesmo estilo pixel art; mouse e teclado funcionam em todas as telas.

const FONT = '"Press Start 2P", monospace';
const ELEMENT_NAME = { fire: 'Fogo', water: 'Água', plant: 'Planta', earth: 'Terra', electric: 'Elétrico' };
const KEY_LABEL = { primary: 'MOUSE E', melee: 'MOUSE D', q: 'Q', e: 'E', f: 'F', dodge: 'ESPAÇO' };
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
  const def = { shake: true, numbers: true, difficulty: 'normal', speed: 1, debug: false, sound: true, volume: 0.6 };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return def; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* armazenamento indisponível */ } }

function text(c, s, x, y, size, color, align = 'left', u = 1, stroke = true) {
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
    if (screen === 'arena') this.buildPreviews();
  }

  // Fundo animado: uma luta IA × IA de verdade numa arena aleatória.
  ensureDemo() {
    if (this.demo && !this.demo.world.over && this.demo.world.time < 90) return;
    const arena = ARENA_ORDER[(Math.random() * 3) | 0];
    const world = World.match((Math.random() * 1e6) | 0, undefined, null, arena);
    if (!this.demo) this.demo = { renderer: new Renderer(makeCanvas(8, 8)) };
    this.demo.renderer.art = this.art;
    this.demo.renderer.shakeEnabled = false;
    this.demo.renderer.reset(world);
    this.demo.world = world;
  }

  buildPreviews() {
    for (const id of ARENA_ORDER) {
      if (this.previews[id]) continue;
      const world = World.match(7, undefined, null, id);
      for (let k = 0; k < 30; k++) world.step(1 / 60);
      const r = new Renderer(makeCanvas(8, 8));
      r.art = this.art;
      r.reset(world);
      r.render(world, 1, 1 / 60, { dpr: 1, embedded: true, speed: 1 });
      const img = makeCanvas(WORLD_W, WORLD_H);
      img.getContext('2d').drawImage(r.low, 0, 0);
      this.previews[id] = img;
    }
  }

  // ───────────── Entrada ─────────────
  pointerMove(x, y) { this.mouse = { x, y }; }
  pointerDown(x, y) {
    this.mouse = { x, y };
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
      drawTail(g, tw / 2, f.ay + 10 - f.top * (big ? 0.22 : 0.3), flip ? -1 : 1, big ? 1.35 : 1, this.time, seed + 3, 0, f.w * 0.3);
      c.drawImage(tb, -(tw / 2) * scale, -(f.ay + 10) * scale, tw * scale, th * scale);
    }
    if (flip) c.scale(-1, 1);
    c.drawImage(f.canvas, -f.ax * scale, -f.ay * scale, f.w * scale, f.h * scale);
    c.restore();
    return f.top * scale;
  }

  // ───────────── Quadro ─────────────
  render(dt, dpr) {
    this.time += dt;
    this.fade = Math.max(0, this.fade - dt * 4);
    const c = this.c, W = this.canvas.width, H = this.canvas.height;
    const u = Math.max(1, Math.min(W / 760, H / 520)) ;
    this.buttons = [];
    // Fundo: luta de demonstração escurecida.
    this.ensureDemo();
    const d = this.demo;
    if (dt > 0) for (let k = 0; k < Math.round(dt * 60); k++) d.world.step(1 / 60);
    d.renderer.render(d.world, 1, dt, { dpr, embedded: true, speed: 1 });
    c.imageSmoothingEnabled = false;
    const S = Math.max(W / WORLD_W, H / WORLD_H);
    c.drawImage(d.renderer.low, (W - WORLD_W * S) / 2, (H - WORLD_H * S) / 2, WORLD_W * S, WORLD_H * S);
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
    if (this.fade > 0) { c.fillStyle = `rgba(0,0,0,${this.fade})`; c.fillRect(0, 0, W, H); }
  }

  renderMenu(u, W, H) {
    const c = this.c;
    const cx = W / 2;
    // Título com as cores dos três elementos.
    const title = 'ELEMENTAL ARENA';
    const ts = Math.min(30, (W / u) / 22);
    c.font = `${ts * u}px ${FONT}`;
    const tw = c.measureText(title).width;
    let x = cx - tw / 2;
    const cols = ['#ff8a3a', '#ffb040', '#ffd860', '#8fd8ff', '#46b4ff', '#7ad84a', '#a8f070'];
    for (let k = 0; k < title.length; k++) {
      const ch = title[k];
      const y = H * 0.15 + Math.sin(this.time * 3 + k * 0.5) * 3 * u;
      text(this.c, ch, x, y, ts, cols[Math.floor((k / title.length) * cols.length)], 'left', u);
      x += c.measureText(ch).width;
    }
    text(c, 'Duelo de monstros elementais em tempo real · 6 monstros · online até 4 jogadores (1v1, 2v2, todos contra todos)', cx, H * 0.15 + 22 * u, 6, '#e8dcc0', 'center', u);
    // Os seis monstros (forma base) com as evoluções esmaecidas ao fundo.
    const gap = Math.min(104 * u, W / 6.6);
    ROSTER.forEach((key, k) => {
      const base = SPECIES[key], evo = SPECIES[base.evolvesTo];
      const mx = cx + (k - 2.5) * gap, my = H * 0.43;
      this.c.globalAlpha = 0.3;
      this.drawMonsterArt(evo, mx + 14 * u, my - 6 * u, Math.max(1, Math.round(1.3 * u)), k + 10);
      this.c.globalAlpha = 1;
      this.drawMonsterArt(base, mx - 4 * u, my + Math.sin(this.time * 2 + k) * 2 * u, Math.max(1, Math.round(2 * u)), k);
      text(c, base.name.toUpperCase(), mx, my + 14 * u, fitSize(c, base.name.toUpperCase(), 6, gap - 4 * u, u), ELEMENT_COLOR[base.element], 'center', u);
    });
    const bw = 230 * u, bh = 28 * u;
    let by = H * 0.53;
    this.button(cx - bw / 2, by, bw, bh, 'JOGAR CONTRA A IA', () => { this.team = []; this.flow = 'local'; this.go('team'); }, { size: 10 });
    by += bh + 8 * u;
    this.button(cx - bw / 2, by, bw, bh, 'MULTIPLAYER ONLINE', () => { this.team = this.team.length === 3 ? this.team : []; this.flow = 'mp'; this.go('team'); }, { color: '#ff8a3a', size: 10 });
    by += bh + 8 * u;
    this.button(cx - bw / 2, by, bw, bh, 'TREINAMENTO', () => { this.team = []; this.flow = 'training'; this.go('team'); }, { color: '#d8c08a' });
    by += bh + 8 * u;
    this.button(cx - bw / 2, by, bw, bh, 'MONSTROS', () => this.go('bestiary'), { color: '#7ad84a' });
    by += bh + 8 * u;
    this.button(cx - bw / 2, by, bw, bh, 'OPÇÕES', () => this.go('options'), { color: '#46b4ff' });
    text(c, 'Mouse ou setas + Enter · arte dos monstros: folhas do usuário', cx, H - 12 * u, 5, '#887', 'center', u);
  }

  renderTeam(u, W, H) {
    const c = this.c, cx = W / 2;
    const training = this.flow === 'training';
    text(c, this.flow === 'mp' ? 'SEU TIME PARA O ONLINE' : training ? 'TREINAMENTO' : 'MONTE SEU TIME', cx, 30 * u, 13, '#ffe9b0', 'center', u);
    text(c, training ? 'Escolha de 1 a 3 monstros para treinar contra bonecos de pano (troque com 1/2/3).' : `Escolha 3 dos ${ROSTER.length} monstros, na ordem em que vão entrar (o 1º começa em campo).`, cx, 46 * u, 6, '#d8ccb0', 'center', u);
    const gap = 8 * u, top = 56 * u, btnH = 28 * u, btnY = H - btnH - 10 * u, orderH = 30 * u;
    const avail = btnY - orderH - 10 * u - top;
    const COLS = ROSTER.length > 6 ? 4 : 3, ROWS = Math.ceil(ROSTER.length / COLS);
    const ch = Math.floor((avail - gap * (ROWS - 1)) / ROWS);
    const cw = Math.min(Math.floor((W - 24 * u - gap * (COLS - 1)) / COLS), 240 * u);
    const x0 = cx - (cw * COLS + gap * (COLS - 1)) / 2;
    ROSTER.forEach((key, k) => {
      const def = SPECIES[key];
      const x = x0 + (k % COLS) * (cw + gap), y = top + Math.floor(k / COLS) * (ch + gap);
      const idx = this.team.indexOf(key);
      const hover = this.mouse.x >= x && this.mouse.x <= x + cw && this.mouse.y >= y && this.mouse.y <= y + ch;
      panel(c, x, y, cw, ch, u, idx >= 0 ? '#ffd23a' : hover ? ELEMENT_COLOR[def.element] : '#5a4636');
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
    const sy = top + 2 * ch + gap + 8 * u;
    for (let k = 0; k < 3; k++) {
      const key = this.team[k];
      const x = cx + (k - 1) * 128 * u - 54 * u;
      panel(c, x, sy, 108 * u, 22 * u, u, key ? ELEMENT_COLOR[SPECIES[key].element] : '#3a302a');
      text(c, `${k + 1}º ${key ? SPECIES[key].name : '—'}`, x + 54 * u, sy + 15 * u, fitSize(c, `${k + 1}º ${key ? SPECIES[key].name : '—'}`, 6, 100 * u, u), key ? '#fff' : '#776', 'center', u);
    }
    this.button(cx - 250 * u, btnY, 150 * u, btnH, 'VOLTAR', () => this.go('menu'), { back: true, color: '#aa9' });
    this.button(cx - 75 * u, btnY, 150 * u, btnH, 'ALEATÓRIO', () => { this.team = [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3); }, { color: '#e8b8ff' });
    this.button(cx + 100 * u, btnY, 150 * u, btnH, 'CONTINUAR', () => this.go(this.flow === 'mp' ? 'mp' : 'arena'), { disabled: training ? this.team.length < 1 : this.team.length !== 3 });
  }

  // ───────────── Multiplayer: criar / entrar em sala ─────────────
  renderMp(u, W, H) {
    const c = this.c, cx = W / 2, mp = this.mp;
    text(c, 'MULTIPLAYER ONLINE', cx, 36 * u, 14, '#ffe9b0', 'center', u);
    text(c, 'Seu time: ' + this.team.map((k) => SPECIES[k].name).join(' · '), cx, 54 * u, 6, '#d8ccb0', 'center', u);
    const bw = 250 * u, bh = 30 * u;
    let y = 82 * u;
    text(c, 'CRIAR UMA SALA (você recebe um código para os amigos)', cx, y, 6, '#e8dcc0', 'center', u);
    y += 10 * u;
    const bw3 = Math.min(bw * 0.66, (W - 40 * u) / 3 - 6 * u);
    this.button(cx - bw3 * 1.5 - 6 * u, y, bw3, bh, 'SALA 1v1', () => this.hooks.mpCreate('1v1'), { color: '#ff8a3a', disabled: mp.busy });
    this.button(cx - bw3 / 2, y, bw3, bh, 'SALA 2v2', () => this.hooks.mpCreate('2v2'), { color: '#ff8a3a', disabled: mp.busy });
    this.button(cx + bw3 / 2 + 6 * u, y, bw3, bh, 'SALA 1v1v1v1', () => this.hooks.mpCreate('ffa'), { color: '#ff5a8a', disabled: mp.busy });
    y += bh + 30 * u;
    text(c, 'OU ENTRAR COM UM CÓDIGO (4 caracteres, digite no teclado)', cx, y, 6, '#e8dcc0', 'center', u);
    y += 12 * u;
    const bx = 44 * u, gp = 8 * u, tot = bx * 4 + gp * 3;
    for (let k = 0; k < 4; k++) {
      const x = cx - tot / 2 + k * (bx + gp);
      panel(c, x, y, bx, bx, u, k === mp.code.length ? '#ffd23a' : '#5a4636');
      const ch = mp.code[k];
      if (ch) text(c, ch, x + bx / 2, y + bx * 0.66, 18, '#ffffff', 'center', u);
      else if (k === mp.code.length && Math.floor(this.time * 2) % 2 === 0) text(c, '_', x + bx / 2, y + bx * 0.7, 16, '#ffd23a', 'center', u);
    }
    y += bx + 12 * u;
    this.button(cx - 100 * u, y, 200 * u, bh, mp.busy ? 'CONECTANDO...' : 'ENTRAR NA SALA', () => this.hooks.mpJoin(mp.code), { color: '#7ad84a', disabled: mp.code.length !== 4 || mp.busy });
    y += bh + 14 * u;
    if (mp.status) text(c, mp.status, cx, y, 6, '#ffe066', 'center', u);
    text(c, 'Todos precisam abrir o jogo pelo mesmo endereço do servidor.', cx, H - 52 * u, 5, '#887', 'center', u);
    this.button(cx - 75 * u, H - 40 * u, 150 * u, 28 * u, 'VOLTAR', () => { this.go('team'); }, { back: true, color: '#aa9' });
  }

  // ───────────── Multiplayer: sala de espera ─────────────
  renderLobby(u, W, H) {
    const c = this.c, cx = W / 2, mp = this.mp;
    const room = mp.room;
    if (!room) { this.go('mp'); return; }
    const isHost = room.host === mp.myId;
    const me = room.players.find((p) => p.id === mp.myId);
    text(c, 'SALA', cx - 70 * u, 34 * u, 10, '#bba', 'center', u);
    text(c, room.code, cx + 20 * u, 36 * u, 22, '#ffe066', 'center', u);
    text(c, 'Passe o código (ou o link) aos amigos para eles entrarem.', cx, 52 * u, 6, '#d8ccb0', 'center', u);
    const copied = mp.copiedAt && performance.now() - mp.copiedAt < 2000;
    this.button(cx + 90 * u, 20 * u, 150 * u, 22 * u, copied ? 'LINK COPIADO!' : 'COPIAR LINK', () => { this.hooks.mpCopyLink?.(room.code).then((ok) => { mp.copiedAt = ok ? performance.now() : 0; if (!ok) this.mpError('Não foi possível copiar. Passe o código: ' + room.code); }); }, { color: '#46b4ff', size: 7 });
    const arenaName = ARENAS[room.arena].name;
    // Configuração (só o anfitrião muda).
    let y = 62 * u;
    const bw = 190 * u, bh = 24 * u;
    this.button(cx - bw - 6 * u, y, bw, bh, `MODO: ${room.mode === 'ffa' ? '1v1v1v1' : room.mode}`, () => this.hooks.mpSend({ t: 'config', mode: { '1v1': '2v2', '2v2': 'ffa', ffa: '1v1' }[room.mode] || '1v1' }), { disabled: !isHost, color: '#ff8a3a', size: 8 });
    const ai = ARENA_ORDER.indexOf(room.arena);
    this.button(cx + 6 * u, y, bw, bh, `ARENA: ${arenaName}`, () => this.hooks.mpSend({ t: 'config', arena: ARENA_ORDER[(ai + 1) % ARENA_ORDER.length] }), { disabled: !isHost, color: '#46b4ff', size: 7 });
    y += bh + 6 * u;
    // Robôs: dificuldade e completar as vagas livres.
    const LV = ['easy', 'normal', 'hard'], lvl = room.botLevel || 'normal';
    const free = room.seats - room.players.length;
    this.button(cx - bw - 6 * u, y, bw, bh, `ROBÔS: ${DIFFICULTY[lvl].toUpperCase()}`, () => this.hooks.mpSend({ t: 'config', botLevel: LV[(LV.indexOf(lvl) + 1) % 3] }), { disabled: !isHost, color: '#b8a0ff', size: 7 });
    this.button(cx + 6 * u, y, bw, bh, 'COMPLETAR COM ROBÔS', () => this.hooks.mpSend({ t: 'fillBots' }), { disabled: !isHost || free <= 0, color: '#b8a0ff', size: 7 });
    y += bh + 4 * u;
    if (!isHost) text(c, 'Só o anfitrião muda o modo, a arena e os robôs.', cx, y + 6 * u, 5, '#887', 'center', u);
    y += 12 * u;
    // Vagas por equipe.
    const half = room.seats / 2; // ffa: 4 vagas em 2×2 (cada vaga é um lado)
    const sw = Math.min(250 * u, (W - 40 * u) / 2 - 6 * u), sh = Math.min(54 * u, (H - y - 120 * u) / half - 6 * u);
    const small = (x0, y0, w0, label, onClick, color) => this.button(x0, y0, w0, 16 * u, label, onClick, { color, size: 5.5 });
    for (let side = 0; side < 2; side++) {
      const x = cx + (side === 0 ? -sw - 6 * u : 6 * u);
      if (room.mode === 'ffa') { if (side === 0) text(c, 'TODOS CONTRA TODOS · último de pé vence', cx, y + 8 * u, 8, '#ff9ab0', 'center', u); }
      else text(c, side === 0 ? 'EQUIPE A' : 'EQUIPE B', x + sw / 2, y + 8 * u, 8, side === 0 ? '#ffd23a' : '#ff4a5a', 'center', u);
      for (let k = 0; k < half; k++) {
        const seat = side === 0 ? (room.mode === '1v1' ? 0 : k) : (room.mode === '1v1' ? 1 : half + k);
        const p = room.players.find((q) => q.seat === seat);
        const sy = y + 14 * u + k * (sh + 6 * u);
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
            text(c, 'clique para ocupar', x + sw - 8 * u, sy + 14 * u, 5, '#998', 'right', u);
            this.button(x, sy, sw, sh, '', () => this.hooks.mpSend({ t: 'seat', seat }), { custom: true });
          }
        } else if (p) {
          text(c, p.name + (p.id === room.host ? ' ★' : '') + (p.id === mp.myId ? ' (você)' : ''), x + 8 * u, sy + 14 * u, fitSize(c, p.name + ' (você) ★', 7, sw - 16 * u, u), p.connected ? '#fff' : '#888', 'left', u);
          text(c, p.ready ? 'PRONTO' : 'esperando...', x + sw - 8 * u, sy + 14 * u, 6, p.ready ? '#7ad84a' : '#bba', 'right', u);
          (p.team || []).forEach((key, i) => this.drawMonsterArt(SPECIES[key], x + 30 * u + i * 44 * u, sy + sh - 6 * u, 1, i + seat));
          if (!p.team) text(c, 'sem time', x + 8 * u, sy + sh - 10 * u, 5, '#887', 'left', u);
        } else if (isHost) {
          text(c, 'vaga livre', x + sw / 2, sy + sh / 2 - 6 * u, 7, '#776', 'center', u);
          small(x + sw / 2 - 98 * u, sy + sh / 2, 92 * u, 'SENTAR AQUI', () => this.hooks.mpSend({ t: 'seat', seat }), '#ffd23a');
          small(x + sw / 2 + 6 * u, sy + sh / 2, 92 * u, '+ ROBÔ', () => this.hooks.mpSend({ t: 'addBot', seat }), '#b8a0ff');
        } else {
          text(c, 'vaga livre', x + sw / 2, sy + sh / 2 - 2 * u, 7, '#776', 'center', u);
          text(c, 'clique para sentar aqui', x + sw / 2, sy + sh / 2 + 9 * u, 5, '#665', 'center', u);
          this.button(x, sy, sw, sh, '', () => this.hooks.mpSend({ t: 'seat', seat }), { custom: true });
        }
      }
    }
    const by = H - 40 * u;
    this.button(cx - 270 * u, by, 120 * u, 28 * u, 'SAIR', () => this.hooks.mpLeave(), { back: true, color: '#aa9' });
    this.button(cx - 130 * u, by, 150 * u, 28 * u, me?.ready ? 'DESMARCAR' : 'PRONTO', () => this.hooks.mpSend({ t: 'ready', ready: !me?.ready }), { color: '#7ad84a', disabled: !me?.team });
    const allReady = room.players.length === room.seats && room.players.every((p) => p.team && (p.ready || p.id === room.host));
    this.button(cx + 40 * u, by, 220 * u, 28 * u, 'INICIAR PARTIDA', () => this.hooks.mpSend({ t: 'start' }), { disabled: !isHost || !allReady, color: '#ff8a3a' });
    const need = room.seats - room.players.length;
    const msg = need > 0 ? (isHost ? `Faltam ${need}: chame amigos ou use + ROBÔ` : `Aguardando ${need} jogador${need > 1 ? 'es' : ''}...`) : allReady ? 'Todos prontos!' : 'Aguardando todos ficarem prontos...';
    text(c, msg, cx, by - 8 * u, 6, '#ffe066', 'center', u);
  }

  renderArena(u, W, H) {
    const c = this.c, cx = W / 2;
    text(c, 'ESCOLHA A ARENA', cx, 30 * u, 13, '#ffe9b0', 'center', u);
    const ids = ARENA_ORDER;
    // Layout que sempre cabe: botões fixos no rodapé, descrição acima deles, cartões no espaço restante.
    const btnH = 28 * u, btnY = H - btnH - 10 * u;
    const descH = 24 * u;
    const top = 44 * u, bottom = btnY - descH - 8 * u;
    const gap = 8 * u;
    const cols = 2, rows = 2;
    const ch = Math.floor((bottom - top - gap * (rows - 1)) / rows);
    const cwMax = Math.floor((Math.min(W - 24 * u, 1100 * u) - gap * (cols - 1)) / cols);
    const textH = 56 * u; // nome + subtítulo + 2 linhas de recursos
    // Prévia 16:9 que cabe na altura e na largura do cartão.
    let ph = Math.min(ch - textH - 8 * u, (cwMax - 12 * u) * 9 / 16);
    ph = Math.max(40 * u, ph);
    const pw = ph * 16 / 9;
    const cw = Math.min(cwMax, pw + 12 * u);
    const x0 = cx - (cw * cols + gap * (cols - 1)) / 2;
    ids.forEach((id, k) => {
      const A = ARENAS[id];
      const x = x0 + (k % cols) * (cw + gap), y = top + Math.floor(k / cols) * (ch + gap);
      const sel = this.arena === id;
      const hover = this.mouse.x >= x && this.mouse.x <= x + cw && this.mouse.y >= y && this.mouse.y <= y + ch;
      panel(c, x, y, cw, ch, u, sel ? '#ffd23a' : hover ? '#c8b080' : '#5a4636');
      if (this.previews[id]) { c.imageSmoothingEnabled = false; c.drawImage(this.previews[id], x + (cw - pw) / 2, y + 6 * u, pw, ph); }
      const ty = y + ph + 20 * u;
      text(c, A.name.toUpperCase(), x + 8 * u, ty, fitSize(c, A.name.toUpperCase(), 7, cw - 16 * u, u), sel ? '#ffd23a' : '#f4ead0', 'left', u);
      text(c, A.subtitle, x + 8 * u, ty + 11 * u, fitSize(c, A.subtitle, 5, cw - 16 * u, u), '#bba', 'left', u);
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
    const desc = A ? A.description : 'Clique em uma arena para selecioná-la.';
    wrap(c, desc, 5.5, Math.min(W - 40 * u, 700 * u), u).slice(0, 2).forEach((ln, k) => text(c, ln, cx, bottom + 16 * u + k * 10 * u, 5.5, '#e8dcc0', 'center', u));
    this.button(cx - 170 * u, btnY, 150 * u, btnH, 'VOLTAR', () => this.go('team'), { back: true, color: '#aa9' });
    const tr = this.flow === 'training';
    if (!tr) this.button(W - 214 * u, 12 * u, 202 * u, 22 * u, this.ffaLocal ? 'MODO: 1v1v1v1 (você + 3 IAs)' : 'MODO: 1v1 (contra 1 IA)', () => { this.ffaLocal = !this.ffaLocal; }, { color: this.ffaLocal ? '#ff5a8a' : '#ff8a3a', size: 6 });
    this.button(cx + 20 * u, btnY, 150 * u, btnH, tr ? 'TREINAR!' : 'LUTAR!', () => this.hooks.startBattle({ team: [...this.team], arena: this.arena, training: tr, ffa: !tr && !!this.ffaLocal }), { disabled: !this.arena, color: tr ? '#d8c08a' : '#ff8a3a' });
  }

  renderBestiary(u, W, H) {
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
        text(c, `${KEY_LABEL[slot]}`, x + 20 * u, ly, 5, '#ffd23a', 'left', u);
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
    text(c, 'OPÇÕES', cx, 40 * u, 14, '#ffe9b0', 'center', u);
    const pw = Math.min(520 * u, W - 40 * u);
    const x = cx - pw / 2;
    let y = 60 * u;
    const set = (k, v) => { S[k] = v; saveSettings(S); this.hooks.applySettings(S); };
    const row = (label, value, onClick) => {
      text(c, label, x, y + 17 * u, 7, '#f4ead0', 'left', u);
      this.button(x + pw - 170 * u, y, 170 * u, 26 * u, value, onClick, { size: 7, color: '#46b4ff' });
      y += 34 * u;
    };
    row('Tremor de tela', S.shake ? 'LIGADO' : 'DESLIGADO', () => set('shake', !S.shake));
    row('Números de dano', S.numbers ? 'LIGADO' : 'DESLIGADO', () => set('numbers', !S.numbers));
    const diffs = Object.keys(DIFFICULTY);
    row('Dificuldade da IA', DIFFICULTY[S.difficulty].toUpperCase(), () => set('difficulty', diffs[(diffs.indexOf(S.difficulty) + 1) % diffs.length]));
    const speeds = [0.5, 1, 1.5];
    row('Velocidade do jogo', `${S.speed}x`, () => set('speed', speeds[(speeds.indexOf(S.speed) + 1) % speeds.length]));
    row('Visão da IA (depuração)', S.debug ? 'LIGADA' : 'DESLIGADA', () => set('debug', !S.debug));
    const vols = [0, 0.3, 0.6, 1];
    row('Som', !S.sound || S.volume <= 0 ? 'DESLIGADO' : `${Math.round(S.volume * 100)}%`, () => {
      const i = S.sound ? vols.indexOf(S.volume) : 0;
      const v = vols[(Math.max(0, i) + 1) % vols.length];
      S.sound = v > 0; set('volume', v);
    });
    y += 4 * u;
    panel(c, x, y, pw, H - y - 50 * u, u);
    const ctl = [
      ['WASD / setas', 'mover'], ['Mouse', 'mirar'], ['Botão esquerdo', 'ataque à distância'], ['Botão direito', 'corpo a corpo'],
      ['Q / E / F', 'poderes especiais'], ['Espaço / Shift', 'esquiva (preso? quebra o combo: 35 de energia, recarga 14s)'], ['1 2 3 / Tab', `trocar monstro (recarga ${SWITCH.cooldown}s)`],
      ['G', 'evoluir (com a energia cheia)'], ['H', 'ajuda do monstro em campo'], ['P / Esc', 'pausar'], ['I', 'visão da IA'],
    ];
    let ly = y + 18 * u;
    for (const [k, v] of ctl) {
      if (ly > H - 56 * u) break;
      text(c, k, x + 14 * u, ly, 6, '#ffd23a', 'left', u);
      text(c, v, x + 170 * u, ly, 6, '#e8dcc0', 'left', u);
      ly += 13 * u;
    }
    this.button(cx - 75 * u, H - 40 * u, 150 * u, 28 * u, 'VOLTAR', () => this.go('menu'), { back: true, color: '#aa9' });
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
    const pw = Math.min(W - 30 * u, 720 * u), x = cx - pw / 2;
    let y = 30 * u;
    text(c, actions.firstTime ? 'COMO JOGAR' : 'AJUDA', cx, y, 13, '#ffe9b0', 'center', u);
    y += 16 * u;
    text(c, 'WASD mover · mouse mirar · clique esquerdo/direito atacam · Q/E/F poderes · Espaço esquiva/quebra combo · 1/2/3 troca · G evolui', cx, y, fitSize(c, 'WASD mover · mouse mirar · clique esquerdo/direito atacam · Q/E/F poderes · Espaço esquiva/quebra combo · 1/2/3 troca · G evolui', 5.5, pw, u), '#e8dcc0', 'center', u);
    y += 14 * u;
    if (m) {
      const def = m.def;
      panel(c, x, y, pw, 1, u, ELEMENT_COLOR[def.element]);
      y += 12 * u;
      text(c, `${def.name.toUpperCase()} · ${ELEMENT_NAME[def.element]}`, x + 8 * u, y, 8, ELEMENT_COLOR[def.element], 'left', u);
      if (def.sig) {
        y += 13 * u;
        text(c, def.sig.name.toUpperCase(), x + 8 * u, y, 7, SIG_COLOR[def.sig.kind] || '#fff', 'left', u);
        y += 4 * u;
        for (const ln of wrap(c, def.sig.desc, 5.5, pw - 16 * u, u)) { y += 9 * u; text(c, ln, x + 8 * u, y, 5.5, '#f4ead0', 'left', u); }
      }
      y += 12 * u;
      const colW = (pw - 16 * u) / 2;
      let k = 0, y0 = y;
      for (const [slot, id] of Object.entries(def.controls)) {
        const ab = def.abilities.find((a) => a.id === id);
        const col = k % 2, row = Math.floor(k / 2);
        const bx = x + 8 * u + col * colW, by = y0 + row * 30 * u;
        abilityIcon(c, ab.kind, bx, by - 7 * u, 9 * u, ELEMENT_COLOR[def.element]);
        text(c, `${KEY_LABEL[slot]} · ${ab.name}`, bx + 13 * u, by, fitSize(c, `${KEY_LABEL[slot]} · ${ab.name}`, 5.5, colW - 18 * u, u), '#ffd23a', 'left', u);
        wrap(c, ab.desc || '', 4.5, colW - 18 * u, u).slice(0, 2).forEach((ln, j) => text(c, ln, bx + 13 * u, by + (9 + j * 8) * u, 4.5, '#d8ccb0', 'left', u));
        k++;
      }
      y = y0 + Math.ceil(k / 2) * 30 * u;
      if (def.tips) { text(c, def.tips, x + 8 * u, y, fitSize(c, def.tips, 5, pw - 16 * u, u), '#ffe066', 'left', u); y += 12 * u; }
    }
    // Como ler a tela.
    y += 4 * u;
    const legend = [['stun', 'atordoado'], ['root', 'preso'], ['burn', 'queimando'], ['wet', 'molhado'], ['exhaust', 'exausto'], ['cloak', 'camuflado']];
    let lx = x + 8 * u;
    for (const [k2, name] of legend) { statusIcon(c, k2, lx, y - 6 * u, 8 * u); text(c, name, lx + 10 * u, y, 5, '#e8dcc0', 'left', u); lx += 64 * u; if (lx > x + pw - 60 * u) { lx = x + 8 * u; y += 12 * u; } }
    y += 14 * u;
    for (const ln of [
      'Barra DOURADA sobre a cabeça = golpe IMPARÁVEL (não é interrompido). Branca = acerte para interromper.',
      'Gotas azuis depois de um golpe forte = janela para contra-atacar. Arcos e setas no chão mostram onde o golpe vai pegar.',
      'Triângulo: Fogo > Planta > Água > Fogo (mais dano contra quem você vence). Troque de monstro para virar o confronto.',
    ]) { for (const l2 of wrap(c, ln, 5, pw - 16 * u, u)) { text(c, l2, x + 8 * u, y, 5, '#bba', 'left', u); y += 9 * u; } y += 2 * u; }
    const bw = 200 * u, bh = 28 * u;
    this.button(cx - bw / 2, Math.min(H - bh - 10 * u, y + 6 * u), bw, bh, actions.firstTime ? 'ENTENDI, LUTAR!' : 'VOLTAR (H)', actions.closeHelp, { color: '#7ad84a' });
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
      if (world.training) this.button(cx - bw / 2, y, bw, bh, 'PAINEL DE TREINO (T)', actions.trainingPanel, { color: '#d8c08a' });
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
    } else if (kind === 'help') {
      this.renderHelp(u, W, H, world, actions);
      return;
    } else if (kind === 'end') {
      const y = H * 0.66;
      if (actions.online) {
        const host = actions.isHost();
        this.button(cx - bw - 6 * u, y, bw, bh, host ? 'VOLTAR À SALA' : 'AGUARDANDO ANFITRIÃO', actions.backToRoom, { color: '#ff8a3a', disabled: !host, size: 7 });
        this.button(cx + 6 * u, y, bw, bh, 'SAIR DA SALA', actions.leaveOnline, { color: '#aa9' });
      } else {
        this.button(cx - bw * 1.5 - 10 * u, y, bw, bh, 'REVANCHE', actions.rematch, { color: '#ff8a3a' });
        this.button(cx - bw / 2, y, bw, bh, 'OUTRO TIME/ARENA', actions.reselect, { color: '#7ad84a' });
        this.button(cx + bw / 2 + 10 * u, y, bw, bh, 'MENU PRINCIPAL', actions.menu, { color: '#aa9' });
      }
    }
    this.drawButtons(u);
    void world;
  }
}
