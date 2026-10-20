// Brotossauro (ou outra linha) contra todas: % de vitórias em duelos 1×1, com variações por ambiente.
//   LINE=brotossauro SEEDS=3 CLOSE=0.82 PULSE=1 node tools/quick.mjs
import { World } from '../src/sim/world.js';
import { SPECIES, ROSTER } from '../src/sim/species.js';
import { ABILITIES } from '../src/sim/abilities.js';
import { COMBAT, EVOLUTION } from '../src/config.js';
EVOLUTION.threshold = Infinity;
if (process.env.CLOSE) COMBAT.closeMult = +process.env.CLOSE;
if (process.env.PULSE === '0') { ABILITIES.barkGuard.pulse = { radius: 0, heal: 0, shield: 0, shieldTime: 0 }; }
if (process.env.SELF) { for (const k of ['barkGuard', 'ancientBark']) ABILITIES[k].pulse.self = +process.env.SELF; }
if (process.env.HOB) { ABILITIES.barkGuard.healOnBlock = +process.env.HOB; }
const line = process.env.LINE || 'brotossauro', seeds = +(process.env.SEEDS || 3);
const arenas = ['quadra', 'jardim', 'abismo', 'floresta'];
let win = 0, n = 0; const per = {};
for (const o of ROSTER) if (o !== line) for (const arena of arenas) for (let s = 1; s <= seeds; s++) for (const swap of [false, true]) {
  const w = swap ? World.duel(s * 7 + 3, o, line, arena) : World.duel(s * 7 + 3, line, o, arena);
  while (!w.over && w.time < 240) { w.step(1 / 60); w.drainEvents(); }
  const won = w.over && w.winner === (swap ? 1 : 0);
  win += won; n++; per[o] = per[o] || [0, 0]; per[o][0] += won; per[o][1]++;
}
console.log(`${process.env.TAG || ''} ${line}: ${(100 * win / n).toFixed(0)}%  ` + Object.entries(per).map(([k, v]) => `${k.slice(0, 5)} ${(100 * v[0] / v[1]).toFixed(0)}`).join(' · '));
