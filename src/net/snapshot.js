// Protocolo de estado do multiplayer. O SERVIDOR é autoritativo: ele roda a simulação (World) e, a 20 Hz,
// envia snapshots. O cliente nunca simula combate: aplica o snapshot num "mundo espelho" (mesma arena,
// mesmos monstros) e o renderizador desenha esse espelho. Assim todos veem exatamente o mesmo estado.
//
// Snapshot (JSON):
//   mons  – um registro por monstro do roster (vida, forma, status, recargas, posição, ação...); null = sem mudança
//   field – índices dos monstros presentes na arena (em campo ou corpos sumindo)
//   teams – por vaga: monstro em campo, recarga de troca, troca pendente
//   proj, obs, haz, steam – projéteis, obstáculos, perigos e nuvens
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
  const rec = {
    h: r1(m.hp), M: m.maxHp, a: +m.alive, f: +m.onField, d: m.def.key, e: r1(m.energy), ev: +m.evolved,
    st: { burn: r2(m.status.burn), wet: r2(m.status.wet), stun: r2(m.status.stun), invuln: r2(m.status.invuln), root: r2(m.status.root), shield: r2(m.status.shield) },
    cd: Object.fromEntries(Object.entries(m.cd).map(([k, v]) => [k, r2(v)])),
    x: r1(m.x), y: r1(m.y), vx: r1(m.vx), vy: r1(m.vy), fc: r2(m.facing),
    sw: m.switchState || 0, swT: r2(m.switchT), evT: r2(m.evolveT), hf: r2(m.hitFlash), dT: r2(m.deathT),
    sh: r1(m.shieldHp), lv: m.level ?? 1, lf: r2(m.lift), lfM: r2(m.liftMax),
    ai: m.controller ? 'human' : m.ai.state, hum: +!!m.controller,
  };
  if (a) {
    rec.ac = { id: a.ab.id, ph: a.phase, t: r2(a.t), aim: r2(a.aim) };
    if (a.data?.beam) rec.ac.bm = [r1(a.data.beam.ox), r1(a.data.beam.oy), r1(a.data.beam.ex), r1(a.data.beam.ey)];
    if (a.data?.R) rec.ac.R = r1(a.data.R);
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
    else dyn.push([o.kind, r1(o.x), r1(o.y), o.r, o.hp === Infinity ? -1 : r1(o.hp), r1(o.burning), +o.destroyed, o.life === undefined ? -1 : r1(o.life)]);
  });
  const snap = {
    t: 'snap', seq, time: Math.round(world.time * 1000) / 1000,
    over: world.over, winner: world.winner, endTime: world.endTime ?? null,
    mons, field: world.monsters.map((m) => idxOf.get(m)),
    teams: world.teams.map((t) => ({ f: t.field ? idxOf.get(t.field) : -1, c: r2(t.cooldown), p: t.pending ? idxOf.get(t.pending) : -1, s: t.switches })),
    proj: world.projectiles.map((p) => (p.lob
      ? [p.id, p.kind, r1(p.x), r1(p.y), p.team, 1, r1(p.tx), r1(p.ty), r2(p.t), p.flight, r1(p.h), p.radius, +!!p.flat]
      : [p.id, p.kind, r1(p.x), r1(p.y), p.team, 0, r1(p.vx), r1(p.vy), p.r])),
    obs, dyn,
    haz: world.hazards.map((h) => [PH.indexOf(h.phase), r2(h.t)]),
    steam: world.steam.map((s) => [r1(s.x), r1(s.y), r1(s.r), r2(s.density), r2(s.life), +!!s.ink]),
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
    m.px = entering ? r.x : m.x; m.py = entering ? r.y : m.y;
    m.x = r.x; m.y = r.y; m.vx = r.vx; m.vy = r.vy; m.facing = r.fc; m.lookAt = r.fc;
    m.switchState = r.sw || null; m.switchT = r.swT; m.evolveT = r.evT; m.hitFlash = r.hf; m.deathT = r.dT;
    m.shieldHp = r.sh; m.level = r.lv; m.lift = r.lf; m.liftMax = r.lfM || 1;
    m.ai.state = r.ai; m.human = !!r.hum;
    m.action = r.ac ? { ab: ABILITIES[r.ac.id], phase: r.ac.ph, t: r.ac.t, aim: r.ac.aim, hit: new Set(), aimPoint: null, data: { beam: r.ac.bm ? { ox: r.ac.bm[0], oy: r.ac.bm[1], ex: r.ac.bm[2], ey: r.ac.bm[3] } : undefined, R: r.ac.R } } : null;
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
  });
  s.haz.forEach((h, i) => { if (world.hazards[i]) { world.hazards[i].phase = PH[h[0]]; world.hazards[i].t = h[1]; } });
  world.steam = s.steam.map(([x, y, r, density, life, ink]) => ({ x, y, r, density, life, ink: !!ink }));

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
