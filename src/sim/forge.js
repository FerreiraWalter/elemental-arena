// Fogo de longe (Brasalinha → Fornalhonte): pedras em brasa, brasas no chão e forja.
//  · Pedra em Brasa (golpe básico): tiro de longe; onde cai (no alvo, na parede ou no fim do alcance) deixa uma BRASA.
//  · Brasas (zonas 'coal'): armam em meio segundo. Inimigo que pisa numa brasa acesa a faz ESTOURAR (queima).
//    Água e chão molhado apagam. Cada monstro tem um limite de brasas; a mais velha some quando passa dele.
//  · Centelha Ativa / Forja Ardente (assinatura): passar por cima de uma brasa sua a RECOLHE e guarda uma CENTELHA:
//    o próximo tiro sai INCANDESCENTE (maior, explode em área). A Brasalinha ganha velocidade; o Fornalhonte, couraça.
//  · Ignição / Erupção da Forja (E): todas as suas brasas explodem de uma vez, e uma explosão sai em volta de você.
//  · Bumerangue de Brasa (Q da base): vai e volta, fere na ida e na volta e detona as suas brasas por onde passa.
//  · Salva das Chaminés (Q do Fornalhonte): três bombas de magma em arco; cada uma deixa uma brasa.
import { clamp } from '../core/math.js';
import { WORLD_W, WORLD_H } from '../config.js';

export const FORGE = {
  arm: 0.5, // brasa recém-caída: não estoura nem é recolhida antes disso
  life: 9, // segundos até a brasa apagar sozinha
  popR: 15, // raio do estouro de quem pisa
  chainK: 0.4, // mesma explosão de Ignição pegando o mesmo alvo de novo: só 40% do dano
  boomerangLife: 2.6,
};

export const KINDS = new Set(['coalRock', 'boomerang']);
export const sparkMax = (m) => m.def.sig?.sparkMax ?? 2;
const coalMax = (m) => m.def.sig?.coalMax ?? 5;
const isForge = (m) => m?.def?.sig?.kind === 'forge';
export const coalsOf = (w, m) => w.zones.filter((z) => z.kind === 'coal' && z.owner === m && z.life > 0);

// ───────────── Brasas no chão ─────────────
export function dropCoal(w, m, x, y) {
  if (!isForge(m)) return null;
  x = clamp(x, 8, WORLD_W - 8); y = clamp(y, 8, WORLD_H - 8);
  const tr = w.terrain, i = tr.at(x, y);
  if (i < 0 || tr.isWater(i) || tr.wet[i] > 0) { w.emit({ type: 'coalOut', x, y }); return null; }
  const mine = coalsOf(w, m);
  // Caiu em cima de outra brasa sua: aviva a que já estava lá (não empilha).
  const near = mine.find((z) => Math.hypot(z.x - x, z.y - y) < z.r + 3);
  if (near) { near.life = near.max; return near; }
  if (mine.length >= coalMax(m)) { mine[0].life = 0; w.emit({ type: 'coalOut', x: mine[0].x, y: mine[0].y, quiet: true }); }
  const z = { id: (w._zoneId = (w._zoneId || 0) + 1), kind: 'coal', x, y, r: m.def.sig.coalR ?? 7, life: FORGE.life, max: FORGE.life, age: 0, tick: 0, team: m.team, owner: m, big: !!m.evolved };
  w.zones.push(z);
  w.emit({ type: 'coalDrop', x, y, big: z.big });
  return z;
}

// Todo passo: brasas envelhecem, apagam na água, o dono recolhe e inimigos que pisam fazem estourar.
export function update(w, dt) {
  for (const z of w.zones) {
    if (z.kind !== 'coal' || z.life <= 0) continue;
    z.age += dt;
    const tr = w.terrain, i = tr.at(z.x, z.y);
    if (i >= 0 && (tr.isWater(i) || tr.wet[i] > 0)) { z.life = 0; w.emit({ type: 'coalOut', x: z.x, y: z.y }); continue; }
    if (z.age < FORGE.arm) continue;
    const o = z.owner;
    if (o.alive && o.onField && !o.locked && (o.spark || 0) < sparkMax(o) && Math.hypot(o.x - z.x, o.y - z.y) < o.r + z.r) { collect(w, o, z); continue; }
    for (const t of w.monsters) {
      if (!t.alive || !t.onField || t.team === z.team || t.def.hover || w.isAirborne(t)) continue;
      if (Math.hypot(t.x - z.x, t.y - z.y) > t.r * 0.8 + z.r) continue;
      z.life = 0;
      blast(w, o, z.x, z.y, FORGE.popR + (z.big ? 3 : 0), o.def.sig?.pop ?? 4, { tag: 'brasaPisada', burn: 1.2, kb: 90, stun: 0 });
      break;
    }
  }
}

// Recolher uma brasa: guarda uma CENTELHA. Base: disparada curta. Evoluído: couraça incandescente (escudo).
function collect(w, m, z) {
  z.life = 0;
  m.spark = Math.min(sparkMax(m), (m.spark || 0) + 1);
  const sig = m.def.sig;
  if (sig.armor) {
    m.shieldHp = Math.min(sig.armorMax ?? 18, (m.status.shield > 0 ? m.shieldHp : 0) + sig.armor);
    m.status.shield = Math.max(m.status.shield, 6);
  } else m.status.haste = Math.max(m.status.haste, sig.hasteT ?? 1.4);
  w.emit({ type: 'coalPick', m, x: z.x, y: z.y, n: m.spark, armor: !!sig.armor });
}

// Explosão de fogo em área (estouro de brasa, Ignição, pedra incandescente, bomba das chaminés).
// hits: Map opcional alvo → vezes já atingido nesta mesma ação (as repetições doem menos).
export function blast(w, src, x, y, R, dmg, o = {}, hits = null, skip = null) {
  w.emit({ type: 'explosion', x, y, r: R, src, small: R < 24 });
  for (const t of w.monsters) {
    if (!t.alive || !t.onField || t.team === src.team || t === skip) continue;
    if (Math.hypot(t.x - x, t.y - y) > R + t.r) continue;
    const n = hits ? hits.get(t.id) || 0 : 0;
    if (hits) hits.set(t.id, n + 1);
    const k = n ? FORGE.chainK : 1;
    w.damage(t, dmg * k, src, { tag: o.tag, element: 'fire', burn: o.burn ?? 1.2, kb: (o.kb ?? 140) * (n ? 0.4 : 1), ang: Math.atan2(t.y - y, t.x - x), stun: n ? 0 : o.stun ?? 0.15, proj: true, big: o.big });
  }
  w.popDecoysIn(x, y, R, src.team);
  for (const ob of w.obstacles) {
    if (ob.destroyed || ob.hp === Infinity || (ob.team !== undefined && ob.team === src.team) || Math.hypot(ob.x - x, ob.y - y) > R + ob.r) continue;
    ob.lastHitBy = src;
    w.hurtObstacle(ob, dmg);
    if (ob.flammable && !ob.destroyed) w.igniteObstacle(ob, src);
  }
  w.igniteArea(x, y, R * 0.35, 1.2, src);
}

// ───────────── Habilidades ─────────────
// Pedra em Brasa / Bala de Forja. Com centelha guardada, o tiro sai incandescente (gasta 1).
export function shoot(w, m, a, s) {
  const hot = (m.spark || 0) > 0 ? s.hot : null;
  if (hot) { m.spark--; w.emit({ type: 'sparkShot', m, x: m.x, y: m.y }); }
  const sp = hot?.speed ?? s.speed, ang = a.aim;
  w.spawnProjectile({
    kind: 'coalRock', tag: a.ab.id, owner: m, ang, speed: sp, r: hot ? hot.r : s.r, range: s.range, dmg: hot ? hot.dmg : s.dmg,
    hot: hot ? { R: hot.R, dmg: hot.splash } : null, big: !!m.evolved,
    x: m.x + Math.cos(ang) * (m.r + 3), y: m.y + Math.sin(ang) * (m.r + 3) - 6, aimPoint: a.aimPoint,
  });
}

// Bumerangue: vai até `out` px, desacelerando, e volta acelerando até a dona.
export function boomerang(w, m, a, o) {
  const ang = a.aim;
  w.spawnProjectile({
    kind: 'boomerang', tag: a.ab.id, owner: m, ang, speed: o.speed, base: o.speed, r: o.r, range: 9999, out: o.out, dmg: o.dmg, pierce: true,
    x: m.x + Math.cos(ang) * (m.r + 4), y: m.y + Math.sin(ang) * (m.r + 4) - 4,
  });
}

// Chamado antes de mover o projétil (como o teleguiado psíquico).
export function steer(w, p, dt) {
  if (p.kind !== 'boomerang') return;
  const o = p.owner;
  if (p.age > FORGE.boomerangLife || !o.alive || !o.onField) { p.dead = true; w.emit({ type: 'boomerangEnd', x: p.x, y: p.y }); return; }
  if (!p.back) {
    const k = clamp(p.traveled / p.out, 0, 1);
    const sp = p.base * (1 - 0.75 * k);
    const ang = Math.atan2(p.vy, p.vx);
    p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
    if (k >= 1) { p.back = true; p.hitSet = new Set(); p.backT = 0; } // na volta, pode acertar de novo
  } else {
    p.backT += dt;
    const dx = o.x - p.x, dy = o.y - 6 - p.y, d = Math.hypot(dx, dy);
    if (d < o.r + 6) { p.dead = true; w.emit({ type: 'boomerangCatch', m: o, x: o.x, y: o.y }); return; }
    const sp = Math.min(p.base * 1.15, p.base * (0.25 + p.backT * 2.4));
    p.vx = dx / d * sp; p.vy = dy / d * sp;
  }
  // Passou por uma brasa sua: detona.
  for (const z of w.zones) {
    if (z.kind !== 'coal' || z.owner !== o || z.life <= 0 || z.age < 0.15) continue;
    if (Math.hypot(z.x - p.x, z.y - p.y) > z.r + p.r + 4) continue;
    z.life = 0;
    p.chain ||= new Map();
    blast(w, o, z.x, z.y, z.big ? 28 : 24, o.def.sig?.chainDmg ?? 7, { tag: 'bumerangue', stun: 0.1 }, p.chain);
  }
}

// Ignição / Erupção da Forja: explode todas as brasas e solta uma explosão em volta de si.
export function ignite(w, m, o) {
  const hits = new Map();
  const coals = coalsOf(w, m);
  w.emit({ type: 'ignition', m, x: m.x, y: m.y, r: o.self.r, coals: coals.map((z) => [Math.round(z.x), Math.round(z.y)]) });
  blast(w, m, m.x, m.y, o.self.r, o.self.dmg, { tag: a2tag(m), kb: 200, stun: 0.25 }, hits);
  for (const z of coals) {
    z.life = 0;
    blast(w, m, z.x, z.y, o.R + (z.big ? 4 : 0), o.dmg, { tag: a2tag(m), big: true, stun: 0.25 }, hits);
  }
  return coals.length;
}
const a2tag = (m) => m.action?.ab.id || 'ignicao';

// Salva das Chaminés: bombas em arco espalhadas em volta do ponto mirado, caindo uma depois da outra.
export function volley(w, m, a, ab, o) {
  const p = a.point || a.aimPoint || { x: m.x + Math.cos(a.aim) * ab.range, y: m.y + Math.sin(a.aim) * ab.range };
  const ang = Math.atan2(p.y - m.y, p.x - m.x);
  const d = clamp(Math.hypot(p.x - m.x, p.y - m.y), 40, ab.range);
  const cx = m.x + Math.cos(ang) * d, cy = m.y + Math.sin(ang) * d;
  for (let k = 0; k < o.n; k++) {
    const an = ang + Math.PI / 2 + (k / o.n) * Math.PI * 2, rr = k === 0 ? 0 : o.spread;
    const tx = clamp(cx + Math.cos(an) * rr, 10, WORLD_W - 10), ty = clamp(cy + Math.sin(an) * rr, 10, WORLD_H - 10);
    w.spawnProjectile({ kind: 'forgeBomb', tag: ab.id, owner: m, lob: true, x: m.x + (k - 1) * 6, y: m.y - 14, tx, ty, flight: o.flight + k * 0.14, radius: o.r, dmg: o.dmg });
  }
}

export function bombLand(w, p) {
  blast(w, p.owner, p.tx, p.ty, p.radius, p.dmg, { tag: p.tag, kb: 160, stun: 0.2, big: true });
  dropCoal(w, p.owner, p.tx, p.ty);
}

// Tranco do Colosso: atropela (cada alvo uma vez) e recolhe as brasas por onde passa.
export function ram(w, m, a, o) {
  for (const t of w.enemiesOf(m)) {
    if (a.hit.has(t.id) || Math.hypot(t.x - m.x, t.y - m.y) > m.r + t.r + 4) continue;
    a.hit.add(t.id);
    w.damage(t, o.dmg, m, { tag: a.ab.id, kb: o.kb, ang: a.aim, stun: o.stun, burn: 1.2, element: 'fire' });
  }
  w.popDecoysIn(m.x, m.y, m.r + 4, m.team);
  for (const z of w.zones) {
    if (z.kind !== 'coal' || z.owner !== m || z.life <= 0 || Math.hypot(z.x - m.x, z.y - m.y) > m.r + z.r + 8) continue;
    if ((m.spark || 0) < sparkMax(m)) collect(w, m, z);
  }
}

// Recuo Arredio: salta para TRÁS (de costas para onde mira) e deixa brasas e fumaça onde estava.
export function shyLeapStart(w, m, a, o) {
  a.dir = a.aim + Math.PI;
  const px = -Math.sin(a.aim), py = Math.cos(a.aim);
  for (const s of [-1, 1]) dropCoal(w, m, m.x + px * s * o.gap + Math.cos(a.aim) * 4, m.y + py * s * o.gap + Math.sin(a.aim) * 4);
  w.puffSteam(m.x, m.y, 14, 0.7);
  w.emit({ type: 'smokePuff', m, x: m.x, y: m.y });
}

// ───────────── Projéteis ─────────────
export function projectileHit(w, p, t) {
  const ang = Math.atan2(p.vy, p.vx);
  const base = { ang, x: p.x, y: p.y, proj: true, element: 'fire', tag: p.tag || p.kind };
  if (p.kind === 'boomerang') {
    w.damage(t, p.dmg, p.owner, { ...base, burn: 1, kb: p.back ? -60 : 80, stun: 0.05 });
    return;
  }
  w.damage(t, p.dmg, p.owner, { ...base, burn: p.hot ? 1.6 : 0.5, kb: p.hot ? 120 : 50, stun: p.hot ? 0.18 : 0, big: !!p.hot });
  if (p.hot) blast(w, p.owner, t.x, t.y, p.hot.R, p.hot.dmg, { tag: p.tag, kb: 120, big: true }, null, t);
  // A brasa cai aos pés do alvo, um pouco para o lado de quem atirou.
  dropCoal(w, p.owner, t.x - Math.cos(ang) * (t.r + 3), t.y - Math.sin(ang) * (t.r + 3));
}

// solid: bateu em obstáculo/parede (não só acabou o alcance).
export function projectileEnd(w, p, o, solid) {
  if (p.kind === 'boomerang') {
    if (o) w.hurtObstacle(o, p.dmg);
    w.emit({ type: 'boomerangEnd', x: p.x, y: p.y });
    return;
  }
  const ang = Math.atan2(p.vy, p.vx);
  if (o) { w.hurtObstacle(o, p.dmg); if (o.flammable && !o.destroyed) w.igniteObstacle(o, p.owner); }
  if (p.hot) blast(w, p.owner, p.x, p.y, p.hot.R, p.hot.dmg, { tag: p.tag, kb: 120, big: true });
  // Bateu numa parede: a brasa cai um pouco antes, do lado de cá.
  const back = solid ? 7 : 0;
  dropCoal(w, p.owner, p.x - Math.cos(ang) * back, p.y - Math.sin(ang) * back);
}
