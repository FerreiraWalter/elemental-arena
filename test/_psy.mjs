import { World } from '../src/sim/world.js';
import { DT } from '../src/config.js';
const w = World.match(1, [['sapomental', 'hidrocasco', 'brotossauro'], ['brasalisco', 'hidrocasco', 'brotossauro']], null, 'quadra');
let ev = {};
while (!w.over && w.time < 200) { w.step(DT); for (const e of w.drainEvents()) ev[e.type] = (ev[e.type] || 0) + 1; }
console.log('over', w.over, 'winner', w.winner, 't', w.time.toFixed(0));
for (const k of ['hypnotized', 'trance', 'tongue', 'mindSwap', 'spiral', 'orbs', 'psyBlock', 'astralStart', 'astralReturn']) console.log(k, ev[k] || 0);
const s = w.roster.find((m) => m.line === 'sapomental' || m.def.line === 'sapomental');
console.log(s.name, 'dmg', Math.round(s.stats.dmgDealt), JSON.stringify(s.stats.bySource || {}));
