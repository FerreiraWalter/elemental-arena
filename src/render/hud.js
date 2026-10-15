import { STATE_LABEL } from '../ai/brain.js';
import { TEAM_COLOR, ELEMENT_COLOR } from './renderer.js';
import { EVOLUTION } from '../config.js';

const FONT = '"Press Start 2P", monospace';
const ELEMENT_NAME = { fire: 'Fogo', water: 'Água', plant: 'Planta' };
const SLOTS = [['primary', 'BOTÃO ESQ'], ['melee', 'BOTÃO DIR'], ['q', 'Q'], ['e', 'E'], ['f', 'F'], ['dodge', 'ESPAÇO']];

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

// Pode trocar para `m` agora? (mesmas regras de World.requestSwitch)
function canSwitchTo(world, m) {
  const ts = world.teams[m.slot];
  return m.alive && !m.onField && ts.field?.alive && !ts.field.switchState && ts.cooldown <= 0 && !world.over;
}

// Cartão compacto de um monstro do time (em campo, reserva ou derrotado).
function card(c, r, world, m, idx, x, y, w, dpr) {
  const st = r.mon.get(m.id);
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
  text(c, `${Math.ceil(Math.max(0, m.hp))}/${m.maxHp}`, x + w - pad, y + 28 * dpr, 5, '#fff', 'right', dpr);
  bar(c, x + pad, y + 32 * dpr, w - pad * 2, 6 * dpr, m.hp / m.maxHp, st.lagHp / m.maxHp, TEAM_COLOR[m.team], dpr);
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
  // Status persistentes (continuam no banco).
  let ix = x + w - pad - 5 * dpr;
  for (const [on, col] of [[m.status.burn > 0, '#ff8a3a'], [m.status.wet > 0, '#5ab4ff'], [m.status.root > 0, '#9ae070'], [m.status.stun > 0, '#ffe066'], [m.status.shield > 0, '#ffffff']]) {
    if (!on || !m.alive) continue;
    c.fillStyle = col;
    c.fillRect(ix, y + 43 * dpr, 5 * dpr, 6 * dpr);
    ix -= 7 * dpr;
  }
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

// Barra de habilidades do monstro controlado.
function abilityBar(c, world, ox, aw, y, dpr) {
  const m = world.active;
  if (!m) {
    if (!world.over) text(c, 'Próximo monstro entrando...', ox + aw / 2, y + 24 * dpr, 7, '#ffe066', 'center', dpr);
    return;
  }
  const slots = SLOTS.filter(([k]) => m.def.controls[k]);
  const evoSlot = !!m.def.evolvesTo && !m.evolved;
  const nSlots = slots.length + (evoSlot ? 1 : 0);
  const bw = Math.min(64 * dpr, (aw - 140 * dpr) / nSlots - 4 * dpr), bh = 42 * dpr, gap = 4 * dpr;
  const total = nSlots * bw + (nSlots - 1) * gap;
  let x = ox + aw / 2 - total / 2 + 60 * dpr;
  const px = x - 124 * dpr;
  text(c, m.name.toUpperCase(), px, y + 14 * dpr, 7, ELEMENT_COLOR[m.element], 'left', dpr);
  bar(c, px, y + 20 * dpr, 112 * dpr, 8 * dpr, m.hp / m.maxHp, m.hp / m.maxHp, TEAM_COLOR[m.team], dpr);
  text(c, `${Math.ceil(m.hp)}/${m.maxHp}`, px, y + 40 * dpr, 6, '#fff', 'left', dpr);
  for (const [slot, key] of slots) {
    const ab = m.ability(m.def.controls[slot]);
    const cd = m.cd[ab.id];
    const using = m.action?.ab === ab;
    c.fillStyle = using ? '#5a4a1a' : 'rgba(20,14,12,0.92)';
    c.fillRect(x, y, bw, bh);
    c.strokeStyle = using ? '#ffe066' : cd > 0 ? '#3a302a' : ELEMENT_COLOR[m.element];
    c.lineWidth = 2 * dpr;
    c.strokeRect(x + dpr, y + dpr, bw - 2 * dpr, bh - 2 * dpr);
    const ksz = fit(c, key, 5, bw - 6 * dpr, dpr);
    text(c, key, x + bw / 2, y + 11 * dpr, ksz, '#ffe9b0', 'center', dpr);
    const words = ab.name.split(' ');
    const l1 = words.length > 1 ? words.slice(0, Math.ceil(words.length / 2)).join(' ') : ab.name;
    const l2 = words.length > 1 ? words.slice(Math.ceil(words.length / 2)).join(' ') : '';
    const nsz = Math.min(fit(c, l1, 5, bw - 6 * dpr, dpr), fit(c, l2 || l1, 5, bw - 6 * dpr, dpr));
    text(c, l1, x + bw / 2, y + 25 * dpr, nsz, '#e8e0d0', 'center', dpr);
    if (l2) text(c, l2, x + bw / 2, y + 34 * dpr, nsz, '#e8e0d0', 'center', dpr);
    if (cd > 0) {
      const f = cd / ab.cooldown;
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(x + 2 * dpr, y + 2 * dpr + (bh - 4 * dpr) * (1 - f), bw - 4 * dpr, (bh - 4 * dpr) * f);
      if (cd >= 0.95) text(c, cd.toFixed(0), x + bw / 2, y + bh / 2 + 5 * dpr, 9, '#fff', 'center', dpr);
    }
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
    text(c, 'G', x + bw / 2, y + 11 * dpr, 6, '#ffe9b0', 'center', dpr);
    text(c, 'EVOLUIR', x + bw / 2, y + 25 * dpr, Math.min(5, bw / dpr / 9), '#fff', 'center', dpr);
    text(c, ready ? 'PRONTO!' : `${Math.floor(k * 100)}%`, x + bw / 2, y + 35 * dpr, 5, ready ? '#e8b8ff' : '#bba', 'center', dpr);
  }
}

export function drawHud(c, r, world, ui) {
  const { dpr } = ui;
  const H = c.canvas.height;
  const { ox, oy, S } = r.view;
  const aw = 640 * S, ah = 360 * S;
  const myTeam = world.playerTeam ?? 0;
  const mySide = world.teams[myTeam].side;
  const slots = world.teams.map((_, i) => i);
  const foeSlots = slots.filter((i) => world.teams[i].side !== mySide);
  const mateSlots = slots.filter((i) => world.teams[i].side === mySide && i !== myTeam);
  const left = world.teamOf(myTeam), right = world.teamOf(foeSlots[0]);
  const cw = Math.min(118 * dpr, (aw - 150 * dpr) / 6 - 4 * dpr);
  left.forEach((m, k) => card(c, r, world, m, k, ox + k * (cw + 4 * dpr), 6 * dpr, cw, dpr));
  right.forEach((m, k) => card(c, r, world, m, k, ox + aw - (k + 1) * cw - k * 4 * dpr, 6 * dpr, cw, dpr));
  // 2v2: parceiro e segundo adversário aparecem em miniatura no alto da arena.
  const mini = (slot, x0, align) => {
    const mons = world.teamOf(slot);
    const name = world.slotNames?.[slot];
    const w = 30 * dpr, gap = 3 * dpr;
    const total = mons.length * w + (mons.length - 1) * gap;
    let x = align === 'left' ? x0 : x0 - total;
    if (name) text(c, name, align === 'left' ? x : x0, oy + 8 * dpr, 5, TEAM_COLOR[world.teams[slot].side], align, dpr);
    for (const m of mons) {
      c.globalAlpha = m.alive ? 1 : 0.35;
      c.fillStyle = 'rgba(20,14,12,0.85)';
      c.fillRect(x, oy + 11 * dpr, w, 9 * dpr);
      c.fillStyle = ELEMENT_COLOR[m.element];
      c.fillRect(x, oy + 11 * dpr, w, 2 * dpr);
      c.fillStyle = TEAM_COLOR[world.teams[slot].side];
      c.fillRect(x + dpr, oy + 15 * dpr, (w - 2 * dpr) * Math.max(0, m.hp / m.maxHp), 4 * dpr);
      if (m.onField && m.alive) { c.strokeStyle = '#ffe066'; c.lineWidth = dpr; c.strokeRect(x, oy + 11 * dpr, w, 9 * dpr); }
      x += w + gap;
    }
    c.globalAlpha = 1;
  };
  mateSlots.forEach((sl) => mini(sl, ox + 4 * dpr, 'left'));
  if (foeSlots[1] !== undefined) mini(foeSlots[1], ox + aw - 4 * dpr, 'right');

  const mid = ox + aw / 2;
  const tm = world.over ? world.endTime : world.time;
  text(c, `${String(Math.floor(tm / 60)).padStart(2, '0')}:${String(Math.floor(tm % 60)).padStart(2, '0')}`, mid, 22 * dpr, 11, '#ffffff', 'center', dpr);
  const aliveSide = (side) => world.roster.filter((m) => m.team === side && m.alive).length;
  text(c, `${aliveSide(mySide)} × ${aliveSide(1 - mySide)}`, mid, 36 * dpr, 6, '#ffe9b0', 'center', dpr);
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

  if (world.playerTeam !== null) abilityBar(c, world, ox, aw, oy + ah + 8 * dpr, dpr);
  const help = world.playerTeam !== null
    ? 'WASD mover · mouse mirar · cliques e Q/E/F poderes · Espaço esquiva · 1/2/3 ou Tab trocar · G evoluir · P pausar'
    : 'MODO ESPECTADOR · P pausar · I visão da IA';
  const hsz = fit(c, help, 5, aw, dpr);
  text(c, help, mid, H - 6 * dpr, hsz, '#887', 'center', dpr);

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
