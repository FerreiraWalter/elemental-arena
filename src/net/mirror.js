import { World } from '../sim/world.js';

// Mundo espelho do cliente: mesma arena e mesmos monstros do servidor, mas NUNCA simulado; só recebe snapshots.
export function createMirror(start) {
  const world = World.match(start.seed, start.rosters, start.you, start.arena, 'normal', {
    sides: start.sides, humans: start.players.map((p) => p.seat), mirror: true,
  });
  return { world, ctx: { projMap: new Map() }, lastSnapAt: 0, prevSnapAt: 0 };
}
