// Diagnóstico de navegação: roda partidas IA × IA (1v1 e 2v2) e mede monstros presos, tempo sem combate
// e energia de evolução (XP) por minuto, por arena. Reprodutível (seeds fixas).
//   node tools/stuck.mjs [seeds=6] [arenas=quadra,jardim,abismo,floresta] [stage=1|2] [--where]
// Preso = em campo, livre (sem ação, atordoamento, raiz, troca) e querendo andar, mas deslocou < 10 px em 3 s.
// Sem combate = um monstro em campo passa 15 s sem causar nem receber dano.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const WHERE = process.argv.includes('--where');

if (isMainThread) {
  const seeds = +(args[0] || 6);
  const arenas = (args[1] || 'quadra,jardim,abismo,floresta').split(',');
  const stage = +(args[2] || 1);
  const { ROSTER, SPECIES } = await import('../src/sim/species.js');
  const forms = ROSTER.map((k) => (stage === 2 ? SPECIES[k].evolvesTo : k));
  const jobs = [];
  for (const arena of arenas) for (let s = 1; s <= seeds; s++) {
    const pick = (o) => [0, 1, 2].map((k) => forms[(s * 3 + o + k * 2) % forms.length]);
    jobs.push({ arena, seed: s * 17 + 3, mode: '1v1', rosters: [pick(0), pick(1)], sides: [0, 1] });
    jobs.push({ arena, seed: s * 23 + 5, mode: '2v2', rosters: [pick(0), pick(1), pick(2), pick(3)], sides: [0, 0, 1, 1] });
  }
  const n = Math.min(availableParallelism(), 12);
  const chunks = Array.from({ length: n }, (_, k) => jobs.filter((_, q) => q % n === k));
  const t0 = Date.now();
  const res = (await Promise.all(chunks.map((c) => new Promise((ok, bad) => {
    const w = new Worker(new URL(import.meta.url), { workerData: c });
    w.on('message', ok); w.on('error', bad);
  })))).flat();
  console.log(`\nNavegação · ${res.length} partidas · estágio ${stage} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log('arena      modo  partidas  presos(ep)  s-preso/min  sem-combate(ep)  energia/min  duração  spawns-ruins');
  for (const arena of arenas) for (const mode of ['1v1', '2v2']) {
    const r = res.filter((x) => x.arena === arena && x.mode === mode);
    if (!r.length) continue;
    const sum = (f) => r.reduce((a, x) => a + f(x), 0);
    const mins = sum((x) => x.fieldMin);
    console.log(`${arena.padEnd(10)} ${mode}  ${String(r.length).padStart(8)}  ${String(sum((x) => x.stuck.length)).padStart(10)}  ${(sum((x) => x.stuckSec) / mins).toFixed(2).padStart(11)}  ${String(sum((x) => x.drought.length)).padStart(15)}  ${(sum((x) => x.energy) / mins).toFixed(1).padStart(11)}  ${(sum((x) => x.time) / r.length).toFixed(0).padStart(6)}s  ${String(sum((x) => x.badSpawns)).padStart(12)}`);
  }
  if (WHERE) {
    for (const x of res) for (const s of [...x.stuck, ...x.drought].slice(0, 6)) console.log(x.arena, x.mode, x.seed, JSON.stringify(s));
  }
  process.exit(0);
} else {
  const { World } = await import('../src/sim/world.js');
  const { DT } = await import('../src/config.js');
  const { props } = await import('../src/sim/tiles.js');
  const out = [];
  for (const job of workerData) {
    const w = World.match(job.seed, job.rosters, null, job.arena, 'normal', { sides: job.sides });
    const track = new Map();
    let fieldSec = 0, energy = 0, badSpawns = 0;
    const stuck = [], drought = [];
    w._deployHook = true;
    const checkSpawn = (m) => { const i = w.terrain.at(m.x, m.y); if (!w.standable(m, m.x, m.y) || w.blocked(m.x, m.y, m.r * 0.8) || (i >= 0 && props(w.terrain.type[i]).deep && m.element !== 'water')) badSpawns++; };
    const seen = new Set();
    const maxT = 200;
    while (!w.over && w.time < maxT) {
      w.step(DT);
      w.drainEvents();
      for (const m of w.monsters) {
        if (!m.alive || !m.onField) continue;
        const key = m.id + ':' + (m.enteredAt ?? 0);
        if (!seen.has(key)) { seen.add(key); checkSpawn(m); }
      }
      if (w.tick % 30) continue; // amostra a cada 0,5 s
      for (const m of w.monsters) {
        if (!m.alive || !m.onField || m.switchState) continue;
        fieldSec += 0.5;
        let t = track.get(m.id);
        if (!t) { t = { hist: [], lastCombat: w.time, dmg: m.stats.dmgDealt + m.stats.dmgTaken, e: m.energy, stuckT: 0 }; track.set(m.id, t); }
        const dmg = m.stats.dmgDealt + m.stats.dmgTaken;
        if (dmg > t.dmg + 0.5) { t.lastCombat = w.time; t.dmg = dmg; }
        if (m.energy > t.e) energy += m.energy - t.e;
        t.e = m.energy;
        const free = !m.action && !(m.status.stun > 0) && !(m.status.root > 0) && !m.locked && m.move.throttle > 0.5;
        t.hist.push({ t: w.time, x: m.x, y: m.y, free });
        while (t.hist.length && w.time - t.hist[0].t > 3) t.hist.shift();
        const allFree = t.hist.length >= 6 && t.hist.every((h) => h.free);
        const span = t.hist.length ? Math.hypot(m.x - t.hist[0].x, m.y - t.hist[0].y) : 99;
        let maxd = 0; for (const h of t.hist) maxd = Math.max(maxd, Math.hypot(h.x - t.hist[0].x, h.y - t.hist[0].y));
        if (allFree && maxd < 10) {
          if (t.stuckT === 0) {
            const i = w.terrain.at(m.x, m.y);
            const tg = m.ai.target;
            stuck.push({ t: +w.time.toFixed(1), m: m.def.key, x: m.x | 0, y: m.y | 0, h: w.terrain.height[i], tile: props(w.terrain.type[i]).name, st: m.ai.state, mode: m.ai.mode, tg: tg ? `${tg.def.key}@${tg.x | 0},${tg.y | 0}` : null, path: m.ai.path ? m.ai.path.length : null });
          }
          t.stuckT += 0.5;
        } else t.stuckT = 0;
        void span;
        if (w.time - t.lastCombat > 15) {
          const tg = m.ai.target;
          drought.push({ t: +w.time.toFixed(1), m: m.def.key, x: m.x | 0, y: m.y | 0, h: w.terrain.heightAt(m.x, m.y), st: m.ai.state, tg: tg ? `${tg.def.key}@${tg.x | 0},${tg.y | 0} h${w.terrain.heightAt(tg.x, tg.y)}` : null, drought: true });
          t.lastCombat = w.time;
        }
      }
    }
    let stuckSec = 0;
    for (const t of track.values()) void t;
    stuckSec = stuck.length * 3; // cada episódio = ≥ 3 s parado querendo andar
    out.push({ arena: job.arena, mode: job.mode, seed: job.seed, time: w.time, stuck, drought, stuckSec, fieldMin: Math.max(0.01, fieldSec / 60), energy, badSpawns });
  }
  parentPort.postMessage(out);
}
