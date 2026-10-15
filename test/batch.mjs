// Mede balanceamento: node test/batch.mjs [lutas] [watch|player]
import { World } from '../src/sim/world.js';
import { DT } from '../src/config.js';
import { playerBot } from './playerbot.mjs';

const N = +(process.argv[2] || 40);
const mode = process.argv[3] || 'watch';
let wins = [0, 0, 0], dur = [], ign = 0, dou = 0;
const bySpecies = {};
const t0 = Date.now();
for (let s = 1; s <= N; s++) {
  const w = World.match(s, undefined, mode === 'player' ? 0 : null);
  let tick = 0;
  while (!w.over && w.time < 240) { if (mode === 'player') playerBot(w, tick); w.step(DT); w.drainEvents(); tick++; }
  wins[w.over ? w.winner : 2]++;
  dur.push(w.time);
  ign += w.terrain.stats.ignitions; dou += w.terrain.stats.extinguished;
  for (const m of w.roster) {
    const b = (bySpecies[m.name] ||= { dmg: 0, survived: 0 });
    b.dmg += m.stats.dmgDealt / N;
    if (m.alive) b.survived++;
  }
}
dur.sort((a, b) => a - b);
console.log(`[${mode}] time 0 ${wins[0]} | time 1 ${wins[1]} | timeout ${wins[2]}  duração mediana ${dur[N >> 1].toFixed(1)}s (${dur[0].toFixed(0)}–${dur[N - 1].toFixed(0)})  ignições/luta ${(ign / N).toFixed(0)} apagados/luta ${(dou / N).toFixed(0)}  (${Date.now() - t0}ms)`);
for (const [k, v] of Object.entries(bySpecies)) console.log(`  ${k.padEnd(12)} dano médio ${v.dmg.toFixed(0)}  sobreviveu ${v.survived}x`);
