// Matriz de equilíbrio entre linhas (IA × IA), em paralelo, com origem do dano.
//   node tools/balance.mjs [seeds=8] [stage=1|2] [arenas=quadra,jardim,abismo,floresta]
// Mostra: % de vitórias de cada linha contra cada outra, % geral por linha e de onde vem o dano
// (golpes diretos, queimadura, chão em chamas, espinhos...).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

if (isMainThread) {
  const seeds = +(process.argv[2] || 8);
  const stage = +(process.argv[3] || 1);
  const arenas = (process.argv[4] || 'quadra,jardim,abismo,floresta').split(',');
  const { SPECIES, ROSTER } = await import('../src/sim/species.js');
  const forms = ROSTER.map((k) => (stage === 2 ? SPECIES[k].evolvesTo : k));
  const jobs = [];
  for (let i = 0; i < forms.length; i++) for (let j = i + 1; j < forms.length; j++) for (const arena of arenas) for (let s = 1; s <= seeds; s++) {
    jobs.push({ a: forms[i], b: forms[j], arena, seed: s * 7 + i * 31 + j * 131, swap: false });
    jobs.push({ a: forms[j], b: forms[i], arena, seed: s * 7 + i * 31 + j * 131, swap: true });
  }
  const t0 = Date.now();
  const n = Math.min(availableParallelism(), 12);
  const chunks = Array.from({ length: n }, (_, k) => jobs.filter((_, q) => q % n === k));
  const results = (await Promise.all(chunks.map((c) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: c });
    w.on('message', res); w.on('error', rej);
  })))).flat();
  const win = {}, games = {}, dur = [], src = {}, taken = {};
  for (const r of results) {
    const k = r.a + '|' + r.b;
    games[k] = (games[k] || 0) + 1;
    if (r.winner === 0) win[k] = (win[k] || 0) + 1;
    else if (r.winner === -1 || r.winner === null) win[k] = (win[k] || 0) + 0.5;
    dur.push(r.time);
    for (const [tag, v] of Object.entries(r.src)) src[tag] = (src[tag] || 0) + v;
    for (const [who, v] of Object.entries(r.taken)) { taken[who] ||= {}; for (const [tag, x] of Object.entries(v)) taken[who][tag] = (taken[who][tag] || 0) + x; }
  }
  const short = (k) => SPECIES[k].name.split(' ')[0].slice(0, 10);
  console.log(`\nEstágio ${stage} · ${seeds} seeds × ${arenas.length} arenas × 2 lados (${results.length} lutas, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  console.log('linha × coluna = % de vitórias da linha');
  console.log(''.padEnd(11) + forms.map((f) => short(f).padStart(11)).join(''));
  const total = {};
  for (const a of forms) {
    let row = short(a).padEnd(11), w = 0, g = 0;
    for (const b of forms) {
      if (a === b) { row += '—'.padStart(11); continue; }
      const ab = (win[a + '|' + b] || 0) + ((games[b + '|' + a] || 0) - (win[b + '|' + a] || 0));
      const gg = (games[a + '|' + b] || 0) + (games[b + '|' + a] || 0);
      row += `${Math.round((ab / gg) * 100)}%`.padStart(11);
      w += ab; g += gg;
    }
    total[a] = w / g;
    console.log(row + `   geral ${Math.round((w / g) * 100)}%`);
  }
  dur.sort((x, y) => x - y);
  console.log(`duração mediana ${dur[dur.length >> 1].toFixed(0)}s · timeouts ${dur.filter((d) => d >= 239).length}`);
  const elem = { fire: 0, water: 0, plant: 0 };
  for (const f of forms) elem[SPECIES[f].element] += total[f] / 2;
  console.log(`por elemento: fogo ${Math.round(elem.fire * 100)}% · água ${Math.round(elem.water * 100)}% · planta ${Math.round(elem.plant * 100)}%`);
  console.log('\nDano RECEBIDO por espécie, por origem (média por luta em que lutou):');
  for (const f of forms) {
    const t = taken[f] || {};
    const g = results.filter((r) => r.a === f || r.b === f).length;
    const tot = Object.values(t).reduce((x, y) => x + y, 0);
    const top = Object.entries(t).sort((x, y) => y[1] - x[1]).slice(0, 7).map(([k, v]) => `${k} ${(v / g).toFixed(0)}`).join(' · ');
    console.log(`  ${short(f).padEnd(11)} total ${(tot / g).toFixed(0).padStart(4)}  ← ${top}`);
  }
  process.exit(0);
} else {
  const { World } = await import('../src/sim/world.js');
  const { EVOLUTION } = await import('../src/config.js');
  EVOLUTION.threshold = Infinity; // formas fixas: mede cada forma isoladamente
  const out = [];
  for (const job of workerData) {
    const w = World.duel(job.seed, job.a, job.b, job.arena);
    const src = {}, taken = {};
    const orig = w.damage.bind(w);
    w.damage = (t, amount, s, o = {}) => {
      const dmg = orig(t, amount, s, o);
      if (dmg > 0) {
        let tag = o.tag || s?.action?.ab.id || null;
        if (!s) tag = o.dot && (o.element === 'fire') ? (o.burn ? 'chão em chamas' : 'queimadura') : (o.tag || 'ambiente');
        if (!tag) tag = 'outro';
        src[tag] = (src[tag] || 0) + dmg;
        const who = t.def.key;
        taken[who] ||= {}; taken[who][tag] = (taken[who][tag] || 0) + dmg;
      }
      return dmg;
    };
    while (!w.over && w.time < 240) { w.step(1 / 60); w.drainEvents(); }
    // winner é o LADO; o lado 0 é job.a.
    out.push({ a: job.a, b: job.b, arena: job.arena, winner: w.over ? w.winner : null, time: w.time, src, taken });
  }
  parentPort.postMessage(out);
}
