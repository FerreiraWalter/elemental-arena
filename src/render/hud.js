import { STATE_LABEL } from '../ai/brain.js';
import { TEAM_COLOR, ELEMENT_COLOR, SIG_COLOR, REL_COLOR, relation } from './renderer.js';
import { EVOLUTION, WORLD_W, WORLD_H, COMBO_BREAK } from '../config.js';
import { SIG } from '../sim/signature.js';
import { meter } from '../sim/training.js';

const FONT = '"Press Start 2P", monospace';
const ELEMENT_NAME = { fire: 'Fogo', water: 'Água', plant: 'Planta', earth: 'Terra', electric: 'Elétrico', psychic: 'Psíquico', air: 'Voador', neutral: 'Treino' };
const SLOTS = [['primary', 'MOUSE E'], ['melee', 'MOUSE D'], ['q', 'Q'], ['e', 'E'], ['f', 'F'], ['dodge', 'ESPAÇO']];

function text(c, s, x, y, size, color, align = 'left', dpr = 1) {
  c.font = `${size * dpr}px ${FONT}`;
  c.textAlign = align;
  c.lineWidth = 3 * dpr;
  c.strokeStyle = '#100a08';
  c.strokeText(s, x, y);
  c.fillStyle = color;
  c.fillText(s, x, y);
}

function fit(c, s, size, maxW, dpr) {
  let sz = size;
  c.font = `${sz * dpr}px ${FONT}`;
  while (sz > 4 && c.measureText(s).width > maxW) { sz -= 0.5; c.font = `${sz * dpr}px ${FONT}`; }
  return sz;
}

// Cor da vida: verde no seu, azul no aliado (2v2), vermelho no inimigo, cor da vaga no todos-contra-todos.
function hpColor(m, world) {
  const rel = relation(world, m);
  return rel ? REL_COLOR[rel] : TEAM_COLOR[m.team];
}

function bar(c, x, y, w, h, frac, lag, color, dpr) {
  c.fillStyle = '#05080f';
  c.fillRect(x - dpr, y - dpr, w + 2 * dpr, h + 2 * dpr);
  c.fillStyle = '#1a2236';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#fff6e0';
  c.fillRect(x, y, w * Math.max(0, lag), h);
  c.fillStyle = color;
  c.fillRect(x, y, w * Math.max(0, frac), h);
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(x, y, w * Math.max(0, frac), Math.max(1, h / 4));
}

// ───── Estilo dos painéis (azul-noite com cantos chanfrados e borda colorida) ─────
const PANEL_TOP = 'rgba(24,36,62,0.94)', PANEL_BOT = 'rgba(10,16,30,0.94)', GOLD = '#e8b84a';
function bevel(c, x, y, w, h, k) {
  c.beginPath();
  c.moveTo(x + k, y); c.lineTo(x + w - k, y); c.lineTo(x + w, y + k); c.lineTo(x + w, y + h - k);
  c.lineTo(x + w - k, y + h); c.lineTo(x + k, y + h); c.lineTo(x, y + h - k); c.lineTo(x, y + k); c.closePath();
}
function panel(c, x, y, w, h, border, dpr, cut = 5) {
  const k = Math.min(cut * dpr, h / 3);
  bevel(c, x, y, w, h, k);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, PANEL_TOP); g.addColorStop(1, PANEL_BOT);
  c.fillStyle = g; c.fill();
  c.lineWidth = 3.5 * dpr; c.strokeStyle = 'rgba(4,6,12,0.9)'; c.stroke();
  c.lineWidth = 1.6 * dpr; c.strokeStyle = border; c.stroke();
  // Brilho fino no alto (vidro).
  c.fillStyle = 'rgba(255,255,255,0.06)';
  c.fillRect(x + k, y + 2 * dpr, w - 2 * k, Math.max(1, dpr));
}

// Símbolo do elemento ao lado do nome (chama, gota, folha, pedra, raio).
function elementGlyph(c, el, x, y, s) {
  const u = s / 6, P = (px, py, w, h, col) => { c.fillStyle = col; c.fillRect(x + px * u, y + py * u, w * u, h * u); };
  switch (el) {
    case 'fire': P(2, 0, 2, 1, '#ffb03a'); P(1, 1, 4, 2, '#ff7a1a'); P(1, 3, 4, 2, '#ff5a1a'); P(2, 3, 2, 2, '#ffe066'); P(2, 5, 2, 1, '#ff7a1a'); break;
    case 'water': P(2.5, 0, 1, 1, '#8fd8ff'); P(2, 1, 2, 1, '#5ab4ff'); P(1, 2, 4, 3, '#3a8cff'); P(1.5, 2.5, 1, 1.5, '#c8f0ff'); P(2, 5, 2, 1, '#2a6ad8'); break;
    case 'plant': P(3, 0, 3, 1, '#9be862'); P(2, 1, 4, 2, '#6ac84a'); P(1, 3, 3, 2, '#4aa83a'); P(0, 5, 2, 1, '#7a4a28'); break;
    case 'earth': P(1, 1, 4, 4, '#a8743e'); P(2, 0, 2, 1, '#c89a5a'); P(1, 2, 2, 1, '#c89a5a'); P(4, 3, 1, 2, '#6a4a28'); break;
    case 'air': P(0, 1, 4, 1, '#d8f6ff'); P(3, 0, 2, 1, '#9ad8ec'); P(1, 3, 5, 1, '#ffffff'); P(4, 2, 2, 1, '#9ad8ec'); P(0, 5, 3, 1, '#9ad8ec'); P(2, 4, 2, 1, '#d8f6ff'); break;
    case 'psychic': P(1, 2, 4, 2, '#d07aff'); P(0, 3, 6, 1, '#9a4ad8'); P(2, 2, 2, 2, '#ffffff'); P(2.5, 2.5, 1, 1, '#5a2a9a'); P(2, 0, 2, 1, '#ff9ae6'); P(2, 5, 2, 1, '#ff9ae6'); break;
    case 'electric': P(3, 0, 2, 1, '#ffe24a'); P(2, 1, 2, 1, '#ffe24a'); P(1, 2, 4, 1, '#ffffff'); P(3, 3, 2, 1, '#ffe24a'); P(2, 4, 2, 1, '#ffe24a'); P(2, 5, 1, 1, '#c8a838'); break;
  }
}

// Retrato do monstro: busto animado recortado numa moldura quadrada.
function portrait(c, r, m, x, y, s, border, dpr) {
  const def = m.def;
  bevel(c, x, y, s, s, 3 * dpr);
  const g = c.createRadialGradient(x + s / 2, y + s * 0.4, 1, x + s / 2, y + s / 2, s * 0.75);
  g.addColorStop(0, '#2a3e66'); g.addColorStop(1, '#0c1426');
  c.fillStyle = g; c.fill();
  if (r.art?.has(def.sprite)) {
    const f = r.art.render('hud:' + m.id, def.sprite, { t: r.time + m.id, walk: 0, moving: 0, crouch: 0, lunge: 0, dash: 0, dead: 0, seed: m.id, power: 0, flames: def.element === 'fire' ? (def.stage > 1 ? 6 : 3) : 0 });
    const top = f.top || f.h * 0.8;
    const sc = Math.max(1, Math.floor((s * 1.15) / top * 2) / 2);
    c.save();
    bevel(c, x + dpr, y + dpr, s - 2 * dpr, s - 2 * dpr, 3 * dpr); c.clip();
    c.imageSmoothingEnabled = false;
    c.globalAlpha *= m.alive ? 1 : 0.4;
    c.drawImage(f.canvas, Math.round(x + s / 2 - f.ax * sc), Math.round(y + 3 * dpr + top * sc - f.ay * sc), f.w * sc, f.h * sc);
    c.restore();
  }
  bevel(c, x, y, s, s, 3 * dpr);
  c.lineWidth = 1.6 * dpr; c.strokeStyle = border; c.stroke();
}

// Ícone de cada tipo de habilidade, desenhado em pixel (s = tamanho em px do dispositivo).
export function abilityIcon(c, kind, x, y, s, color) {
  const u = s / 10;
  c.save();
  c.translate(x, y);
  c.fillStyle = color; c.strokeStyle = color; c.lineWidth = Math.max(1, u * 1.4); c.lineCap = 'round';
  const P = (px, py, w = 1, h = 1) => c.fillRect(px * u, py * u, w * u, h * u);
  c.beginPath();
  switch (kind) {
    case 'projectile': c.arc(6.5 * u, 5 * u, 2.2 * u, 0, 7); c.fill(); P(0.5, 4.5, 3, 1); P(1.5, 2.5, 2, 1); P(1.5, 6.5, 2, 1); break;
    case 'melee': for (let k = 0; k < 3; k++) { c.moveTo((2 + k * 2.5) * u, 1.5 * u); c.quadraticCurveTo((5 + k * 2.5) * u, 5 * u, (2 + k * 2.5) * u, 8.5 * u); } c.stroke(); break;
    case 'cone': c.moveTo(1 * u, 5 * u); c.lineTo(9 * u, 1 * u); c.lineTo(9 * u, 9 * u); c.closePath(); c.globalAlpha = 0.85; c.fill(); break;
    case 'beam': P(3, 4, 7, 2); c.arc(2 * u, 5 * u, 1.8 * u, 0, 7); c.fill(); break;
    case 'aoe': c.arc(5 * u, 5 * u, 4 * u, 0, 7); c.stroke(); c.beginPath(); c.arc(5 * u, 5 * u, 1.6 * u, 0, 7); c.fill(); break;
    case 'dash': c.moveTo(1 * u, 5 * u); c.lineTo(8 * u, 5 * u); c.moveTo(5.5 * u, 2 * u); c.lineTo(8.5 * u, 5 * u); c.lineTo(5.5 * u, 8 * u); c.stroke(); break;
    case 'lob': c.moveTo(1 * u, 8.5 * u); c.quadraticCurveTo(5 * u, -2 * u, 9 * u, 8.5 * u); c.stroke(); c.beginPath(); c.arc(9 * u, 8.5 * u, 1.4 * u, 0, 7); c.fill(); break;
    case 'guard': c.arc(5 * u, 7 * u, 4.2 * u, Math.PI, 0); c.lineTo(9.2 * u, 8.5 * u); c.lineTo(0.8 * u, 8.5 * u); c.closePath(); c.globalAlpha = 0.9; c.fill(); break;
    case 'dodge': c.moveTo(1 * u, 7.5 * u); c.quadraticCurveTo(4 * u, 1 * u, 9 * u, 3 * u); c.stroke(); P(7, 6, 2, 1); P(5, 8, 2, 1); break;
    case 'buff': c.moveTo(5 * u, 0.5 * u); c.lineTo(6.4 * u, 3.6 * u); c.lineTo(9.5 * u, 5 * u); c.lineTo(6.4 * u, 6.4 * u); c.lineTo(5 * u, 9.5 * u); c.lineTo(3.6 * u, 6.4 * u); c.lineTo(0.5 * u, 5 * u); c.lineTo(3.6 * u, 3.6 * u); c.closePath(); c.fill(); break;
    case 'evolve': c.moveTo(5 * u, 0.5 * u); c.lineTo(9 * u, 5 * u); c.lineTo(6.5 * u, 5 * u); c.lineTo(6.5 * u, 9.5 * u); c.lineTo(3.5 * u, 9.5 * u); c.lineTo(3.5 * u, 5 * u); c.lineTo(1 * u, 5 * u); c.closePath(); c.fill(); break;
    default: P(3, 3, 4, 4);
  }
  c.restore();
}

// Ícones de status em pixel (queimando, molhado, preso, atordoado, bolha, superaquecido, exausto, camuflado).
export function statusIcon(c, kind, x, y, s) {
  const u = s / 6;
  const P = (px, py, w, h, col) => { c.fillStyle = col; c.fillRect(x + px * u, y + py * u, w * u, h * u); };
  P(0, 0, 6, 6, 'rgba(10,6,4,0.85)');
  switch (kind) {
    case 'burn': P(2, 1, 2, 4, '#ff7a1a'); P(1, 3, 4, 2, '#ff7a1a'); P(2, 3, 2, 2, '#ffd84a'); break;
    case 'wet': P(2.5, 1, 1, 1, '#8fd8ff'); P(2, 2, 2, 1, '#5ab4ff'); P(1.5, 3, 3, 2, '#5ab4ff'); break;
    case 'root': P(1, 1, 1, 4, '#7ad84a'); P(3, 2, 1, 3, '#5a3a1a'); P(4.5, 1, 1, 4, '#7ad84a'); P(1, 4, 4.5, 1, '#5a3a1a'); break;
    case 'stun': P(1, 1, 1, 1, '#ffe066'); P(4, 2, 1, 1, '#ffe066'); P(2, 4, 1, 1, '#ffe066'); P(3, 3, 1, 1, '#ffffff'); break;
    case 'shield': P(1, 1, 4, 4, '#8fd8ff'); P(2, 2, 2, 2, 'rgba(10,6,4,0.9)'); break;
    case 'overheat': P(1, 1, 1, 4, '#ffd84a'); P(4, 1, 1, 4, '#ffd84a'); P(2.5, 2, 1, 3, '#ff7a1a'); break;
    case 'exhaust': P(1, 1, 4, 1, '#c8b8a0'); P(3, 2, 1, 1, '#c8b8a0'); P(2, 3, 1, 1, '#c8b8a0'); P(1, 4, 4, 1, '#c8b8a0'); break;
    case 'cloak': P(1, 2, 4, 3, '#6a5aa0'); P(2, 3, 1, 1, '#ffffff'); P(3.5, 3, 1, 1, '#ffffff'); break;
    case 'charged': P(3, 0.5, 1, 2, '#ffe066'); P(2, 2.5, 2, 1, '#ffe066'); P(2, 3.5, 1, 2, '#ffe066'); break;
    case 'slow': P(1, 1, 4, 1, '#9be862'); P(1.5, 2, 1, 2, '#9be862'); P(3.5, 2, 1, 3, '#5aa83c'); P(2.5, 4, 1, 1, '#c8ff7a'); break;
    case 'dr': P(1, 1, 4, 4, '#7a4a28'); P(2, 2, 2, 2, '#a8743e'); P(4, 1, 1, 1, '#9be862'); break;
    case 'regen': P(2.5, 1, 1, 4, '#7ad84a'); P(1, 2.5, 4, 1, '#7ad84a'); break;
    case 'charm': P(1, 1, 4, 1, '#ff9ae6'); P(4, 2, 1, 2, '#ff9ae6'); P(2, 4, 3, 1, '#d07aff'); P(2, 2.5, 1, 1.5, '#d07aff'); P(3, 2.5, 1, 1, '#ffffff'); break;
    case 'volt': P(3, 0.5, 2, 1, '#8fe8ff'); P(2, 1.5, 2, 1, '#8fe8ff'); P(1.5, 2.5, 3, 1, '#ffffff'); P(2.5, 3.5, 2, 1, '#8fe8ff'); P(2, 4.5, 1, 1, '#3fa9ff'); break;
  }
}

export const STATUS_NAME = { burn: 'queimando', wet: 'molhado', root: 'preso', stun: 'atordoado', shield: 'escudo', overheat: 'superaquecido', exhaust: 'exausto', cloak: 'camuflado', charged: 'em disparada', slow: 'lento (seiva/choque)', dr: 'casca (menos dano)', regen: 'regenerando', volt: 'eletrizado', charm: 'hipnotizado' };
export function statusList(m) {
  const st = m.status, out = [];
  for (const k of ['stun', 'charm', 'root', 'burn', 'wet', 'slow', 'dr', 'shield', 'overheat', 'exhaust', 'cloak']) if (st[k] > 0 && (k !== 'shield' || m.shieldHp > 0)) out.push(k);
  if (m.charged) out.push('charged');
  if (m.def?.sig?.kind === 'volt' && m.volt >= (m.def.sig.voltMax ?? 3)) out.push('volt');
  return out;
}

// Pode trocar para `m` agora? (mesmas regras de World.requestSwitch)
function canSwitchTo(world, m) {
  const ts = world.teams[m.slot];
  return m.alive && !m.onField && ts.field?.alive && !ts.field.switchState && ts.cooldown <= 0 && !world.over;
}

// Cartão compacto de um monstro do time (em campo, reserva ou derrotado).
function card(c, r, world, m, idx, x, y, w, dpr) {
  const st = r.ms(m);
  const h = 54 * dpr, pad = 5 * dpr;
  const field = m.onField && m.alive;
  const mine = world.playerTeam !== null && m.slot === world.playerTeam;
  c.globalAlpha = m.alive ? (field ? 1 : 0.85) : 0.45;
  panel(c, x, y, w, h, field ? GOLD : TEAM_COLOR[m.team], dpr);
  // Retrato à esquerda (some quando o cartão fica estreito demais).
  const ps = (w >= 96 * dpr ? 26 : w >= 64 * dpr ? 17 : 0) * dpr;
  // Retrato grande empurra o cartão todo; o pequeno só divide a linha do nome.
  if (ps) portrait(c, r, m, x + pad, y + (ps > 20 * dpr ? pad : 3 * dpr), ps, field ? GOLD : '#3a4a6a', dpr);
  if (ps > 20 * dpr) { x += ps + 3 * dpr; w -= ps + 3 * dpr; }
  let tx = x + pad + (ps && ps <= 20 * dpr ? ps + 3 * dpr : 0);
  if (mine) {
    // Tecla de troca: verde = pode trocar agora; cinza = recarga/indisponível.
    const ready = canSwitchTo(world, m);
    c.fillStyle = field ? '#ffe066' : ready ? '#4ac05a' : '#3a2e28';
    if (ps) {
      // Com retrato: a tecla vira um selo no canto do retrato (sobra espaço para o nome).
      const kx = x - (ps > 20 * dpr ? ps + 3 * dpr : 0) + pad - 2 * dpr, ky = y + (ps > 20 * dpr ? pad : 3 * dpr) + ps - 8 * dpr;
      c.fillRect(kx, ky, 10 * dpr, 10 * dpr);
      text(c, String(idx + 1), kx + 5 * dpr, ky + 8.5 * dpr, 6, field || ready ? '#100a08' : '#887', 'center', dpr);
    } else {
      c.fillRect(tx, y + 6 * dpr, 12 * dpr, 12 * dpr);
      text(c, String(idx + 1), tx + 6 * dpr, y + 16 * dpr, 7, field || ready ? '#100a08' : '#887', 'center', dpr);
      tx += 16 * dpr;
    }
  }
  const nsz = fit(c, m.name.toUpperCase(), 7, x + w - pad - tx - 8 * dpr, dpr);
  text(c, m.name.toUpperCase(), tx, y + 15 * dpr, nsz, field ? '#ffd86a' : ELEMENT_COLOR[m.element], 'left', dpr);
  elementGlyph(c, m.element, x + w - pad - 6 * dpr, y + 7 * dpr, 6 * dpr);
  // Cartão estreito: o símbolo já diz o elemento; fica só o estágio (e a vida não se sobrepõe).
  const narrow = w < 100 * dpr;
  const sub = `${narrow ? '' : `${ELEMENT_NAME[m.element]} · `}Est.${m.stage}${m.evolved ? ' ★' : m.canEvolve ? (narrow ? ' !' : ' PRONTO') : ''}`;
  text(c, sub, x + pad, y + 28 * dpr, 5, m.canEvolve ? '#e8b8ff' : '#8fa0c0', 'left', dpr);
  const shielded = m.alive && m.status.shield > 0 && m.shieldHp > 0;
  text(c, `${Math.ceil(Math.max(0, m.hp))}${shielded ? `+${Math.ceil(m.shieldHp)}` : `/${m.maxHp}`}`, x + w - pad, y + 28 * dpr, 5, shielded ? '#8fd8ff' : '#fff', 'right', dpr);
  bar(c, x + pad, y + 32 * dpr, w - pad * 2, 6 * dpr, m.hp / m.maxHp, st.lagHp / m.maxHp, hpColor(m, world), dpr);
  if (shielded) {
    // Escudo: faixa azul sobre a barra de vida (proporcional à vida máxima) + contorno enquanto durar.
    c.fillStyle = '#8fd8ff';
    c.fillRect(x + pad, y + 32 * dpr, (w - pad * 2) * Math.min(1, m.shieldHp / m.maxHp), 2 * dpr);
    c.strokeStyle = '#8fd8ff'; c.lineWidth = dpr;
    c.strokeRect(x + pad - dpr, y + 32 * dpr - dpr, w - pad * 2 + 2 * dpr, 6 * dpr + 2 * dpr);
  }
  // Energia de evolução (persiste no banco); estrela quando já evoluiu.
  if (m.alive && m.def.evolvesTo && !m.evolved) {
    c.fillStyle = '#1e1428';
    c.fillRect(x + pad, y + 39 * dpr, w - pad * 2, 2 * dpr);
    c.fillStyle = m.canEvolve ? (Math.floor(r.time * 6) % 2 ? '#ffffff' : '#e8b8ff') : '#a070d8';
    c.fillRect(x + pad, y + 39 * dpr, (w - pad * 2) * Math.min(1, m.energy / EVOLUTION.threshold), 2 * dpr);
  }
  let label, lc = '#d8d0c0';
  if (!m.alive) { label = 'DERROTADO'; lc = '#ff6a6a'; }
  else if (m.switchState === 'exiting') { label = 'SAINDO...'; lc = '#ffe066'; }
  else if (m.switchState === 'entering') { label = 'ENTRANDO...'; lc = '#ffe066'; }
  else if (!m.onField) { label = 'RESERVA'; lc = '#99a'; }
  else if (m.evolveT > 0) { label = 'EVOLUINDO...'; lc = '#e8b8ff'; }
  else if (m === world.active) { label = 'EM CAMPO · você'; lc = '#ffe066'; }
  else label = STATE_LABEL[m.status.root > 0 ? 'rooted' : m.ai.state] || m.ai.state;
  const lsz = fit(c, label, 5, w - pad * 2 - 20 * dpr, dpr);
  text(c, label, x + pad, y + 49 * dpr, lsz, lc, 'left', dpr);
  // Status (continuam no banco): ícones em pixel, da direita para a esquerda.
  let ix = x + w - pad - 7 * dpr;
  if (m.alive) for (const k of statusList(m).slice(0, 4)) { statusIcon(c, k, ix, y + 42 * dpr, 7 * dpr); ix -= 8 * dpr; }
  c.globalAlpha = 1;
  if (!m.alive) {
    c.strokeStyle = 'rgba(255,74,90,0.85)';
    c.lineWidth = 3 * dpr;
    c.beginPath();
    c.moveTo(x + 4 * dpr, y + 4 * dpr); c.lineTo(x + w - 4 * dpr, y + h - 4 * dpr);
    c.moveTo(x + w - 4 * dpr, y + 4 * dpr); c.lineTo(x + 4 * dpr, y + h - 4 * dpr);
    c.stroke();
  }
}

// Texto e preenchimento do medidor da mecânica própria do monstro controlado.
function sigGauge(world, m) {
  const sig = m.def.sig;
  if (!sig) return null;
  const st = m.status;
  switch (sig.kind) {
    case 'heat':
      if (st.exhaust > 0) return { label: `EXAUSTO ${st.exhaust.toFixed(1)}s`, k: st.exhaust / (sig.exhaust ?? SIG.heat.exhaust), color: SIG_COLOR.exhaust, warn: true };
      if (st.overheat > 0) return { label: `SUPERAQUECIDO ${st.overheat.toFixed(1)}s`, k: st.overheat / SIG.heat.overheat, color: SIG_COLOR.overheat, blink: true };
      return { label: `CALOR ${Math.round(m.heat)}%`, k: m.heat / 100, color: SIG_COLOR.heat, warn: m.heat > 75 };
    case 'momentum':
      return m.charged ? { label: 'EM DISPARADA!', k: 1, color: SIG_COLOR.momentum, blink: true } : { label: `ÍMPETO ${Math.round(m.momentum)}%`, k: m.momentum / 100, color: '#c8a838' };
    case 'guard': {
      const id = m.def.controls.f, cd = m.cd[id] || 0;
      const on = m.action?.ab.kind === 'guard' && m.action.phase === 'active';
      return { label: on ? 'BLOQUEANDO!' : cd > 0 ? `CASCO ${cd.toFixed(1)}s` : 'CASCO PRONTO (F)', k: on ? 1 : 1 - cd / (m.ability(id)?.cooldown || 1), color: SIG_COLOR.guard, blink: on };
    }
    case 'sentry': {
      const n = world.obstacles.filter((o) => o.sentry && o.owner === m && !o.destroyed).length;
      return { label: `SENTINELAS ${n}/${SIG.sentry.max}`, k: n / SIG.sentry.max, color: SIG_COLOR.sentry };
    }
    case 'decoy': {
      const n = world.decoys.filter((d) => d.owner === m).length;
      if (st.cloak > 0) return { label: `CAMUFLADO ${st.cloak.toFixed(1)}s`, k: st.cloak / 2.2, color: SIG_COLOR.decoy, blink: true };
      return { label: n ? `CÓPIAS EM CAMPO: ${n}` : 'CÓPIAS: esquive ou use Q', k: Math.min(1, n / 3), color: SIG_COLOR.decoy };
    }
    case 'volt': {
      const max = sig.voltMax ?? 3, n = m.volt || 0;
      return { label: n >= max ? `ELETRIZADO! ${n}/${max} (E descarrega)` : `CARGAS ${n}/${max}`, k: n / max, color: SIG_COLOR.volt, blink: n >= max };
    }
    case 'trance': {
      const foes = world.monsters.filter((o) => o.alive && o.team !== m.team);
      if (foes.some((o) => o.status.charm > 0 && o.charmBy === m)) return { label: 'HIPNOTIZADO!', k: 1, color: '#ff9ae6', blink: true };
      const n = Math.max(0, ...foes.map((o) => o.trance || 0));
      return { label: `TRANSE ${n}/3`, k: n / 3, color: '#d07aff', blink: n >= 2 };
    }
    case 'marks': {
      const foe = world.monsters.find((o) => o.alive && o.marks?.by === m.id && o.marks.n > 0);
      const n = foe ? foe.marks.n : 0;
      // Lutadores (Terra) chamam de Combo/Nocaute; o Mantifolha, de Marcas/Execução.
      if (m.element === 'earth') return { label: n >= 3 ? 'NOCAUTE! (próximo golpe de perto)' : `COMBO ${n}/3`, k: n / 3, color: '#e8c890', blink: n >= 3 };
      return { label: n >= 3 ? 'EXECUTE! (foice ou salto)' : `MARCAS NO ALVO ${n}/3`, k: n / 3, color: SIG_COLOR.marks, blink: n >= 3 };
    }
  }
  return null;
}

// Barra de habilidades do monstro controlado.
function abilityBar(c, world, ox, aw, y, dpr, r) {
  const m = world.active;
  if (!m) {
    if (!world.over) text(c, 'Próximo monstro entrando...', ox + aw / 2, y + 24 * dpr, 7, '#ffe066', 'center', dpr);
    return;
  }
  const slots = SLOTS.filter(([k]) => m.def.controls[k]);
  const evoSlot = !!m.def.evolvesTo && !m.evolved;
  const nSlots = slots.length + (evoSlot ? 1 : 0);
  // Bloco da esquerda: retrato grande + nome, vida, medidor da mecânica e status.
  const pS = 46 * dpr, lw = 118 * dpr, left = pS + 6 * dpr + lw + 10 * dpr;
  const bh = 46 * dpr, gap = 4 * dpr;
  const bw = Math.max(40 * dpr, Math.min(66 * dpr, (aw - left - 16 * dpr) / nSlots - gap));
  const total = nSlots * bw + (nSlots - 1) * gap;
  const x0 = Math.max(ox, ox + aw / 2 - (left + total) / 2);
  panel(c, x0 - 5 * dpr, y - 5 * dpr, left + total + 10 * dpr, bh + 10 * dpr, GOLD, dpr, 6);
  portrait(c, r, m, x0, y, pS, GOLD, dpr);
  const px = x0 + pS + 6 * dpr;
  let x = x0 + left;
  elementGlyph(c, m.element, px, y + 1 * dpr, 7 * dpr);
  text(c, m.name.toUpperCase(), px + 10 * dpr, y + 9 * dpr, fit(c, m.name.toUpperCase(), 7, lw - 56 * dpr, dpr), '#ffd86a', 'left', dpr);
  bar(c, px, y + 13 * dpr, lw, 7 * dpr, m.hp / m.maxHp, m.hp / m.maxHp, hpColor(m, world), dpr);
  if (m.status.shield > 0 && m.shieldHp > 0) { c.fillStyle = '#8fd8ff'; c.fillRect(px, y + 13 * dpr, lw * Math.min(1, m.shieldHp / m.maxHp), 3 * dpr); }
  text(c, `${Math.ceil(m.hp)}${m.status.shield > 0 && m.shieldHp > 0 ? `+${Math.ceil(m.shieldHp)}` : `/${m.maxHp}`}`, px + lw, y + 9 * dpr, 5, m.status.shield > 0 && m.shieldHp > 0 ? '#8fd8ff' : '#fff', 'right', dpr);
  // Medidor da mecânica própria (Fornalha, Ímpeto, Casco, Sentinelas, Cópias, Marcas).
  const gge = sigGauge(world, m);
  if (gge) {
    const blink = gge.blink && Math.floor(performance.now() / 160) % 2;
    text(c, gge.label, px, y + 30 * dpr, fit(c, gge.label, 5.5, lw * 0.56, dpr), blink ? '#ffffff' : gge.color, 'left', dpr);
    c.fillStyle = '#100a08'; c.fillRect(px - dpr, y + 33 * dpr, lw + 2 * dpr, 6 * dpr);
    c.fillStyle = '#2a201a'; c.fillRect(px, y + 34 * dpr, lw, 4 * dpr);
    c.fillStyle = blink ? '#ffffff' : gge.color; c.fillRect(px, y + 34 * dpr, lw * Math.max(0, Math.min(1, gge.k)), 4 * dpr);
  }
  // Quebra de combo: pronta (energia + recarga) ou quanto falta.
  {
    const ok = m.breakCd <= 0 && m.energy >= COMBO_BREAK.cost;
    const s = m.breakCd > 0 ? `COMBO ${Math.ceil(m.breakCd)}s` : ok ? 'COMBO PRONTO' : 'SEM COMBO';
    text(c, s, px + lw, y + 30 * dpr, fit(c, s, 4.5, lw * 0.4, dpr), ok ? '#ffb04a' : '#6a7488', 'right', dpr);
  }
  // Status atuais do seu monstro, com nome (fácil de ler).
  const sts = statusList(m);
  let sx = px;
  for (const k of sts.slice(0, 3)) {
    statusIcon(c, k, sx, y + 42 * dpr, 7 * dpr);
    text(c, STATUS_NAME[k], sx + 9 * dpr, y + 48 * dpr, 4.5, '#e8dcc0', 'left', dpr);
    sx += 42 * dpr;
  }
  const deny = r.denySlot;
  for (const [slot, key] of slots) {
    const ab = m.ability(m.def.controls[slot]);
    const cd = m.waitFor ? m.waitFor(ab.id) : m.cd[ab.id];
    const charges = ab.charges ? (m.ch[ab.id] ?? ab.charges) : 0;
    const using = m.action?.ab === ab;
    const locked = m.status.exhaust > 0 && m.isSpecial?.(ab.id);
    const denied = deny && deny.slot === slot && Math.floor(deny.t * 14) % 2 === 0;
    const off = cd > 0 || locked;
    panel(c, x, y, bw, bh, denied ? '#ff4a4a' : using ? '#ffe066' : off ? '#34405a' : ELEMENT_COLOR[m.element], dpr, 4);
    if (using) { c.fillStyle = 'rgba(255,224,102,0.16)'; bevel(c, x, y, bw, bh, 4 * dpr); c.fill(); }
    // Etiqueta da tecla no canto (sem ícone: o nome da habilidade é o destaque).
    const ksz = fit(c, key, 5, bw - 10 * dpr, dpr);
    c.font = `${ksz * dpr}px ${FONT}`;
    const kw = c.measureText(key).width + 6 * dpr;
    c.fillStyle = off ? '#3a4458' : '#ffe9b0';
    c.fillRect(x + 3 * dpr, y + 3 * dpr, kw, 9 * dpr);
    c.fillStyle = off ? '#9aa4b8' : '#141a2a'; c.textAlign = 'left';
    c.fillText(key, x + 6 * dpr, y + 10.5 * dpr);
    const words = ab.name.split(' ');
    const l1 = words.length > 1 ? words.slice(0, Math.ceil(words.length / 2)).join(' ') : ab.name;
    const l2 = words.length > 1 ? words.slice(Math.ceil(words.length / 2)).join(' ') : '';
    const nsz = Math.min(fit(c, l1, 6.5, bw - 6 * dpr, dpr), fit(c, l2 || l1, 6.5, bw - 6 * dpr, dpr));
    text(c, l1, x + bw / 2, y + 24 * dpr, nsz, off ? '#8a94a8' : '#f2ecdc', 'center', dpr);
    if (l2) text(c, l2, x + bw / 2, y + 33 * dpr, nsz, off ? '#8a94a8' : '#f2ecdc', 'center', dpr);
    // Recarga total da habilidade, embaixo (como no esboço).
    if (!(cd > 0)) text(c, `${+ab.cooldown.toFixed(1)}s`, x + bw / 2, y + bh - 4 * dpr, 4.5, '#8fa0c0', 'center', dpr);
    if (ab.charges) {
      // Pontinhos de carga no canto e a barrinha da próxima carga recarregando.
      for (let k = 0; k < ab.charges; k++) {
        c.fillStyle = k < charges ? '#ffe066' : '#3a302a';
        c.fillRect(x + bw - (7 + k * 6) * dpr, y + 4 * dpr, 4 * dpr, 4 * dpr);
      }
      if (charges < ab.charges && charges > 0) {
        const f = 1 - (m.rc[ab.id] || 0) / ab.cooldown;
        c.fillStyle = '#ffe066';
        c.fillRect(x + 3 * dpr, y + bh - 4 * dpr, (bw - 6 * dpr) * Math.max(0, Math.min(1, f)), 2 * dpr);
      }
    }
    if (cd > 0) {
      const f = Math.min(1, cd / (ab.charges && charges > 0 ? (ab.chargeGap ?? 0.6) : ab.cooldown));
      c.fillStyle = 'rgba(4,8,18,0.62)';
      c.fillRect(x + 2 * dpr, y + 2 * dpr + (bh - 4 * dpr) * (1 - f), bw - 4 * dpr, (bh - 4 * dpr) * f);
      if (cd >= 0.95) text(c, cd.toFixed(0), x + bw / 2, y + bh / 2 + 5 * dpr, 9, '#fff', 'center', dpr);
    }
    if (locked) {
      c.fillStyle = 'rgba(40,30,24,0.75)';
      c.fillRect(x + 2 * dpr, y + 2 * dpr, bw - 4 * dpr, bh - 4 * dpr);
      text(c, 'EXAUSTO', x + bw / 2, y + bh / 2 + 3 * dpr, fit(c, 'EXAUSTO', 5.5, bw - 6 * dpr, dpr), '#d8ccb8', 'center', dpr);
    }
    if (denied) text(c, deny.reason === 'exhaust' ? 'EXAUSTO' : deny.reason === 'root' ? 'PRESO' : 'RECARGA', x + bw / 2, y - 4 * dpr, 5, '#ff8a8a', 'center', dpr);
    x += bw + gap;
  }
  // Botão de evolução: enche com a energia; pisca quando está pronto.
  if (evoSlot) {
    const k = Math.min(1, m.energy / EVOLUTION.threshold);
    const ready = m.canEvolve;
    const blink = ready && Math.floor(performance.now() / 200) % 2;
    panel(c, x, y, bw, bh, ready ? '#e8b8ff' : '#5a4a7a', dpr, 4);
    c.fillStyle = ready ? (blink ? 'rgba(160,96,232,0.75)' : 'rgba(110,56,170,0.75)') : 'rgba(80,44,120,0.6)';
    c.fillRect(x + 2 * dpr, y + 2 * dpr + (bh - 4 * dpr) * (1 - k), bw - 4 * dpr, (bh - 4 * dpr) * k);
    c.fillStyle = '#ffe9b0'; c.fillRect(x + 3 * dpr, y + 3 * dpr, 11 * dpr, 9 * dpr);
    c.font = `${5 * dpr}px ${FONT}`; c.fillStyle = '#141a2a'; c.textAlign = 'left'; c.fillText('G', x + 6 * dpr, y + 10.5 * dpr);
    // Virada: rival já evoluído em campo e você ainda não — a barra enche 60% mais rápido.
    const underdog = !ready && !m.evolved && m.def.evolvesTo && world.monsters.some((e) => e.alive && e.onField && e.team !== m.team && e.def.stage >= 2);
    text(c, underdog ? 'VIRADA x1.6' : 'EVOLUIR', x + bw / 2, y + 26 * dpr, Math.min(underdog ? 5 : 6, bw / dpr / (underdog ? 12 : 9)), underdog ? '#ffd23a' : '#fff', 'center', dpr);
    text(c, ready ? 'PRONTO!' : `${Math.floor(k * 100)}%`, x + bw / 2, y + bh - 5 * dpr, 5.5, ready ? '#e8b8ff' : '#c8bce0', 'center', dpr);
  }
}

// Aviso de controle no seu monstro (hipnotizado / atordoado / preso / no ar), com o tempo que falta, e a Quebra
// de Combo quando ela vale (atordoado, hipnotizado ou no ar; raízes só prendem no lugar).
const CC_BANNER = { charm: ['VOCÊ ESTÁ HIPNOTIZADO', '#ff9ae6'], stun: ['VOCÊ ESTÁ ATORDOADO', '#ffe066'], root: ['VOCÊ ESTÁ PRESO', '#7ad84a'] };
function comboPrompt(c, world, x, y, dpr) {
  const m = world.active;
  if (!m || world.over || !m.alive) return;
  const cc = m.status.charm > 0.05 ? 'charm' : m.status.stun > 0.05 ? 'stun' : m.status.root > 0.05 ? 'root' : null;
  if (!cc && !(m.lift > 0)) return;
  if (cc) {
    const [label, col] = CC_BANNER[cc];
    text(c, `${label} · ${m.status[cc].toFixed(1)}s`, x, y - 11 * dpr, 8, col, 'center', dpr);
    if (cc === 'root') { text(c, 'Pode atacar, mas não anda nem esquiva', x, y, 6, '#c8d8b0', 'center', dpr); return; }
  }
  let s, col;
  if (world.canBreakCombo?.(m)) { s = 'ESPAÇO: QUEBRAR COMBO!'; col = Math.floor(performance.now() / 150) % 2 ? '#ffffff' : '#ffb04a'; }
  else if (m.breakCd > 0) { s = `Quebra de combo em ${m.breakCd.toFixed(0)}s`; col = '#aa9'; }
  else { s = `Quebra de combo: precisa de ${COMBO_BREAK.cost} de energia`; col = '#aa9'; }
  text(c, s, x, y, 7, col, 'center', dpr);
}

// Todos-contra-todos: um painel por adversário no alto (nome na cor da vaga, os 3 monstros, eliminação e campeão).
function ffaPanels(c, world, slots, x0, x1, y, dpr, oy) {
  const n = slots.length, gap = 5 * dpr;
  const pw = Math.min(150 * dpr, (x1 - x0 - gap * (n - 1)) / n), ph = Math.min(66 * dpr, oy - 2 * y);
  const startX = x1 - (pw * n + gap * (n - 1));
  slots.forEach((slot, k) => {
    const x = startX + k * (pw + gap);
    const side = world.teams[slot].side, col = TEAM_COLOR[side];
    const mons = world.teamOf(slot);
    const out = world.elim.some((e) => e.side === side), champ = world.over && world.winner === side;
    const alive = mons.filter((m) => m.alive).length;
    c.globalAlpha = out ? 0.5 : 1;
    panel(c, x, y, pw, ph, col, dpr);
    const nm = (world.slotNames?.[slot] || `Jogador ${slot + 1}`).toUpperCase();
    text(c, nm.slice(0, 12), x + 4 * dpr, y + 13 * dpr, 5.5, col, 'left', dpr);
    text(c, out ? 'ELIMINADO' : champ ? 'CAMPEÃO' : `${alive}/${mons.length}`, x + pw - 4 * dpr, y + 13 * dpr, 5, out ? '#ff6a6a' : champ ? '#ffe066' : '#bba', 'right', dpr);
    const tw = (pw - 8 * dpr - 2 * 3 * dpr) / mons.length;
    mons.forEach((m, i) => {
      const tx = x + 4 * dpr + i * (tw + 3 * dpr), ty = y + 20 * dpr;
      c.globalAlpha = (out ? 0.5 : 1) * (m.alive ? 1 : 0.35);
      c.fillStyle = 'rgba(30,44,72,0.9)'; c.fillRect(tx, ty, tw, 24 * dpr);
      c.fillStyle = ELEMENT_COLOR[m.element]; c.fillRect(tx, ty, tw, 2 * dpr);
      c.fillStyle = col; c.fillRect(tx + dpr, ty + 18 * dpr, (tw - 2 * dpr) * Math.max(0, m.hp / m.maxHp), 4 * dpr);
      if (m.alive && m.status.shield > 0 && m.shieldHp > 0) { c.fillStyle = '#8fd8ff'; c.fillRect(tx + dpr, ty + 16 * dpr, (tw - 2 * dpr) * Math.min(1, m.shieldHp / m.maxHp), 2 * dpr); }
      text(c, m.name.slice(0, 6).toUpperCase(), tx + 2 * dpr, ty + 11 * dpr, 4, '#e8dcc0', 'left', dpr);
      if (m.onField && m.alive) { c.strokeStyle = '#ffe066'; c.lineWidth = dpr; c.strokeRect(tx, ty, tw, 24 * dpr); }
    });
    c.globalAlpha = out ? 0.5 : 1;
    const f = world.teams[slot].field;
    const sts = f && f.alive ? statusList(f).slice(0, 4) : [];
    let sx = x + 4 * dpr;
    for (const k2 of sts) { statusIcon(c, k2, sx, y + 49 * dpr, 7 * dpr); sx += 8 * dpr; }
    const kos = mons.reduce((a, m) => a + (m.stats.kos || 0), 0);
    text(c, `KO ${kos}`, x + pw - 4 * dpr, y + 58 * dpr, 4.5, '#bba', 'right', dpr);
    c.globalAlpha = 1;
    if (out) { c.strokeStyle = 'rgba(255,90,90,0.8)'; c.lineWidth = 2 * dpr; c.beginPath(); c.moveTo(x + 2 * dpr, y + ph - 2 * dpr); c.lineTo(x + pw - 2 * dpr, y + 2 * dpr); c.stroke(); }
  });
}

// Fim do todos-contra-todos: classificação completa com cor, nome, abates e dano.
function ffaEnd(c, world, mid, oy, aw, ah, dpr) {
  const rows = world.standings();
  const mine = world.playerTeam, mySide = mine === null ? null : world.teams[mine].side;
  const myRow = rows.find((q) => q.side === mySide);
  const draw = world.winner === -1;
  const winRow = rows.find((q) => q.side === world.winner);
  const title = draw ? 'EMPATE' : mySide === null ? `VITÓRIA DE ${world.sideName(world.winner).toUpperCase()}` : myRow?.rank === 1 ? 'VITÓRIA!' : `${myRow?.rank}º LUGAR`;
  const bw = Math.min(aw * 0.85, 440 * dpr), bh = 170 * dpr, cy = oy + ah * 0.42;
  c.fillStyle = 'rgba(16,10,8,0.9)'; c.fillRect(mid - bw / 2, cy - bh / 2, bw, bh);
  c.fillStyle = winRow ? TEAM_COLOR[winRow.side] : '#fff'; c.fillRect(mid - bw / 2, cy - bh / 2, bw, 3 * dpr);
  text(c, title, mid, cy - bh / 2 + 26 * dpr, 14, myRow?.rank === 1 || mySide === null ? '#ffe066' : '#ff9a8a', 'center', dpr);
  let ly = cy - bh / 2 + 50 * dpr;
  for (const q of rows) {
    const slot = q.slots[0], col = TEAM_COLOR[q.side];
    c.fillStyle = col; c.fillRect(mid - bw / 2 + 14 * dpr, ly - 8 * dpr, 6 * dpr, 9 * dpr);
    text(c, `${q.rank}º`, mid - bw / 2 + 28 * dpr, ly, 7, q.rank === 1 && !draw ? '#ffe066' : '#d8ccb0', 'left', dpr);
    const nm = (world.slotNames?.[slot] || `Jogador ${slot + 1}`) + (q.side === mySide ? ' (você)' : '');
    text(c, nm.slice(0, 18), mid - bw / 2 + 56 * dpr, ly, 6.5, col, 'left', dpr);
    text(c, `${q.kos} KO · ${q.dmg} dano${q.alive ? ' · CAMPEÃO' : ''}`, mid + bw / 2 - 12 * dpr, ly, 5.5, '#d8ccb0', 'right', dpr);
    ly += 17 * dpr;
  }
  text(c, `Duração ${world.endTime.toFixed(0)}s · ${world.arenaDef.name}`, mid, cy + bh / 2 - 8 * dpr, 5, '#ccb', 'center', dpr);
}

export function drawHud(c, r, world, ui) {
  const dpr = ui.dpr * (r.hudScale || 1); // unidade de interface = pixels do dispositivo × escala da janela
  const H = c.canvas.height;
  const { ox, oy, S } = r.view;
  const aw = WORLD_W * S, ah = WORLD_H * S;
  const myTeam = world.playerTeam ?? 0;
  const mySide = world.teams[myTeam].side;
  const slots = world.teams.map((_, i) => i);
  const foeSlots = slots.filter((i) => world.teams[i].side !== mySide);
  const mateSlots = slots.filter((i) => world.teams[i].side === mySide && i !== myTeam);
  const ffa = !!world.ffa;
  const left = world.teamOf(myTeam), right = world.teamOf(foeSlots[0]);
  const cw = Math.min(118 * dpr, (aw - 150 * dpr) / (ffa ? 8 : 6) - 4 * dpr);
  left.forEach((m, k) => card(c, r, world, m, k, ox + k * (cw + 4 * dpr), 6 * dpr, cw, dpr));
  if (ffa) ffaPanels(c, world, foeSlots, ox + aw / 2 + 74 * dpr, ox + aw, 6 * dpr, dpr, oy);
  else right.forEach((m, k) => card(c, r, world, m, k, ox + aw - (k + 1) * cw - k * 4 * dpr, 6 * dpr, cw, dpr));
  // 2v2: parceiro e segundo adversário aparecem em miniatura no alto da arena.
  const mini = (slot, x0, align) => {
    const mons = world.teamOf(slot);
    const name = world.slotNames?.[slot];
    const w = 44 * dpr, gap = 3 * dpr;
    const total = mons.length * w + (mons.length - 1) * gap;
    let x = align === 'left' ? x0 : x0 - total;
    const rel = mons[0] ? relation(world, mons[0]) : null;
    const tag = rel === 'ally' ? 'ALIADO' : rel === 'foe' ? 'INIMIGO' : '';
    const col = rel ? REL_COLOR[rel] : TEAM_COLOR[world.teams[slot].side];
    const label = [tag, name].filter(Boolean).join(' · ');
    if (label) text(c, label, align === 'left' ? x : x0, oy + 8 * dpr, 5, col, align, dpr);
    for (const m of mons) {
      c.globalAlpha = m.alive ? 1 : 0.35;
      c.fillStyle = 'rgba(20,14,12,0.85)';
      c.fillRect(x, oy + 11 * dpr, w, 15 * dpr);
      c.fillStyle = ELEMENT_COLOR[m.element];
      c.fillRect(x, oy + 11 * dpr, w, 2 * dpr);
      c.fillStyle = col;
      c.fillRect(x + dpr, oy + 20 * dpr, (w - 2 * dpr) * Math.max(0, m.hp / m.maxHp), 4 * dpr);
      if (m.alive && m.status.shield > 0 && m.shieldHp > 0) { c.fillStyle = '#8fd8ff'; c.fillRect(x + dpr, oy + 18 * dpr, (w - 2 * dpr) * Math.min(1, m.shieldHp / m.maxHp), 2 * dpr); }
      if (m.alive) text(c, m.name.slice(0, 7).toUpperCase(), x + 2 * dpr, oy + 18 * dpr, 4, '#e8dcc0', 'left', dpr);
      if (m.onField && m.alive) {
        c.strokeStyle = '#ffe066'; c.lineWidth = dpr; c.strokeRect(x, oy + 11 * dpr, w, 15 * dpr);
        // Status do parceiro/adversário em campo (atordoado, preso, queimando...): pontinhos coloridos.
        let sx = x + w - 3 * dpr;
        for (const k of statusList(m).slice(0, 4)) { statusIcon(c, k, sx - 6 * dpr, oy + 12 * dpr, 6 * dpr); sx -= 7 * dpr; }
      }
      x += w + gap;
    }
    c.globalAlpha = 1;
  };
  mateSlots.forEach((sl) => mini(sl, ox + 4 * dpr, 'left'));
  if (!ffa && foeSlots[1] !== undefined) mini(foeSlots[1], ox + aw - 4 * dpr, 'right');

  const mid = ox + aw / 2;
  // Painel do cronômetro (centro do alto) e a aba de troca logo abaixo.
  panel(c, mid - 68 * dpr, 3 * dpr, 136 * dpr, 39 * dpr, GOLD, dpr, 8);
  panel(c, mid - 58 * dpr, 41 * dpr, 116 * dpr, 14 * dpr, '#3a5a8a', dpr, 4);
  const tm = world.over ? world.endTime : world.time;
  text(c, `${String(Math.floor(tm / 60)).padStart(2, '0')}:${String(Math.floor(tm % 60)).padStart(2, '0')}`, mid, 22 * dpr, 11, '#ffffff', 'center', dpr);
  const aliveSide = (side) => world.roster.filter((m) => m.team === side && m.alive).length;
  if (world.training) {
    // Medidor do treino: dano nos bonecos nos últimos 5 s, por segundo e o último golpe.
    const mt = meter(world);
    text(c, `TREINO · dano 5s ${Math.round(mt.sum)} · ${mt.dps.toFixed(1)}/s`, mid, 36 * dpr, 6, '#d8c08a', 'center', dpr);
    if (mt.last) text(c, `último golpe ${mt.last.toFixed(1)}`, mid, 62 * dpr, 5, '#bba', 'center', dpr);
  } else if (ffa) {
    const left4 = world.sideIds().filter((sd) => aliveSide(sd) > 0).length;
    text(c, `${left4} JOGADOR${left4 === 1 ? '' : 'ES'} EM PÉ`, mid, 36 * dpr, 6, '#ffe9b0', 'center', dpr);
  } else text(c, `${aliveSide(mySide)} × ${aliveSide(1 - mySide)}`, mid, 36 * dpr, 6, '#ffe9b0', 'center', dpr);
  if (world.suddenDeath && !world.over) text(c, 'MORTE SÚBITA · sem cura', mid, 62 * dpr, 5, Math.floor(performance.now() / 400) % 2 ? '#ff6a6a' : '#ffb0b0', 'center', dpr);
  else if (world.time >= 130 && !world.over && !world.training) text(c, `Morte súbita em ${Math.ceil(150 - world.time)}s`, mid, 62 * dpr, 5, '#ffb070', 'center', dpr);
  if (world.playerTeam !== null) {
    const ts = world.teams[myTeam];
    const anyBench = world.teamOf(myTeam).some((m) => m.alive && !m.onField);
    let s, col;
    if (!anyBench) { s = 'Sem reservas'; col = '#887'; }
    else if (ts.cooldown > 0) { s = `Troca em ${ts.cooldown.toFixed(1)}s`; col = r.denyFlash > 0 && Math.floor(r.time * 12) % 2 ? '#ff6a6a' : '#aa9'; }
    else if (ts.field?.switchState) { s = 'Trocando...'; col = '#ffe066'; }
    else { s = 'Troca pronta (1/2/3)'; col = '#7ae07a'; }
    text(c, s, mid, 50 * dpr, 5, col, 'center', dpr);
  } else text(c, 'MODO ESPECTADOR', mid, 50 * dpr, 5, '#ffe9b0', 'center', dpr);
  if (ui.paused || ui.speed !== 1) text(c, `${ui.paused ? 'PAUSADO' : ''}${ui.speed !== 1 ? ` ${ui.speed}x` : ''}`, mid, 62 * dpr, 5, '#ffe066', 'center', dpr);

  // Registro de eventos (canto inferior esquerdo da arena).
  const feed = world.feed.filter((f) => world.time - f.t < 7).slice(-5);
  let fy = oy + ah - 10 * dpr - (feed.length - 1) * 12 * dpr;
  for (const f of feed) {
    const age = world.time - f.t;
    c.globalAlpha = age > 5.5 ? Math.max(0, (7 - age) / 1.5) : 1;
    text(c, f.text, ox + 10 * dpr, fy, 6, f.color, 'left', dpr);
    fy += 12 * dpr;
  }
  c.globalAlpha = 1;

  if (world.playerTeam !== null && !ui.touch) abilityBar(c, world, ox, aw, oy + ah + 8 * dpr, dpr, r);
  // Cantos de baixo, nas margens fora da arena: sala/ping (online) e modo/arena.
  const cwid = Math.min(128 * dpr, ox - 14 * dpr);
  if (cwid >= 84 * dpr && !ui.touch) { // no toque esses cantos ficam sob o analógico e os botões
    const cy = oy + ah + 6 * dpr, chh = 34 * dpr;
    panel(c, 8 * dpr, cy, cwid, chh, '#3a5a8a', dpr, 4);
    const net = ui.net;
    if (net?.room || net?.rtt) {
      const ms = Math.round(net.rtt || 0);
      text(c, `SALA: ${net.room || '—'}`, 14 * dpr, cy + 14 * dpr, 5.5, '#e8ecf6', 'left', dpr);
      text(c, `PING: ${ms ? ms + 'ms' : '...'}`, 14 * dpr, cy + 27 * dpr, 5.5, ms < 80 ? '#7ae07a' : ms < 160 ? '#ffe066' : '#ff6a6a', 'left', dpr);
    } else {
      text(c, world.training ? 'TREINO' : 'PARTIDA LOCAL', 14 * dpr, cy + 14 * dpr, fit(c, 'PARTIDA LOCAL', 5.5, cwid - 12 * dpr, dpr), '#e8ecf6', 'left', dpr);
      text(c, 'contra a IA', 14 * dpr, cy + 27 * dpr, 5, '#8fa0c0', 'left', dpr);
    }
    const rx = c.canvas.width - 8 * dpr - cwid;
    panel(c, rx, cy, cwid, chh, '#3a5a8a', dpr, 4);
    const nSides = new Set(world.teams.map((t) => t.side)).size;
    const mode = world.training ? 'TREINO' : ffa ? `TODOS × TODOS (${nSides})` : world.teams.length > 2 ? '2 × 2' : `DUELO ${left.length}×${right.length}`;
    text(c, mode, rx + cwid - 6 * dpr, cy + 14 * dpr, fit(c, mode, 5.5, cwid - 12 * dpr, dpr), '#ffd86a', 'right', dpr);
    const an = (world.arenaDef?.name || '').toUpperCase();
    text(c, an, rx + cwid - 6 * dpr, cy + 27 * dpr, fit(c, an, 5, cwid - 12 * dpr, dpr), '#8fa0c0', 'right', dpr);
  }
  comboPrompt(c, world, mid, oy + ah * 0.78, dpr);
  const help = world.training
    ? 'TREINO · T painel (bonecos, tiros, recargas, forma base) · B nº de bonecos · G evoluir · H ajuda · 1/2/3 trocar · Esc menu'
    : world.playerTeam !== null
    ? 'WASD mover · mouse mirar · cliques e Q/E/F poderes · Espaço esquiva · 1/2/3 trocar · G evoluir · H ajuda · P pausar · preso? Espaço quebra o combo'
    : 'MODO ESPECTADOR · P pausar · I visão da IA';
  const hsz = fit(c, help, 5, aw, dpr);
  if (!ui.touch) text(c, help, mid, H - 6 * dpr, hsz, '#887', 'center', dpr);
  else if (ui.net?.room || ui.net?.rtt) {
    // Toque: sala e ping numa linha embaixo, no meio (entre o analógico e os botões).
    const ms = Math.round(ui.net.rtt || 0);
    text(c, `SALA ${ui.net.room || '—'} · PING ${ms ? ms + 'ms' : '...'}`, mid, H - 8 * dpr, 6, ms && ms < 80 ? '#7ae07a' : ms < 160 ? '#ffe066' : '#ff6a6a', 'center', dpr);
  }

  if (world.over && ffa) { ffaEnd(c, world, mid, oy, aw, ah, dpr); return; }
  if (world.over) {
    const mine = world.playerTeam;
    const draw = world.winner === -1;
    const won = mine === null || draw ? null : world.winner === world.teams[mine].side;
    const title = draw ? 'EMPATE' : won === null ? `VITÓRIA DO TIME ${world.winner === 0 ? 'DOURADO' : 'VERMELHO'}` : won ? 'VITÓRIA!' : 'DERROTA';
    const cy = oy + ah * 0.42;
    const bw = Math.min(aw * 0.85, 470 * dpr), bh = 150 * dpr;
    c.fillStyle = 'rgba(16,10,8,0.88)';
    c.fillRect(mid - bw / 2, cy - bh / 2, bw, bh);
    c.fillStyle = won === false ? '#ff4a5a' : TEAM_COLOR[world.winner] || '#fff';
    c.fillRect(mid - bw / 2, cy - bh / 2, bw, 3 * dpr);
    text(c, title, mid, cy - bh / 2 + 26 * dpr, 14, won === false ? '#ff6a7a' : '#ffe066', 'center', dpr);
    let ly = cy - bh / 2 + 46 * dpr;
    for (const m of [...world.roster].sort((p, q) => q.stats.dmgDealt - p.stats.dmgDealt).slice(0, 6)) {
      const s = m.stats;
      text(c, `${m.name}${m.alive ? '' : ' (KO)'}: ${Math.round(s.dmgDealt)} dano · ${s.dodges} esquivas · ${s.ignites} incêndios · ${s.douses} apagados`, mid, ly, 5, TEAM_COLOR[m.team], 'center', dpr);
      ly += 12 * dpr;
    }
    text(c, `Duração ${world.endTime.toFixed(0)}s · ${world.arenaDef.name}`, mid, ly + 8 * dpr, 5, '#ccb', 'center', dpr);
  }
}
