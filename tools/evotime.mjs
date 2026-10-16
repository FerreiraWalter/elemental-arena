// Quanto tempo de luta (em campo) cada monstro leva para poder evoluir, em partidas IA × IA.
//   node tools/evotime.mjs [partidas=12]
import { World } from '../src/sim/world.js';
import { ROSTER } from '../src/sim/species.js';
const N = +(process.argv[2] || 12);
const times = [], perLine = {};
let never = 0, mons = 0;
for (let s = 1; s <= N; s++) {
  const pick = (k) => [...ROSTER].sort((a, b) => ((a.length * 7 + s * 13 + k) % 5) - ((b.length * 3 + s * 7) % 5)).slice(0, 3);
  const w = World.match(s * 31, [pick(1), pick(2)], null, ['quadra', 'jardim', 'abismo', 'floresta'][s % 4]);
  const field = new Map(), ready = new Map();
  while (!w.over && w.time < 300) {
    w.step(1 / 60); w.drainEvents();
    for (const m of w.roster) {
      if (m.onField && m.alive && !ready.has(m)) field.set(m, (field.get(m) || 0) + 1 / 60);
      if (m.energy >= 150 && !ready.has(m)) ready.set(m, field.get(m) || 0);
    }
  }
  for (const m of w.roster) {
    if (!field.get(m)) continue;
    mons++;
    if (ready.has(m)) { times.push(ready.get(m)); (perLine[m.line] ||= []).push(ready.get(m)); } else never++;
  }
}
times.sort((a, b) => a - b);
const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1].toFixed(0) + 's' : '—';
console.log(`${mons} monstros que lutaram: ${times.length} encheram a energia (${Math.round(times.length / mons * 100)}%), ${never} nunca`);
console.log(`tempo em campo até poder evoluir: mediana ${med(times)} · 25% ${times[times.length >> 2]?.toFixed(0)}s · 75% ${times[(times.length * 3) >> 2]?.toFixed(0)}s`);
console.log(Object.entries(perLine).map(([k, v]) => `${k} ${med(v)}`).join(' · '));
