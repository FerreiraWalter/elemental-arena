import { World } from '../sim/world.js';

// Mundo espelho do cliente: mesma arena e mesmos monstros do servidor, mas NUNCA simulado; só recebe snapshots.
// Espectador (torneio): you < 0 → sem vaga própria (câmera e HUD de espectador).
export function createMirror(start) {
  const world = World.match(start.seed, start.rosters, start.you >= 0 ? start.you : null, start.arena, 'normal', {
    sides: start.sides, humans: start.players.filter((p) => !p.bot).map((p) => p.seat), mirror: true,
  });
  return { world, match: start.match ?? 0, ctx: { projMap: new Map() }, lastSnapAt: 0, prevSnapAt: 0 };
}
