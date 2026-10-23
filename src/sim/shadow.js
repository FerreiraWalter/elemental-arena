// Sombra (Pantrinja → Kagepantera): a pantera ninja do elemento SOMBRA.
//
//  · Sombra Viva (F): lança a própria SOMBRA até um ponto (voa rápido e fica parada alguns segundos). Enquanto ela
//    existe, apertar F de novo LEVA a pantera até a sombra (troca de lugar, como a sombra do Zed). A sombra IMITA o
//    Shuriken Bumerangue (Q) do ponto onde está, mirando no mesmo lugar; na forma evoluída imita também as garras. Um alvo atingido
//    pela pantera E pela sombra no mesmo golpe leva só metade no segundo acerto (as duas juntas não dobram o dano).
//  · Rastro Invisível (base): esquivar ou ir até a sombra deixa a pantera CAMUFLADA por um instante. Atacar saindo
//    da camuflagem (EMBOSCADA) ou golpear de perto PELAS COSTAS do alvo é CRÍTICO.
//  · Emboscada da Noite (evoluída): críticos maiores; cada crítico recarrega a Sombra. A Noite Eterna (E) cria uma
//    área escura: lá dentro a pantera volta a se camuflar sozinha e os inimigos ficam lentos.
// A sombra não leva dano nem bloqueia nada: é só uma posição (w.shadows), sincronizada por snapshot.

import { angleDiff } from '../core/math.js';
import { applySlow } from './electric.js';

export const SHADOW = {
  life: 4.5, // segundos que a sombra fica no chão
  speed: 620, // px/s do voo da sombra até o ponto
  range: 150, // distância máxima do ponto da sombra
  minRange: 40,
  mirrorK: 0.5, // segundo acerto do mesmo golpe (pantera + sombra) no mesmo alvo
  back: 1.95, // rad: o atacante está "pelas costas" se estiver a mais que isto da frente do alvo
  trail: 0.45, // camuflagem do Rastro Invisível
  ambush: 0.6, // janela (s) em que o ataque que saiu da camuflagem ainda é emboscada
  nightCloak: 1, // dentro da Noite Eterna a camuflagem volta depois deste tempo sem atacar
};
export const KINDS = new Set(['shuriken', 'kunai', 'fuuma']);
export const isShadow = (m) => m?.def?.sig?.kind === 'shadow';
let nextId = 1;
let nextCast = 1;

export const shadowOf = (w, m) => w.shadows?.find((s) => s.owner === m) || null;
// F de novo: a sombra está no chão (ou chegando) e a pantera pode agir.
export const canSwap = (w, m) => !!shadowOf(w, m) && m.alive && m.onField && !m.locked && m.status.stun <= 0 && m.status.charm <= 0 && m.status.root <= 0 && (!m.action || m.action.phase === 'recovery');

// ───────────── Sombra Viva ─────────────
export function castShadow(w, m, a, ab) {
  for (const s of w.shadows) if (s.owner === m) s.life = 0; // só uma sombra por pantera
  const ap = a.aimPoint || { x: m.x + Math.cos(a.aim) * SHADOW.range, y: m.y + Math.sin(a.aim) * SHADOW.range };
  const ang = Math.atan2(ap.y - m.y, ap.x - m.x);
  const d = Math.max(SHADOW.minRange, Math.min(ab.range ?? SHADOW.range, Math.hypot(ap.x - m.x, ap.y - m.y)));
  // O ponto final precisa ser um lugar onde a pantera possa ficar (não dentro de rocha, muro ou água funda).
  let tx = m.x + Math.cos(ang) * d, ty = m.y + Math.sin(ang) * d;
  for (let k = d; k > 10; k -= 8) {
    tx = m.x + Math.cos(ang) * k; ty = m.y + Math.sin(ang) * k;
    if (w.standable(m, tx, ty) && !w.blockedFor(m, tx, ty, m.r)) break;
  }
  const s = { id: nextId++, owner: m, team: m.team, x: m.x, y: m.y, tx, ty, life: (ab.shadowLife ?? SHADOW.life) + 0.25, max: (ab.shadowLife ?? SHADOW.life) + 0.25, facing: ang, moving: true, strike: ab.arrival || null };
  w.shadows.push(s);
  w.emit({ type: 'shadowCast', m, x: m.x, y: m.y, tx, ty });
}

// Ir até a sombra: a pantera aparece onde a sombra estava; a sombra some (vira fumaça).
export function swap(w, m) {
  const s = shadowOf(w, m);
  if (!s || !canSwap(w, m)) return false;
  const fx = m.x, fy = m.y;
  m.action = null;
  m.x = m.px = s.moving ? s.x : s.tx; m.y = m.py = s.moving ? s.y : s.ty;
  m.vx = m.vy = m.kx = m.ky = 0;
  m.level = w.terrain.heightAt(m.x, m.y);
  m.facing = s.facing;
  s.life = 0;
  w.shadows = w.shadows.filter((q) => q !== s);
  w.emit({ type: 'shadowSwap', m, x0: fx, y0: fy, x: m.x, y: m.y });
  trail(w, m);
  // Sombra Assassina: chega cortando quem estiver em volta.
  if (s.strike) {
    for (const t of w.enemiesOf(m)) {
      if (Math.hypot(t.x - m.x, t.y - m.y) > s.strike.r + t.r) continue;
      w.damage(t, s.strike.dmg, m, { tag: 'sombraAssassina', element: 'dark', kb: 80, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.15, noCrit: true });
    }
    w.emit({ type: 'shadowSlash', m, x: m.x, y: m.y, r: s.strike.r });
  }
  return true;
}

// Rastro Invisível: some por um instante e o próximo ataque é emboscada.
export function trail(w, m) {
  const sig = m.def.sig;
  m.status.cloak = Math.max(m.status.cloak, sig.trail ?? SHADOW.trail);
  w.emit({ type: 'cloak', m, x: m.x, y: m.y, shadow: true });
}

// A sombra imita a habilidade (do ponto onde está, mirando no mesmo ponto que a pantera).
export function mirror(w, m, a, fire) {
  const s = shadowOf(w, m);
  if (!s || s.moving) return;
  const ap = a.aimPoint || { x: m.x + Math.cos(a.aim) * 120, y: m.y + Math.sin(a.aim) * 120 };
  const aim = Math.atan2(ap.y - s.y, ap.x - s.x);
  s.facing = aim;
  s.atk = 0.3;
  fire(s, aim);
  w.emit({ type: 'shadowMirror', m, x: s.x, y: s.y, ang: aim });
}

// Leque de shurikens (pantera e sombra). castId liga os tiros de um mesmo golpe (regra do segundo acerto).
export function fan(w, m, a, o) {
  const castId = nextCast++;
  const shoot = (src, aim, fromShadow) => {
    for (let k = 0; k < o.n; k++) {
      const ang = aim + (k - (o.n - 1) / 2) * o.spread;
      w.spawnProjectile({ kind: o.kind || 'shuriken', tag: o.tag, owner: m, ang, speed: o.speed, r: 3, range: o.range, dmg: o.dmg, castId, fromShadow, pierce: !!o.pierce, x: src.x + Math.cos(ang) * (m.r + 2), y: src.y + Math.sin(ang) * (m.r + 2) - 6 });
    }
  };
  shoot(m, a.aim, false);
  if (o.mirror) mirror(w, m, a, (s, aim) => shoot(s, aim, true));
}

// Shuriken bumerangue (Q): uma estrela grande que vai até o alcance (ou até bater numa parede), VOLTA para quem
// lançou (a pantera ou a sombra) e acerta de novo na volta. Atravessa os inimigos.
export function boomerang(w, m, a, o) {
  const castId = nextCast++;
  const shoot = (src, aim, fromShadow) => w.spawnProjectile({
    kind: 'fuuma', tag: o.tag, owner: m, ang: aim, speed: o.speed, r: o.r, range: o.range, dmg: o.dmg, castId, fromShadow, pierce: true,
    boomerang: { back: false, from: fromShadow ? shadowOf(w, m) : null }, x: src.x + Math.cos(aim) * (m.r + 3), y: src.y + Math.sin(aim) * (m.r + 3) - 6,
  });
  shoot(m, a.aim, false);
  mirror(w, m, a, (s, aim) => shoot(s, aim, true));
}
// Vira para voltar (chegou no alcance ou bateu): pode acertar de novo quem já levou na ida.
export function turnBack(w, p) {
  if (p.boomerang.back) return;
  p.boomerang.back = true;
  p.hitSet = new Set();
  p.range = Infinity;
  w.emit({ type: 'fuumaTurn', x: p.x, y: p.y });
}
// Na volta, persegue quem lançou (a sombra, se ainda existir; senão a pantera) e some ao chegar nela.
export function steerBoomerang(w, p, dt) {
  const B = p.boomerang;
  if (!B.back) return false;
  const home = B.from && w.shadows.includes(B.from) ? B.from : p.owner;
  const tx = home.x, ty = home.y - 6, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < 10 || !p.owner.alive || !p.owner.onField || p.age > 6) { p.dead = true; w.emit({ type: 'fuumaCatch', m: p.owner, x: p.x, y: p.y }); return true; }
  const sp = p.speed * 1.1;
  p.vx += ((dx / d) * sp - p.vx) * Math.min(1, dt * 9);
  p.vy += ((dy / d) * sp - p.vy) * Math.min(1, dt * 9);
  return false;
}

// Garras da sombra (forma evoluída): corta quem estiver perto dela, na direção da mira.
export function mirrorClaw(w, m, a, o) {
  mirror(w, m, a, (s, aim) => {
    for (const t of w.enemiesOf(m)) {
      const d = Math.hypot(t.x - s.x, t.y - s.y);
      if (d > o.reach + m.r + t.r) continue;
      if (d > 4 && Math.abs(angleDiff(aim, Math.atan2(t.y - s.y, t.x - s.x))) > o.arc / 2 + 0.3) continue;
      hitFrom(w, m, t, o.dmg, { tag: 'garraSombra', element: 'dark', kb: 50, ang: aim, castId: a.data.castId, fromShadow: true });
    }
    w.emit({ type: 'shadowClaw', m, x: s.x, y: s.y, ang: aim, r: o.reach });
  });
}

// Dano com a regra do segundo acerto: a pantera e a sombra no mesmo golpe (castId) não somam o dano inteiro.
export function hitFrom(w, m, t, dmg, o) {
  if (o.castId) {
    t._shadowHits ||= new Map();
    const prev = t._shadowHits.get(o.castId);
    const who = o.fromShadow ? 's' : 'm';
    if (prev && prev.who !== who && w.time - prev.t < 1.5) dmg *= SHADOW.mirrorK;
    t._shadowHits.set(o.castId, { who, t: w.time });
    if (t._shadowHits.size > 12) t._shadowHits.delete(t._shadowHits.keys().next().value);
  }
  return w.damage(t, dmg, m, o);
}

export function projectileHit(w, p, t) {
  const ang = Math.atan2(p.vy, p.vx);
  hitFrom(w, p.owner, t, p.dmg, { tag: p.tag || p.kind, element: 'dark', kb: p.kind === 'fuuma' ? 70 : p.kind === 'kunai' ? 45 : 30, stun: p.kind === 'fuuma' ? 0.1 : 0, ang, x: p.x, y: p.y, proj: true, castId: p.castId, fromShadow: p.fromShadow, slow: p.slow });
}

// ───────────── Bomba de Fumaça / Noite Eterna ─────────────
export function smoke(w, m, o) {
  w.puffInk(m.x, m.y, o.r);
  m.status.cloak = Math.max(m.status.cloak, o.cloak);
  m.status.haste = Math.max(m.status.haste, o.haste);
  m.ambushT = 0;
  for (const t of w.enemiesOf(m)) if (Math.hypot(t.x - m.x, t.y - m.y) < o.r + t.r) applySlow(t, o.slowT, o.slow);
  w.emit({ type: 'smokeBomb', m, x: m.x, y: m.y, r: o.r });
  w.emit({ type: 'cloak', m, x: m.x, y: m.y, shadow: true });
}
export function night(w, m, a, o) {
  const p = a.aimPoint || m;
  const d = Math.hypot(p.x - m.x, p.y - m.y), k = d > o.range ? o.range / d : 1;
  const x = m.x + (p.x - m.x) * k, y = m.y + (p.y - m.y) * k;
  w.zones.push({ id: w.zones.length + 1e4 + Math.floor(w.time * 1000), kind: 'night', x, y, r: o.r, life: o.life, max: o.life, team: m.team, owner: m, tick: 0, dps: 0, big: true });
  w.emit({ type: 'nightFall', m, x, y, r: o.r });
}
const inNight = (w, m) => w.zones.some((z) => z.kind === 'night' && z.owner === m && z.life > 0 && Math.hypot(z.x - m.x, z.y - m.y) < z.r);

// ───────────── Crítico (chamado por Sig.outgoing) ─────────────
export function behind(t, src) {
  if (!t || !src) return false;
  return Math.abs(angleDiff(t.facing ?? 0, Math.atan2(src.y - t.y, src.x - t.x))) > SHADOW.back;
}
export function outgoing(w, src, t, o) {
  if (!isShadow(src) || o.dot || o.noCrit || !t || t === src) return 1;
  const sig = src.def.sig;
  const ambush = (src.ambushT ?? -9) > w.time;
  const back = !o.proj && !o.fromShadow && behind(t, src);
  if (!ambush && !back) return 1;
  if (ambush && !inNight(w, src)) src.ambushT = 0; // a emboscada vale para um acerto (na Noite, todos)
  const k = back && ambush ? sig.crit + 0.15 : ambush ? sig.crit : sig.back;
  w.emit({ type: 'shadowCrit', m: t, src, x: t.x, y: t.y, back, ambush });
  // Emboscada da Noite: cada crítico recarrega um pouco a Sombra.
  if (sig.critRefund) { const f = src.def.controls.f; if (src.cd[f] > 0) src.cd[f] = Math.max(0, src.cd[f] - sig.critRefund); }
  return k;
}

// Ao lançar uma habilidade: sair da camuflagem marca a emboscada.
export function onCast(w, m, ab) {
  if (!isShadow(m)) return;
  if (ab.kind !== 'dodge') m._lastCastT = w.time;
  if (m.status.cloak > 0 && ab.kind !== 'dodge') m.ambushT = w.time + SHADOW.ambush + (ab.windup || 0) + (ab.active || 0);
}

// ───────────── Por passo ─────────────
export function update(w, dt) {
  for (const s of w.shadows) {
    s.life -= dt;
    if (s.atk > 0) s.atk = Math.max(0, s.atk - dt);
    if (s.moving) {
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), st = SHADOW.speed * dt;
      if (d <= st) { s.x = s.tx; s.y = s.ty; s.moving = false; w.emit({ type: 'shadowLand', m: s.owner, x: s.x, y: s.y }); }
      else { s.x += (dx / d) * st; s.y += (dy / d) * st; }
    }
    const o = s.owner;
    if (!o.alive || !o.onField || o.switchState) s.life = 0;
  }
  const gone = w.shadows.filter((s) => s.life <= 0);
  for (const s of gone) w.emit({ type: 'shadowFade', m: s.owner, x: s.x, y: s.y });
  if (gone.length) w.shadows = w.shadows.filter((s) => s.life > 0);
  for (const m of w.monsters) {
    if (!isShadow(m) || !m.alive || !m.onField) continue;
    // Noite Eterna: dentro da escuridão a pantera some de novo pouco depois de atacar.
    if (inNight(w, m)) {
      if (m.status.cloak <= 0 && !m.action && w.time - (m._lastCastT ?? -9) > SHADOW.nightCloak) { m.status.cloak = 0.4; w.emit({ type: 'cloak', m, x: m.x, y: m.y, shadow: true }); }
      else if (m.status.cloak > 0) m.status.cloak = Math.max(m.status.cloak, 0.4);
    }
    if (!m.controller) aiSwap(w, m);
  }
  // Inimigos dentro da Noite Eterna ficam lentos.
  for (const z of w.zones) {
    if (z.kind !== 'night' || z.life <= 0) continue;
    for (const t of w.monsters) if (t.alive && t.onField && t.team !== z.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r * 0.5) applySlow(t, 0.3, z.slow ?? 0.3);
  }
}

// IA: quando ir até a sombra (emboscar quem está perto dela, fugir quando apanha, ou antes de ela sumir).
function aiSwap(w, m) {
  const s = shadowOf(w, m);
  if (!s || s.moving || !canSwap(w, m)) return;
  if (w.time - (m._aiSwapCheck ?? -9) < 0.2) return;
  m._aiSwapCheck = w.time;
  const foes = w.enemiesOf(m);
  if (!foes.length) return;
  const nearMe = Math.min(...foes.map((e) => Math.hypot(e.x - m.x, e.y - m.y)));
  const nearShadow = Math.min(...foes.map((e) => Math.hypot(e.x - s.x, e.y - s.y)));
  const hpF = m.hp / m.maxHp;
  const ambush = nearShadow < 42 && nearMe > 60;
  const escape = hpF < 0.4 && nearMe < 50 && nearShadow > 90;
  const late = s.life < 0.5 && nearShadow < nearMe - 30;
  if (ambush || escape || late) swap(w, m);
}
