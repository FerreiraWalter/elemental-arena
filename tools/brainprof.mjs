// Quais partes da IA (Brain) geram os picos de tempo: lutas IA × IA com cada método medido.
import { World } from '../src/sim/world.js';
import { Brain } from '../src/ai/brain.js';
import { ROSTER } from '../src/sim/species.js';
import { PathGrid } from '../src/ai/path.js';
const prof = {};
for (const name of Object.getOwnPropertyNames(Brain.prototype)) {
  const f = Brain.prototype[name];
  if (typeof f !== 'function' || name === 'constructor') continue;
  Brain.prototype[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t; const p = (prof[name] ||= { n: 0, tot: 0, max: 0, over5: 0 }); p.n++; p.tot += d; if (d > p.max) p.max = d; if (d > 5) p.over5++; return r; };
}
for (const name of ['refresh', 'find', 'walkable']) { const f = PathGrid.prototype[name]; PathGrid.prototype[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t; const p = (prof['grid.' + name] ||= { n: 0, tot: 0, max: 0, over5: 0 }); p.n++; p.tot += d; if (d > p.max) p.max = d; if (d > 5) p.over5++; return r; }; }
for (let s = 1; s <= 8; s++) {
  const pick = () => [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3);
  const w = World.match(s, [pick(), pick()], null, ['quadra', 'jardim', 'floresta', 'abismo'][s % 4]);
  while (!w.over && w.time < 150) { w.step(1 / 60); w.drainEvents(); }
}
console.log(Object.entries(prof).sort((a, b) => b[1].max - a[1].max).slice(0, 12).map(([k, p]) => `${k.padEnd(20)} n ${p.n} total ${p.tot.toFixed(0)} ms máx ${p.max.toFixed(1)} ms  >5ms ${p.over5}`).join('\n'));
