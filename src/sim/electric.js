// Elemento ELÉTRICO (Raiolua → Trovogato) e efeitos de controle compartilhados (lentidão, redução de dano, regeneração).
// Tudo roda na simulação (servidor) e é sincronizado por snapshot.
//
//   Cargas (volt)  — cada golpe elétrico que acerta soma 1 CARGA (máx. 3; Trovogato 5). Com o máximo o gato fica
//                    ELETRIZADO (+10% de velocidade). Descarga 110V / Núcleo de Sobrecarga CONSOMEM as cargas para
//                    bater mais forte, atordoar mais e (evoluído) explodir numa área maior. Sem acertar, as cargas somem.
//   Solo eletrificado (zonas) — rastros de dash e o Julgamento do Trovão deixam chão que dá choque e deixa LENTO.
//   Condutor — alvo MOLHADO leva +12% de dano elétrico (combina com aliados de água no 2v2).

import { zoneTick as psyZoneTick } from './psychic.js';
import { zoneTick as windZoneTick } from './air.js';

export const VOLT = { max: 3, maxEvo: 5, speed: 1.1, keep: 5, decay: 1.4, wetBonus: 1.12 };

let nextZone = 1;

export const voltMax = (m) => (m.def.sig?.voltMax ?? VOLT.max);

export function addVolt(w, m, n = 1) {
  if (!m || m.def.sig?.kind !== 'volt' || !m.alive) return;
  const max = voltMax(m), was = m.volt;
  m.volt = Math.min(max, m.volt + n);
  m.voltT = 0;
  if (was < max && m.volt >= max) w.emit({ type: 'voltFull', m, x: m.x, y: m.y });
  else if (m.volt > was) w.emit({ type: 'voltGain', m, n: m.volt, x: m.x, y: m.y });
}

// Consome todas as cargas; devolve quantas eram.
export function spendVolt(w, m) {
  const n = m.volt || 0;
  if (n > 0) { m.volt = 0; w.emit({ type: 'voltSpend', m, n, x: m.x, y: m.y }); }
  return n;
}

export function updateVolt(w, m, dt) {
  if (m.def.sig?.kind !== 'volt' || !(m.volt > 0)) return;
  m.voltT = (m.voltT || 0) + dt;
  if (m.voltT > VOLT.keep) { m.voltT -= VOLT.decay; m.volt = Math.max(0, m.volt - 1); }
}

// Lentidão: guarda a mais forte enquanto durar. k = fração de velocidade perdida.
export function applySlow(t, time, k) {
  if (!t.alive || time <= 0) return;
  if (t.status.slow <= 0) t.slowK = k;
  else t.slowK = Math.max(t.slowK || 0, k);
  t.status.slow = Math.max(t.status.slow, time);
}

// Casca (Brotossauro): redução de dano e cura contínua por alguns segundos.
export function applyBark(w, t, time, dr, regen) {
  if (!t.alive) return;
  t.drK = t.status.dr > 0 ? Math.max(t.drK || 0, dr) : dr;
  t.status.dr = Math.max(t.status.dr, time);
  t.regenK = t.status.regen > 0 ? Math.max(t.regenK || 0, regen) : regen;
  t.status.regen = Math.max(t.status.regen, time);
}

// Puxão: impulso em direção ao ponto (para perto do dono), proporcional à distância (chega encostado).
export function pullTo(t, x, y, gap) {
  const dx = x - t.x, dy = y - t.y, d = Math.hypot(dx, dy) || 1;
  const travel = Math.max(0, d - gap);
  const k = travel * 6.2; // o empurrão decai a exp(-6t): percorre ~k/6
  t.kx = dx / d * k; t.ky = dy / d * k;
  t.vx *= 0.2; t.vy *= 0.2;
}

// ───────────── Solo eletrificado ─────────────
export function addZone(w, z) {
  const zone = { id: nextZone++, kind: 'shock', tick: 0, ...z, max: z.life };
  w.zones.push(zone);
  return zone;
}

export function updateZones(w, dt) {
  if (!w.zones.length) return;
  for (const z of w.zones) {
    z.life -= dt;
    z.tick -= dt;
    if (z.tick > 0) continue;
    z.tick = 0.25;
    if (z.kind === 'psy') { psyZoneTick(w, z, dt); continue; }
    if (z.kind === 'wind') { windZoneTick(w, z, dt); continue; }
    for (const t of w.monsters) {
      if (!t.alive || !t.onField || t.team === z.team || Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.r * 0.6) continue;
      if (t.action?.ab.leap && t.action.phase === 'active') continue; // pulando por cima
      w.damage(t, z.dps * 0.25, z.owner, { dot: true, element: 'electric', tag: z.tag || 'soloEletrico', slow: [0.6, z.slow ?? 0.3] });
      if (w.rng() < 0.35) w.emit({ type: 'zap', x: t.x, y: t.y - 4, x0: z.x, y0: z.y, small: true });
    }
  }
  w.zones = w.zones.filter((z) => z.life > 0);
}

// Rastro elétrico de uma investida: pequenas zonas a cada ~12 px percorridos.
export function trail(w, m, a, o) {
  const d = a.data;
  if (d.lx === undefined) { d.lx = m.x; d.ly = m.y; }
  if (Math.hypot(m.x - d.lx, m.y - d.ly) < (o.step || 12)) return;
  d.lx = m.x; d.ly = m.y;
  addZone(w, { x: m.x, y: m.y, r: o.r || 10, life: o.life || 2.2, dps: o.dps || 6, slow: o.slow ?? 0.25, team: m.team, owner: m, tag: o.tag });
}

// ───────────── Raio que cai do céu (Descarga 220V / Julgamento do Trovão) ─────────────
export function thunderStrike(w, p) {
  const R = p.radius;
  w.emit({ type: 'thunder', x: p.tx, y: p.ty, r: R, big: !!p.zone, src: p.owner });
  for (const t of w.monsters) {
    if (!t.alive || t.team === p.team) continue;
    const d = Math.hypot(t.x - p.tx, t.y - p.ty);
    if (d > R + t.r) continue;
    const f = 1 - 0.35 * Math.min(1, d / R); // centro dói mais
    w.damage(t, p.dmg * f, p.owner, { tag: p.tag || 'thunder', element: 'electric', stun: p.stun ?? 0.35, kb: 60, ang: Math.atan2(t.y - p.ty, t.x - p.tx), proj: true, big: true });
  }
  w.popDecoysIn(p.tx, p.ty, R, p.team);
  for (const o of w.obstacles) if (!o.destroyed && Math.hypot(o.x - p.tx, o.y - p.ty) < R + o.r) { w.hurtObstacle(o, 10); if (o.flammable && !o.destroyed && w.rng() < 0.5) w.igniteObstacle(o, p.owner); }
  // Raio na vegetação seca pode acender um foco pequeno.
  const i = w.terrain.at(p.tx, p.ty);
  if (i >= 0 && w.terrain.isWater?.(i)) w.emit({ type: 'zap', x: p.tx, y: p.ty, x0: p.tx, y0: p.ty - 40 });
  if (p.zone) addZone(w, { x: p.tx, y: p.ty, r: p.zone.r, life: p.zone.life, dps: p.zone.dps, slow: p.zone.slow, team: p.team, owner: p.owner, tag: 'soloEletrico', big: true });
}

// ───────────── Projéteis elétricos ─────────────
export function projectileHit(w, p, t) {
  const ang = Math.atan2(p.vy, p.vx);
  w.damage(t, p.dmg, p.owner, { ang, x: p.x, y: p.y, proj: true, tag: p.tag || p.kind, element: 'electric', kb: p.kind === 'voltOrb' ? 60 : 40, stun: p.stun ?? 0.08 });
  // Esfera Voltaica: ricocheteia para o inimigo mais próximo que ainda não levou.
  if (p.kind === 'voltOrb' && p.bounces > 0) {
    p.hitSet ||= new Set();
    p.hitSet.add(t.id);
    let best = null, bd = p.bounceR || 120;
    for (const e of w.monsters) {
      if (!e.alive || !e.onField || e.team === p.team || p.hitSet.has(e.id)) continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d < bd && w.los(t.x, t.y, e.x, e.y)) { bd = d; best = e; }
    }
    if (best) {
      const a2 = Math.atan2(best.y - t.y, best.x - t.x);
      const q = w.spawnProjectile({ kind: 'voltOrb', tag: p.tag, owner: p.owner, ang: a2, speed: p.speed * 1.15, r: p.r, range: bd + 30, dmg: p.dmg * 0.75, bounces: p.bounces - 1, bounceR: p.bounceR, x: t.x + Math.cos(a2) * (t.r + 3), y: t.y + Math.sin(a2) * (t.r + 3) - 3 });
      q.hitSet = p.hitSet;
      w.emit({ type: 'zap', x: best.x, y: best.y - 4, x0: t.x, y0: t.y - 4 });
    }
  }
}

export function projectileEnd(w, p) {
  w.emit({ type: 'sparkPop', x: p.x, y: p.y, big: p.kind === 'voltOrb' });
}
