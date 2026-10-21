// Controles de toque para celular/tablet: analógico à esquerda, botões de habilidade à direita, troca de monstro,
// pausa e tela cheia. É uma camada de DOM sobre o canvas; usa as mesmas entradas do teclado/mouse (press/held),
// então vale igual no modo local e no multiplayer.
//  · Toque rápido num botão: usa na hora com mira automática (inimigo mais próximo).
//  · Arrastar a partir de um botão (ATQ, GOLPE, Q, E, F): mira manual na direção do arraste (o tamanho do arraste
//    escolhe a distância nos poderes de área). Q/E/F saem ao soltar; arrastar de volta para o botão cancela.
//  · Aparece em telas de toque (ou com ?touch=1) e só durante a batalha. Num tablet com mouse/trackpad, os
//    controles somem quando o mouse é usado e voltam no próximo toque na tela.

import { WORLD_W, WORLD_H } from '../config.js';

const FORCE = /[?&]touch=1/.test(location.search);
const mq = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
const CAN_TOUCH = FORCE || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || mq('(any-pointer: coarse)');
const START_ON = FORCE || mq('(pointer: coarse)');

const CSS = `
#touch{position:fixed;inset:0;pointer-events:none;z-index:5;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;font-family:"Press Start 2P",monospace}
#touch .stick{position:absolute;border-radius:50%;background:rgba(20,14,12,.35);border:2px solid rgba(255,233,176,.35);pointer-events:auto;touch-action:none}
#touch .knob{position:absolute;left:50%;top:50%;width:42%;height:42%;transform:translate(-50%,-50%);border-radius:50%;background:rgba(255,233,176,.55);border:2px solid #ffe9b0}
#touch .btn{position:absolute;pointer-events:auto;touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;color:#ffe9b0;background:rgba(20,14,12,.62);border:3px solid #ffe066;font-size:calc(9px*var(--k));text-shadow:0 0 3px #100a08;overflow:hidden}
#touch .btn small{font-size:calc(6px*var(--k));color:#d8c8a0;margin-top:3px;max-width:90%;white-space:nowrap;overflow:hidden}
#touch .btn.cd{border-color:#5a4a3a;color:#887}
#touch .btn.on{background:rgba(255,224,102,.55)}
#touch .btn.aim{background:rgba(70,180,255,.45);border-color:#c8f0ff}
#touch .btn.cancel{background:rgba(160,40,40,.6);border-color:#ff8a8a}
#touch .btn i{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.6)}
#touch .btn.brk{border-color:#ff9a3a;color:#fff;background:rgba(150,60,10,.75);animation:tb .4s infinite alternate}
@keyframes tb{to{transform:scale(1.12)}}
#touch .sw{position:absolute;border-radius:6px;pointer-events:auto;touch-action:none;color:#ffe9b0;background:rgba(20,14,12,.62);border:2px solid #6a5a3a;font-size:calc(8px*var(--k));display:flex;align-items:center;justify-content:center}
#touch .sw.cur{border-color:#ffe066;background:rgba(90,74,26,.8)}
#touch .sw.off{opacity:.35}
#touch .top{position:absolute;border-radius:8px;pointer-events:auto;touch-action:none;background:rgba(20,14,12,.55);border:2px solid #6a5a3a;color:#ffe9b0;font-size:calc(12px*var(--k));display:flex;align-items:center;justify-content:center}
`;

// Botões: posição relativa ao canto inferior direito (px, antes da escala), tamanho, a vaga que acionam e como.
// hold: segura enquanto o dedo está no botão (ataque básico, carga do tornado); release: sai ao soltar (Q/E/F).
const BUTTONS = [
  { slot: 'primary', label: 'ATQ', x: 28, y: 36, s: 84, hold: true, aim: true },
  { slot: 'melee', label: 'GOLPE', x: 122, y: 92, s: 62, hold: true, aim: true },
  { slot: 'q', label: 'Q', x: 138, y: 22, s: 58, aim: true, release: true },
  { slot: 'e', label: 'E', x: 190, y: 74, s: 58, aim: true, release: true },
  { slot: 'f', label: 'F', x: 28, y: 132, s: 58, aim: true, release: true },
  { slot: 'dodge', label: 'ESQ', x: 100, y: 164, s: 58 },
  { slot: 'evolve', label: 'EVO', x: 190, y: 146, s: 52 },
];
// Prende o dedo no elemento (o arraste continua mesmo saindo do botão); alguns navegadores recusam ponteiros sintéticos.
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch { /* sem captura: segue funcionando dentro do botão */ } };
const DEAD = 16; // px de arraste antes de virar mira manual
const PULL = 110; // px de arraste para a distância máxima

export function createTouchControls({ press, hold, key, getWorld, getLayout }) {
  const off = { active: false, visible: false, update() {}, aim() { return null; }, move: { x: 0, y: 0 }, preview: null };
  if (!CAN_TOUCH) return off;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'touch'; root.style.display = 'none'; document.body.appendChild(root);
  const api = { active: START_ON, move: { x: 0, y: 0 }, visible: false, preview: null };
  let drag = null; // { slot, dx, dy, k, until } mira manual em andamento (ou mantida um instante depois de soltar)

  // Liga com o primeiro toque na tela; desliga quando o mouse é usado (tablet com trackpad, notebook com tela de toque).
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') api.active = true;
    else if (e.pointerType === 'mouse' && !FORCE) api.active = false;
  }, { capture: true });

  // Analógico
  const stick = document.createElement('div'); stick.className = 'stick';
  const knob = document.createElement('div'); knob.className = 'knob'; stick.appendChild(knob); root.appendChild(stick);
  let sid = null;
  const setStick = (e) => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
    const m = Math.min(1, Math.hypot(dx, dy) / (R * 0.85));
    api.move.x = d > 8 ? (dx / Math.max(1, Math.hypot(dx, dy))) * m : 0;
    api.move.y = d > 8 ? (dy / Math.max(1, Math.hypot(dx, dy))) * m : 0;
  };
  const endStick = () => { sid = null; api.move.x = api.move.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; capture(stick, e); setStick(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);

  // Botões de habilidade (com arrastar para mirar)
  const els = {};
  for (const b of BUTTONS) {
    const el = document.createElement('div'); el.className = 'btn';
    el.innerHTML = `${b.label}<small></small><i></i>`;
    let p = null; // { id, x0, y0, dragging }
    const down = (e) => {
      e.preventDefault();
      capture(el, e);
      p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dragging: false };
      el.classList.add('on');
      if (b.hold) hold(b.slot, true);
      if (!b.release) press(b.slot);
    };
    const move = (e) => {
      if (!p || e.pointerId !== p.id || !b.aim) return;
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0, d = Math.hypot(dx, dy);
      if (!p.dragging && d > DEAD) p.dragging = true;
      if (!p.dragging) return;
      const cancel = b.release && d < DEAD * 0.75;
      drag = cancel ? null : { slot: b.slot, dx, dy, k: Math.min(1, d / PULL), until: Infinity };
      el.classList.toggle('aim', !cancel); el.classList.toggle('cancel', cancel);
    };
    const up = (e) => {
      if (!p || (e && e.pointerId !== p.id)) return;
      const wasDrag = p.dragging, cancelled = el.classList.contains('cancel');
      p = null;
      el.classList.remove('on', 'aim', 'cancel');
      if (b.hold) hold(b.slot, false);
      if (b.release && !cancelled) press(b.slot);
      // A mira manual vale mais um instante: a habilidade termina de mirar durante a preparação.
      if (wasDrag && drag?.slot === b.slot) drag.until = performance.now() + 350;
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    root.appendChild(el); els[b.slot] = { el, b, small: el.querySelector('small'), cd: el.querySelector('i') };
  }
  // Troca de monstro (1/2/3), pausa e tela cheia
  const sws = [0, 1, 2].map((k) => {
    const el = document.createElement('div'); el.className = 'sw'; el.textContent = String(k + 1);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); key(`Digit${k + 1}`); });
    root.appendChild(el); return el;
  });
  const pause = document.createElement('div'); pause.className = 'top'; pause.textContent = 'II';
  pause.addEventListener('pointerdown', (e) => { e.preventDefault(); key('Escape'); });
  root.appendChild(pause);
  const de = document.documentElement;
  const canFull = !!(de.requestFullscreen || de.webkitRequestFullscreen);
  const full = document.createElement('div'); full.className = 'top'; full.textContent = '⛶';
  // 'click' (não pointerdown): o Safari só libera tela cheia num clique completo.
  full.addEventListener('click', (e) => {
    e.preventDefault();
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    else (de.requestFullscreen || de.webkitRequestFullscreen)?.call(de);
  });
  if (canFull) root.appendChild(full);

  // Tamanho e posição: crescem um pouco em telas grandes (tablet) e respeitam a área segura (entalhe, barra do iPad).
  let lastKey = '';
  const layout = () => {
    const k = Math.max(1, Math.min(1.4, Math.min(innerWidth, innerHeight) / 560));
    const top = (getLayout?.().top || 60) + 6;
    const key2 = `${k}|${top}|${innerWidth}x${innerHeight}`;
    if (key2 === lastKey) return;
    lastKey = key2;
    root.style.setProperty('--k', k.toFixed(3));
    const sz = 132 * k;
    stick.style.cssText = `left:max(${18 * k}px,env(safe-area-inset-left));bottom:max(${22 * k}px,env(safe-area-inset-bottom));width:${sz}px;height:${sz}px`;
    for (const { el, b } of Object.values(els)) {
      el.style.cssText = `right:calc(env(safe-area-inset-right) + ${b.x * k}px);bottom:calc(env(safe-area-inset-bottom) + ${b.y * k}px);width:${b.s * k}px;height:${b.s * k}px`;
    }
    sws.forEach((el, i) => { el.style.cssText = `left:calc(env(safe-area-inset-left) + ${(18 + i * 50) * k}px);bottom:calc(env(safe-area-inset-bottom) + ${168 * k}px);width:${46 * k}px;height:${34 * k}px`; });
    // Pausa e tela cheia logo abaixo dos cartões do topo (não cobrem o placar).
    pause.style.cssText = `right:calc(env(safe-area-inset-right) + ${10 * k}px);top:${top}px;width:${40 * k}px;height:${40 * k}px`;
    full.style.cssText = `right:calc(env(safe-area-inset-right) + ${56 * k}px);top:${top}px;width:${40 * k}px;height:${40 * k}px`;
  };

  api.update = (visible) => {
    visible = visible && api.active;
    if (visible !== api.visible) {
      api.visible = visible; root.style.display = visible ? 'block' : 'none';
      if (!visible) { endStick(); drag = null; for (const { el, b } of Object.values(els)) { el.classList.remove('on', 'aim', 'cancel'); if (b.hold) hold(b.slot, false); } }
    }
    if (!visible) return;
    layout();
    if (drag && performance.now() > drag.until) drag = null;
    const w = getWorld(), m = w?.active;
    for (const slot in els) {
      const { el, b, small, cd } = els[slot];
      if (slot === 'evolve') { el.style.display = m && m.def.evolvesTo && !m.evolved ? 'flex' : 'none'; }
      const id = m?.def.controls?.[slot === 'evolve' ? '' : slot];
      const t = slot === 'evolve' ? 0 : (id ? (m.waitFor ? m.waitFor(id) : m.cd[id]) || 0 : 0);
      const ab = id ? m.ability(id) : null;
      let label = b.label, sub = '', frac = 0, cls = false, brk = false;
      if (slot === 'evolve' && m) { frac = 0; sub = m.canEvolve ? 'PRONTO' : `${Math.floor(Math.min(1, m.energy / 150) * 100)}%`; cls = !m.canEvolve; }
      else if (ab) { sub = ab.name.length > 11 ? ab.name.slice(0, 10) + '.' : ab.name; frac = ab.cooldown ? Math.min(1, t / ab.cooldown) : 0; cls = t > 0.05; }
      if (slot === 'dodge' && m && w.canBreakCombo?.(m)) { label = 'QUEBRAR'; sub = 'combo!'; brk = true; cls = false; }
      if (el.firstChild.nodeValue !== label) el.firstChild.nodeValue = label;
      if (small.textContent !== sub) small.textContent = sub;
      cd.style.height = `${Math.round(frac * 100)}%`;
      el.classList.toggle('cd', cls); el.classList.toggle('brk', brk);
    }
    if (w && w.playerTeam !== null) {
      const team = w.teamOf(w.playerTeam);
      sws.forEach((el, k) => { const mm = team[k]; el.classList.toggle('cur', !!mm && mm === m); el.classList.toggle('off', !mm || !mm.alive); });
    }
  };
  // Mira: manual enquanto arrasta (direção do dedo; distância pelo tamanho do arraste nos poderes de área) ou
  // automática no inimigo mais próximo do monstro controlado (ou para onde ele olha).
  api.aim = (w) => {
    const m = w?.active; if (!m) return null;
    api.preview = null;
    if (drag) {
      const ab = m.ability(m.def.controls[drag.slot]);
      const len = Math.hypot(drag.dx, drag.dy) || 1, ux = drag.dx / len, uy = drag.dy / len;
      const R = ab?.range || 120, area = ab && (ab.kind === 'lob' || ab.leap);
      const d = area ? R * Math.max(0.2, drag.k) : R;
      const p = { x: Math.max(4, Math.min(WORLD_W - 4, m.x + ux * d)), y: Math.max(4, Math.min(WORLD_H - 4, m.y + uy * d)) };
      if (drag.until === Infinity) api.preview = { x0: m.x, y0: m.y, x: p.x, y: p.y, r: area ? ab.radius || ab.landR || 14 : 0, slot: drag.slot };
      return p;
    }
    let best = null, bd = Infinity;
    for (const e of w.enemiesOf(m)) { const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < bd) { bd = d; best = e; } }
    if (best) return { x: best.x, y: best.y };
    return { x: m.x + Math.cos(m.facing) * 80, y: m.y + Math.sin(m.facing) * 80 };
  };
  return api;
}
