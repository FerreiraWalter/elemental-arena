// Experimento: efeito da recarga de troca e da vulnerabilidade na entrada sobre o jogo.
// node test/switch-tuning.mjs [seeds]
import { World } from '../src/sim/world.js';
import { DT, SWITCH } from '../src/config.js';
import { playerBot } from './playerbot.mjs';
const N = +(process.argv[2] || 20);
const base = { ...SWITCH };
const configs = [
  { cooldown: 1, entryInvulnerable: false }, { cooldown: 3, entryInvulnerable: false },
  { cooldown: 6, entryInvulnerable: false }, { cooldown: 3, entryInvulnerable: true },
];
// Jogador "abusivo": troca toda vez que o inimigo prepara um ataque, assim que a recarga permite.
function spamBot(w, tick) {
  playerBot(w, tick);
  const m = w.active, f = w.fieldOf(1);
  if (!m || !f?.action || f.action.phase !== 'windup') return;
  const next = w.teamOf(0).find((x) => x.alive && !x.onField);
  if (next) w.requestSwitch(0, next);
}
for (const [label, bot] of [['jogador razoável', playerBot], ['jogador abusivo (troca para fugir)', spamBot]]) {
console.log(`
${label}`);
for (const cfg of configs) {
  Object.assign(SWITCH, base, cfg);
  let switches = 0, dur = 0, entryDmg = 0, entries = 0, saved = 0, savedTry = 0, wins = 0;
  for (let s = 1; s <= N; s++) {
    const w = World.match(s, undefined, 0);
    const hpOut = new Map();
    let tick = 0;
    while (!w.over && w.time < 400) {
      bot(w, tick++);
      const before = new Map(w.monsters.map((m) => [m, m.hp]));
      w.step(DT);
      for (const m of w.monsters) if (m.switchState === 'entering' && before.has(m)) entryDmg += Math.max(0, before.get(m) - m.hp);
      for (const e of w.drainEvents()) {
        if (e.type === 'enter' && e.reason !== 'start') entries++;
        if (e.type === 'recall' && e.m.hp / e.m.maxHp < 0.35) { savedTry++; hpOut.set(e.m, true); }
        if (e.type === 'enter' && hpOut.get(e.m)) { saved++; hpOut.delete(e.m); }
      }
    }
    switches += w.teams[0].switches + w.teams[1].switches;
    dur += w.time;
    if (w.winner === 0) wins++;
  }
  console.log(`recarga ${cfg.cooldown}s, entrada ${cfg.entryInvulnerable ? 'invulnerável' : 'vulnerável'}: ${(switches / N).toFixed(1)} trocas/partida, duração ${(dur / N).toFixed(0)}s, dano na entrada ${(entryDmg / Math.max(1, entries)).toFixed(1)}/entrada, feridos salvos que voltaram ${saved}/${savedTry}, jogador venceu ${wins}/${N}`);
}
}
