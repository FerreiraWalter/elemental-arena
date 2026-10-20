// Custo da simulação 1v1v1v1 (4 jogadores, IA × IA) por arena: ms por quadro de simulação (média, p95, máx) e crescimento de memória.
//   node tools/perf-ffa.mjs [segundos=60]
import { World } from '../src/sim/world.js';
import { DT } from '../src/config.js';
import { ARENA_ORDER } from '../src/arenas/index.js';
const secs = +(process.argv[2] || 60);
const keys = ['brasalisco', 'hidrocasco', 'brotossauro', 'ouriflama', 'gotapus', 'mantifolha', 'pugilar'];
console.log(`\nSimulação 4 jogadores, ${secs}s simulados por arena (orçamento por quadro a 60 Hz: ${(DT * 1000).toFixed(1)} ms)`);
console.log('arena       média ms  p95 ms  máx ms  heap Δ MB  projéteis máx  fim');
for (const arena of ARENA_ORDER) {
  const rosters = [0, 1, 2, 3].map((i) => [0, 1, 2].map((k) => keys[(i * 2 + k) % keys.length]));
  const w = World.match(11, rosters, null, arena, 'normal', { sides: [0, 1, 2, 3] });
  global.gc?.();
  const h0 = process.memoryUsage().heapUsed;
  const ts = []; let pmax = 0;
  for (let i = 0; i < secs * 60 && !w.over; i++) {
    const t0 = performance.now(); w.step(DT); ts.push(performance.now() - t0); w.drainEvents();
    pmax = Math.max(pmax, w.projectiles.length);
  }
  global.gc?.();
  const dh = (process.memoryUsage().heapUsed - h0) / 1048576;
  ts.sort((a, b) => a - b);
  const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
  console.log(`${arena.padEnd(11)} ${avg.toFixed(2).padStart(8)} ${ts[Math.floor(ts.length * 0.95)].toFixed(2).padStart(7)} ${ts[ts.length - 1].toFixed(2).padStart(7)} ${dh.toFixed(1).padStart(10)} ${String(pmax).padStart(14)}  ${w.over ? `terminou em ${w.time.toFixed(0)}s` : 'em andamento'}`);
}
