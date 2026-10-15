// Partidas IA × IA em cada arena: verifica se terminam, se os monstros se movem e lutam.
// node test/arenas.mjs [seeds]
import { World } from '../src/sim/world.js';
import { ARENA_ORDER } from '../src/arenas/index.js';
const N = +(process.argv[2] || 6);
for (const arena of ARENA_ORDER) {
  let ends = 0, dur = 0, hits = 0, stuckT = 0, wins = [0, 0, 0], evo = 0, ms = 0;
  const t0 = Date.now();
  for (let seed = 1; seed <= N; seed++) {
    const w = World.match(seed, undefined, null, arena);
    let lastHit = 0;
    while (!w.over && w.time < 300) {
      w.step(1 / 60);
      for (const e of w.drainEvents()) {
        if (e.type === 'hit' && !e.dot) { hits++; lastHit = w.time; }
        if (e.type === 'evolveSwap') evo++;
      }
      if (w.time - lastHit > 15) { stuckT++; lastHit = w.time; }
    }
    if (w.over) ends++;
    wins[w.over ? (w.winner < 0 ? 2 : w.winner) : 2]++;
    dur += w.time;
  }
  ms = Date.now() - t0;
  console.log(`${arena.padEnd(9)} terminaram ${ends}/${N}  vitórias ${wins[0]}×${wins[1]} (empates/tempo ${wins[2]})  duração média ${(dur / N).toFixed(0)}s  golpes/luta ${(hits / N).toFixed(0)}  períodos de 15s sem golpe ${stuckT}  evoluções ${evo}  (${ms}ms)`);
}
