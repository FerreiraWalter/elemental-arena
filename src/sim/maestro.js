// Maestro dos 4 Braços (Arutchin → Anemokahn): o gênio do vento que tece combos em vez de esperar recargas.
//
//  · Fluxo: usar o E ou o F ZERA a recarga do Q na hora. Os dois braços de cima guardam uma CARGA DE BRISA a cada E/F
//    (máx. 2). O Q disparado com as 2 cargas as consome: ESCUDO DE VENTO + DISPARADA por 1,5 s (na evolução, os
//    braços de cima disparam também uma segunda lâmina).
//  · Turbulência (marca do E, 4 s): o Q que acerta um alvo marcado CONSOME a marca, causa CRÍTICO e RICOCHETEIA para
//    outros marcados por perto (cada um também consome a marca). O E num alvo já marcado vira MICRO-VÁCUO: espalha a
//    marca em todos em volta e puxa para o centro. O F num marcado consome a marca e vira JAULA DE VENTO (prende e
//    levanta); sem marca, só deixa lento. O F também empurra para longe os projéteis inimigos perto do ponto.
//  · O golpe básico (Palma de Ar) que acerta adianta a recarga do E. RITMO DOS 4 BRAÇOS: a cada `sig.palmMark` (3) Palmas
//    seguidas no MESMO alvo, ele fica com Turbulência — o combo abre também por quem acerta o básico, sem depender só do E.
// Apertar botões a esmo gasta as cargas e acerta Q sem marca (dano baixo); a ordem certa controla a arena.

import { applySlow } from './electric.js';

export const MAESTRO = {
  turb: 4, // duração da marca de Turbulência
  chainR: 150, // alcance do ricochete do Q crítico
  vacuumR: 60, // raio do micro-vácuo (E em alvo marcado)
  pull: 170, // força do puxão do micro-vácuo
  slow: [1.5, 0.4], // F sem marca: lentidão de 40% por 1,5 s
  repelR: 70, // F: empurra projéteis inimigos até esta distância do ponto
  surge: 1.5, // escudo + disparada das 2 cargas
};
export const KINDS = new Set(['palm', 'vacuum', 'windHand']); // windHand: o Q da evolução (mão de vento gigante)
export const isMaestro = (m) => m?.def?.sig?.kind === 'maestro';
const marked = (t, m) => t.turb > 0 && t.turbBy === m.id;
let nextChain = 1;

function mark(w, t, m) {
  t.turb = m.def.sig.turbLife ?? MAESTRO.turb;
  t.turbBy = m.id;
  w.emit({ type: 'turbMark', m: t, src: m, x: t.x, y: t.y });
}
function consume(t) { t.turb = 0; t.turbBy = 0; }

// E ou F: zera o Q e guarda uma carga de Brisa nos braços de cima.
export function flux(w, m) {
  const q = m.def.controls.q;
  if (m.cd[q] > 0) { m.cd[q] = 0; w.emit({ type: 'qReset', m, x: m.x, y: m.y }); }
  const max = m.def.sig.charges ?? 2;
  if ((m.brisa || 0) < max) { m.brisa = (m.brisa || 0) + 1; w.emit({ type: 'brisa', m, n: m.brisa, x: m.x, y: m.y }); }
}

// Ponto do E/F: o mirado, limitado ao alcance.
function pointOf(m, a, range) {
  const p = a.aimPoint || { x: m.x + Math.cos(a.aim) * range, y: m.y + Math.sin(a.aim) * range };
  const d = Math.hypot(p.x - m.x, p.y - m.y), k = d > range ? range / d : 1;
  return { x: m.x + (p.x - m.x) * k, y: m.y + (p.y - m.y) * k };
}

// ───────────── Palma de Ar (básico): mãos alternadas ─────────────
export function palm(w, m, a, o) {
  m._hand = m._hand ? 0 : 1;
  const side = m._hand ? 1 : -1, nx = -Math.sin(a.aim), ny = Math.cos(a.aim);
  const x = m.x + Math.cos(a.aim) * (m.r + 2) + nx * side * 6, y = m.y + Math.sin(a.aim) * (m.r + 2) + ny * side * 6 - 6;
  w.spawnProjectile({ kind: 'palm', tag: o.tag, owner: m, ang: a.aim, speed: o.speed, r: 3, range: o.range, dmg: o.dmg, cdr: o.cdr, hand: m._hand, x, y });
}

// ───────────── Lâmina de Vácuo (Q) ─────────────
export function blade(w, m, a, o) {
  const sig = m.def.sig, max = sig.charges ?? 2;
  const surge = (m.brisa || 0) >= max;
  const shoot = (ang, x, y) => w.spawnProjectile({ kind: o.kind || 'vacuum', tag: o.tag, owner: m, ang, speed: o.speed, r: o.r || 4, range: o.range, dmg: o.dmg, chain: sig.chain ?? 3, x, y });
  shoot(a.aim, m.x + Math.cos(a.aim) * (m.r + 3), m.y + Math.sin(a.aim) * (m.r + 3) - 6);
  if (surge) {
    // Sobrecarga dos 4 Ventos: os braços de cima soltam as cargas.
    m.brisa = 0;
    const S = sig.surge || {};
    m.status.shield = Math.max(m.status.shield, S.t ?? MAESTRO.surge);
    m.shieldHp = Math.max(m.shieldHp || 0, S.hp ?? 12);
    m.status.haste = Math.max(m.status.haste, S.t ?? MAESTRO.surge);
    w.emit({ type: 'windSurge', m, x: m.x, y: m.y });
    if (sig.twin) shoot(a.aim + 0.16, m.x + Math.cos(a.aim) * (m.r + 3), m.y + Math.sin(a.aim) * (m.r + 3) - 16); // braços de cima: segunda palma
  }
}

export function projectileHit(w, p, t) {
  const m = p.owner, ang = Math.atan2(p.vy, p.vx);
  const base = { ang, x: p.x, y: p.y, proj: true, element: 'air', tag: p.tag || p.kind };
  if (p.kind === 'palm') {
    w.damage(t, p.dmg, m, { ...base, kb: 35 });
    const e = m.def.controls.e;
    if (p.cdr && m.cd[e] > 0) m.cd[e] = Math.max(0, m.cd[e] - p.cdr);
    // Ritmo: a contagem é por alvo (trocar de alvo recomeça) e já marcado não acumula.
    const need = m.def.sig.palmMark;
    if (need && t.alive && !marked(t, m)) {
      m._palmN = m._palmT === t.id ? (m._palmN || 0) + 1 : 1;
      m._palmT = t.id;
      if (m._palmN >= need) { m._palmN = 0; mark(w, t, m); }
    }
    return;
  }
  // Lâmina de vácuo / Palma do Vendaval: crítico (e ricochete) só em quem está com Turbulência sua.
  const sig = m.def.sig;
  const hand = p.kind === 'windHand';
  if (!marked(t, m)) { w.damage(t, p.dmg, m, { ...base, kb: hand ? 75 : 60 }); return; }
  consume(t);
  w.damage(t, p.dmg * (sig.crit ?? 1.6), m, { ...base, kb: hand ? 100 : 90, big: true }); // sem atordoar: o controle é a Jaula (F)
  w.emit({ type: 'vacuumCrit', m: t, src: m, x: t.x, y: t.y });
  if (p.chain <= 0) return;
  const chainId = p.chainId || nextChain++;
  const next = w.enemiesOf(m).filter((e) => e !== t && marked(e, m) && Math.hypot(e.x - t.x, e.y - t.y) < MAESTRO.chainR)
    .sort((x, y) => Math.hypot(x.x - t.x, x.y - t.y) - Math.hypot(y.x - t.x, y.y - t.y))[0];
  if (!next) return;
  const na = Math.atan2(next.y - t.y, next.x - t.x);
  w.spawnProjectile({ kind: p.kind, tag: p.tag, owner: m, ang: na, speed: p.speed * 1.1, r: p.r, range: MAESTRO.chainR + 20, dmg: p.dmg, chain: p.chain - 1, chainId, hitSet: new Set([t.id]), x: t.x + Math.cos(na) * (t.r + 3), y: t.y + Math.sin(na) * (t.r + 3) - 6 });
  w.emit({ type: 'vacuumChain', m: next, src: m, x0: t.x, y0: t.y, x: next.x, y: next.y });
}

// ───────────── Pulso de Turbulência (E) ─────────────
export function pulse(w, m, a, o) {
  const p = pointOf(m, a, o.range);
  w.emit({ type: 'turbPulse', m, x: p.x, y: p.y, r: o.r });
  const hits = w.enemiesOf(m).filter((t) => Math.hypot(t.x - p.x, t.y - p.y) < o.r + t.r);
  const vac = hits.find((t) => marked(t, m));
  if (vac) {
    // Micro-vácuo: o ar estoura no alvo marcado, espalha a marca e puxa todo mundo em volta para o centro.
    const R = o.vacuumR ?? MAESTRO.vacuumR;
    w.emit({ type: 'microVacuum', m, x: vac.x, y: vac.y, r: R });
    for (const t of w.enemiesOf(m)) {
      const d = Math.hypot(t.x - vac.x, t.y - vac.y);
      if (d > R + t.r) continue;
      w.damage(t, o.dmg, m, { tag: 'microVacuo', element: 'air', x: t.x, y: t.y });
      if (t !== vac && d > 4) { const k = (o.pull ?? MAESTRO.pull) / t.def.mass; t.kx += ((vac.x - t.x) / d) * k; t.ky += ((vac.y - t.y) / d) * k; }
      if (t.alive) mark(w, t, m);
    }
  } else {
    for (const t of hits) { w.damage(t, o.dmg, m, { tag: 'turbulencia', element: 'air', x: t.x, y: t.y }); if (t.alive) mark(w, t, m); }
  }
  w.popDecoysIn(p.x, p.y, o.r, m.team);
  flux(w, m);
}

// ───────────── Pressão Ciclônica (F) ─────────────
export function pressure(w, m, a, o) {
  const p = pointOf(m, a, o.range);
  w.emit({ type: 'cyclonePress', m, x: p.x, y: p.y, r: o.r });
  for (const t of w.enemiesOf(m)) {
    if (Math.hypot(t.x - p.x, t.y - p.y) > o.r + t.r) continue;
    if (marked(t, m)) {
      // Jaula de Vento: consome a marca, prende e levanta (levantado = sem agir enquanto está no ar).
      consume(t);
      w.damage(t, o.dmg, m, { tag: 'jaulaVento', element: 'air', lift: o.cage, stun: o.cage, x: t.x, y: t.y, big: true });
      w.applyRoot(t, o.cage);
      w.emit({ type: 'windCage', m: t, src: m, x: t.x, y: t.y, t: o.cage });
    } else {
      w.damage(t, o.dmg * 0.5, m, { tag: 'pressaoCiclonica', element: 'air', x: t.x, y: t.y });
      applySlow(t, MAESTRO.slow[0], MAESTRO.slow[1]);
    }
  }
  // Repulsa seletiva: projéteis inimigos perto do ponto (e do gênio) são soprados para longe.
  for (const q of w.projectiles) {
    if (q.dead || q.lob || q.team === m.team) continue;
    const from = Math.hypot(q.x - p.x, q.y - p.y) < MAESTRO.repelR ? p : Math.hypot(q.x - m.x, q.y - m.y) < MAESTRO.repelR ? m : null;
    if (!from) continue;
    const ang = Math.atan2(q.y - from.y, q.x - from.x), sp = Math.hypot(q.vx, q.vy);
    q.vx = Math.cos(ang) * sp; q.vy = Math.sin(ang) * sp;
    w.emit({ type: 'windRepel', x: q.x, y: q.y });
  }
  flux(w, m);
}

// ───────────── Por passo: marcas somem com o tempo ─────────────
export function update(_w, m, dt) {
  if (m.turb > 0) { m.turb = Math.max(0, m.turb - dt); if (m.turb <= 0) m.turbBy = 0; }
}
