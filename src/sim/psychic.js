// Elemento PSÍQUICO (Sapomental → Sapofilósofo). Tudo roda na simulação (servidor) e é sincronizado por snapshot.
//
//   Transe      — cada acerto psíquico soma 1 TRANSE no alvo (máx. 3). Sem novos acertos, o transe vai sumindo.
//   Hipnose     — com 3 de transe o alvo fica HIPNOTIZADO (1,1 s; Sapofilósofo 1,4 s): anda devagar em direção ao sapo
//                 e não usa habilidades. Depois fica alguns segundos imune (não vira trava infinita). Quebra de Combo
//                 também liberta.
//   Orbes       — esferas que orbitam o sapo: batem em quem encosta e INTERCEPTAM projéteis inimigos. O Coro de Orbes
//                 (evoluído) gira um instante e depois dispara as esferas teleguiadas.
//   Espiral     — zona no chão (Espiral Hipnótica / Mandala do Despertar) que deixa lento e a cada pulso soma transe.
import { addZone, pullTo } from './electric.js';
import { WORLD_W, WORLD_H } from '../config.js';

export const PSY = { max: 3, charm: 1, charmEvo: 1.25, immune: 3, keep: 4, decay: 1.2, charmSpeed: 0.55 };

export const isPsy = (m) => m?.def?.sig?.kind === 'trance';

// Soma transe no alvo; no máximo, hipnotiza.
export function addTrance(w, t, src, n = 1) {
  if (!t || !t.alive || !src || t.team === src.team) return;
  if (t.status.charm > 0 || t.status.charmImm > 0 || t.status.invuln > 0) return;
  t.trance = Math.min(PSY.max, (t.trance || 0) + n);
  t.tranceT = 0;
  if (t.trance >= PSY.max) hypnotize(w, t, src);
  else w.emit({ type: 'trance', m: t, n: t.trance, x: t.x, y: t.y });
}

export function hypnotize(w, t, src) {
  const dur = src.evolved ? PSY.charmEvo : PSY.charm;
  t.trance = 0;
  t.status.charm = dur;
  t.status.charmImm = dur + PSY.immune;
  t.charmBy = src;
  if (t.action && !t.action.ab.superArmor) t.interrupt(w);
  w.emit({ type: 'hypnotized', m: t, src, x: t.x, y: t.y, dur });
  w.say(`${t.name} foi HIPNOTIZADO por ${src.name}!`, '#e0a0ff');
}

export function updateTrance(w, m, dt) {
  if (m.trance > 0) {
    m.tranceT = (m.tranceT || 0) + dt;
    if (m.tranceT > PSY.keep) { m.tranceT -= PSY.decay; m.trance = Math.max(0, m.trance - 1); }
  }
  if (m.status.charm <= 0) m.charmBy = null;
}

// Direção em que o hipnotizado anda (em direção ao sapo), ou null.
export function charmPull(m) {
  const s = m.charmBy;
  if (!(m.status.charm > 0) || !s || !s.alive) return null;
  const dx = s.x - m.x, dy = s.y - m.y, d = Math.hypot(dx, dy);
  if (d < m.r + s.r + 6) return { x: 0, y: 0 };
  return { x: dx / d, y: dy / d };
}

// Acerto de projétil psíquico (Bolha, Orbe, esferas).
export function projectileHit(w, p, m) {
  const ang = Math.atan2(p.vy || 0, p.vx || 1);
  w.damage(m, p.dmg, p.owner, { ang, x: p.x, y: p.y, proj: true, tag: p.tag || p.kind, element: 'psychic', kb: p.kb ?? 50, stun: p.stun ?? 0.06 });
  addTrance(w, m, p.owner, 1);
}

// ───────────── Orbes ─────────────
// Cria n esferas em volta do dono (projéteis que orbitam: o snapshot já leva a posição de cada uma).
export function spawnOrbs(w, m, ab, { n, life, dmg, rad, launchAt = 0 }) {
  for (let k = 0; k < n; k++) {
    w.spawnProjectile({
      kind: 'psyOrb', tag: ab.id, owner: m, ang: 0, speed: 0, r: 4, range: 9999, dmg,
      x: m.x, y: m.y, orbit: { ang: (k / n) * Math.PI * 2, rad, spin: 3.2 }, life, launchAt,
    });
  }
  w.emit({ type: 'orbs', m, x: m.x, y: m.y, n });
}

// Atualiza uma esfera em órbita. Devolve true se ela ainda está orbitando (o resto do projétil não roda).
export function updateOrbit(w, p, dt) {
  const o = p.orbit, m = p.owner;
  if (!o) return false;
  p.life -= dt;
  if (!m.alive || !m.onField || p.life <= 0) { p.dead = true; w.emit({ type: 'impact', kind: 'psyOrb', x: p.x, y: p.y }); return true; }
  o.ang += o.spin * dt;
  p.x = m.x + Math.cos(o.ang) * o.rad;
  p.y = m.y + Math.sin(o.ang) * o.rad * 0.8 - 6;
  // Coro de Orbes: depois do giro, cada esfera sai teleguiada atrás do inimigo mais perto.
  if (p.launchAt > 0 && p.age >= p.launchAt) {
    const foes = w.enemiesOf(m).filter((t) => t.status.invuln <= 0);
    let best = null, bd = 260;
    for (const t of foes) { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; best = t; } }
    const ang = best ? Math.atan2(best.y - p.y, best.x - p.x) : o.ang;
    p.orbit = null; p.homing = 4.2; p.speed = 260; p.range = 260; p.traveled = 0;
    p.vx = Math.cos(ang) * 260; p.vy = Math.sin(ang) * 260;
    return true;
  }
  // Bate em quem encosta.
  for (const t of w.enemiesOf(m)) {
    if (Math.hypot(t.x - p.x, t.y - (p.y + 6)) > t.r + p.r + 2) continue;
    if (t.status.invuln > 0) continue;
    p.dead = true;
    w.emit({ type: 'impact', kind: 'psyOrb', x: p.x, y: p.y, target: t });
    w.damage(t, p.dmg, m, { ang: Math.atan2(t.y - m.y, t.x - m.x), x: p.x, y: p.y, proj: true, tag: p.tag, element: 'psychic', kb: 90, stun: 0.08 });
    addTrance(w, t, m, 1);
    return true;
  }
  // Intercepta projéteis inimigos (não pega ondas, raízes nem coisas arremessadas).
  for (const q of w.projectiles) {
    if (q.dead || q.team === p.team || q.lob || q.pierce || q.orbit) continue;
    // distância da esfera ao trecho que o tiro andou neste quadro (tiro rápido não "pula" a esfera)
    const sx = q.x - q.px, sy = q.y - q.py, L2 = sx * sx + sy * sy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - q.px) * sx + (p.y - q.py) * sy) / L2)) : 0;
    if (Math.hypot(q.px + sx * u - p.x, q.py + sy * u - p.y) > q.r + p.r + 5) continue;
    q.dead = true; p.dead = true;
    w.emit({ type: 'psyBlock', x: p.x, y: p.y, m });
    return true;
  }
  return true;
}

// Teleguiado: vira aos poucos para o inimigo mais perto à frente.
export function steerHoming(w, p, dt) {
  let best = null, bd = 170;
  const dir = Math.atan2(p.vy, p.vx);
  for (const t of w.monsters) {
    if (!t.alive || !t.onField || t.team === p.team || t.status.invuln > 0) continue;
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d > bd) continue;
    let da = Math.atan2(t.y - p.y, t.x - p.x) - dir;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 1.6) continue;
    bd = d; best = { t, da };
  }
  if (!best) return;
  const turn = Math.max(-p.homing * dt, Math.min(p.homing * dt, best.da));
  const a = dir + turn, sp = Math.hypot(p.vx, p.vy);
  p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
}

// ───────────── Espiral / Mandala ─────────────
export function spiral(w, m, a, ab, { r, life, dps, slow, pulse, burst = 0 }) {
  const q = a.point || a.aimPoint || { x: m.x + Math.cos(a.aim) * ab.range, y: m.y + Math.sin(a.aim) * ab.range };
  const ang = Math.atan2(q.y - m.y, q.x - m.x), d = Math.min(ab.range, Math.hypot(q.x - m.x, q.y - m.y));
  const p = { x: Math.max(10, Math.min(WORLD_W - 10, m.x + Math.cos(ang) * d)), y: Math.max(10, Math.min(WORLD_H - 10, m.y + Math.sin(ang) * d)) };
  const z = addZone(w, { x: p.x, y: p.y, r, life, dps, slow, team: m.team, owner: m, tag: ab.id, kind: 'psy', pulse, pulseT: 0.35, big: r > 40, burst });
  w.emit({ type: 'spiral', m, x: p.x, y: p.y, r, big: r > 40 });
  return z;
}

// Pulso da zona psíquica (chamado pelo updateZones a cada 0,25 s).
export function zoneTick(w, z, dt) {
  z.pulseT -= 0.25;
  const pulse = z.pulseT <= 0;
  if (pulse) { z.pulseT += z.pulse; w.emit({ type: 'spiralPulse', x: z.x, y: z.y, r: z.r, big: z.big }); }
  for (const t of w.monsters) {
    if (!t.alive || !t.onField || t.team === z.team || Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.r * 0.6) continue;
    if (w.isAirborne?.(t)) continue;
    w.damage(t, z.dps * 0.25, z.owner, { dot: true, element: 'psychic', tag: z.tag, slow: [0.6, z.slow] });
    if (pulse) addTrance(w, t, z.owner, 1);
  }
  // Mandala: no fim, a flor se fecha num estouro.
  if (z.burst && z.life <= 0.25 && !z.burstDone) {
    z.burstDone = true;
    w.emit({ type: 'spiralBurst', x: z.x, y: z.y, r: z.r });
    for (const t of w.enemiesOf(z.owner)) {
      if (Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.r) continue;
      w.damage(t, z.burst, z.owner, { tag: z.tag, element: 'psychic', kb: 120, ang: Math.atan2(t.y - z.y, t.x - z.x), stun: 0.15, big: true });
      addTrance(w, t, z.owner, 1);
    }
  }
}

// ───────────── Língua, troca mental e projeção astral ─────────────
// Linguada: acerta o primeiro inimigo na linha da mira e PUXA para perto do sapo.
export function tongue(w, m, a, { reach, dmg, tag }) {
  const ax = Math.cos(a.aim), ay = Math.sin(a.aim);
  let best = null, bd = Infinity;
  for (const t of w.enemiesOf(m)) {
    const dx = t.x - m.x, dy = t.y - m.y, along = dx * ax + dy * ay, side = Math.abs(dx * ay - dy * ax);
    if (along < 0 || along > reach + m.r + t.r || side > t.r + 6) continue;
    if (!w.los(m.x, m.y, t.x, t.y, { noSteam: true })) continue;
    if (along < bd) { bd = along; best = t; }
  }
  const len = best ? bd : reach + m.r;
  w.emit({ type: 'tongue', m, x0: m.x + ax * (m.r - 2), y0: m.y + ay * (m.r - 2) - 8, x: m.x + ax * len, y: m.y + ay * len - 6, hit: !!best });
  if (!best) return;
  if (best.status.invuln <= 0) pullTo(best, m.x, m.y, m.r + best.r + 6);
  w.damage(best, dmg, m, { tag, element: 'psychic', ang: a.aim, stun: 0.1 });
  addTrance(w, best, m, 1);
}

// Troca Mental: troca de lugar com o inimigo mirado; sem alvo, teletransporte curto até onde mirou.
export function mindSwap(w, m, a, ab) {
  const p = a.aimPoint || { x: m.x + Math.cos(a.aim) * ab.range, y: m.y + Math.sin(a.aim) * ab.range };
  let best = null, bd = 46;
  for (const t of w.enemiesOf(m)) {
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d < bd && Math.hypot(t.x - m.x, t.y - m.y) <= ab.range + t.r && w.los(m.x, m.y, t.x, t.y, { noSteam: true })) { bd = d; best = t; }
  }
  const fx = m.x, fy = m.y;
  if (best && !best.status.invuln && !(best.status.shield > 0 && best.shieldHp > 0)) {
    const tx = best.x, ty = best.y;
    m.x = m.px = tx; m.y = m.py = ty; m.level = w.terrain.heightAt(tx, ty);
    best.x = best.px = fx; best.y = best.py = fy; best.level = w.terrain.heightAt(fx, fy);
    best.kx = best.ky = 0;
    if (best.action && !best.action.ab.superArmor) best.interrupt(w);
    w.damage(best, ab.dmg, m, { tag: ab.id, element: 'psychic', stun: ab.stun });
    addTrance(w, best, m, 1);
    w.emit({ type: 'mindSwap', m, t: best, x0: fx, y0: fy, x: tx, y: ty });
    return;
  }
  // Sem alvo: teleporta até o ponto (no máximo blink), pousando num lugar válido.
  const ang = Math.atan2(p.y - m.y, p.x - m.x), d = Math.min(ab.blink, Math.hypot(p.x - m.x, p.y - m.y));
  m.x = m.px = m.x + Math.cos(ang) * d; m.y = m.py = m.y + Math.sin(ang) * d;
  w.landAirborne(m, { from: { x: fx, y: fy } });
  w.emit({ type: 'mindSwap', m, x0: fx, y0: fy, x: m.x, y: m.y, blink: true });
}

// Projeção Astral: o espírito atravessa os inimigos (fere e soma transe) e, no fim, volta para o corpo.
export function astralHit(w, m, a, { dmg, tag }) {
  for (const t of w.enemiesOf(m)) {
    if (a.hit.has(t.id) || Math.hypot(t.x - m.x, t.y - m.y) > m.r + t.r + 6) continue;
    a.hit.add(t.id);
    w.damage(t, dmg, m, { tag, element: 'psychic', stun: 0.2, ang: a.aim });
    addTrance(w, t, m, 1);
  }
  w.popDecoysIn(m.x, m.y, m.r + 6, m.team);
}
export function astralReturn(w, m, a) {
  const b = a.data.body;
  if (!b) return;
  w.emit({ type: 'astralReturn', m, x0: m.x, y0: m.y, x: b.x, y: b.y });
  m.x = m.px = b.x; m.y = m.py = b.y; m.level = w.terrain.heightAt(b.x, b.y);
  m.vx = m.vy = m.kx = m.ky = 0;
}
