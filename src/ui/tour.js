// Torneio online (telas): sala do torneio, chave animada (sorteio, ao vivo, quem avançou), tela de "VS" antes de
// cada luta, resultado da luta e a cerimônia do campeão. Tudo desenhado no canvas com os auxiliares do ui.js; os
// botões usam o mesmo sistema (ui.button / ui.drawButtons). Os dados vêm do servidor (mensagens 'room' e 'tour').
import { SPECIES } from '../sim/species.js';
import { ARENAS, ARENA_ORDER } from '../arenas/index.js';
import { ELEMENT_COLOR } from '../render/renderer.js';
import { text, fitSize, wrap, para, panel } from './ui.js';

const GOLD = '#ffd23a', RED = '#ff5a5a', CYAN = '#7ae8ff', DIM = '#6a5a4a';
const ROUND_COL = { 'QUARTAS DE FINAL': '#8fd8ff', SEMIFINAL: '#ffb347', FINAL: GOLD };
export const TOUR_MODES = { tour1: '1v1', tour2: '2v2' };
const arenaName = (a) => (a === 'sorteio' ? 'SORTEADA' : ARENAS[a]?.name || a);
// Fases que a chave terá com n participantes (o servidor decide de verdade; isto é só para a sala explicar).
export function tourPlan(fmt, n) {
  const e = fmt === '2v2' ? Math.floor(n / 2) : n;
  if (e < 2) return { rounds: [], byes: 0, entrants: e };
  const size = e <= 2 ? 2 : e <= 4 ? 4 : 8;
  const rounds = { 8: ['QUARTAS', 'SEMIFINAL', 'FINAL'], 4: ['SEMIFINAL', 'FINAL'], 2: ['FINAL'] }[size];
  return { rounds, byes: size - e, entrants: e };
}

// Troféu em pixel art (taça dourada com alças, base e brilho), desenhado em blocos de `s` px.
export function drawTrophy(c, x, y, s, t = 0) {
  const P = (px, py, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x + px * s), Math.round(y + py * s), Math.ceil(w * s), Math.ceil(h * s)); };
  const D = '#7a4a10', M = '#d89a20', L = GOLD, W = '#fff6c0';
  P(-6, -14, 12, 1, D); P(-6, -13, 12, 6, M); P(-5, -7, 10, 2, M); P(-3, -5, 6, 2, M); P(-1, -3, 2, 3, M); // taça
  P(-4, -13, 2, 6, L); P(-5, -13, 1, 5, W); // brilho
  P(-9, -13, 3, 1, D); P(-9, -12, 1, 4, D); P(-8, -9, 2, 1, D); P(6, -13, 3, 1, D); P(8, -12, 1, 4, D); P(6, -9, 2, 1, D); // alças
  P(-4, 0, 8, 2, D); P(-5, 2, 10, 2, M); P(-5, 2, 10, 1, L); // base
  P(-1, -11, 2, 2, '#ff6a8a'); // gema
  const k = (Math.sin(t * 3) + 1) / 2; // brilho que passa
  c.globalAlpha = 0.6 * k; P(-3 + Math.round(k * 4), -12, 1, 4, W); c.globalAlpha = 1;
}

// Cor de cada monstro do time (quadradinhos na chave, que não tem espaço para a arte).
function teamDots(c, team, x, y, s) {
  (team || []).forEach((k, i) => { c.fillStyle = ELEMENT_COLOR[SPECIES[k]?.element] || '#888'; c.fillRect(x + i * (s + 2), y, s, s); });
}

// ───────────── Sala do torneio ─────────────
export function renderTourLobby(ui, u, W, H) {
  const c = ui.c, cx = W / 2, mp = ui.mp, room = mp.room;
  const tall = ui.phone && ui.portrait, isHost = room.host === mp.myId, me = room.players.find((p) => p.id === mp.myId);
  const fmt = TOUR_MODES[room.mode], n = room.players.length, plan = tourPlan(fmt, n);
  if (!tall) drawTrophy(c, cx - 140 * u, 40 * u, 1.6 * u, ui.time);
  text(c, `TORNEIO ${fmt}`, cx, 30 * u, tall ? 13 : 15, GOLD, 'center', u);
  text(c, `SALA ${room.code}`, tall ? cx - 46 * u : cx, 46 * u, 9, '#ffe9b0', 'center', u);
  const copied = mp.copiedAt && performance.now() - mp.copiedAt < 2000;
  ui.button(cx + (tall ? 14 : 120) * u, 34 * u, (tall ? 96 : 120) * u, 18 * u, copied ? 'COPIADO!' : 'COPIAR LINK', () => ui.hooks.mpCopyLink?.(room.code).then((ok) => { mp.copiedAt = ok ? performance.now() : 0; }), { color: '#46b4ff', size: 6 });
  // Como vai ser a chave com quem está na sala agora.
  let y = 60 * u;
  const how = plan.entrants < 2 ? `Entre de 4 a 8 jogadores (faltam ${Math.max(0, 4 - n)}) · complete com robôs se quiser`
    : `${n} jogadores${fmt === '2v2' ? ` · ${plan.entrants} duplas SORTEADAS na hora` : ''} · ${plan.rounds.join(' → ')}${plan.byes ? ` · ${plan.byes} passa${plan.byes > 1 ? 'm' : ''} direto` : ''}`;
  y = para(c, how, cx, y, tall ? 6.5 : 6, W - 24 * u, n >= 4 ? '#e8dcc0' : '#ffb070', 'center', u, 9, 2) + 2 * u;
  // Configuração (só o anfitrião).
  const bw = tall ? (W - 30 * u) / 2 : 170 * u, bh = (ui.phone ? 24 : 22) * u, g = 6 * u;
  const modes = ['1v1', '2v2', 'ffa', 'tour1', 'tour2'], mName = { '1v1': '1v1', '2v2': '2v2', ffa: '1v1v1v1', tour1: 'TORNEIO 1v1', tour2: 'TORNEIO 2v2' };
  const arenas = [...ARENA_ORDER, 'sorteio'], LV = ['easy', 'normal', 'hard'], lvName = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };
  const row = (k, label, fn, color) => ui.button(tall ? cx - bw - g / 2 + (k % 2) * (bw + g) : cx - 2 * bw - 1.5 * g + k * (bw + g), y + (tall ? Math.floor(k / 2) * (bh + g) : 0), bw, bh, label, fn, { disabled: !isHost, color, size: 6.5 });
  row(0, `MODO: ${mName[room.mode]}`, () => ui.hooks.mpSend({ t: 'config', mode: modes[(modes.indexOf(room.mode) + 1) % modes.length] }), '#ff8a3a');
  row(1, `ARENA: ${arenaName(room.arena)}`, () => ui.hooks.mpSend({ t: 'config', arena: arenas[(arenas.indexOf(room.arena) + 1) % arenas.length] }), '#46b4ff');
  row(2, `ROBÔS: ${lvName[room.botLevel || 'normal']}`, () => ui.hooks.mpSend({ t: 'config', botLevel: LV[(LV.indexOf(room.botLevel || 'normal') + 1) % 3] }), '#b8a0ff');
  row(3, 'COMPLETAR COM ROBÔS', () => ui.hooks.mpSend({ t: 'fillBots' }), '#b8a0ff');
  y += (tall ? 2 : 1) * (bh + g) + 2 * u;
  // 8 vagas: 4 colunas × 2 linhas deitado; 2 × 4 em pé.
  const fbH = (ui.phone ? 28 : 26) * u, footY = H - fbH - 10 * u - (tall ? fbH + 6 * u : 0);
  const cols = tall ? 2 : 4, rows = 8 / cols, sw = (W - 24 * u - (cols - 1) * g) / cols;
  const sh = Math.min(64 * u, (footY - 8 * u - y) / rows - g);
  const tap = ui.touchMode ? 'toque' : 'clique';
  for (let seat = 0; seat < 8; seat++) {
    const x = 12 * u + (seat % cols) * (sw + g), sy = y + Math.floor(seat / cols) * (sh + g);
    const p = room.players.find((q) => q.seat === seat);
    panel(c, x, sy, sw, sh, u, p ? (p.bot ? '#8a70d0' : p.ready || p.id === room.host ? '#7ad84a' : '#8a7a5a') : '#3a302a');
    if (!p) {
      text(c, 'vaga livre', x + sw / 2, sy + sh / 2 - 2 * u, 6.5, '#776', 'center', u);
      if (isHost) ui.button(x + sw / 2 - 40 * u, sy + sh / 2 + 4 * u, 80 * u, 16 * u, '+ ROBÔ', () => ui.hooks.mpSend({ t: 'addBot', seat }), { color: '#b8a0ff', size: 6 });
      else { text(c, `${tap} para sentar`, x + sw / 2, sy + sh / 2 + 10 * u, 5.5, '#665', 'center', u); ui.button(x, sy, sw, sh, '', () => ui.hooks.mpSend({ t: 'seat', seat }), { custom: true }); }
      continue;
    }
    const who = p.name + (p.id === room.host ? ' ★' : '') + (p.id === mp.myId ? ' (você)' : '') + (p.bot ? ' · IA' : '');
    text(c, who, x + 7 * u, sy + 13 * u, fitSize(c, who, 6.5, sw - 14 * u, u), p.bot ? '#d8c8ff' : p.connected ? '#fff' : '#888', 'left', u);
    // Arte dos 3 monstros no tamanho que cabe no cartão (no celular, escala 1 para não cobrir o nome).
    const art = ui.phone ? 1 : Math.max(1, Math.floor(Math.min(sh - 22 * u, 40 * u) / 30));
    (p.team || []).forEach((key, i) => ui.drawMonsterArt(SPECIES[key], x + (16 + i * Math.min(34, (sw / u - 20) / 3.2)) * u, sy + sh - 5 * u, art, i + seat));
    if (!p.bot) text(c, p.ready || p.id === room.host ? 'PRONTO' : '...', x + sw - 6 * u, sy + sh - 6 * u, 5.5, p.ready || p.id === room.host ? '#7ad84a' : '#bba', 'right', u);
    if (p.bot && isHost) ui.button(x + sw - 52 * u, sy + sh - 18 * u, 46 * u, 14 * u, 'REMOVER', () => ui.hooks.mpSend({ t: 'removeBot', seat }), { color: '#ff8a8a', size: 5.5 });
    if (p.id === mp.myId) ui.button(x + sw - 64 * u, sy + 18 * u, 58 * u, 14 * u, 'TROCAR TIME', () => ui.editRoomTeam(p.team), { color: GOLD, size: 5.5 });
  }
  // Rodapé.
  const fw = tall ? (W - 30 * u) / 2 : 160 * u, fy = H - fbH - 10 * u;
  const fx = tall ? cx - fw - g / 2 : cx - 1.5 * fw - g;
  ui.button(fx, tall ? footY + 4 * u : fy, fw, fbH, 'SAIR', () => ui.hooks.mpLeave(), { back: true, color: '#aa9' });
  if (me && !isHost) ui.button(fx + fw + g, tall ? footY + 4 * u : fy, fw, fbH, me.ready ? 'PRONTO ✓' : 'PRONTO', () => ui.hooks.mpSend({ t: 'ready', ready: !me.ready }), { color: me.ready ? '#7ad84a' : '#ffd23a' });
  const okN = n >= 4 && (fmt !== '2v2' || n % 2 === 0);
  if (isHost) ui.button(tall ? 12 * u : fx + 2 * (fw + g), fy, tall ? W - 24 * u : fw, fbH, n < 4 ? `FALTAM ${4 - n}` : !okN ? 'NÚMERO ÍMPAR' : 'COMEÇAR TORNEIO', () => ui.hooks.mpSend({ t: 'start' }), { color: GOLD, disabled: !okN, size: 8 });
  else if (!tall) text(c, 'O anfitrião começa o torneio', fx + 2 * (fw + g) + fw / 2, fy + fbH / 2 + 3 * u, 6, '#998', 'center', u);
}

// ───────────── Chave ─────────────
// Quanto falta da fase (o servidor manda o valor; contamos para baixo desde que chegou).
const leftOf = (mp) => Math.max(0, (mp.tour?.left || 0) - (performance.now() - (mp.tourAt || 0)) / 1000);

export function renderBracket(ui, u, W, H) {
  const c = ui.c, mp = ui.mp, T = mp.tour;
  if (!T) return;
  if (T.phase === 'champion') { renderChampion(ui, u, W, H); return; }
  const cx = W / 2, tall = ui.phone && ui.portrait, t = ui.time;
  const R = T.rounds, nR = R.length, me = T.me;
  const left = leftOf(mp);
  c.fillStyle = 'rgba(8,6,12,0.78)'; c.fillRect(0, 0, W, H); // a luta de fundo do menu atrapalha a leitura da chave
  // Título da fase.
  const cur = R[T.round];
  let title, sub;
  if (T.phase === 'draw') { title = T.format === '2v2' ? 'SORTEIO DAS DUPLAS E DA CHAVE' : 'SORTEIO DA CHAVE'; sub = `O torneio começa em ${Math.ceil(left)}s`; }
  else if (T.phase === 'round') { title = `${cur.name} · AO VIVO`; sub = 'Clique numa luta ao vivo para assistir'; }
  else { title = `${R[T.round + 1]?.name || ''} EM ${Math.ceil(left)}s`; sub = 'Quem venceu avançou na chave'; }
  if (ui.touchMode && T.phase === 'round') sub = 'Toque numa luta ao vivo para assistir';
  text(c, title, cx, (tall ? 26 : 30) * u, fitSize(c, title, 13, W - 24 * u, u), T.phase === 'round' ? (ROUND_COL[cur.name] || GOLD) : '#ffe9b0', 'center', u);
  text(c, sub, cx, (tall ? 38 : 44) * u, tall ? 6.5 : 6, '#d8ccb0', 'center', u);
  // Sua situação.
  const meE = me != null ? T.entrants[me] : null;
  let mine = '';
  if (meE) {
    const nextM = R[T.round]?.matches.find((m) => (m.a === me || m.b === me));
    if (meE.out) mine = 'Você foi eliminado — fique para assistir a decisão!';
    else if (T.phase === 'draw') mine = `Você está na chave${T.format === '2v2' ? ` com ${meE.name.split(' & ').find((x) => x !== ui.mp.myName) || 'sua dupla'}` : ''}. Prepare-se!`;
    else if (nextM?.state === 'bye') mine = 'Você PASSOU DIRETO nesta fase!';
    else if (nextM?.state === 'done') mine = 'Você avançou! Espere a próxima fase.';
    else if (T.phase === 'break') mine = `Você está na ${R[T.round + 1]?.name}!`;
  }
  if (mine) text(c, mine, cx, (tall ? 50 : 58) * u, fitSize(c, mine, 7, W - 24 * u, u), meE?.out ? '#ff9a8a' : CYAN, 'center', u);
  // Colunas da chave: fases + campeão. Em pé, letra menor e caixas mais baixas.
  const top = (tall ? 74 : 86) * u, bottom = H - (ui.phone ? 46 : 42) * u;
  const colW = (W - 24 * u) / (nR + 1), boxW = Math.min(colW - (tall ? 8 : 14) * u, 210 * u), rowH = Math.min((tall ? 15 : 16) * u, (bottom - top) / (R[0].matches.length * 2.6));
  const drawP = T.phase === 'draw' ? Math.min(1, 1 - left / 9 + 0.05) : 1; // progresso do sorteio (vagas vão sendo reveladas)
  const nSlots = R[0].matches.length * 2;
  const yOf = (r, k) => { const n = R[r].matches.length, span = (bottom - top) / n; return top + span * (k + 0.5); };
  const names = T.entrants.map((e) => e.name);
  for (let r = 0; r < nR; r++) {
    const x = 12 * u + r * colW + (colW - boxW) / 2;
    text(c, R[r].name, x + boxW / 2, top - 6 * u, fitSize(c, R[r].name, 6.5, boxW, u), r === T.round && T.phase === 'round' ? (ROUND_COL[R[r].name] || GOLD) : '#bba', 'center', u);
    R[r].matches.forEach((m, k) => {
      const yc = yOf(r, k), y0 = yc - rowH;
      const live = m.state === 'live', done = m.state === 'done' || m.state === 'bye';
      // Linhas até a próxima fase (douradas no caminho de quem venceu).
      if (r < nR) {
        const nx = x + boxW, ny = r < nR - 1 ? yOf(r + 1, k >> 1) + (k % 2 ? rowH * 0.5 : -rowH * 0.5) : yc;
        c.strokeStyle = done && m.winner ? GOLD : '#6a5a48'; c.lineWidth = (done && m.winner ? 2.5 : 1.5) * u;
        c.beginPath(); c.moveTo(nx, yc); c.lineTo(nx + (colW - boxW) / 2 + 2 * u, yc); c.lineTo(nx + (colW - boxW) / 2 + 2 * u, ny); c.lineTo(12 * u + (r + 1) * colW + (colW - boxW) / 2, ny); c.stroke();
      }
      const border = live ? (Math.floor(t * 3) % 2 ? RED : '#ff9a8a') : done ? '#8a7a5a' : '#5a4636';
      panel(c, x, y0, boxW, rowH * 2, u, border, live ? 'rgba(60,14,14,0.92)' : 'rgba(18,12,10,0.92)');
      ['a', 'b'].forEach((sd, j) => {
        const id = m[sd], e = id != null ? T.entrants[id] : null, ry = y0 + j * rowH;
        const won = m.winner === sd, lost = m.winner && !won && e;
        if (e && e.id === me) { c.fillStyle = 'rgba(122,232,255,0.18)'; c.fillRect(x + 2 * u, ry + 2 * u, boxW - 4 * u, rowH - 3 * u); }
        if (won) { c.fillStyle = 'rgba(255,210,58,0.2)'; c.fillRect(x + 2 * u, ry + 2 * u, boxW - 4 * u, rowH - 3 * u); }
        let label = e ? e.name : r === 0 ? (T.phase === 'draw' ? '' : '— passa direto —') : '...';
        // Sorteio: vagas ainda não reveladas mostram nomes girando (caça-níquel).
        const slotIdx = r === 0 ? k * 2 + j : -1;
        const hidden = r === 0 && slotIdx >= Math.floor(drawP * nSlots);
        if (hidden) label = '? ' + (names.length ? names[(Math.floor(t * 14) + slotIdx * 3) % names.length] : '') + ' ?';
        const col = hidden ? '#776' : !e ? DIM : lost ? '#776' : won ? GOLD : e.id === me ? CYAN : '#f4ead0';
        const dots = e && !hidden && e.players.length ? 3 * (e.players.length === 1 ? 1 : 0) : 0;
        text(c, label, x + 5 * u, ry + rowH * 0.7, fitSize(c, label, 6, boxW - (dots ? 30 : 10) * u - (won ? 8 * u : 0), u), col, 'left', u);
        if (dots) teamDots(c, e.players[0].team, x + boxW - 22 * u, ry + rowH * 0.35, 4 * u);
        if (won) text(c, '▶', x + boxW - (dots ? 28 : 8) * u, ry + rowH * 0.7, 5, GOLD, 'center', u);
      });
      if (live) {
        text(c, '● AO VIVO', x + boxW - 3 * u, y0 - 2 * u, 5, Math.floor(t * 3) % 2 ? RED : '#ff9a8a', 'right', u);
        const mine2 = m.a === me || m.b === me;
        if (!mine2) ui.button(x, y0, boxW, rowH * 2, '', () => ui.hooks.mpSend({ t: 'watch', match: m.id }), { custom: true });
      } else if (m.score && m.state === 'done') text(c, m.score, x + boxW - 3 * u, y0 - 2 * u, 5, '#bba', 'right', u);
    });
  }
  // Coluna do campeão: troféu esperando o dono.
  const tx = 12 * u + nR * colW + colW / 2, ty = (top + bottom) / 2;
  drawTrophy(c, tx, ty + 4 * u, (tall ? 1.6 : 2.4) * u, t);
  text(c, 'CAMPEÃO', tx, ty + (tall ? 16 : 22) * u, tall ? 6 : 7, GOLD, 'center', u);
  // Rodapé: assistir uma luta ao vivo e sair.
  const bh = (ui.phone ? 26 : 24) * u, by = H - bh - 10 * u;
  const liveM = cur && T.phase === 'round' ? cur.matches.filter((m) => m.state === 'live' && m.a !== me && m.b !== me) : [];
  if (liveM.length) ui.button(cx - 160 * u, by, 150 * u, bh, 'ASSISTIR AO VIVO', () => ui.hooks.mpSend({ t: 'watch', match: liveM[(Math.floor(t) % liveM.length)].id }), { color: RED, size: 7 });
  ui.button(liveM.length ? cx + 10 * u : cx - 75 * u, by, 150 * u, bh, 'SAIR DO TORNEIO', () => ui.hooks.mpLeave(), { color: '#aa9', size: 7 }); // sem "back": o Esc não pode tirar ninguém do torneio
}

// ───────────── Cerimônia do campeão ─────────────
function confetti(ui, W, H, u, dt) {
  ui.confetti ||= [];
  const cols = [GOLD, '#ff6a8a', CYAN, '#7ad84a', '#ffffff', '#b8a0ff'];
  for (let k = 0; k < 4; k++) ui.confetti.push({ x: Math.random() * W, y: -10 * u, vx: (Math.random() - 0.5) * 60 * u, vy: (40 + Math.random() * 60) * u, r: Math.random() * 6, vr: (Math.random() - 0.5) * 10, col: cols[(Math.random() * cols.length) | 0], s: (2 + Math.random() * 3) * u });
  const c = ui.c;
  for (const p of ui.confetti) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.vx += Math.sin(p.y / (30 * u)) * 10 * u * dt;
    c.fillStyle = p.col; c.fillRect(p.x, p.y, p.s * Math.abs(Math.cos(p.r)) + u, p.s);
  }
  ui.confetti = ui.confetti.filter((p) => p.y < H + 10 * u).slice(-260);
}

export function renderChampion(ui, u, W, H) {
  const c = ui.c, mp = ui.mp, T = mp.tour, cx = W / 2, t = ui.time, tall = ui.phone && ui.portrait;
  const dt = Math.min(0.05, t - (ui._confT ?? t)); ui._confT = t;
  c.fillStyle = 'rgba(8,6,12,0.6)'; c.fillRect(0, 0, W, H);
  // Raios de luz girando atrás do troféu.
  const ty = (tall ? 150 : 150) * u;
  c.save(); c.translate(cx, ty - 20 * u); c.rotate(t * 0.3);
  for (let k = 0; k < 12; k++) { c.rotate(Math.PI / 6); c.fillStyle = k % 2 ? 'rgba(255,210,58,0.08)' : 'rgba(255,255,255,0.05)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-30 * u, -400 * u); c.lineTo(30 * u, -400 * u); c.fill(); }
  c.restore();
  confetti(ui, W, H, u, dt);
  const champ = T.champion != null ? T.entrants[T.champion] : null;
  text(c, 'CAMPEÃO DO TORNEIO', cx, (tall ? 34 : 40) * u, tall ? 11 : 14, '#ffe9b0', 'center', u);
  drawTrophy(c, cx, ty + Math.sin(t * 2) * 3 * u, (tall ? 4 : 5) * u, t);
  const name = champ ? champ.name : '—';
  const pulse = 1 + Math.sin(t * 4) * 0.04;
  text(c, name, cx, ty + (tall ? 46 : 52) * u, fitSize(c, name, 18 * pulse, W - 30 * u, u), GOLD, 'center', u);
  if (champ && champ.id === T.me) text(c, 'É VOCÊ!!!', cx, ty + (tall ? 62 : 70) * u, 10, CYAN, 'center', u);
  // Times do campeão (a arte dos monstros que levantaram a taça).
  if (champ) {
    const ps = champ.players, gap = (tall ? 90 : 130) * u;
    ps.forEach((p, i) => {
      const px = cx + (i - (ps.length - 1) / 2) * gap;
      (p.team || []).forEach((k, j) => ui.drawMonsterArt(SPECIES[k], px + (j - 1) * (tall ? 30 : 56) * u, ty + (tall ? 104 : 126) * u + Math.sin(t * 5 + j) * 2 * u, Math.max(1, Math.round(u * (tall ? 1 : 2))), j + i * 3));
    });
  }
  // Pódio: vice e semifinalistas.
  const fin = T.rounds[T.rounds.length - 1].matches[0];
  const vice = fin.winner ? T.entrants[fin[fin.winner === 'a' ? 'b' : 'a']] : null;
  const semis = T.rounds.length > 1 ? T.rounds[T.rounds.length - 2].matches.map((m) => (m.winner ? T.entrants[m[m.winner === 'a' ? 'b' : 'a']] : null)).filter(Boolean) : [];
  let py = ty + (tall ? 128 : 152) * u;
  if (vice) { text(c, `2º LUGAR · ${vice.name}`, cx, py, fitSize(c, `2º LUGAR · ${vice.name}`, 8, W - 30 * u, u), '#d8dcec', 'center', u); py += 14 * u; }
  if (semis.length) { const s = `SEMIFINALISTAS · ${semis.map((e) => e.name).join(' · ')}`; text(c, s, cx, py, fitSize(c, s, 6.5, W - 30 * u, u), '#d8a070', 'center', u); }
  const bh = (ui.phone ? 28 : 26) * u, by = H - bh - 12 * u;
  const isHost = mp.room?.host === mp.myId;
  if (isHost) ui.button(cx - 160 * u, by, 150 * u, bh, 'NOVO TORNEIO', () => ui.hooks.mpSend({ t: 'rematch' }), { color: GOLD, size: 7 });
  else text(c, 'O anfitrião volta para a sala', cx - 85 * u, by + bh / 2 + 3 * u, 6, '#998', 'center', u);
  ui.button(cx + 10 * u, by, 150 * u, bh, 'SAIR', () => ui.hooks.mpLeave(), { back: true, color: '#aa9', size: 7 });
}

// ───────────── Tela de VS antes da luta (por cima da arena, durante a contagem do servidor) ─────────────
export function drawVsIntro(ui, c, u, W, H, start, elapsed) {
  const T = start.tour, hold = start.holdReal || 4;
  if (!T || elapsed > hold + 0.6) return;
  const left = hold - elapsed, ph = Math.min(1, elapsed / 0.45), out = left < 0 ? Math.min(1, -left / 0.6) : 0;
  const tall = ui.phone && ui.portrait;
  c.save();
  c.globalAlpha = 1 - out;
  c.fillStyle = 'rgba(6,4,10,0.78)'; c.fillRect(0, 0, W, H);
  // Faixas diagonais entrando dos lados (lado A dourado, lado B vermelho).
  const slide = (1 - ph) * W * 0.6;
  const mid = W / 2, skew = 40 * u;
  c.fillStyle = 'rgba(255,210,58,0.16)'; c.beginPath(); c.moveTo(-slide, 0); c.lineTo(mid + skew - slide, 0); c.lineTo(mid - skew - slide, H); c.lineTo(-slide, H); c.fill();
  c.fillStyle = 'rgba(255,74,90,0.16)'; c.beginPath(); c.moveTo(W + slide, 0); c.lineTo(mid + skew + slide, 0); c.lineTo(mid - skew + slide, H); c.lineTo(W + slide, H); c.fill();
  const label = T.final ? 'GRANDE FINAL' : `${T.round}${T.games > 1 ? ` · LUTA ${T.game}/${T.games}` : ''}`;
  text(c, label, mid, (tall ? 70 : 60) * u, fitSize(c, label, T.final ? 18 : 13, W - 24 * u, u), T.final ? GOLD : ROUND_COL[T.round] || '#ffe9b0', 'center', u);
  if (start.spectate) text(c, 'VOCÊ ESTÁ ASSISTINDO', mid, (tall ? 84 : 76) * u, 7, CYAN, 'center', u);
  // Nomes e times de cada lado.
  const sides = [0, 1].map((s) => start.players.filter((p) => start.sides[p.seat] === s));
  sides.forEach((ps, s) => {
    const dir = s ? 1 : -1, x = mid + dir * (tall ? 0 : W * 0.25) - dir * slide, y0 = tall ? (s ? H * 0.64 : H * 0.3) : H * 0.42;
    const name = s ? T.b : T.a;
    text(c, name, x, y0, fitSize(c, name, 13, (tall ? W - 30 * u : W * 0.42), u), s ? '#ff8a8a' : GOLD, 'center', u);
    ps.forEach((p, i) => {
      const team = start.rosters[p.seat] || [];
      const rowY = y0 + (tall ? 40 : 54) * u + i * (tall ? 34 : 46) * u;
      team.forEach((k, j) => ui.drawMonsterArt(SPECIES[k], x + (j - 1) * (tall ? 34 : 70) * u, rowY + (tall ? 0 : 20) * u, Math.max(1, Math.round(u * (tall ? 1 : 2))), j + p.seat * 3, s === 1));
    });
  });
  // VS no meio, tremendo, e a contagem.
  const shake = ph < 1 ? 0 : Math.sin(elapsed * 40) * 1.5 * u;
  text(c, 'VS', mid + shake, tall ? H * 0.5 : H * 0.48, tall ? 26 : 34, '#ffffff', 'center', u);
  const n = Math.ceil(left);
  const cd = left <= 0 ? 'LUTEM!' : n <= 3 ? String(n) : '';
  if (cd) { const k = 1 + (left > 0 ? (left % 1) * 0.5 : 0); text(c, cd, mid, tall ? H * 0.5 + 44 * u : H - 70 * u, (cd.length > 1 ? 20 : 30) * k, left <= 0 ? GOLD : '#ffe9b0', 'center', u); } // em pé, acima dos botões de toque
  c.restore();
}

// ───────────── Resultado da luta do torneio (tela de fim) ─────────────
export function renderTourEnd(ui, u, W, H, res, actions) {
  const c = ui.c, cx = W / 2, t = ui.time;
  c.fillStyle = 'rgba(8,4,2,0.72)'; c.fillRect(0, 0, W, H);
  let title, sub, col;
  if (res.you === 'win' && res.final) { title = 'VOCÊ É O CAMPEÃO!'; sub = 'A taça é sua!'; col = GOLD; }
  else if (res.you === 'win') { title = 'VOCÊ AVANÇOU!'; sub = `Próxima fase: ${res.next}`; col = '#7ad84a'; }
  else if (res.you === 'lose') { title = 'ELIMINADO'; sub = `Caiu na ${res.round.toLowerCase()} · fique para assistir o resto!`; col = '#ff8a8a'; }
  else { title = `${res.winner} VENCEU`; sub = res.final ? 'e é o CAMPEÃO do torneio!' : `e avança para a ${res.next?.toLowerCase()}`; col = GOLD; }
  const k = 1 + Math.max(0, 0.3 - (t - (res.shownAt ?? t))) * 1.5; // entra grande e assenta
  const pw = Math.min(W - 20 * u, 460 * u);
  panel(c, cx - pw / 2, H * 0.36 - (res.you === 'win' && res.final ? 90 : 34) * u, pw, (res.you === 'win' && res.final ? 140 : 84) * u, u, col, 'rgba(18,12,10,0.98)'); // cobre o resumo padrão do fim
  text(c, title, cx, H * 0.36, fitSize(c, title, 20 * k, W - 24 * u, u), col, 'center', u);
  text(c, sub, cx, H * 0.36 + 22 * u, fitSize(c, sub, 8, W - 24 * u, u), '#e8dcc0', 'center', u);
  text(c, `${res.winner}  ${res.score || ''}  ${res.loser}`, cx, H * 0.36 + 40 * u, fitSize(c, `${res.winner}  ${res.score || ''}  ${res.loser}`, 7, W - 24 * u, u), '#bba', 'center', u);
  if (res.you === 'win' && res.final) drawTrophy(c, cx, H * 0.36 - 40 * u, 3 * u, t);
  const left = Math.max(0, 6 - (performance.now() - res.at) / 1000);
  const bw = 200 * u, bh = 28 * u;
  ui.button(cx - bw / 2, H * 0.66, bw, bh, `VER A CHAVE (${Math.ceil(left)})`, actions.tourBracket, { color: GOLD });
  ui.drawButtons(u);
}

// Menu sobre a luta do torneio (Esc): voltar à chave, assistir outra luta ao vivo, sair do torneio.
export function renderTourMenu(ui, u, W, H, actions, spectating) {
  const c = ui.c, cx = W / 2, T = ui.mp.tour;
  c.fillStyle = 'rgba(8,4,2,0.6)'; c.fillRect(0, 0, W, H);
  text(c, spectating ? 'ASSISTINDO O TORNEIO' : 'TORNEIO (a luta continua)', cx, H * 0.26, 12, '#ffe9b0', 'center', u);
  const bw = 230 * u, bh = 26 * u;
  let y = H * 0.34;
  ui.button(cx - bw / 2, y, bw, bh, 'CONTINUAR', actions.resume); y += bh + 8 * u;
  if (spectating) {
    ui.button(cx - bw / 2, y, bw, bh, 'VOLTAR À CHAVE', actions.tourBracket, { color: GOLD }); y += bh + 8 * u;
    const cur = T?.rounds[T.round];
    const live = T?.phase === 'round' ? cur.matches.filter((m) => m.state === 'live' && m.id !== actions.watching() && m.a !== T.me && m.b !== T.me) : [];
    for (const m of live.slice(0, 3)) {
      const lbl = `ASSISTIR: ${T.entrants[m.a].name} × ${T.entrants[m.b].name}`;
      ui.button(cx - bw / 2, y, bw, bh, lbl, () => actions.tourWatch(m.id), { color: RED, size: 6.5 }); y += bh + 8 * u;
    }
  }
  ui.button(cx - bw / 2, y, bw, bh, 'SAIR DO TORNEIO', actions.leaveOnline, { color: '#aa9' });
  ui.drawButtons(u);
}

void wrap;
