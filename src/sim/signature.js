// Mecânicas próprias de cada linha de monstros ("assinaturas"). Ficam aqui, fora do World, para que cada
// identidade seja fácil de ler e ajustar. Todas rodam no servidor/simulação e são sincronizadas por snapshot.
//
//   heat     Brasalisco  — Fornalha: ataques aquecem; em 100% SUPERAQUECE (mais dano e velocidade) e depois
//                         fica EXAUSTO (lento, sem poderes, leva mais dano). A água esfria.
//   guard    Hidrocasco  — Casco Reflexo: bloqueio com tempo certo; reflete projéteis e contra-ataca corpo a corpo.
//   sentry   Brotossauro — Brotos Sentinela: planta torres vivas que atiram e curam quem está perto.
//   momentum Ouriflama   — Ímpeto: correndo sem parar ganha DISPARADA; o próximo golpe sai muito mais forte.
//                         Couraça de espinhos fere quem o ataca corpo a corpo.
//   decoy    Gotapus     — Ilusões de Tinta: cópias falsas enganam a mira e a IA; pode ficar camuflado.
//   marks    Mantifolha  — Marca do Louva-a-deus: acertos marcam a presa; com 3 marcas, um golpe de perto
//                         ou o pouso do salto EXECUTA (dano extra, prende e recarrega o salto).

import { T } from './tiles.js';

export const SIG = {
  heat: { max: 100, decayDelay: 1.3, decay: 11, overheat: 3, exhaust: 2.2, exhaustEvolved: 1.5, dmg: 1.2, speed: 1.1, exhaustSpeed: 0.72, exhaustTaken: 1.15, waterCool: 12 },
  nova: { r: 42, dmg: 9, kb: 230, burn: 1 },
  momentum: { gain: 60, loss: 75, keep: 0.3, chargedSpeed: 1.15, strike: 1.6, kb: 1.4 },
  guard: { block: 0.15, blockDot: 0.3, counterReach: 46 },
  decoy: { life: 2.2, speed: 0.95 },
  marks: { max: 3, life: 4.5, gap: 0.14, root: 0.7 },
  sentry: { max: 2 },
};

export const kindOf = (m) => m?.def?.sig?.kind;

// ───────────── Fornalha (calor) ─────────────
export function onCast(w, m, ab) {
  if (m.status.cloak > 0 && ab.kind !== 'dodge') { m.status.cloak = 0; w.emit({ type: 'uncloak', m, x: m.x, y: m.y }); }
  // Atacar denuncia a posição: quem estava enganado por uma cópia volta a enxergar o verdadeiro.
  if (ab.kind !== 'dodge' && ab.kind !== 'buff' && w.decoys.length) for (const e of w.enemiesOf(m)) if (e.ai?.fooled?.owner === m.id) e.ai.fooled = null;
  if (kindOf(m) === 'heat' && ab.heat && m.status.overheat <= 0 && m.status.exhaust <= 0) {
    m.heat = Math.min(SIG.heat.max, m.heat + ab.heat);
    m.heatIdle = 0;
    if (m.heat >= SIG.heat.max) overheat(w, m);
  }
}

function overheat(w, m) {
  m.status.overheat = SIG.heat.overheat;
  m.heat = SIG.heat.max;
  w.emit({ type: 'overheat', m, x: m.x, y: m.y });
  w.say(`${m.name} SUPERAQUECEU!`, '#ffb040');
  // Núcleo Vulcânico (forma evoluída): ao superaquecer, solta uma onda de calor que afasta quem está perto.
  if (m.def.sig.nova) {
    const N = SIG.nova;
    w.emit({ type: 'heatNova', m, x: m.x, y: m.y, r: N.r });
    for (const t of w.enemiesOf(m)) {
      if (Math.hypot(t.x - m.x, t.y - m.y) > N.r + t.r) continue;
      w.damage(t, N.dmg, m, { tag: 'nucleoVulcanico', kb: N.kb, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.2, burn: N.burn, element: 'fire', proj: true });
    }
    w.popDecoysIn(m.x, m.y, N.r, m.team);
  }
}

// ───────────── Atualização por passo (monstro em campo) ─────────────
export function update(w, m, dt) {
  const st = m.status;
  const k = kindOf(m);
  if (k === 'heat') {
    if (st.overheat > 0 && st.overheat - dt <= 0) {
      st.overheat = 0;
      st.exhaust = m.def.sig.exhaust ?? SIG.heat.exhaust;
      m.heat = 0;
      w.emit({ type: 'exhaust', m, x: m.x, y: m.y });
      w.say(`${m.name} ficou EXAUSTO`, '#c8b8a0');
    }
    if (st.overheat <= 0 && st.exhaust <= 0) {
      m.heatIdle = (m.heatIdle || 0) + dt;
      if (m.heatIdle > SIG.heat.decayDelay) m.heat = Math.max(0, m.heat - SIG.heat.decay * dt);
    }
    const tr = w.terrain, i = tr.at(m.x, m.y);
    if (i >= 0 && tr.isWater(i)) m.heat = Math.max(0, m.heat - 40 * dt);
  } else if (k === 'momentum') {
    const M = SIG.momentum;
    const sp = Math.hypot(m.vx, m.vy), full = m.def.speed;
    const running = !m.action && st.stun <= 0 && st.root <= 0 && sp > full * 0.7;
    if (m.charged) {
      if (sp < full * M.keep && !m.action) m.momentum -= M.loss * dt;
      if (m.momentum < 70) { m.charged = false; w.emit({ type: 'momentumLost', m }); }
    } else if (running) {
      m.momentum = Math.min(100, m.momentum + M.gain * dt);
      if (m.momentum >= 100) { m.charged = true; w.emit({ type: 'charged', m, x: m.x, y: m.y }); }
    } else if (!m.action) m.momentum = Math.max(0, m.momentum - M.loss * dt);
  }
  // Bolha Prisão: quando a bolha acaba, ela estoura.
  if (m._bubbleWas > 0 && st.bubble <= 0) w.emit({ type: 'bubblePop', m, x: m.x, y: m.y });
  m._bubbleWas = st.bubble;
  // Marcas recebidas (de uma Mantifolha) somem com o tempo.
  if (m.marks.n > 0) { m.marks.t -= dt; if (m.marks.t <= 0) m.marks.n = 0; }
  if (m.ccGuard > 0) m.ccGuard = Math.max(0, m.ccGuard - dt);
  if (m.rootGuard > 0) m.rootGuard = Math.max(0, m.rootGuard - dt);
}

// No banco: o calor esfria, o ímpeto se perde, marcas somem.
export function bench(m, dt) {
  if (m.heat > 0) m.heat = Math.max(0, m.heat - SIG.heat.decay * 2 * dt);
  m.momentum = 0; m.charged = false;
  m.marks.n = 0;
}

// ───────────── Multiplicadores de dano ─────────────
// Chamado antes de aplicar o dano. Pode consumir o ímpeto (golpe fortalecido). Retorna { mult, o }.
export function outgoing(w, src, t, o) {
  let mult = 1;
  if (!src) return { mult, o };
  if (src.status.overheat > 0 && (o.element || src.element) === 'fire') mult *= SIG.heat.dmg;
  if (src.charged && !o.dot && !o.proj && src.action && ['melee', 'dash', 'cone'].includes(src.action.ab.kind)) {
    mult *= SIG.momentum.strike;
    o = { ...o, kb: (o.kb || 0) * SIG.momentum.kb };
    src.charged = false; src.momentum = 0;
    w.emit({ type: 'empowered', m: src, target: t, x: t.x, y: t.y });
  }
  return { mult, o };
}
export function incoming(t) { return t.status.exhaust > 0 ? SIG.heat.exhaustTaken : 1; }

// Depois do dano aplicado: marcas, camuflagem, esfriar o calor, perder o ímpeto.
export function afterDamage(w, t, src, dmg, o) {
  if (dmg <= 0) return;
  if (t.status.cloak > 0 && !o.dot) { t.status.cloak = 0; w.emit({ type: 'uncloak', m: t, x: t.x, y: t.y }); }
  if (kindOf(t) === 'heat' && (o.element || src?.element) === 'water') t.heat = Math.max(0, t.heat - SIG.heat.waterCool * (o.dot ? 0.1 : 1));
  if (kindOf(t) === 'momentum' && (o.stun || o.root) && t.momentum > 0) { t.momentum = 0; if (t.charged) { t.charged = false; w.emit({ type: 'momentumLost', m: t }); } }
  if (src && src !== t && kindOf(src) === 'marks' && !o.dot && !o.noMark && t.alive) mark(w, t, src, o);
}

// ───────────── Marca do Louva-a-deus ─────────────
function mark(w, t, src, o) {
  const M = SIG.marks, sig = src.def.sig;
  if (t.marks.by !== src.id) { t.marks.n = 0; t.marks.by = src.id; }
  const close = !o.proj && (src.action?.ab.kind === 'melee' || o.leap);
  if (close && t.marks.n >= M.max) {
    t.marks.n = 0;
    w.emit({ type: 'execute', m: t, src, x: t.x, y: t.y });
    w.say(src.element === 'earth' ? `${src.name} NOCAUTEOU ${t.name}!` : `${src.name} EXECUTOU ${t.name}!`, '#b4f08a');
    w.damage(t, sig.exec, src, { tag: 'execucao', element: src.element, noMark: true, root: M.root, x: t.x, y: t.y, big: true });
    const leap = sig.resetId || src.def.controls.f; // habilidade que a execução recarrega
    if (leap && src.cd[leap] > 0) src.cd[leap] *= sig.leapReset ?? 0;
    return;
  }
  if (w.time - t.marks.last < M.gap) return; // leque de lâminas: uma marca por rajada
  t.marks.last = w.time;
  t.marks.n = Math.min(M.max, t.marks.n + 1);
  t.marks.t = sig.markLife ?? M.life;
  w.emit({ type: 'marked', m: t, src, n: t.marks.n, x: t.x, y: t.y });
}

// ───────────── Couraça de espinhos ─────────────
export function thorns(w, owner, attacker) {
  const th = owner.def.sig?.thorns;
  if (!th || !attacker || !attacker.alive || attacker === owner) return;
  w.emit({ type: 'thorns', m: owner, target: attacker, x: attacker.x, y: attacker.y });
  w.damage(attacker, th.dmg, owner, { tag: 'espinhos', element: 'fire', burn: th.burn || 0, proj: true, noMark: true });
}

// ───────────── Casco Reflexo ─────────────
export const isGuarding = (m) => !!m && m.alive && m.action?.ab.kind === 'guard' && m.action.phase === 'active';

// Contra-ataque: quem bateu de perto é arremessado e encharcado.
export function counter(w, t, src) {
  const a = t.action, ab = a.ab;
  if (a.data.countered) return;
  a.data.countered = true;
  const ang = Math.atan2(src.y - t.y, src.x - t.x);
  w.emit({ type: 'counter', m: t, target: src, x: t.x, y: t.y, ang });
  const C = ab.counter, water = !C.element || C.element === 'water';
  w.damage(src, C.dmg, t, { tag: C.tag || 'contraMare', element: C.element || 'water', kb: C.kb ?? 260, ang, stun: C.stun ?? 0.35, ...(water ? { wet: 2.5 } : {}), counter: true, proj: true });
  if (water) w.douseArea(t.x + Math.cos(ang) * 14, t.y + Math.sin(ang) * 14, 14, 6, t);
  // Contra-ataque bem-sucedido encerra o bloqueio com recuperação curta.
  a.phase = 'recovery'; a.t = Math.max(0, ab.recovery - 0.12);
}

// Bloqueio recebido (qualquer dano direto): efeito visual e, na forma evoluída, uma bolha protetora.
export function blocked(w, t, src, o) {
  const a = t.action;
  if (!a.data.blockedOnce) {
    a.data.blockedOnce = true;
    if (a.ab.shieldOnBlock) { t.status.shield = 4; t.shieldHp = Math.max(t.shieldHp, a.ab.shieldOnBlock); w.emit({ type: 'shield', m: t, x: t.x, y: t.y }); }
  }
  if (!o.dot) w.emit({ type: 'block', m: t, src, x: t.x, y: t.y });
  if (!o.dot && !o.proj && !o.counter && src && src.alive && src !== t && Math.hypot(src.x - t.x, src.y - t.y) < src.r + t.r + SIG.guard.counterReach) counter(w, t, src);
}

// Projétil batendo no casco: volta contra quem atirou (fogo vira água ao bater no casco molhado).
export function reflect(w, p, m) {
  if (p.pierce) { p.dead = true; w.emit({ type: 'block', m, x: p.x, y: p.y }); return; }
  p.team = m.team;
  p.owner = m;
  p.vx = -p.vx; p.vy = -p.vy;
  p.traveled = 0;
  p.range = Math.max(160, p.range * 0.8);
  p.dmg = Math.round(p.dmg * 0.8);
  p.closest = Infinity; p.closestM = null;
  p.level = w.terrain.heightAt(m.x, m.y);
  if ((p.kind === 'ember' || p.kind === 'magma') && m.element === 'water') p.kind = 'waterBolt'; // casco molhado apaga o fogo
  p.reflected = true;
  w.emit({ type: 'reflect', m, x: p.x, y: p.y, kind: p.kind });
  if (isGuarding(m)) blocked(w, m, null, { proj: true });
}

// ───────────── Ilusões de Tinta ─────────────
let nextDecoy = 1;
export function spawnDecoy(w, owner, ang, life = SIG.decoy.life) {
  const sp = owner.def.speed * SIG.decoy.speed;
  const d = {
    id: nextDecoy++, owner, team: owner.team, x: owner.x, y: owner.y, px: owner.x, py: owner.y,
    vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life, max: life, facing: ang, turnT: 0.4,
    shootT: 0.45 + w.rng() * 0.3, atk: 0, // as cópias também atiram (dano baixo) para parecerem de verdade
  };
  w.decoys.push(d);
  w.emit({ type: 'decoy', m: owner, x: d.x, y: d.y, id: d.id });
  // Cada inimigo controlado pela IA pode cair na ilusão e passar a mirar a cópia.
  for (const e of w.enemiesOf(owner)) {
    const b = e.ai;
    if (!b || e.controller) continue;
    if (w.rng() < 0.62 - (b.p?.dodgeSkill ?? 0.6) * 0.4) b.fooled = { owner: owner.id, decoy: d.id };
  }
  return d;
}

export function updateDecoys(w, dt) {
  for (const d of w.decoys) {
    d.px = d.x; d.py = d.y;
    d.life -= dt;
    d.turnT -= dt;
    if (d.turnT <= 0) {
      d.turnT = 0.35 + w.rng() * 0.4;
      const sp = Math.hypot(d.vx, d.vy), ang = Math.atan2(d.vy, d.vx) + (w.rng() - 0.5) * 1.1;
      d.vx = Math.cos(ang) * sp; d.vy = Math.sin(ang) * sp;
    }
    let nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
    const probe = { r: d.owner.r, element: d.owner.element, level: w.terrain.heightAt(d.x, d.y) };
    if (w.blocked(nx, ny, d.owner.r) || !w.standable(probe, nx, ny)) {
      // Desvia como um monstro de verdade: tenta os eixos e, se travar, vira.
      if (!w.blocked(nx, d.y, d.owner.r) && w.standable(probe, nx, d.y)) { ny = d.y; d.vy = -d.vy * 0.5; }
      else if (!w.blocked(d.x, ny, d.owner.r) && w.standable(probe, d.x, ny)) { nx = d.x; d.vx = -d.vx * 0.5; }
      else { nx = d.x; ny = d.y; d.vx = -d.vx; d.vy = -d.vy; }
    }
    d.x = nx; d.y = ny;
    if (Math.abs(d.vx) > 2 && d.atk <= 0) d.facing = Math.atan2(d.vy, d.vx);
    d.atk = Math.max(0, d.atk - dt);
    // Tiro da cópia: bolha fraca no inimigo mais próximo à vista (confunde quem está sendo atacado).
    d.shootT -= dt;
    if (d.shootT <= 0 && d.life > 0.2) {
      d.shootT = 1.1 + w.rng() * 0.3;
      let best = null, bd = 175;
      for (const t of w.enemiesOf(d.owner)) {
        const dd = Math.hypot(t.x - d.x, t.y - d.y);
        if (dd < bd && w.los(d.x, d.y, t.x, t.y)) { bd = dd; best = t; }
      }
      if (best) {
        const ang = Math.atan2(best.y - d.y, best.x - d.x) + (w.rng() - 0.5) * 0.12;
        d.facing = ang; d.atk = 0.25;
        w.spawnProjectile({ kind: 'waterBolt', tag: 'copia', fromDecoy: true, owner: d.owner, ang, speed: 250, r: 3, range: 185, dmg: d.owner.def.sig?.cloneDmg ?? 2.5, x: d.x + Math.cos(ang) * (d.owner.r + 2), y: d.y + Math.sin(ang) * (d.owner.r + 2) - 3, level: w.terrain.heightAt(d.x, d.y) });
      }
    }
    if (d.life <= 0) w.emit({ type: 'decoyFade', x: d.x, y: d.y, m: d.owner });
  }
  w.decoys = w.decoys.filter((d) => d.life > 0 && d.owner.alive && d.owner.onField);
}

export function popDecoy(w, d) {
  if (d.life <= 0) return;
  d.life = 0;
  w.emit({ type: 'decoyPop', x: d.x, y: d.y, m: d.owner });
  w.puffInk(d.x, d.y, 12);
  w.decoys = w.decoys.filter((x) => x !== d);
}

// ───────────── Brotos Sentinela ─────────────
export function plantSentry(w, p) {
  const owner = p.owner;
  if (!owner || !owner.alive) return;
  const kind = p.sentryKind || 'sentry';
  const r = kind === 'ancientSentry' ? 8 : 6;
  let x = p.tx, y = p.ty;
  const free = (px, py) => {
    const i = w.terrain.at(px, py);
    return i >= 0 && !w.terrain.isWater(i) && !w.blocked(px, py, r + 1) && !w.monsters.some((m) => m.alive && Math.hypot(m.x - px, m.y - py) < m.r + r + 2);
  };
  if (!free(x, y)) {
    let ok = false;
    for (let d = 8; d <= 32 && !ok; d += 8) for (let k = 0; k < 8 && !ok; k++) {
      const ang = (k / 8) * Math.PI * 2;
      if (free(x + Math.cos(ang) * d, y + Math.sin(ang) * d)) { x += Math.cos(ang) * d; y += Math.sin(ang) * d; ok = true; }
    }
    if (!ok) { w.emit({ type: 'wither', x, y }); return; }
  }
  // No máximo duas por dono: a mais antiga murcha.
  const mine = w.obstacles.filter((o) => o.owner === owner && !o.destroyed && o.sentry);
  while (mine.length >= SIG.sentry.max) { const old = mine.shift(); old.life = Math.min(old.life, 0.01); }
  const o = w.addObstacle(kind, x, y, r);
  o.sentry = true; o.owner = owner; o.team = owner.team;
  o.life = p.life || 10;
  o.fireT = 0.8;
  w.emit({ type: 'sentryGrow', x, y, big: kind === 'ancientSentry', o });
  w.sprout(x, y, kind === 'ancientSentry' ? T.THORNS : T.GRASS, owner);
}

export function updateSentry(w, o, dt) {
  const owner = o.owner;
  if (!owner || !owner.alive || !owner.onField) { o.life = Math.min(o.life, 0.4); return; }
  const S = o.def.shot;
  // Raízes conectadas: o dono perto da sentinela se regenera.
  if (Math.hypot(owner.x - o.x, owner.y - o.y) < o.def.healR) w.heal(owner, o.def.heal * dt);
  o.fireT -= dt;
  if (o.fireT > 0) return;
  // Mira automática: a sentinela também cai nas cópias de tinta (alvo mais próximo, real ou falso).
  let best = null, bestD = S.range;
  const cands = [...w.enemiesOf(owner).filter((t) => t.status.cloak <= 0), ...w.decoys.filter((d) => d.team !== owner.team)];
  for (const t of cands) {
    const d = Math.hypot(t.x - o.x, t.y - o.y);
    if (d < bestD && w.los(o.x, o.y - 4, t.x, t.y, { ignore: o })) { best = t; bestD = d; }
  }
  if (!best) { o.fireT = 0.2; return; }
  o.fireT = S.every;
  // Mira com leve antecipação do movimento.
  const lead = bestD / S.speed * 0.7;
  const ang = Math.atan2(best.y + best.vy * lead - (o.y - 4), best.x + best.vx * lead - o.x);
  w.spawnProjectile({ kind: S.kind, owner, ang, speed: S.speed, r: 3, range: S.range + 12, dmg: S.dmg, x: o.x + Math.cos(ang) * (o.r + 2), y: o.y - 4 + Math.sin(ang) * (o.r + 2), fromSentry: true });
  w.emit({ type: 'sentryShot', x: o.x, y: o.y - 4, ang, o });
}

