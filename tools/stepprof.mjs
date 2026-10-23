// Onde o passo da simulação (World.step) gasta tempo nos piores casos: lutas IA × IA, cada parte medida.
import { World } from '../src/sim/world.js';
import { ROSTER } from '../src/sim/species.js';
import * as Sig from '../src/sim/signature.js';
const prof = {};
const wrap = (obj, name, key) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t; const p = (prof[key] ||= { n: 0, tot: 0, max: 0, over3: 0 }); p.n++; p.tot += d; if (d > p.max) p.max = d; if (d > 3) p.over3++; return r; }; };
for (const n of ['step', 'updateTeams', 'updateMonster', 'updateBench', 'resolveCollisions', 'constrainToTerrain', 'updateProjectiles', 'updateObstacles', 'updateRelics', 'checkEnd', 'damage']) wrap(World.prototype, n, 'w.' + n);
const step = World.prototype.step;
let worst = 0;
for (let s = 1; s <= 10; s++) {
  const pick = () => [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3);
  const w = World.match(s, [pick(), pick()], null, ['quadra', 'jardim', 'floresta', 'abismo', 'terra'][s % 5]);
  wrap(w.terrain, 'update', 'terrain.update');
  while (!w.over && w.time < 150) { const t = performance.now(); w.step(1 / 60); w.drainEvents(); worst = Math.max(worst, performance.now() - t); }
}
console.log('pior passo', worst.toFixed(1), 'ms');
console.log(Object.entries(prof).sort((a, b) => b[1].max - a[1].max).map(([k, p]) => `${k.padEnd(22)} n ${p.n} total ${p.tot.toFixed(0)} máx ${p.max.toFixed(1)} >3ms ${p.over3}`).join('\n'));
void Sig; void step;
