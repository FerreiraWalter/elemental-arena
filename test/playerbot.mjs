import { matchup } from '../src/ai/coach.js';

// "Jogador" sintético para testes headless: escreve em world.input exatamente como o teclado/mouse fariam
// e troca de monstro pelas mesmas regras do teclado (World.requestSwitch).
export function playerBot(w, tick) {
  const m = w.active;
  const inp = w.input;
  if (!m) return;
  const foes = w.monsters.filter((e) => e.alive && e.onField && e.team !== m.team);
  if (!foes.length) return;
  const f = foes[0];
  const d = Math.hypot(f.x - m.x, f.y - m.y) || 1;
  const ux = (f.x - m.x) / d, uy = (f.y - m.y) / d;
  const radial = d > 90 ? 1 : d < 50 ? -1 : 0;
  const side = Math.sin(w.time * 1.3) > 0 ? 1 : -1;
  inp.aim.x = f.x; inp.aim.y = f.y;
  inp.move.x = ux * radial - uy * side * 0.6;
  inp.move.y = uy * radial + ux * side * 0.6;
  inp.held.primary = true;
  if (tick % 90 === 0) inp.presses.push('q');
  if (tick % 150 === 40) inp.presses.push('e');
  if (tick % 170 === 80) inp.presses.push('f');
  if (tick % 200 === 70) inp.presses.push('dodge');
  if (d < 32) inp.presses.push('melee');
  if (m.canEvolve && d > 60) inp.presses.push('evolve'); // evolui quando está a uma distância segura
  // Troca como um jogador razoável: foge de desvantagem elemental ou salva um monstro muito ferido.
  if (tick % 30 === 0 && w.time - m.enteredAt > 6) {
    const bench = w.teamOf(w.playerTeam).filter((x) => x.alive && !x.onField);
    const bad = matchup(m, f) < 0, low = m.hp / m.maxHp < 0.25;
    if (bench.length && (bad || low)) {
      bench.sort((a, b) => (matchup(b, f) + b.hp / b.maxHp) - (matchup(a, f) + a.hp / a.maxHp));
      const next = bench[0];
      if (matchup(next, f) > matchup(m, f) || (low && next.hp / next.maxHp > 0.5)) w.requestSwitch(w.playerTeam, next);
    }
  }
}
