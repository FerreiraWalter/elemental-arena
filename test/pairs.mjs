// Balanceamento 1×1 entre formas, nas duas posições de time: node test/pairs.mjs [seeds] [--evolve]
// Por padrão as formas ficam fixas (sem evoluir no meio do duelo) para medir cada forma isoladamente.
import { World } from '../src/sim/world.js';
import { SPECIES } from '../src/sim/species.js';
import { EVOLUTION } from '../src/config.js';
const N = +(process.argv[2] || 20);
if (!process.argv.includes('--evolve')) EVOLUTION.threshold = Infinity;
const keys = Object.keys(SPECIES);
const stage = (k) => SPECIES[k].stage;
const filt = process.argv[3];
for (const a of keys) for (const b of keys) {
  if (filt && !(a.includes(filt) || b.includes(filt))) continue;
  if (a >= b || SPECIES[a].line === SPECIES[b].line || stage(a) !== stage(b)) continue;
  let wa = 0, games = 0, dur = 0;
  for (let s = 1; s <= N; s++) for (const [x, y, me] of [[a, b, 0], [b, a, 1]]) {
    const w = World.duel(s, x, y);
    while (!w.over && w.time < 240) { w.step(1 / 60); w.drainEvents(); }
    games++; dur += w.time;
    if (w.winner === me) wa++;
  }
  console.log(`[estágio ${stage(a)}] ${a} × ${b}: ${a} vence ${wa}/${games} (duração média ${(dur / games).toFixed(0)}s)`);
}
