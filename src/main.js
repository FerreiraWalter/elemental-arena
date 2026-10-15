import { World } from './sim/world.js';
import { DT } from './config.js';
import { ROSTER, DEFAULT_TEAM } from './sim/species.js';
import { ARENAS } from './arenas/index.js';
import { Renderer, setPerspective } from './render/renderer.js';
import { UI } from './ui/ui.js';
import { NetClient, serverUrls, inviteCode } from './net/client.js';
import { createMirror } from './net/mirror.js';
import { NetSmoother } from './net/smooth.js';

// Fluxo: carregando → menu (time → arena | multiplayer → sala) → batalha → pausa/fim.
// Batalha LOCAL: passo fixo de 1/60 s (a simulação roda no navegador, contra a IA).
// Batalha ONLINE: o servidor simula (autoritativo); o navegador só envia entradas e desenha o "mundo espelho"
// atualizado pelos snapshots a 20 Hz, interpolando posições entre eles.

const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
const renderer = new Renderer(canvas);
const hud = { dpr: 1, speed: 1, paused: false, started: true };
const keys = new Set();
const mouse = { x: 0, y: 0, inside: false };
let mode = 'loading';
let world = null;
let battle = null; // configuração da última partida local
let overlay = null; // 'pause' | 'end' | 'online'
let overT = 0;
let acc = 0;
let last = performance.now();

// ───────────── Online ─────────────
let net = null;
let online = false;
let mirror = null;

let netPresses = [];
let lastSent = 0;
let lastSentKey = '';
const playerName = (() => {
  const gen = 'Jogador ' + ((Math.random() * 90 + 10) | 0);
  try { const n = localStorage.getItem('ea-name'); if (n) return n; localStorage.setItem('ea-name', gen); } catch { /* sem armazenamento */ }
  return gen;
})();
let session = null; // { code, token } da sala atual: permite voltar à partida se a conexão cair
let reconnecting = false;
let notice = null; // { text, t } aviso sobre a batalha (ex.: reconectando)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ui = new UI(canvas, renderer.art, {
  startBattle, applySettings,
  mpCreate: (m) => mpEnter({ t: 'create', mode: m, name: playerName }),
  mpJoin: (code) => mpEnter({ t: 'join', code, name: playerName }),
  mpSend: (o) => net && net.send(o),
  mpLeave: () => { net?.send({ t: 'leave' }); session = null; ui.mp.room = null; ui.go('menu'); },
  mpCopyLink: async (code) => {
    const q = new URLSearchParams(location.search), link = new URL(location.href);
    link.search = ''; link.hash = '';
    link.searchParams.set('sala', code);
    if (q.get('server')) link.searchParams.set('server', q.get('server'));
    try { await navigator.clipboard.writeText(link.href); return true; } catch { return false; }
  },
});

function makeNet() {
  const n = new NetClient();
  n.on('joined', (m) => {
    session = { code: m.code, token: m.token };
    ui.mp.myId = m.id;
    if (m.rejoined) { reconnecting = false; notice = { text: 'Reconectado!', t: 2 }; return; }
    ui.mp.busy = false; ui.mp.status = '';
    n.send({ t: 'team', team: ui.team });
    ui.go('lobby');
  });
  n.on('room', (m) => {
    ui.mp.room = m;
    if (online && m.state === 'lobby') { online = false; mode = 'menu'; overlay = null; ui.go('lobby'); }
  });
  n.on('error', (m) => {
    if (reconnecting) return; // a tentativa de voltar trata o próprio erro
    if (online) notice = { text: m.message, t: 4 }; else ui.mpError(m.message);
  });
  n.on('start', startOnline);
  n.on('snap', (m) => { if (online) smooth.enqueue(m, performance.now(), world); });
  n.on('left', () => {});
  n.on('closed', () => {
    if (net !== n) return;
    if (online && session?.token) { reconnect(); return; }
    const inRoom = online || ui.screen === 'lobby';
    online = false; ui.mp.room = null; ui.mp.busy = false; session = null;
    if (inRoom && mode !== 'loading') {
      ui.mpError('Conexão com o servidor perdida. Você saiu da sala.');
      mode = 'menu'; overlay = null;
      ui.go('mp');
    }
  });
  return n;
}

// Conecta (tentando os endereços candidatos); falhar ao conectar NÃO é "conexão perdida".
async function ensureNet() {
  if (net && net.open) return net;
  const n = makeNet();
  net = n;
  await n.connect(serverUrls());
  return n;
}

// Caiu no meio da partida: tenta voltar por ~40 s com o token da sessão (a IA joga no seu lugar enquanto isso).
async function reconnect() {
  if (reconnecting) return;
  reconnecting = true;
  const { code, token } = session;
  const delays = [300, 1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000, 5000, 5000];
  let ok = false;
  for (let i = 0; i < delays.length && reconnecting && online; i++) {
    notice = { text: `Conexão perdida. Reconectando... (${i + 1}/${delays.length})`, t: Infinity };
    await sleep(delays[i]);
    try {
      const n = makeNet();
      await n.connect(serverUrls(), 4000);
      net = n;
      n.on('error', (m) => { if (m.code === 'gone' || m.code === 'not_found') { reconnecting = false; n.close(); } });
      n.send({ t: 'rejoin', code, token });
      for (let k = 0; k < 40 && reconnecting && n.open; k++) await sleep(100);
      if (!reconnecting && n.open) { ok = true; break; }
    } catch { /* tenta de novo */ }
  }
  reconnecting = false;
  if (ok) return;
  session = null; online = false; mode = 'menu'; overlay = null; ui.mp.room = null;
  notice = null;
  ui.mpError('Não foi possível voltar à partida. A conexão com o servidor foi perdida.');
  ui.go('mp');
}

async function mpEnter(msg) {
  ui.mp.busy = true; ui.mp.error = null; ui.mp.status = 'Conectando ao servidor...';
  try {
    await ensureNet();
    net.send(msg);
  } catch {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    ui.mpError(local
      ? 'Servidor do jogo não encontrado. Rode "npm start" e abra http://localhost:8140.'
      : 'Não consegui falar com o servidor do jogo. Confira sua internet e tente de novo.');
    ui.mp.status = '';
  }
}

function startOnline(start) {
  mirror = createMirror(start);
  world = mirror.world;
  world.slotNames = start.players.reduce((a, p) => { a[p.seat] = p.name; return a; }, []);
  setPerspective(world.teams[start.you].side);
  renderer.reset(world);
  online = true;
  mode = 'battle';
  overlay = null;
  overT = 0;
  smooth.reset();
  hud.paused = false;
  hud.speed = 1;
  window.world = world;
}

function sendInput(now, neutral = false) {
  if (!online || !net) return;
  const inp = world.input;
  const msg = neutral
    ? { t: 'input', mx: 0, my: 0, ax: inp.aim.x, ay: inp.aim.y, hp: false, hm: false, presses: [] }
    : { t: 'input', mx: inp.move.x, my: inp.move.y, ax: Math.round(inp.aim.x), ay: Math.round(inp.aim.y), hp: !!inp.held.primary, hm: !!inp.held.melee, presses: netPresses.splice(0, 6) };
  const key = JSON.stringify([msg.mx, msg.my, msg.hp, msg.hm, msg.ax >> 3, msg.ay >> 3]);
  if (!msg.presses.length && key === lastSentKey && now - lastSent < 250) return;
  if (!msg.presses.length && now - lastSent < 25) return;
  lastSent = now; lastSentKey = key;
  net.send(msg);
}

function applySettings(s) {
  renderer.shakeEnabled = s.shake;
  renderer.showNumbers = s.numbers;
  renderer.debug = s.debug;
  if (!online) hud.speed = s.speed;
}

// ───────────── Partida local ─────────────
function startBattle(cfg) {
  battle = cfg;
  online = false;
  const enemy = [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3);
  const seed = (Math.random() * 1e6) | 0;
  world = World.match(seed, [cfg.team, enemy], cfg.spectator ? null : 0, cfg.arena, ui.settings.difficulty);
  setPerspective(0);
  renderer.reset(world);
  mode = 'battle';
  overlay = null;
  overT = 0;
  acc = 0;
  hud.paused = false;
  hud.speed = ui.settings.speed;
  window.world = world; // acesso para depuração no console
}

function toMenu(screen = 'menu') {
  mode = 'menu';
  overlay = null;
  ui.go(screen);
}

function leaveOnline() {
  net?.send({ t: 'leave' });
  session = null; reconnecting = false;
  online = false;
  ui.mp.room = null;
  toMenu('menu');
}

const overlayActions = {
  resume: () => { overlay = null; hud.paused = false; },
  rematch: () => startBattle(battle),
  reselect: () => { ui.team = []; ui.flow = 'local'; toMenu('team'); },
  menu: () => toMenu('menu'),
  leaveOnline,
  backToRoom: () => net?.send({ t: 'rematch' }),
  isHost: () => ui.mp.room && ui.mp.room.host === ui.mp.myId,
};

function resize() {
  hud.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * hud.dpr);
  canvas.height = Math.floor(window.innerHeight * hud.dpr);
}

function toWorld(clientX, clientY) {
  const v = renderer.view;
  if (!v) return { x: 320, y: 180 };
  return { x: (clientX * hud.dpr - v.ox) / v.S, y: (clientY * hud.dpr - v.oy) / v.S };
}

function press(slot) {
  if (mode !== 'battle' || overlay || world.over || !world.active) return;
  if (online) netPresses.push(slot);
  else world.input.presses.push(slot);
}

// Troca o monstro em campo (1×1 por vaga). Tab procura o próximo vivo na reserva.
function switchTo(m) {
  if (mode !== 'battle' || overlay || world.playerTeam === null) return;
  if (online) net?.send({ t: 'switch', idx: world.teamOf(world.playerTeam).indexOf(m) });
  else world.requestSwitch(world.playerTeam, m);
}

function cycleActive(dir = 1) {
  const team = world.teamOf(world.playerTeam);
  const k = team.indexOf(world.teams[world.playerTeam].field);
  for (let j = 1; j < team.length; j++) {
    const m = team[(k + dir * j + team.length * 3) % team.length];
    if (m.alive && !m.onField) return switchTo(m);
  }
}

const KEY_SLOT = { KeyQ: 'q', KeyE: 'e', KeyF: 'f', Space: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyG: 'evolve' };

window.addEventListener('resize', resize);
window.addEventListener('blur', () => { keys.clear(); if (world) world.input.held = {}; });
window.addEventListener('paste', (e) => {
  if (mode === 'menu' && ui.screen === 'mp') {
    const t = (e.clipboardData?.getData('text') || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
    if (t) ui.mp.code = t;
  }
});
window.addEventListener('keydown', (e) => {
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.ctrlKey || e.metaKey) return;
  if (mode === 'menu') { if (!e.repeat) ui.keyDown(e.code, e.key); return; }
  if (mode !== 'battle') return;
  if (overlay) {
    if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP') && (overlay === 'pause' || overlay === 'online')) overlayActions.resume();
    else if (!e.repeat) ui.keyDown(e.code);
    return;
  }
  keys.add(e.code);
  if (e.repeat) return;
  const playing = world.playerTeam !== null;
  if (KEY_SLOT[e.code] && playing) press(KEY_SLOT[e.code]);
  else if (/^Digit[1-3]$/.test(e.code) && playing) {
    const m = world.teamOf(world.playerTeam)[+e.code.slice(5) - 1];
    if (m) switchTo(m);
  } else if (e.code === 'Tab' && playing) cycleActive(e.shiftKey ? -1 : 1);
  else if (e.code === 'KeyP' || e.code === 'Escape') {
    overlay = online ? 'online' : 'pause';
    hud.paused = !online;
    ui.focus = 0;
    if (online) sendInput(performance.now(), true);
  } else if (e.code === 'KeyI') renderer.debug = !renderer.debug;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
  ui.pointerMove(e.clientX * hud.dpr, e.clientY * hud.dpr);
});
canvas.addEventListener('pointerdown', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
  if (mode === 'menu' || overlay) { if (e.button === 0) ui.pointerDown(e.clientX * hud.dpr, e.clientY * hud.dpr); return; }
  if (mode !== 'battle') return;
  const slot = e.button === 2 ? 'melee' : e.button === 0 ? 'primary' : null;
  if (!slot) return;
  world.input.held[slot] = true;
  press(slot);
});
window.addEventListener('pointerup', (e) => {
  if (!world) return;
  const slot = e.button === 2 ? 'melee' : e.button === 0 ? 'primary' : null;
  if (slot) world.input.held[slot] = false;
});

function readInput() {
  const inp = world.input;
  const k = (...codes) => codes.some((c) => keys.has(c));
  inp.move.x = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
  inp.move.y = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
  if (mouse.inside) {
    const p = toWorld(mouse.x, mouse.y);
    inp.aim.x = Math.max(0, Math.min(640, p.x));
    inp.aim.y = Math.max(0, Math.min(360, p.y));
  }
}

const smooth = new NetSmoother(); // buffer de interpolação + predição do próprio monstro (net/smooth.js)

function drawPing(c) {
  if (!net || !net.rtt) return;
  const ms = Math.round(net.rtt), u = Math.max(1, Math.min(canvas.width / 760, canvas.height / 520));
  c.save();
  c.font = `${6 * u}px "Press Start 2P", monospace`;
  c.textAlign = 'right';
  c.fillStyle = ms < 80 ? '#7ae07a' : ms < 160 ? '#ffe066' : '#ff6a6a';
  c.fillText(`${ms} ms`, canvas.width - 8 * u, canvas.height - 6 * u);
  c.restore();
}

function drawNotice(c, dt) {
  if (!notice) return;
  notice.t -= dt;
  if (notice.t <= 0) { notice = null; return; }
  const u = Math.max(1, Math.min(canvas.width / 760, canvas.height / 520));
  c.save();
  c.font = `${8 * u}px "Press Start 2P", monospace`;
  c.textAlign = 'center';
  const w = c.measureText(notice.text).width + 24 * u, x = canvas.width / 2 - w / 2;
  c.fillStyle = 'rgba(20,12,8,0.88)';
  c.fillRect(x, 70 * u, w, 22 * u);
  c.strokeStyle = '#ffd23a';
  c.strokeRect(x, 70 * u, w, 22 * u);
  c.fillStyle = '#ffe9b0';
  c.fillText(notice.text, canvas.width / 2, 85 * u);
  c.restore();
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const c = canvas.getContext('2d');
  if (mode === 'loading') {
    c.fillStyle = '#14100e';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#ffe9b0';
    c.font = `${12 * hud.dpr}px "Press Start 2P", monospace`;
    c.textAlign = 'center';
    c.fillText('CARREGANDO...', canvas.width / 2, canvas.height / 2);
  } else if (mode === 'menu') {
    canvas.style.cursor = 'default';
    ui.render(dt, hud.dpr);
  } else if (online) {
    canvas.style.cursor = world.active && !overlay ? 'none' : 'default';
    const alpha = smooth.pump(now, world, mirror.ctx);
    if (!overlay) { readInput(); sendInput(now); }
    if (world.over) { overT += dt; if (overT > 1.5 && overlay !== 'end') { overlay = 'end'; ui.focus = 0; } }
    smooth.lead(now, dt, alpha, world, !!overlay, net?.rtt || 60);
    renderer.render(world, alpha, dt, hud);
    drawNotice(c, dt);
    drawPing(c);
    if (overlay) {
      const u = Math.max(1, Math.min(canvas.width / 760, canvas.height / 520));
      ui.time += dt;
      ui.renderOverlay(overlay, u, canvas.width, canvas.height, world, { ...overlayActions, online: true });
    }
  } else {
    canvas.style.cursor = world.active && !overlay ? 'none' : 'default';
    if (!overlay) {
      readInput();
      if (renderer.hitstop > 0) renderer.hitstop -= dt;
      else {
        acc += dt * hud.speed;
        let steps = 0;
        while (acc >= DT && steps < 10) { world.step(DT); acc -= DT; steps++; }
        if (steps >= 10) acc = 0;
      }
      if (world.over) { overT += dt; if (overT > 1.5) { overlay = 'end'; ui.focus = 0; } }
    }
    renderer.render(world, Math.min(1, acc / DT), overlay === 'pause' ? 0 : dt * hud.speed, hud);
    if (overlay) {
      const u = Math.max(1, Math.min(canvas.width / 760, canvas.height / 520));
      ui.time += dt;
      ui.renderOverlay(overlay, u, canvas.width, canvas.height, world, overlayActions);
    }
  }
  requestAnimationFrame(frame);
}

async function init() {
  resize();
  requestAnimationFrame(frame);
  try { await document.fonts?.load('12px "Press Start 2P"'); } catch { /* fonte opcional */ }
  await renderer.loadArt();
  applySettings(ui.settings);
  window.renderer = renderer;
  window.ui = ui;
  window.__tick = (sec) => frame(last + sec * 1000); // avança um quadro manualmente (testes/depuração)
  window.__now = () => frame(performance.now()); // um quadro no tempo real (depuração com a aba em segundo plano)
  window.__state = () => ({ mode, overlay, screen: ui.screen, online });
  // Atalhos para testes: ?arena=jardim&autostart  ·  ?watch (IA × IA)
  const arena = ARENAS[params.get('arena')] ? params.get('arena') : 'jardim';
  if (params.has('autostart') || params.has('watch')) startBattle({ team: [...DEFAULT_TEAM], arena, spectator: params.has('watch') });
  else mode = 'menu';
  // Link de convite (?sala=ABCD): vai direto escolher o time e entrar na sala.
  const invite = inviteCode();
  if (invite && mode === 'menu') {
    ui.flow = 'mp'; ui.team = []; ui.mp.code = invite;
    ui.go('team');
  }
}

init();
