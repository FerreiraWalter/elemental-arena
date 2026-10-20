import { STATE_LABEL } from '../ai/brain.js';
import { TEAM_COLOR, ELEMENT_COLOR, SIG_COLOR } from './renderer.js';
import { EVOLUTION, WORLD_W, WORLD_H, COMBO_BREAK } from '../config.js';
import { SIG } from '../sim/signature.js';
import { meter } from '../sim/training.js';

const FONT = '"Press Start 2P", monospace';
const ELEMENT_NAME = { fire: 'Fogo', water: 'Água', plant: 'Planta', earth: 'Terra', electric: 'Elétrico', neutral: 'Treino' };
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

function bar(c, x, y, w, h, frac, lag, color, dpr) {
  c.fillStyle = '#100a08';
  c.fillRect(x - dpr, y - dpr, w + 2 * dpr, h + 2 * dpr);
  c.fillStyle = '#3a1a16';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#fff6e0';
  c.fillRect(x, y, w * Math.max(0, lag), h);
  c.fillStyle = color;
  c.fillRect(x, y, w * Math.max(0, frac), h);
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(x, y, w * Math.max(0, frac), Math.max(1, h / 4));
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
    case 'volt': P(3, 0.5, 2, 1, '#8fe8ff'); P(2, 1.5, 2, 1, '#8fe8ff'); P(1.5, 2.5, 3, 1, '#ffffff'); P(2.5, 3.5, 2, 1, '#8fe8ff'); P(2, 4.5, 1, 1, '#3fa9ff'); break;
  }
}

export const STATUS_NAME = { burn: 'queimando', wet: 'molhado', root: 'preso', stun: 'atordoado', shield: 'escudo', overheat: 'superaquecido', exhaust: 'exausto', cloak: 'camuflado', charged: 'em disparada', slow: 'lento (seiva/choque)', dr: 'casca (menos dano)', regen: 'regenerando', volt: 'eletrizado' };
export function statusList(m) {
  const st = m.status, out = [];
  for (const k of ['stun', 'root', 'burn', 'wet', 'slow', 'dr', 'shield', 'overheat', 'exhaust', 'cloak']) if (st[k] > 0 && (k !== 'shield' || m.shieldHp > 0)) out.push(k);
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
  const h = 54 * dpr, pad = 6 * dpr;
  const field = m.onField && m.alive;
  const mine = world.playerTeam !== null && m.slot === world.playerTeam;
  c.globalAlpha = m.alive ? (field ? 1 : 0.82) : 0.4;
  c.fillStyle = field ? 'rgba(60,46,20,0.95)' : 'rgba(20,14,12,0.88)';
  c.fillRect(x, y, w, h);
  c.fillStyle = TEAM_COLOR[m.team];
  c.fillRect(x, y, w, 2 * dpr);
  if (field) { c.strokeStyle = '#ffe066'; c.lineWidth = 2 * dpr; c.strokeRect(x + dpr, y + dpr, w - 2 * dpr, h - 2 * dpr); }
  let tx = x + pad;
  if (mine) {
    // Tecla de troca: verde = pode trocar agora; cinza = recarga/indisponível.
    const ready = canSwitchTo(world, m);
    c.fillStyle = field ? '#ffe066' : ready ? '#4ac05a' : '#3a2e28';
    c.fillRect(tx, y + 6 * dpr, 12 * dpr, 12 * dpr);
    text(c, String(idx + 1), tx + 6 * dpr, y + 16 * dpr, 7, field || ready ? '#100a08' : '#887', 'center', dpr);
    tx += 16 * dpr;
  }
  const nsz = fit(c, m.name.toUpperCase(), 7, x + w - pad - tx, dpr);
  text(c, m.name.toUpperCase(), tx, y + 15 * dpr, nsz, ELEMENT_COLOR[m.element], 'left', dpr);
  text(c, `${ELEMENT_NAME[m.element]} · Est.${m.stage}${m.evolved ? ' ★' : m.canEvolve ? ' PRONTO' : ''}`, x + pad, y + 28 * dpr, 5, m.canEvolve ? '#e8b8ff' : '#aa9', 'left', dpr);
  const shielded = m.alive && m.status.shield > 0 && m.shieldHp > 0;
  text(c, `${Math.ceil(Math.max(0, m.hp))}${shielded ? `+${Math.ceil(m.shieldHp)}` : `/${m.maxHp}`}`, x + w - pad, y + 28 * dpr, 5, shielded ? '#8fd8ff' : '#fff', 'right', dpr);
  bar(c, x + pad, y + 32 * dpr, w - pad * 2, 6 * dpr, m.hp / m.maxHp, st.lagHp / m.maxHp, TEAM_COLOR[m.team], dpr);
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
  const bw = Math.min(64 * dpr, (aw - 150 * dpr) / nSlots - 4 * dpr), bh = 42 * dpr, gap = 4 * dpr;
  const total = nSlots * bw + (nSlots - 1) * gap;
  let x = ox + aw / 2 - total / 2 + 66 * dpr;
  const px = x - 132 * dpr, lw = 120 * dpr;
  text(c, m.name.toUpperCase(), px, y + 9 * dpr, fit(c, m.name.toUpperCase(), 7, lw, dpr), ELEMENT_COLOR[m.element], 'left', dpr);
  bar(c, px, y + 13 * dpr, lw, 7 * dpr, m.hp / m.maxHp, m.hp / m.maxHp, TEAM_COLOR[m.team], dpr);
  if (m.status.shield > 0 && m.shieldHp > 0) { c.fillStyle = '#8fd8ff'; c.fillRect(px, y + 13 * dpr, lw * Math.min(1, m.shieldHp / m.maxHp), 3 * dpr); }
  text(c, `${Math.ceil(m.hp)}${m.status.shield > 0 && m.shieldHp > 0 ? `+${Math.ceil(m.shieldHp)}` : `/${m.maxHp}`}`, px + lw, y + 9 * dpr, 5, m.status.shield > 0 && m.shieldHp > 0 ? '#8fd8ff' : '#fff', 'right', dpr);
  // Medidor da mecânica própria (Fornalha, Ímpeto, Casco, Sentinelas, Cópias, Marcas).
  const gge = sigGauge(world, m);
  if (gge) {
    const blink = gge.blink && Math.floor(performance.now() / 160) % 2;
    text(c, gge.label, px, y + 30 * dpr, fit(c, gge.label, 5.5, lw, dpr), blink ? '#ffffff' : gge.color, 'left', dpr);
    c.fillStyle = '#100a08'; c.fillRect(px - dpr, y + 33 * dpr, lw + 2 * dpr, 6 * dpr);
    c.fillStyle = '#2a201a'; c.fillRect(px, y + 34 * dpr, lw, 4 * dpr);
    c.fillStyle = blink ? '#ffffff' : gge.color; c.fillRect(px, y + 34 * dpr, lw * Math.max(0, Math.min(1, gge.k)), 4 * dpr);
  }
  // Quebra de combo: pronta (energia + recarga) ou quanto falta.
  {
    const ok = m.breakCd <= 0 && m.energy >= COMBO_BREAK.cost;
    const s = m.breakCd > 0 ? `COMBO ${Math.ceil(m.breakCd)}s` : ok ? 'COMBO PRONTO' : 'COMBO: SEM ENERGIA';
    text(c, s, px + lw, y + 30 * dpr, 4.5, ok ? '#ffb04a' : '#776a5a', 'right', dpr);
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
    c.fillStyle = using ? '#5a4a1a' : denied ? '#5a1414' : 'rgba(20,14,12,0.92)';
    c.fillRect(x, y, bw, bh);
    c.strokeStyle = denied ? '#ff4a4a' : using ? '#ffe066' : cd > 0 || locked ? '#3a302a' : ELEMENT_COLOR[m.element];
    c.lineWidth = 2 * dpr;
    c.strokeRect(x + dpr, y + dpr, bw - 2 * dpr, bh - 2 * dpr);
    abilityIcon(c, ab.kind, x + 4 * dpr, y + 4 * dpr, 9 * dpr, cd > 0 || locked ? '#776a5a' : ELEMENT_COLOR[m.element]);
    const ksz = fit(c, key, 6, bw - 18 * dpr, dpr);
    text(c, key, x + bw / 2 + 5 * dpr, y + 11 * dpr, ksz, '#ffe9b0', 'center', dpr);
    const words = ab.name.split(' ');
    const l1 = words.length > 1 ? words.slice(0, Math.ceil(words.length / 2)).join(' ') : ab.name;
    const l2 = words.length > 1 ? words.slice(Math.ceil(words.length / 2)).join(' ') : '';
    const nsz = Math.min(fit(c, l1, 6.5, bw - 6 * dpr, dpr), fit(c, l2 || l1, 6.5, bw - 6 * dpr, dpr));
    text(c, l1, x + bw / 2, y + 25 * dpr, nsz, '#e8e0d0', 'center', dpr);
    if (l2) text(c, l2, x + bw / 2, y + 34 * dpr, nsz, '#e8e0d0', 'center', dpr);
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
      c.fillStyle = 'rgba(0,0,0,0.6)';
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
    c.fillStyle = 'rgba(20,14,12,0.92)';
    c.fillRect(x, y, bw, bh);
    c.fillStyle = ready ? (blink ? '#8a50c8' : '#5a2e8a') : '#3a2450';
    c.fillRect(x + 2 * dpr, y + 2 * dpr + (bh - 4 * dpr) * (1 - k), bw - 4 * dpr, (bh - 4 * dpr) * k);
    c.strokeStyle = ready ? '#e8b8ff' : '#5a4a6a';
    c.lineWidth = 2 * dpr;
    c.strokeRect(x + dpr, y + dpr, bw - 2 * dpr, bh - 2 * dpr);
    abilityIcon(c, 'evolve', x + 4 * dpr, y + 4 * dpr, 9 * dpr, ready ? '#ffffff' : '#a080c0');
    text(c, 'G', x + bw / 2 + 5 * dpr, y + 11 * dpr, 6, '#ffe9b0', 'center', dpr);
    text(c, 'EVOLUIR', x + bw / 2, y + 25 * dpr, Math.min(6, bw / dpr / 9), '#fff', 'center', dpr);
    text(c, ready ? 'PRONTO!' : `${Math.floor(k * 100)}%`, x + bw / 2, y + 35 * dpr, 5.5, ready ? '#e8b8ff' : '#bba', 'center', dpr);
  }
}

// Aviso de Quebra de Combo: aparece quando o seu monstro está atordoado ou no ar.
function comboPrompt(c, world, x, y, dpr) {
  const m = world.active;
  if (!m || world.over || !(m.status.stun > 0.1 || m.lift > 0)) return;
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
    c.fillStyle = 'rgba(20,14,12,0.88)'; c.fillRect(x, y, pw, ph);
    c.fillStyle = col; c.fillRect(x, y, pw, 3 * dpr);
    const nm = (world.slotNames?.[slot] || `Jogador ${slot + 1}`).toUpperCase();
    text(c, nm.slice(0, 12), x + 4 * dpr, y + 13 * dpr, 5.5, col, 'left', dpr);
    text(c, out ? 'ELIMINADO' : champ ? 'CAMPEÃO' : `${alive}/${mons.length}`, x + pw - 4 * dpr, y + 13 * dpr, 5, out ? '#ff6a6a' : champ ? '#ffe066' : '#bba', 'right', dpr);
    const tw = (pw - 8 * dpr - 2 * 3 * dpr) / mons.length;
    mons.forEach((m, i) => {
      const tx = x + 4 * dpr + i * (tw + 3 * dpr), ty = y + 20 * dpr;
      c.globalAlpha = (out ? 0.5 : 1) * (m.alive ? 1 : 0.35);
      c.fillStyle = 'rgba(40,30,26,0.9)'; c.fillRect(tx, ty, tw, 24 * dpr);
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
  if (ffa) ffaPanels(c, world, foeSlots, ox + aw / 2 + 62 * dpr, ox + aw, 6 * dpr, dpr, oy);
  else right.forEach((m, k) => card(c, r, world, m, k, ox + aw - (k + 1) * cw - k * 4 * dpr, 6 * dpr, cw, dpr));
  // 2v2: parceiro e segundo adversário aparecem em miniatura no alto da arena.
  const mini = (slot, x0, align) => {
    const mons = world.teamOf(slot);
    const name = world.slotNames?.[slot];
    const w = 44 * dpr, gap = 3 * dpr;
    const total = mons.length * w + (mons.length - 1) * gap;
    let x = align === 'left' ? x0 : x0 - total;
    if (name) text(c, name, align === 'left' ? x : x0, oy + 8 * dpr, 5, TEAM_COLOR[world.teams[slot].side], align, dpr);
    for (const m of mons) {
      c.globalAlpha = m.alive ? 1 : 0.35;
      c.fillStyle = 'rgba(20,14,12,0.85)';
      c.fillRect(x, oy + 11 * dpr, w, 15 * dpr);
      c.fillStyle = ELEMENT_COLOR[m.element];
      c.fillRect(x, oy + 11 * dpr, w, 2 * dpr);
      c.fillStyle = TEAM_COLOR[world.teams[slot].side];
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

  if (world.playerTeam !== null) abilityBar(c, world, ox, aw, oy + ah + 8 * dpr, dpr, r);
  comboPrompt(c, world, mid, oy + ah * 0.78, dpr);
  const help = world.training
    ? 'TREINO · T painel (bonecos, tiros, recargas, forma base) · B nº de bonecos · G evoluir · H ajuda · 1/2/3 trocar · Esc menu'
    : world.playerTeam !== null
    ? 'WASD mover · mouse mirar · cliques e Q/E/F poderes · Espaço esquiva · 1/2/3 trocar · G evoluir · H ajuda · P pausar · preso? Espaço quebra o combo'
    : 'MODO ESPECTADOR · P pausar · I visão da IA';
  const hsz = fit(c, help, 5, aw, dpr);
  text(c, help, mid, H - 6 * dpr, hsz, '#887', 'center', dpr);

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
