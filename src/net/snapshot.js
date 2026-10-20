// Protocolo de estado do multiplayer. O SERVIDOR é autoritativo: ele roda a simulação (World) e, a 20 Hz,
// envia snapshots. O cliente nunca simula combate: aplica o snapshot num "mundo espelho" (mesma arena,
// mesmos monstros) e o renderizador desenha esse espelho. Assim todos veem exatamente o mesmo estado.
//
// Snapshot (JSON):
//   mons  – um registro por monstro do roster (vida, forma, status, recargas, posição, ação...); null = sem mudança
//   field – índices dos monstros presentes na arena (em campo ou corpos sumindo)
//   teams – por vaga: monstro em campo, recarga de troca, troca pendente
//   proj, obs, haz, steam – projéteis, obstáculos, perigos e nuvens
//   zones – solo eletrificado (rastros e Julgamento do Trovão)
//   dec   – ilusões de tinta (cópias do Gotapus); obstáculos dinâmicos incluem sentinelas (lado e dono)
//   terr  – deltas do terreno (fogo, umidade, raízes, tipo, fuligem), quantizados
//   events, feed – eventos visuais/sonoros e mensagens novas desde o snapshot anterior

import { SPECIES } from '../sim/species.js';
import { ABILITIES } from '../sim/abilities.js';
import { Monster } from '../sim/monster.js';

export const SNAP_HZ = 20;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const PH = ['idle', 'warn', 'active'];
const SKIP_EVENTS = new Set(['state', 'steam', 'nearMiss']);

export function makeSyncCtx(world) {
  return { seq: 0, prevTerr: null, lastFeed: world.feedSeq || 0, nInit: world.obstacles.length, prevField: new Set(), projMap: new Map() };
}

// Terreno quantizado em 21 bits por tile: tipo(4) fogo(4) fogoMax(4) molhado(1) raízes(4) fuligem(4).
function terrKey(tr, i) {
  const f = tr.fire[i];
  const fq = f > 0 ? Math.min(15, Math.ceil(f)) : 0;
  const fm = f > 0 ? Math.min(15, Math.ceil(tr.fireMax[i])) : 0;
  return tr.type[i] | (fq << 4) | (fm << 8) | ((tr.wet[i] > 0 ? 1 : 0) << 12) | (Math.min(15, Math.ceil(tr.roots[i] * 2)) << 13) | (Math.min(10, Math.round(tr.soot[i] * 10)) << 17);
}

function monsterRec(m, idxOf) {
  const a = m.action;
  const idxOfId = (id) => { for (const [mm, i] of idxOf) if (mm.id === id) return i; return -1; };
  const rec = {
    h: r1(m.hp), M: m.maxHp, a: +m.alive, f: +m.onField, d: m.def.key, e: r1(m.energy), ev: +m.evolved,
    st: { burn: r2(m.status.burn), wet: r2(m.status.wet), stun: r2(m.status.stun), invuln: r2(m.status.invuln), root: r2(m.status.root), shield: r2(m.status.shield), overheat: r2(m.status.overheat), exhaust: r2(m.status.exhaust), cloak: r2(m.status.cloak), bubble: r2(m.status.bubble), slow: r2(m.status.slow), dr: r2(m.status.dr), regen: r2(m.status.regen), charm: r2(m.status.charm), charmImm: r2(m.status.charmImm) },
    sk: r2(m.slowK || 0), dk: r2(m.drK || 0), vt: m.volt || 0, tr: m.trance || 0, cb: m.charmBy ? (idxOf.get(m.charmBy) ?? -1) : -1,
    ht: r1(m.heat), mo: r1(m.momentum), cg: +m.charged, mk: m.marks.n ? [m.marks.n, idxOfId(m.marks.by)] : 0,
    cd: Object.fromEntries(Object.entries(m.cd).map(([k, v]) => [k, r2(v)])),
    ...(Object.keys(m.ch).length ? { chg: Object.fromEntries(Object.keys(m.ch).map((k) => [k, [m.ch[k], r2(m.rc[k])]])) } : {}),
    x: r1(m.x), y: r1(m.y), vx: r1(m.vx), vy: r1(m.vy), fc: r2(m.facing),
    sw: m.switchState || 0, swT: r2(m.switchT), evT: r2(m.evolveT), hf: r2(m.hitFlash), dT: r2(m.deathT),
    bc: r1(m.breakCd), sh: r1(m.shieldHp), lv: m.level ?? 1, lf: r2(m.lift), lfM: r2(m.liftMax),
    ai: m.controller ? 'human' : m.ai.state, hum: +!!m.controller,
  };
  if (a) {
    rec.ac = { id: a.ab.id, ph: a.phase, t: r2(a.t), aim: r2(a.aim) };
    if (a.data?.beam) rec.ac.bm = [r1(a.data.beam.ox), r1(a.data.beam.oy), r1(a.data.beam.ex), r1(a.data.beam.ey)];
    if (a.data?.R) rec.ac.R = r1(a.data.R);
    if (a.leapDist != null) rec.ac.ld = r1(a.leapDist);
  }
  void idxOf;
  return rec;
}

function eventRec(e, idxOf, world) {
  const out = {};
  for (const k in e) {
    const v = e[k];
    if (v instanceof Monster) out[k] = { $m: idxOf.get(v) };
    else if (v && typeof v === 'object') {
      if (k === 'o' || k === 'obstacle') out[k] = { $o: world.obstacles.indexOf(v) };
      else if (k === 'p') out[k] = { kind: v.kind, x: v.x, y: v.y, vx: v.vx, vy: v.vy, r: v.r, ang: v.ang };
    } else if (typeof v !== 'function' && v !== undefined) out[k] = typeof v === 'number' ? r2(v) : v;
  }
  return out;
}

export function serialize(world, ctx) {
  const seq = ++ctx.seq;
  const idxOf = new Map(world.roster.map((m, i) => [m, i]));
  const benchTick = seq === 1 || seq % 6 === 0;
  const mons = world.roster.map((m) => (benchTick || m.onField || ctx.prevField.has(m) || (!m.alive && m.deathT < 3) ? monsterRec(m, idxOf) : null));
  ctx.prevField = new Set(world.roster.filter((m) => m.onField));
  const tr = world.terrain;
  const terr = [];
  const n = tr.type.length;
  if (!ctx.prevTerr) ctx.prevTerr = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const k = terrKey(tr, i);
    if (k !== ctx.prevTerr[i]) { ctx.prevTerr[i] = k; terr.push(i, k); }
  }
  const obs = [], dyn = [];
  world.obstacles.forEach((o, i) => {
    if (i < ctx.nInit) obs.push([o.hp === Infinity ? -1 : r1(o.hp), r1(o.burning), +o.destroyed, +(o.hitFlash > 0), o.life === undefined ? -1 : r1(o.life)]);
    else dyn.push([o.kind, r1(o.x), r1(o.y), o.r, o.hp === Infinity ? -1 : r1(o.hp), r1(o.burning), +o.destroyed, o.life === undefined ? -1 : r1(o.life), o.team ?? -1, o.owner ? idxOf.get(o.owner) ?? -1 : -1]);
  });
  const snap = {
    t: 'snap', seq, time: Math.round(world.time * 1000) / 1000,
    over: world.over, winner: world.winner, endTime: world.endTime ?? null, el: world.elim.map((e) => [e.side, r2(e.t)]),
    mons, field: world.monsters.map((m) => idxOf.get(m)),
    teams: world.teams.map((t) => ({ f: t.field ? idxOf.get(t.field) : -1, c: r2(t.cooldown), p: t.pending ? idxOf.get(t.pending) : -1, s: t.switches })),
    proj: world.projectiles.map((p) => (p.lob
      ? [p.id, p.kind, r1(p.x), r1(p.y), p.team, 1, r1(p.tx), r1(p.ty), r2(p.t), p.flight, r1(p.h), p.radius, +!!p.flat]
      : [p.id, p.kind, r1(p.x), r1(p.y), p.team, 0, r1(p.vx), r1(p.vy), p.r])),
    obs, dyn,
    haz: world.hazards.map((h) => [PH.indexOf(h.phase), r2(h.t)]),
    steam: world.steam.map((s) => [r1(s.x), r1(s.y), r1(s.r), r2(s.density), r2(s.life), +!!s.ink]),
    zones: world.zones.map((z) => [z.id, r1(z.x), r1(z.y), r1(z.r), r2(z.life), r2(z.max), z.team, +!!z.big, z.kind === 'psy' ? 1 : 0]),
    dec: world.decoys.map((d) => [d.id, idxOf.get(d.owner), r1(d.x), r1(d.y), r2(d.life), r2(d.max), r2(d.facing), r1(d.vx), r1(d.vy), r2(d.atk || 0)]),
    terr,
    feed: world.feed.filter((f) => f.seq > ctx.lastFeed).map((f) => [f.text, f.color]),
    events: world.drainEvents().filter((e) => !SKIP_EVENTS.has(e.type)).map((e) => eventRec(e, idxOf, world)),
  };
  ctx.lastFeed = world.feedSeq || 0;
  return snap;
}

const revive = (v, world) => {
  if (v && typeof v === 'object') {
    if ('$m' in v) return world.roster[v.$m];
    if ('$o' in v) return world.obstacles[v.$o];
  }
  return v;
};

// Aplica um snapshot no mundo espelho. `ctx` guarda o mapa de projéteis (interpolação).
export function applySnapshot(world, s, ctx) {
  ctx.projMap ||= new Map();
  world.time = s.time;
  world.over = s.over;
  world.winner = s.winner;
  if (s.el) world.elim = s.el.map(([side, t]) => ({ side, t }));
  world.endTime = s.endTime ?? world.endTime;
  const tr = world.terrain;
  for (let i = 0; i < s.mons.length; i++) {
    const r = s.mons[i];
    if (!r) continue;
    const m = world.roster[i];
    const entering = r.f && !m.onField;
    const def = SPECIES[r.d];
    if (m.def !== def) {
      m.def = def; m.name = def.name; m.r = def.radius; m.stage = def.stage;
      for (const ab of def.abilities) if (m.cd[ab.id] === undefined) m.cd[ab.id] = 0;
    }
    m.hp = r.h; m.maxHp = r.M; m.alive = !!r.a; m.onField = !!r.f; m.energy = r.e; m.evolved = !!r.ev;
    Object.assign(m.status, r.st);
    m.cd = r.cd;
    if (r.chg) for (const k in r.chg) { m.ch[k] = r.chg[k][0]; m.rc[k] = r.chg[k][1]; }
    m.px = entering ? r.x : m.x; m.py = entering ? r.y : m.y;
    m.x = r.x; m.y = r.y; m.vx = r.vx; m.vy = r.vy; m.facing = r.fc; m.lookAt = r.fc;
    m.switchState = r.sw || null; m.switchT = r.swT; m.evolveT = r.evT; m.hitFlash = r.hf; m.deathT = r.dT;
    m.breakCd = r.bc || 0; m.shieldHp = r.sh; m.level = r.lv; m.lift = r.lf; m.liftMax = r.lfM || 1;
    m.heat = r.ht || 0; m.momentum = r.mo || 0; m.charged = !!r.cg;
    m.slowK = r.sk || 0; m.drK = r.dk || 0; m.volt = r.vt || 0; m.trance = r.tr || 0; m.charmBy = r.cb >= 0 ? world.roster[r.cb] : null;
    if (r.mk) { m.marks.n = r.mk[0]; m.marks.by = world.roster[r.mk[1]]?.id ?? 0; } else m.marks.n = 0;
    m.ai.state = r.ai; m.human = !!r.hum;
    m.action = r.ac ? { ab: ABILITIES[r.ac.id], phase: r.ac.ph, t: r.ac.t, aim: r.ac.aim, hit: new Set(), aimPoint: null, data: { beam: r.ac.bm ? { ox: r.ac.bm[0], oy: r.ac.bm[1], ex: r.ac.bm[2], ey: r.ac.bm[3] } : undefined, R: r.ac.R }, leapDist: r.ac.ld } : null;
  }
  world.monsters = s.field.map((i) => world.roster[i]);
  s.teams.forEach((t, i) => {
    const slot = world.teams[i];
    slot.field = t.f >= 0 ? world.roster[t.f] : null;
    slot.cooldown = t.c;
    slot.pending = t.p >= 0 ? world.roster[t.p] : null;
    slot.switches = t.s;
  });
  const mine = world.playerTeam !== null ? world.teams[world.playerTeam].field : null;
  world.active = mine && mine.alive && mine.onField ? mine : null;

  // Projéteis.
  const next = new Map();
  for (const a of s.proj) {
    const [id, kind, x, y, team, lob] = a;
    let p = ctx.projMap.get(id);
    if (!p) p = { id, kind, team, px: x, py: y, x, y, age: 0 };
    else { p.px = p.x; p.py = p.y; p.x = x; p.y = y; }
    p.lob = !!lob;
    if (lob) { p.tx = a[6]; p.ty = a[7]; p.t = a[8]; p.flight = a[9]; p.h = a[10]; p.radius = a[11]; p.flat = !!a[12]; }
    else { p.vx = a[6]; p.vy = a[7]; p.r = a[8]; }
    next.set(id, p);
  }
  ctx.projMap = next;
  world.projectiles = [...next.values()];

  // Obstáculos (os iniciais por índice; os criados em combate vêm completos).
  s.obs.forEach((o, i) => {
    const ob = world.obstacles[i];
    if (!ob) return;
    ob.hp = o[0] < 0 ? Infinity : o[0]; ob.burning = o[1]; ob.destroyed = !!o[2]; ob.solid = !o[2]; ob.hitFlash = o[3] ? 0.1 : 0;
    if (o[4] >= 0) ob.life = o[4];
  });
  s.dyn.forEach((o, k) => {
    const i = s.obs.length + k;
    let ob = world.obstacles[i];
    if (!ob) ob = world.addObstacle(o[0], o[1], o[2], o[3]);
    ob.hp = o[4] < 0 ? Infinity : o[4]; ob.burning = o[5]; ob.destroyed = !!o[6]; ob.solid = !o[6];
    if (o[7] >= 0) ob.life = o[7];
    if (o[8] >= 0) { ob.team = o[8]; ob.sentry = ob.kind === 'sentry' || ob.kind === 'ancientSentry'; }
    if (o[9] >= 0) ob.owner = world.roster[o[9]];
  });
  // Ilusões de tinta (interpoladas como os projéteis).
  ctx.decMap ||= new Map();
  const decs = new Map();
  for (const [id, oi, x, y, life, max, facing, vx, vy, atk] of s.dec || []) {
    let d = ctx.decMap.get(id);
    if (!d) d = { id, px: x, py: y, x, y };
    else { d.px = d.x; d.py = d.y; d.x = x; d.y = y; }
    d.owner = world.roster[oi]; d.team = d.owner?.team; d.life = life; d.max = max; d.facing = facing; d.vx = vx; d.vy = vy; d.atk = atk || 0;
    decs.set(id, d);
  }
  ctx.decMap = decs;
  world.decoys = [...decs.values()];
  s.haz.forEach((h, i) => { if (world.hazards[i]) { world.hazards[i].phase = PH[h[0]]; world.hazards[i].t = h[1]; } });
  world.steam = s.steam.map(([x, y, r, density, life, ink]) => ({ x, y, r, density, life, ink: !!ink }));
  world.zones = (s.zones || []).map(([id, x, y, r, life, max, team, big, psy]) => ({ id, kind: psy ? 'psy' : 'shock', x, y, r, life, max, team, big: !!big }));

  // Terreno.
  for (let k = 0; k < s.terr.length; k += 2) {
    const i = s.terr[k], key = s.terr[k + 1];
    const type = key & 15, fq = (key >> 4) & 15, fm = (key >> 8) & 15, wet = (key >> 12) & 1, rq = (key >> 13) & 15, sq = (key >> 17) & 15;
    if (tr.type[i] !== type || (tr.wet[i] > 0) !== !!wet || Math.round(tr.soot[i] * 10) !== sq) tr.dirty.add(i);
    tr.type[i] = type;
    tr.fire[i] = fq; tr.fireMax[i] = fm || 1;
    tr.wet[i] = wet ? 1 : 0;
    tr.roots[i] = rq / 2;
    tr.soot[i] = sq / 10;
    if (fq > 0) tr.burning.add(i); else tr.burning.delete(i);
    if (rq > 0) tr.rootSet.add(i); else tr.rootSet.delete(i);
    if (type === 4) tr.scorchedSet.add(i); else tr.scorchedSet.delete(i);
  }

  for (const [text, color] of s.feed) world.feed.push({ text, color, t: world.time });
  while (world.feed.length > 40) world.feed.shift();
  for (const e of s.events) {
    const ev = {};
    for (const k in e) ev[k] = revive(e[k], world);
    world.events.push(ev);
  }
}
