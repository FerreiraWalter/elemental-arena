// Controles de toque para celular/tablet: analógico à esquerda, botões de habilidade à direita, troca de monstro
// e mira automática no inimigo mais próximo. É uma camada de DOM sobre o canvas; usa as mesmas entradas do
// teclado/mouse (press/held), então vale igual no modo local e no multiplayer.
// Aparece só em telas de toque (ou com ?touch=1) e só durante a batalha.

const COARSE = typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || /[?&]touch=1/.test(location.search));

const CSS = `
#touch{position:fixed;inset:0;pointer-events:none;z-index:5;touch-action:none;user-select:none;-webkit-user-select:none;font-family:"Press Start 2P",monospace}
#touch .stick{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(22px,env(safe-area-inset-bottom));width:132px;height:132px;border-radius:50%;background:rgba(20,14,12,.35);border:2px solid rgba(255,233,176,.35);pointer-events:auto;touch-action:none}
#touch .knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,233,176,.55);border:2px solid #ffe9b0}
#touch .btn{position:absolute;pointer-events:auto;touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;color:#ffe9b0;background:rgba(20,14,12,.62);border:3px solid #ffe066;font-size:9px;text-shadow:0 0 3px #100a08;overflow:hidden}
#touch .btn small{font-size:6px;color:#d8c8a0;margin-top:3px}
#touch .btn.cd{border-color:#5a4a3a;color:#887}
#touch .btn.on{background:rgba(255,224,102,.55)}
#touch .btn i{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.6)}
#touch .btn.brk{border-color:#ff9a3a;color:#fff;background:rgba(150,60,10,.75);animation:tb .4s infinite alternate}
@keyframes tb{to{transform:scale(1.12)}}
#touch .sw{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(168px,calc(env(safe-area-inset-bottom) + 168px));width:46px;height:34px;border-radius:6px;pointer-events:auto;touch-action:none;color:#ffe9b0;background:rgba(20,14,12,.62);border:2px solid #6a5a3a;font-size:8px;display:flex;align-items:center;justify-content:center}
#touch .sw.cur{border-color:#ffe066;background:rgba(90,74,26,.8)}
#touch .sw.off{opacity:.35}
#touch .pause{position:absolute;right:10px;top:8px;width:40px;height:40px;border-radius:8px;pointer-events:auto;background:rgba(20,14,12,.55);border:2px solid #6a5a3a;color:#ffe9b0;font-size:14px;display:flex;align-items:center;justify-content:center}
`;

// Botões: posição relativa ao canto inferior direito (px), tamanho e a vaga que acionam.
const BUTTONS = [
  { slot: 'primary', label: 'ATQ', x: 28, y: 36, s: 84, hold: true },
  { slot: 'melee', label: 'GOLPE', x: 122, y: 92, s: 62, hold: true },
  { slot: 'q', label: 'Q', x: 138, y: 22, s: 58 },
  { slot: 'e', label: 'E', x: 190, y: 74, s: 58 },
  { slot: 'f', label: 'F', x: 28, y: 132, s: 58 },
  { slot: 'dodge', label: 'ESQ', x: 100, y: 164, s: 58 },
  { slot: 'evolve', label: 'EVO', x: 190, y: 146, s: 52 },
];

export function createTouchControls({ press, hold, key, getWorld }) {
  if (!COARSE) return { active: false, update() {}, aim() { return null; }, move: { x: 0, y: 0 } };
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'touch'; root.style.display = 'none'; document.body.appendChild(root);
  const api = { active: true, move: { x: 0, y: 0 }, visible: false };

  // Analógico
  const stick = document.createElement('div'); stick.className = 'stick';
  const knob = document.createElement('div'); knob.className = 'knob'; stick.appendChild(knob); root.appendChild(stick);
  let sid = null;
  const setStick = (e) => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.min(1, Math.hypot(dx, dy) / (R * 0.85));
    api.move.x = d > 8 ? (dx / Math.max(1, Math.hypot(dx, dy))) * m : 0;
    api.move.y = d > 8 ? (dy / Math.max(1, Math.hypot(dx, dy))) * m : 0;
  };
  const endStick = () => { sid = null; api.move.x = api.move.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(e.pointerId); setStick(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);

  // Botões de habilidade
  const els = {};
  for (const b of BUTTONS) {
    const el = document.createElement('div'); el.className = 'btn';
    el.style.cssText = `right:max(${b.x}px,env(safe-area-inset-right));bottom:max(${b.y}px,env(safe-area-inset-bottom));width:${b.s}px;height:${b.s}px`;
    el.innerHTML = `${b.label}<small></small><i></i>`;
    const down = (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); if (b.hold) hold(b.slot, true); press(b.slot); };
    const up = () => { el.classList.remove('on'); if (b.hold) hold(b.slot, false); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    root.appendChild(el); els[b.slot] = { el, b, small: el.querySelector('small'), cd: el.querySelector('i') };
  }
  // Troca de monstro (1/2/3) e pausa
  const sws = [0, 1, 2].map((k) => {
    const el = document.createElement('div'); el.className = 'sw'; el.textContent = String(k + 1);
    el.style.marginLeft = `${k * 50}px`;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); key(`Digit${k + 1}`); });
    root.appendChild(el); return el;
  });
  const pause = document.createElement('div'); pause.className = 'pause'; pause.textContent = 'II';
  pause.addEventListener('pointerdown', (e) => { e.preventDefault(); key('Escape'); });
  root.appendChild(pause);

  api.update = (visible) => {
    if (visible !== api.visible) { api.visible = visible; root.style.display = visible ? 'block' : 'none'; if (!visible) endStick(); }
    if (!visible) return;
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
  // Mira automática: inimigo mais próximo do monstro controlado (ou a direção em que ele olha).
  api.aim = (w) => {
    const m = w?.active; if (!m) return null;
    let best = null, bd = Infinity;
    for (const e of w.enemiesOf(m)) { const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < bd) { bd = d; best = e; } }
    if (best) return { x: best.x, y: best.y };
    return { x: m.x + Math.cos(m.facing) * 80, y: m.y + Math.sin(m.facing) * 80 };
  };
  return api;
}
