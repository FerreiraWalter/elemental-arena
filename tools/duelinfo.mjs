// Detalhe de duelos IA × IA: node tools/duelinfo.mjs formaA formaB [arena] [seeds]
import { World } from '../src/sim/world.js';
import { EVOLUTION } from '../src/config.js';
EVOLUTION.threshold = Infinity;
const [a, b, arena = 'quadra', n = 4] = process.argv.slice(2);
for (let s = 1; s <= +n; s++) {
  const w = World.duel(s * 11, a, b, arena);
  while (!w.over && w.time < 240) { w.step(1 / 60); w.drainEvents(); }
  const [A, B] = w.roster;
  const fmt = (m) => `${m.def.key} hp ${m.hp.toFixed(0)}/${m.maxHp} dealt ${m.stats.dmgDealt.toFixed(0)} casts ${m.stats.casts} evaded ${m.stats.evaded} dodges ${m.stats.dodges} | ` + Object.entries(m.stats.bySource || {}).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ');
  console.log(`seed ${s * 11}: vencedor ${w.winner} em ${w.time.toFixed(0)}s\n  A ${fmt(A)}\n  B ${fmt(B)}`);
}
