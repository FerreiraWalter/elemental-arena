// Voador (Araralvo → Araravento): araras de vento.
//  · Tornado carregado (golpe básico): SEGURE para carregar e SOLTE para lançar. Quanto mais carga, mais longe,
//    maior e mais forte; com carga suficiente ele LEVANTA quem atravessa (atordoado no ar). Atravessa monstros.
//  · Presa no Ar (assinatura): acertos em quem está no ar causam dano extra.
//  · Voo: pairam sobre o chão — água rasa, mato, raízes e espinhos não os atrasam nem ferem.
//  · Olho da Tempestade (Araravento): vórtice que puxa para o centro.
import { clamp, lerp } from '../core/math.js';

export const AIR = {
  liftMin: 0.35, // carga mínima para o tornado levantar
  airBonus: 1.25, // Presa no Ar (forma base); a evoluída usa sig.airBonus
};

const lerpK = (pair, k) => (Array.isArray(pair) ? lerp(pair[0], pair[1], k) : pair);

// Carga atual (0..1) de uma habilidade de segurar durante a preparação.
export function holdK(a) {
  const ab = a.ab;
  if (!ab.hold) return 0;
  return clamp((a.t - ab.windup) / ab.hold, 0, 1);
}

// Quanto a IA segura: o suficiente para o tornado alcançar o alvo (com uma folga), às vezes tudo.
export function aiHoldFor(w, m, a) {
  const ab = a.ab, t = a.target, tor = ab.tornado;
  if (!t || !tor) return ab.windup + ab.hold * 0.5;
  const d = Math.hypot(t.x - m.x, t.y - m.y);
  let k = clamp((d + 20 - tor.range[0]) / (tor.range[1] - tor.range[0]), 0, 1);
  if (t.status.stun > 0 || t.status.root > 0 || w.rng() < 0.35) k = Math.max(k, 0.6 + w.rng() * 0.4); // alvo parado: carga cheia
  return ab.windup + ab.hold * Math.max(k, AIR.liftMin + 0.05);
}

// Lança o tornado com a carga guardada em a.charge.
export function tornado(w, m, a, tor) {
  const k = a.charge ?? 0;
  const ang = a.aim;
  w.spawnProjectile({
    kind: 'tornado', tag: a.ab.id, owner: m, ang, speed: lerpK(tor.speed ?? 170, k), r: lerpK(tor.r, k), range: lerpK(tor.range, k),
    dmg: lerpK(tor.dmg, k), lift: k >= AIR.liftMin ? lerpK(tor.lift, k) : 0, charge: k, pierce: true, vortex: k >= 0.95 && tor.vortex ? tor.vortex : null,
    x: m.x + Math.cos(ang) * (m.r + 4), y: m.y + Math.sin(ang) * (m.r + 4), aimPoint: a.aimPoint,
  });
  w.emit({ type: 'tornadoCast', m, x: m.x, y: m.y, k });
}

// Leque de penas cortantes (deixam lento).
export function feathers(w, m, a, o) {
  const n = o.n, spread = o.spread;
  for (let i = 0; i < n; i++) {
    const ang = a.aim + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
    w.spawnProjectile({ kind: 'feather', tag: a.ab.id, owner: m, ang, speed: o.speed, r: 3, range: o.range, dmg: o.dmg, slow: o.slow, x: m.x + Math.cos(ang) * (m.r + 2), y: m.y + Math.sin(ang) * (m.r + 2) - 6 });
  }
}

// Rajada de Vento: empurra quem está perto e DEVOLVE os projéteis inimigos próximos.
export function gust(w, m, o) {
  w.emit({ type: 'gust', m, x: m.x, y: m.y, r: o.r });
  for (const t of w.enemiesOf(m)) {
    const d = Math.hypot(t.x - m.x, t.y - m.y);
    if (d > o.r + t.r) continue;
    w.damage(t, o.dmg, m, { tag: 'rajadaVento', element: 'air', kb: o.kb, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.2 });
  }
  for (const p of w.projectiles) {
    if (p.dead || p.lob || p.team === m.team || Math.hypot(p.x - m.x, p.y - m.y) > o.r + 20) continue;
    const ang = Math.atan2(p.y - m.y, p.x - m.x), sp = Math.hypot(p.vx, p.vy);
    p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
    p.team = m.team; p.owner = m; p.reflected = true; p.traveled = 0; p.hitSet = null;
  }
  w.popDecoysIn(m.x, m.y, o.r, m.team);
}

// Pouso do mergulho: dano em área e levanta quem estiver embaixo.
export function diveLand(w, m, o) {
  w.emit({ type: 'diveLand', x: m.x, y: m.y, r: o.r, m });
  for (const t of w.enemiesOf(m)) {
    if (Math.hypot(t.x - m.x, t.y - m.y) > o.r + t.r) continue;
    w.damage(t, o.dmg, m, { tag: o.tag, element: 'air', kb: 120, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: o.lift, lift: o.lift, leap: true });
  }
  w.popDecoysIn(m.x, m.y, o.r, m.team);
}

// Vórtice (Olho da Tempestade e tornado cheio do Araravento): zona que puxa para o centro.
export function addVortex(w, m, x, y, o) {
  w.zones.push({ id: (w._zoneId = (w._zoneId || 0) + 1), kind: 'wind', x, y, r: o.r, life: o.life, max: o.life, tick: 0, dps: o.dps ?? 0, slow: o.slow ?? 0.25, pull: o.pull ?? 60, lift: o.lift ?? 0, team: m.team, owner: m, big: !!o.big });
  w.emit({ type: 'vortex', x, y, r: o.r, m });
}

// Puxão contínuo (todo passo); o dano/lentidão vem do tick das zonas (electric.updateZones).
export function updateWind(w, dt) {
  for (const z of w.zones) {
    if (z.kind !== 'wind') continue;
    for (const t of w.monsters) {
      if (!t.alive || !t.onField || t.team === z.team || t.status.invuln > 0) continue;
      const dx = z.x - t.x, dy = z.y - t.y, d = Math.hypot(dx, dy);
      if (d > z.r + t.r || d < 2) continue;
      const k = z.pull * dt / Math.max(1, t.def.mass);
      t.x += (dx / d) * Math.min(k, d); t.y += (dy / d) * Math.min(k, d);
    }
  }
}

export function zoneTick(w, z) {
  for (const t of w.monsters) {
    if (!t.alive || !t.onField || t.team === z.team || Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.r * 0.6) continue;
    w.damage(t, z.dps * 0.25, z.owner, { dot: true, element: 'air', tag: 'vortice', slow: [0.5, z.slow] });
  }
  // No fim, o vórtice grande arremessa para o alto quem ainda está dentro.
  if (z.lift && z.life <= 0.25 && !z.burst) {
    z.burst = true;
    w.emit({ type: 'vortexBurst', x: z.x, y: z.y, r: z.r });
    for (const t of w.monsters) {
      if (!t.alive || !t.onField || t.team === z.team || Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.r) continue;
      w.damage(t, 6, z.owner, { element: 'air', tag: 'vortice', stun: z.lift, lift: z.lift });
    }
  }
}

export function projectileHit(w, p, m) {
  const ang = Math.atan2(p.vy, p.vx);
  const base = { ang, x: p.x, y: p.y, proj: true, element: 'air' };
  if (p.kind === 'tornado') {
    // Levantado no ar = atordoado enquanto está suspenso; sem carga, só um empurrão.
    w.damage(m, p.dmg, p.owner, { ...base, tag: p.tag, kb: p.lift ? 40 : 110, stun: p.lift || 0.12, lift: p.lift || 0 });
    if (p.lift) w.emit({ type: 'tornadoLift', m, x: m.x, y: m.y });
  } else if (p.kind === 'feather') {
    w.damage(m, p.dmg, p.owner, { ...base, tag: p.tag, kb: 40, stun: 0.06, slow: p.slow });
  }
}

export function projectileEnd(w, p, o) {
  if (o) w.hurtObstacle(o, p.kind === 'tornado' ? p.dmg : p.dmg * 0.5);
  if (p.kind === 'tornado') {
    w.emit({ type: 'tornadoEnd', x: p.x, y: p.y, r: p.r });
    if (p.vortex) addVortex(w, p.owner, p.x, p.y, p.vortex);
  }
}

// Presa no Ar: dano extra em quem está suspenso.
export function airMult(src, t, o) {
  if (!src || o.dot || !(t.lift > 0) || src.def.sig?.kind !== 'gale') return 1;
  return src.def.sig.airBonus ?? AIR.airBonus;
}
