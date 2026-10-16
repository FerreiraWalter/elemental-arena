// Teste de navegação por arena: sorteia pontos de partida e de chegada válidos e manda a IA ir até lá
// (A* + steering de verdade, sem combate). Mede regiões desconectadas e trajetos que o A* diz serem
// possíveis mas o monstro não completa (preso em quina, ponte, escada, borda de água...).
//   node tools/navtest.mjs [tentativas=60] [arenas=...] [--where]
import { World } from '../src/sim/world.js';
import { DT, TILE, COLS, ROWS } from '../src/config.js';
import { ARENA_ORDER } from '../src/arenas/index.js';
import { PathGrid } from '../src/ai/path.js';
import { props } from '../src/sim/tiles.js';
import { mulberry32 } from '../src/core/math.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const N = +(args[0] || 60);
const arenas = (args[1] || ARENA_ORDER.join(',')).split(',');
const WHERE = process.argv.includes('--where');
// Corpos de tamanhos e tipos diferentes: pequeno, médio, grande; nadadores e não nadadores.
const BODIES = ['gotapus', 'brasalisco', 'mantifolha', 'brotossauroAncestral', 'hidrocascoAbissal', 'leviapus', 'silvamante'];

export function navRun(arena, key, trials, seed = 1) {
  const rnd = mulberry32(seed * 977 + key.length * 31);
  const res = { arena, key, trials: 0, unreachable: 0, ok: 0, fail: [], slow: 0 };
  for (let t = 0; t < trials; t++) {
    const w = World.match(seed + t, [[key], ['brasalisco']], null, arena);
    const me = w.fieldOf(0), foe = w.fieldOf(1);
    w.monsters = [me]; // sem inimigo: só navegação
    foe.onField = false;
    me.switchState = null;
    const grid = (w.pathGrid ||= new PathGrid(w));
    const swim = me.element === 'water';
    const valid = (x, y) => {
      const i = w.terrain.at(x, y);
      if (i < 0 || w.blocked(x, y, me.r)) return false;
      const p = props(w.terrain.type[i]);
      if (p.deep && !swim) return false;
      return w.standable({ r: me.r, element: me.element, level: w.terrain.height[i] }, x, y);
    };
    const pick = () => { for (let k = 0; k < 400; k++) { const x = 12 + rnd() * (COLS * TILE - 24), y = 12 + rnd() * (ROWS * TILE - 24); if (valid(x, y)) return { x, y }; } return null; };
    const a = pick();
    // Destino: fora de correnteza (o canal empurra de volta quem desacelera) e fora d'água para quem evita água.
    let b = null;
    for (let k = 0; k < 40 && !b; k++) { const c = pick(); if (!c) break; const i = w.terrain.at(c.x, c.y); if (w.terrain.flowX[i] || w.terrain.flowY[i]) continue; if (me.ai.p.waterCost > 0.5 && !swim && props(w.terrain.type[i]).water) continue; b = c; }
    if (!a || !b) continue;
    res.trials++;
    me.x = me.px = a.x; me.y = me.py = a.y; me.level = w.terrain.heightAt(a.x, a.y); me.vx = me.vy = 0;
    const wc = me.ai.p.waterCost; const path = grid.walkable(a.x, a.y, b.x, b.y, swim, wc > 0.5) ? [b] : grid.find(a.x, a.y, b.x, b.y, swim, 1e9, wc);
    if (!path) { res.unreachable++; continue; }
    let L = 0, px = a.x, py = a.y;
    for (const p of path) { L += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
    const brain = me.ai;
    brain.think = () => { brain.mode = 'goto'; brain.goalPt = b; brain.setState('goto'); };
    brain.reactToThreats = () => {};
    brain.thinkT = 0;
    const limit = (L / (me.def.speed * 0.55)) + 4;
    let reached = false;
    for (let k = 0; k < limit / DT; k++) {
      w.step(DT);
      w.drainEvents();
      if (Math.hypot(me.x - b.x, me.y - b.y) < 12) { reached = true; break; }
    }
    if (reached) { res.ok++; if (w.time > L / me.def.speed + 2.5) res.slow++; }
    else res.fail.push({ from: [a.x | 0, a.y | 0], to: [b.x | 0, b.y | 0], at: [me.x | 0, me.y | 0], h: w.terrain.heightAt(me.x, me.y), L: L | 0 });
  }
  return res;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('navtest.mjs')) {
  console.log(`\nNavegação por arena (${N} trajetos por corpo)`);
  console.log('arena      corpo                 válidos  desconectados  chegou  falhou  lento');
  for (const arena of arenas) for (const key of BODIES) {
    const r = navRun(arena, key, N);
    console.log(`${arena.padEnd(10)} ${key.padEnd(22)} ${String(r.trials).padStart(6)}  ${String(r.unreachable).padStart(13)}  ${String(r.ok).padStart(6)}  ${String(r.fail.length).padStart(6)}  ${String(r.slow).padStart(5)}`);
    if (WHERE) for (const f of r.fail.slice(0, 5)) console.log('   falha', JSON.stringify(f));
  }
}
