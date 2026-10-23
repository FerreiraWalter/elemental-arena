import { World } from './sim/world.js';
import { DT, WORLD_W, WORLD_H } from './config.js';
import { ROSTER, DEFAULT_TEAM } from './sim/species.js';
import { ARENAS, ARENA_ORDER } from './arenas/index.js';
import { Renderer, setPerspective } from './render/renderer.js';
import { UI, CAMERAS, CAMERA_NAME, saveSettings } from './ui/ui.js';
import { drawVsIntro } from './ui/tour.js';
import { NetClient, serverUrls, inviteCode } from './net/client.js';
import { createMirror } from './net/mirror.js';
import { NetSmoother } from './net/smooth.js';
import { sfx } from './audio/sfx.js';
import * as Training from './sim/training.js';
import { Tutorial, TUTORIAL_TEAM, TUTORIAL_KEY } from './sim/tutorial.js';
import { createTouchControls } from './control/touch.js';

// Fluxo: carregando → menu (time → arena | multiplayer → sala) → batalha → pausa/fim.
// Batalha LOCAL: passo fixo de 1/60 s (a simulação roda no navegador, contra a IA).
// Batalha ONLINE: o servidor simula (autoritativo); o navegador só envia entradas e desenha o "mundo espelho"
// atualizado pelos snapshots a 20 Hz, interpolando posições entre eles.

const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
const renderer = new Renderer(canvas);
renderer.sfx = sfx;
const HELP_KEY = 'ea-ajuda-vista';
let helpFirst = false; // ajuda aberta automaticamente na primeira partida
let trainingOpts = null; // opções do treino (bonecos, tiros, recargas) mantidas entre sessões
const hud = { dpr: 1, speed: 1, paused: false, started: true };
const keys = new Set();
const mouse = { x: 0, y: 0, inside: false };
let mode = 'loading';
let world = null;
let battle = null; // configuração da última partida local
let overlay = null; // 'pause' | 'end' | 'online' | 'tourEnd'
// Torneio: início da luta atual (tela de VS durante a contagem) e o resultado da última luta (tela de fim).
let vsStart = null, tourEnd = null;
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
let lastMoveKey = '';
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
  startTutorial: () => startBattle({ tutorial: true, team: TUTORIAL_TEAM, arena: 'quadra' }),
  sfx: (n) => sfx.play(n),
  mpCreate: (m) => mpEnter({ t: 'create', mode: m, name: playerName }),
  mpJoin: (code) => mpEnter({ t: 'join', code, name: playerName }),
  mpSend: (o) => net && net.send(o),
  mpFocusCode: () => focusCodeInput(),
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
    if (!online && m.state === 'lobby' && ui.screen === 'tour') { ui.mp.tour = null; ui.go('lobby'); } // fim do torneio: volta à sala
  });
  // Torneio: chave e fase atual. Fora de uma luta, a tela é a chave (e a cerimônia do campeão no fim).
  n.on('tour', (m) => {
    const prev = ui.mp.tour?.phase;
    ui.mp.tour = m; ui.mp.tourAt = performance.now(); ui.mp.myName = playerName;
    if (m.phase !== prev) sfx.play(m.phase === 'champion' ? 'victory' : 'start');
    if (!online && mode === 'menu' && (ui.screen === 'lobby' || ui.screen === 'tour')) ui.go('tour');
  });
  n.on('end', (m) => { if (m.tour) tourEnd = { ...m.tour, at: performance.now(), shownAt: ui.time }; });
  n.on('error', (m) => {
    if (reconnecting) return; // a tentativa de voltar trata o próprio erro
    if (online) notice = { text: m.message, t: 4 }; else ui.mpError(m.message);
  });
  n.on('start', startOnline);
  n.on('snap', (m) => { if (online && (m.match ?? 0) === (mirror?.match ?? 0)) smooth.enqueue(m, performance.now(), world); }); // torneio: só a luta atual
  n.on('left', () => {});
  n.on('closed', () => {
    if (net !== n) return;
    if (online && session?.token) { reconnect(); return; }
    const inRoom = online || ui.screen === 'lobby' || ui.flow === 'mpEdit';
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
  // Torneio: espectador não tem vaga (câmera e HUD de espectador); a fase vai no cartão do modo.
  setPerspective(start.you >= 0 ? world.teams[start.you].side : 0, world.ffa);
  world.tourLabel = start.tour ? (start.tour.final ? 'FINAL' : start.tour.round) : null;
  vsStart = start.tour && start.hold > 0 ? { ...start, holdReal: start.hold, at: performance.now() } : null;
  tourEnd = null;
  if (start.spectate) notice = { text: `ASSISTINDO AO VIVO · ${touch.active ? 'II' : 'Esc'}: chave e outras lutas`, t: start.hold > 0 ? start.hold + 3 : 3 };
  renderer.reset(world);
  online = true;
  mode = 'battle';
  overlay = null;
  overT = 0;
  smooth.reset();
  hud.paused = false;
  hud.speed = 1;
  window.world = world;
  sfx.play('start');
}

function sendInput(now, neutral = false) {
  if (!online || !net || world.playerTeam === null) return; // espectador do torneio não manda entradas
  const inp = world.input;
  const msg = neutral
    ? { t: 'input', mx: 0, my: 0, ax: inp.aim.x, ay: inp.aim.y, hp: false, hm: false, presses: [] }
    : { t: 'input', mx: inp.move.x, my: inp.move.y, ax: Math.round(inp.aim.x), ay: Math.round(inp.aim.y), hp: !!inp.held.primary, hm: !!inp.held.melee, presses: netPresses.splice(0, 6) };
  const key = JSON.stringify([msg.mx, msg.my, msg.hp, msg.hm, msg.ax >> 3, msg.ay >> 3]);
  // Mudança de direção/botão vai NA HORA (toque curto de tecla não se perde); só a mira é limitada a ~40/s.
  const moveKey = `${msg.mx},${msg.my},${msg.hp},${msg.hm}`;
  const urgent = msg.presses.length > 0 || moveKey !== lastMoveKey;
  if (!urgent && key === lastSentKey && now - lastSent < 250) return;
  if (!urgent && now - lastSent < 25) return;
  lastSent = now; lastSentKey = key; lastMoveKey = moveKey;
  net.send(msg);
}

function applySettings(s) {
  hud.camera = s.camera || 'auto';
  if (s.quality !== qChosen) { qChosen = s.quality; qStep = 0; } // trocou a qualidade: recomeça do degrau mais alto
  resize();
  sfx.setEnabled(s.sound !== false);
  sfx.setVolume(s.volume ?? 0.6);
  renderer.shakeEnabled = s.shake;
  renderer.showNumbers = s.numbers;
  renderer.debug = s.debug;
  if (!online) hud.speed = s.speed;
}

// ───────────── Assistir em sequência (?watch&arenas=...) ─────────────
// IA × IA sem parar: ao fim de cada partida mostra o resultado por alguns segundos e começa a próxima no mapa
// seguinte da lista (e no modo seguinte, com &modos=). Times sorteados a cada partida, a menos que &team= fixe um lado.
const PLAYLIST_WAIT = 6; // segundos mostrando o resultado antes da próxima
function playlistFromUrl() {
  const list = (v, all, ok) => {
    const raw = (params.get(v) || '').toLowerCase();
    if (raw === 'todas' || raw === 'todos' || raw === 'all') return [...all];
    return raw.split(',').map((x) => x.trim()).filter(ok);
  };
  const arenas = list('arenas', ARENA_ORDER, (a) => !!ARENAS[a]);
  const modes = list('modos', ['1v1', '2v2', 'ffa'], (m) => ['1v1', '2v2', 'ffa'].includes(m));
  if (!arenas.length && !modes.length) return null;
  return { arenas: arenas.length ? arenas : [ARENAS[params.get('arena')] ? params.get('arena') : 'jardim'], modes: modes.length ? modes : [params.has('ffa') ? 'ffa' : params.has('duo') ? '2v2' : '1v1'], n: 1 };
}
function playlistBattle(pl, fixedTeam, speed) {
  const k = pl.n - 1, md = pl.modes[k % pl.modes.length];
  const team = fixedTeam || [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3);
  startBattle({ team, arena: pl.arenas[k % pl.arenas.length], spectator: true, ffa: md === 'ffa', duo: md === '2v2', playlist: pl, fixedTeam, speed });
}
function tickPlaylist(dt) {
  const pl = battle?.playlist;
  if (!pl || !world?.over || overlay === 'pause' || overlay === 'help') return;
  pl.wait -= dt;
  const k = pl.n, next = ARENAS[pl.arenas[k % pl.arenas.length]].name;
  notice = { text: `Próxima: ${next} em ${Math.max(1, Math.ceil(pl.wait))}s`, t: 0.25 };
  if (pl.wait <= 0) { pl.n++; playlistBattle(pl, battle.fixedTeam, battle.speed); }
}

// ───────────── Partida local ─────────────
function startBattle(cfg) {
  battle = cfg;
  online = false;
  const enemy = [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3);
  const seed = (Math.random() * 1e6) | 0;
  // Treinamento: seus monstros contra bonecos de pano (mantém as opções da sessão anterior de treino).
  // Tutorial: treino com o time fixo e o Professor Remendo conduzindo as lições (sim/tutorial.js).
  if (cfg.tutorial) { world = World.training(seed, TUTORIAL_TEAM, 'quadra', { dummies: 1, shoot: false, noCd: false }); new Tutorial(world); }
  else if (cfg.training) world = World.training(seed, cfg.team, cfg.arena, trainingOpts || {});
  else if (cfg.ffa) {
    // Todos contra todos local: você + 3 IAs, cada um por si.
    const pick = () => [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3);
    world = World.match(seed, [cfg.team, enemy, pick(), pick()], cfg.spectator ? null : 0, cfg.arena, ui.settings.difficulty, { sides: [0, 1, 2, 3] });
    world.slotNames = cfg.spectator ? ['IA 1', 'IA 2', 'IA 3', 'IA 4'] : ['Você', 'IA 1', 'IA 2', 'IA 3'];
  } else if (cfg.duo) {
    // 2v2 local (atalho de teste ?duo): você + IA aliada contra duas IAs.
    const pick = () => [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3);
    world = World.match(seed, [cfg.team, pick(), enemy, pick()], cfg.spectator ? null : 0, cfg.arena, ui.settings.difficulty, { sides: [0, 0, 1, 1] });
    world.slotNames = cfg.spectator ? ['IA A1', 'IA A2', 'IA B1', 'IA B2'] : ['Você', 'IA', 'IA 1', 'IA 2'];
  } else world = World.match(seed, [cfg.team, enemy], cfg.spectator ? null : 0, cfg.arena, ui.settings.difficulty);
  setPerspective(0, !!cfg.ffa);
  renderer.reset(world);
  mode = 'battle';
  overlay = null;
  overT = 0;
  acc = 0;
  hud.paused = false;
  hud.speed = cfg.speed || ui.settings.speed;
  if (cfg.playlist) {
    const pl = cfg.playlist, modeName = cfg.ffa ? '1v1v1v1' : cfg.duo ? '2v2' : '1v1';
    pl.wait = PLAYLIST_WAIT;
    notice = { text: `Partida ${pl.n} · ${ARENAS[cfg.arena].name} · ${modeName}`, t: 3 };
  }
  window.world = world; // acesso para depuração no console
  sfx.play('start');
  let seen = true;
  try { seen = !!localStorage.getItem(HELP_KEY); } catch { /* sem armazenamento */ }
  if (!seen && !cfg.spectator && !cfg.tutorial && !params.has('autostart')) openHelp(true);
}

function trainingPanel() {
  if (mode !== 'battle' || !world.training) return;
  overlay = 'training';
  ui.focus = 0;
  hud.paused = true;
}
function saveTrainingOpts() { if (world?.training) trainingOpts = { ...world.training.opts }; }

function openHelp(first = false) {
  if (mode !== 'battle' || world.playerTeam === null) return;
  helpFirst = first;
  overlay = 'help';
  ui.focus = 0;
  if (online) sendInput(performance.now(), true);
  else hud.paused = true;
}

function closeHelp() {
  if (helpFirst) { try { localStorage.setItem(HELP_KEY, '1'); } catch { /* sem armazenamento */ } }
  helpFirst = false;
  overlay = null;
  hud.paused = false;
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
  closeHelp: () => closeHelp(),
  trainingPanel: () => trainingPanel(),
  trainingDummies: (n) => { Training.setDummies(world, n); saveTrainingOpts(); },
  trainingToggle: (k) => { world.training.opts[k] = !world.training.opts[k]; saveTrainingOpts(); },
  trainingEvolve: () => { const m = world.active; if (m && world.requestEvolve(m)) { overlay = null; hud.paused = false; } },
  trainingDevolve: () => { const m = world.active; if (m) Training.devolve(world, m); },
  tutorialSkip: () => { world.tutorial?.skip(); overlay = null; hud.paused = false; },
  tutorialPlay: () => { ui.team = []; ui.flow = 'local'; toMenu('team'); },
  tutorialTrain: () => { ui.team = []; ui.flow = 'training'; toMenu('team'); },
  // Torneio: voltar à chave (para de assistir), assistir outra luta, resultado da luta.
  tourBracket: () => { if (world?.playerTeam === null) net?.send({ t: 'watch', match: null }); online = false; mode = 'menu'; overlay = null; tourEnd = null; vsStart = null; ui.go('tour'); },
  tourWatch: (id) => { overlay = null; net?.send({ t: 'watch', match: id }); },
  watching: () => mirror?.match ?? 0,
  get tour() { return !!ui.mp.tour && ui.mp.room?.state === 'tour'; },
  get spectating() { return world?.playerTeam === null; },
  get tourEnd() { return tourEnd; },
  get firstTime() { return helpFirst; },
};

// Resolução do canvas. O jogo é pixel art em 1024×576 ampliada; resolução alta só deixa os textos e as barras
// mais nítidos, e em tela retina de tablet/notebook (até 4 milhões de pixels por quadro) pesa. Teto de pixels por
// qualidade; na automática, se a partida fica lenta (muitos quadros acima de 25 ms), desce um degrau por vez e,
// no último, liga os efeitos leves (menos chamas e partículas).
const QUALITY = { auto: [3.2e6, 1.8e6, 1.1e6], alta: [8e6], leve: [1.1e6] };
let qStep = 0, qChosen = null;
const perf = { t: 0, n: 0, slow: 0, wait: 2 };
// Tamanho real do canvas na página (CSS 100vw × 100dvh). No Safari do iPhone innerWidth/innerHeight chegam
// atrasados ao girar e não acompanham a barra de endereço: o jogo ficava cortado/esticado até girar de novo.
let cssW = 0, cssH = 0;
function cssSize() {
  const r = canvas.getBoundingClientRect();
  return { w: Math.round(r.width) || window.innerWidth, h: Math.round(r.height) || window.innerHeight };
}
function resize() {
  const q = QUALITY[ui.settings.quality] ? ui.settings.quality : 'auto';
  const steps = QUALITY[q], budget = steps[Math.min(qStep, steps.length - 1)];
  const { w, h } = cssSize();
  cssW = w; cssH = h;
  hud.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(budget / (w * h))));
  canvas.width = Math.floor(w * hud.dpr);
  canvas.height = Math.floor(h * hud.dpr);
  renderer.lowFx = q === 'leve' || (q === 'auto' && qStep >= steps.length - 1);
  renderer.particles.max = renderer.lowFx ? 400 : 900;
}

// Mede a batalha (aba visível, sem pausa) a cada 3 s e baixa a qualidade automática se estiver engasgando.
function watchPerf(dt) {
  if (mode !== 'battle' || overlay || document.hidden || ui.settings.quality && ui.settings.quality !== 'auto') { perf.t = perf.n = perf.slow = 0; perf.wait = 2; return; }
  if (perf.wait > 0) { perf.wait -= dt; return; } // início da partida (montagem do mapa) não conta
  perf.t += dt; perf.n++;
  if (dt > 0.025) perf.slow++;
  if (perf.t < 3) return;
  if (perf.slow / perf.n > 0.25 && qStep < QUALITY.auto.length - 1) { qStep++; resize(); }
  perf.t = perf.n = perf.slow = 0;
}

function toWorld(clientX, clientY) {
  const v = renderer.view;
  if (!v) return { x: WORLD_W / 2, y: WORLD_H / 2 };
  return { x: (clientX * hud.dpr - v.ox) / v.S, y: (clientY * hud.dpr - v.oy) / v.S };
}

function press(slot) {
  if (mode !== 'battle' || overlay || world.over || !world.active) return;
  if (world.tutorial?.talking) { ui.tutorialTap(world.tutorial); return; } // professor falando: o botão passa a fala
  if (online) {
    // Resposta na hora (esquiva/investida/salto, som e recarga) e a tecla vai ao servidor sem esperar o próximo quadro.
    const now = performance.now();
    netPresses.push(slot);
    smooth.press(slot, world, now, net?.rtt || 60);
    sendInput(now);
  } else world.input.presses.push(slot);
}

// Troca o monstro em campo (1×1 por vaga). Tab procura o próximo vivo na reserva.
function switchTo(m) {
  if (mode !== 'battle' || overlay || world.playerTeam === null || world.tutorial?.talking) return;
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
// Tablet girando: alguns navegadores só atualizam o tamanho da janela um instante depois.
window.addEventListener('orientationchange', () => { for (const ms of [100, 300, 700]) setTimeout(resize, ms); });
window.addEventListener('pageshow', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('blur', () => { keys.clear(); if (world) world.input.held = {}; });
window.addEventListener('paste', (e) => {
  if (mode === 'menu' && ui.screen === 'mp') {
    const t = (e.clipboardData?.getData('text') || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
    if (t) ui.mp.code = t;
  }
});
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
// iPhone/iPad: o Safari ignora o "user-scalable=no" da página. Dois toques rápidos (ex.: errar o botão de ataque
// e tocar de novo no campo) davam zoom na tela inteira, e a pinça também. Bloqueia o segundo toque rápido e a pinça.
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = performance.now();
  if (now - lastTouchEnd < 350 && e.cancelable) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.ctrlKey || e.metaKey) return;
  if (mode === 'menu') { if (!e.repeat) ui.keyDown(e.code, e.key); return; }
  if (mode !== 'battle') return;
  if (overlay) {
    if (!e.repeat && overlay === 'help' && (e.code === 'Escape' || e.code === 'KeyH' || e.code === 'KeyP')) closeHelp();
    else if (!e.repeat && overlay === 'training' && (e.code === 'Escape' || e.code === 'KeyT' || e.code === 'KeyP')) overlayActions.resume();
    else if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP') && (overlay === 'pause' || overlay === 'online')) overlayActions.resume();
    else if (!e.repeat) ui.keyDown(e.code);
    return;
  }
  // Professor falando: Enter/Espaço passam a fala; Esc/P pausam; o resto espera.
  if (world.tutorial?.talking && e.code !== 'Escape' && e.code !== 'KeyP') {
    if (!e.repeat && ['Enter', 'NumpadEnter', 'Space'].includes(e.code)) ui.tutorialTap(world.tutorial);
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
  } else if (e.code === 'KeyH' && playing) openHelp();
  else if (e.code === 'KeyT' && world.training && !world.tutorial) trainingPanel();
  else if (e.code === 'KeyB' && world.training && !world.tutorial) { Training.setDummies(world, (world.training.opts.dummies % 3) + 1); saveTrainingOpts(); }
  else if (e.code === 'KeyC') {
    // Distância da câmera na hora (fica salva nas opções).
    const s = ui.settings, k = CAMERAS[(CAMERAS.indexOf(s.camera) + 1) % CAMERAS.length];
    s.camera = k; saveSettings(s); applySettings(s);
    notice = { text: `Câmera: ${CAMERA_NAME[k]}`, t: 1.4 };
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
  if (world.tutorial?.talking) { ui.tutorialTap(world.tutorial); return; }
  const slot = e.button === 2 ? 'melee' : e.button === 0 ? 'primary' : null;
  if (!slot) return;
  if (e.pointerType === 'touch' && touch.active) return; // no celular, só os botões na tela atacam
  world.input.held[slot] = true;
  press(slot);
});
window.addEventListener('pointerup', (e) => {
  if (!world) return;
  const slot = e.button === 2 ? 'melee' : e.button === 0 ? 'primary' : null;
  if (slot) world.input.held[slot] = false;
});

// Celular/tablet: controles de toque (analógico + botões); mira automática no inimigo mais próximo.
const touch = createTouchControls({
  press: (slot) => press(slot),
  hold: (slot, v) => { if (world) world.input.held[slot] = v; },
  key: (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code })),
  getWorld: () => world,
  getLayout: () => ({ top: renderer.hudTop ?? 64 * (renderer.hudScale || 1) }), // altura da faixa dos cartões do topo (px CSS)
});

// Código da sala sem teclado físico (tablet): um campo invisível abre o teclado da tela; o que for digitado vai
// para os 4 quadrados do código. Só é focado por um toque (o sistema só abre o teclado num gesto do usuário).
const codeInput = document.createElement('input');
Object.assign(codeInput, { type: 'text', maxLength: 4, autocomplete: 'off', spellcheck: false, inputMode: 'text' });
codeInput.setAttribute('autocapitalize', 'characters');
codeInput.setAttribute('aria-label', 'Código da sala');
codeInput.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none';
document.body.appendChild(codeInput);
codeInput.addEventListener('input', () => {
  const v = codeInput.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  codeInput.value = v;
  if (!ui.mp.busy) ui.mp.code = v;
});
codeInput.addEventListener('keydown', (e) => {
  e.stopPropagation(); // não duplica a letra pelo atalho global de teclado do menu
  if (e.key === 'Enter' && ui.mp.code.length === 4 && !ui.mp.busy) { codeInput.blur(); ui.hooks.mpJoin(ui.mp.code); }
});
// No Android o toque nos quadrados chega pelo pointerdown, que para o navegador NÃO é gesto do usuário (só o fim
// do toque é): o campo era focado sem abrir o teclado e, em seguida, o mousedown de compatibilidade no canvas
// tirava o foco dele. Agora o foco é repetido no touchend e o canvas não rouba o foco enquanto o campo está ativo.
let codeFocusPending = false;
function focusCodeInput() {
  codeInput.value = ui.mp.code;
  codeInput.focus({ preventScroll: true });
  codeFocusPending = true;
}
canvas.addEventListener('touchend', () => {
  if (!codeFocusPending) return;
  codeFocusPending = false;
  if (mode === 'menu' && ui.screen === 'mp') { codeInput.blur(); codeInput.focus({ preventScroll: true }); }
});
canvas.addEventListener('mousedown', (e) => { if (document.activeElement === codeInput) e.preventDefault(); });
window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') codeFocusPending = false; });

// Prévia da mira manual do toque: linha tracejada do monstro até o alvo e o círculo da área, por cima do jogo.
function drawTouchAim(c) {
  const pv = touch.preview, v = renderer.view;
  if (!pv || !v) return;
  const sx = (x) => v.ox + x * v.S, sy = (y) => v.oy + y * v.S;
  c.save();
  c.strokeStyle = 'rgba(200,240,255,0.9)'; c.lineWidth = 2 * v.dpr; c.setLineDash([6 * v.dpr, 5 * v.dpr]);
  c.beginPath(); c.moveTo(sx(pv.x0), sy(pv.y0)); c.lineTo(sx(pv.x), sy(pv.y)); c.stroke();
  c.setLineDash([]);
  c.beginPath(); c.arc(sx(pv.x), sy(pv.y), Math.max(4 * v.dpr, pv.r * v.S), 0, Math.PI * 2);
  c.fillStyle = 'rgba(70,180,255,0.18)'; c.fill(); c.stroke();
  c.restore();
}

// Tablet em pé durante a batalha: dá para jogar (os controles ficam embaixo da arena), mas deitado a arena fica
// bem maior. Sugere girar por alguns segundos, acima da arena, sem cobrir o jogo nem pausar.
let rotateHint = { portrait: false, t: 0 };
function drawRotateHint(c, dt) {
  const portrait = touch.visible && innerHeight > innerWidth * 1.05;
  if (portrait && !rotateHint.portrait) rotateHint.t = 6;
  rotateHint.portrait = portrait;
  if (!portrait || rotateHint.t <= 0) return;
  rotateHint.t -= dt;
  const v = renderer.view, u = hud.dpr * Math.max(1, Math.min(1.6, innerWidth / 420));
  c.save();
  c.globalAlpha = Math.min(1, rotateHint.t);
  c.font = `${7 * u}px "Press Start 2P", monospace`; c.textAlign = 'center';
  const t = 'Dica: deite o aparelho para a arena ficar maior', w = c.measureText(t).width + 20 * u;
  const y = Math.max(20 * u, (v?.oy ?? canvas.height / 2) - 16 * u);
  c.fillStyle = 'rgba(20,12,8,0.85)'; c.fillRect(canvas.width / 2 - w / 2, y - 13 * u, w, 20 * u);
  c.fillStyle = '#ffe9b0'; c.fillText(t, canvas.width / 2, y + 1 * u);
  c.restore();
}

function readInput() {
  const inp = world.input;
  const k = (...codes) => codes.some((c) => keys.has(c));
  inp.move.x = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
  inp.move.y = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
  if (touch.active && touch.visible) {
    if (Math.hypot(touch.move.x, touch.move.y) > 0.01) { inp.move.x = touch.move.x; inp.move.y = touch.move.y; }
    const a = touch.aim(world);
    if (a) { inp.aim.x = a.x; inp.aim.y = a.y; }
  } else if (mouse.inside) {
    const p = toWorld(mouse.x, mouse.y);
    inp.aim.x = Math.max(0, Math.min(WORLD_W, p.x));
    inp.aim.y = Math.max(0, Math.min(WORLD_H, p.y));
  }
}

const smooth = new NetSmoother(); // buffer de interpolação + predição do próprio monstro (net/smooth.js)

function drawNotice(c, dt) {
  if (!notice) return;
  notice.t -= dt;
  if (notice.t <= 0) { notice = null; return; }
  const u = ui.scale(canvas.width, canvas.height, hud.dpr);
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
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  // Rede de segurança: se o tamanho do canvas na página mudou sem evento (iOS), refaz a resolução.
  if (canvas.clientWidth !== cssW || canvas.clientHeight !== cssH) { const s2 = cssSize(); if (s2.w !== cssW || s2.h !== cssH) resize(); }
  watchPerf(dt);
  touch.update(mode === 'battle' && !overlay && !!world && world.playerTeam !== null && !world.tutorial?.talking);
  touch.hint?.(mode === 'battle' && !overlay && world?.tutorial ? world.tutorial.hint : null);
  if (world?.tutorial) world.tutorial.touch = touch.active;
  hud.touch = touch.visible; // HUD sem a barra de teclas/mouse (os botões de toque mostram as recargas)
  ui.touchMode = touch.active;
  if (!(mode === 'menu' && ui.screen === 'mp') && document.activeElement === codeInput) codeInput.blur();
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
    if (world.over) { overT += dt; if (overT > 1.5 && overlay !== 'end' && overlay !== 'tourEnd') { overlay = tourEnd ? 'tourEnd' : 'end'; ui.focus = 0; } }
    // Resultado da luta do torneio: depois de 6 s volta sozinho para a chave.
    if (overlay === 'tourEnd' && tourEnd && performance.now() - tourEnd.at > 6000) overlayActions.tourBracket();
    smooth.lead(now, dt, alpha, world, !!overlay, net?.rtt || 60);
    hud.net = { rtt: net?.rtt || 0, room: session?.code || '' }; // sala e ping no canto da HUD
    renderer.render(world, alpha, dt, hud);
    drawTouchAim(c);
    drawRotateHint(c, dt);
    if (vsStart) {
      const u = ui.scale(canvas.width, canvas.height, hud.dpr), el = (performance.now() - vsStart.at) / 1000;
      ui.time += overlay ? 0 : dt;
      drawVsIntro(ui, c, u, canvas.width, canvas.height, vsStart, el);
      // Bipe a cada número da contagem e a largada no LUTEM!
      const n = Math.ceil(vsStart.holdReal - el);
      if (n !== vsStart.lastN) { if (n >= 1 && n <= 3) sfx.play('hover'); else if (n <= 0 && vsStart.lastN > 0) sfx.play('start'); vsStart.lastN = n; }
      if (el > vsStart.holdReal + 1) vsStart = null;
    }
    drawNotice(c, dt);
    if (overlay) {
      const u = ui.scale(canvas.width, canvas.height, hud.dpr);
      ui.time += dt;
      ui.renderOverlay(overlay, u, canvas.width, canvas.height, world, { ...overlayActions, online: true });
    }
  } else {
    canvas.style.cursor = world.active && !overlay ? 'none' : 'default';
    const tut = world.tutorial;
    if (tut?.finished && overlay !== 'tutorialEnd') { overlay = 'tutorialEnd'; ui.focus = 0; sfx.play('victory'); try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* sem armazenamento */ } }
    if (!overlay) {
      // Professor falando: o mundo continua (animações, entrada do monstro), mas o jogador fica parado.
      if (tut?.talking) { world.input.move.x = world.input.move.y = 0; world.input.held = {}; world.input.presses.length = 0; } else readInput();
      if (renderer.hitstop > 0) renderer.hitstop -= dt;
      else {
        acc += dt * hud.speed;
        let steps = 0;
        while (acc >= DT && steps < 10) { world.step(DT); acc -= DT; steps++; }
        if (steps >= 10) acc = 0;
      }
      if (world.over) { overT += dt; if (overT > 1.5) { overlay = 'end'; ui.focus = 0; } }
    }
    hud.net = null;
    tickPlaylist(dt);
    renderer.render(world, Math.min(1, acc / DT), overlay === 'pause' || overlay === 'help' || overlay === 'training' ? 0 : dt * hud.speed, hud);
    drawTouchAim(c);
    drawRotateHint(c, dt);
    if (tut && !overlay) {
      // Caixa de fala embaixo (no toque, os controles somem enquanto ele fala) e cartão do objetivo no alto da arena.
      const u = ui.scale(canvas.width, canvas.height, hud.dpr), f = renderer.frame;
      ui.time += dt;
      // Toque em pé: os botões de pausa e tela cheia ficam logo abaixo dos cartões; o objetivo vem embaixo deles.
      const top = touch.visible && canvas.height > canvas.width * 1.05 ? Math.max(f.oy, (renderer.hudTop + 52) * hud.dpr) : f.oy;
      ui.renderTutorial(u, canvas.width, canvas.height, world, { top, bottom: tut.talking && touch.active ? canvas.height : f.oy + f.ah }, dt);
    }
    drawNotice(c, dt);
    if (overlay) {
      const u = ui.scale(canvas.width, canvas.height, hud.dpr);
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
  // Atalhos para testes: ?arena=jardim&autostart&team=a,b,c  ·  ?watch (IA × IA)  ·  ?ffa  ·  ?duo (2v2 local)
  // Assistir em sequência: ?watch&arenas=jardim,floresta (ou =todas) &modos=1v1,2v2,ffa &vel=2
  const arena = ARENAS[params.get('arena')] ? params.get('arena') : 'jardim';
  const qTeam = (params.get('team') || '').split(',').filter((k) => ROSTER.includes(k));
  const vel = +params.get('vel'), speed = vel > 0 ? Math.max(0.5, Math.min(4, vel)) : 0; // 0 = velocidade das opções
  const pl = params.has('watch') ? playlistFromUrl() : null;
  if (pl) playlistBattle(pl, qTeam.length === 3 ? qTeam : null, speed);
  else if (params.has('autostart') || params.has('watch')) startBattle({ team: qTeam.length === 3 ? qTeam : [...DEFAULT_TEAM], arena, spectator: params.has('watch'), ffa: params.has('ffa'), duo: params.has('duo'), speed });
  else mode = 'menu';
  // Link de convite (?sala=ABCD): vai direto escolher o time e entrar na sala.
  const invite = inviteCode();
  if (invite && mode === 'menu') {
    ui.flow = 'mp'; ui.team = []; ui.mp.code = invite;
    ui.go('team');
  }
}

init();
