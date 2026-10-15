// Teste de aceitação do combate em tempo real (headless, determinístico por seed).
// Partidas 1×1 com times de 3: o time 0 é controlado por um "jogador" sintético (test/playerbot.mjs) que envia
// as mesmas entradas do teclado/mouse e troca de monstro; o time 1 é a IA. Uso: node test/acceptance.mjs [lutas]
// Os cenários específicos de troca estão em test/switching.mjs.
import { World } from '../src/sim/world.js';
import { DT } from '../src/config.js';
import { playerBot } from './playerbot.mjs';
import { ARENA_ORDER } from '../src/arenas/index.js';

const N = +(process.argv[2] || 20);
const runs = [];
const t0 = Date.now();

for (let seed = 1; seed <= N; seed++) {
  const w = World.match(seed, undefined, 0, ARENA_ORDER[(seed - 1) % ARENA_ORDER.length]); // alterna entre as arenas
  const r = {
    seed, ticks: 0, bothActive: 0, castWindows: new Map(), events: {}, castsSeq: [], hazardEpisodes: [], escapeEntries: 0,
    castsAfterEnd: 0, playerCasts: 0, enemyCastsDuringPlayerSwitch: 0, playerSwitchTicks: 0, enemyMoveDuringPlayerSwitch: 0,
    alliedOverlap: 0, offFieldCasts: 0,
  };
  const onFire = new Map();
  let endT = null, tick = 0;
  while (w.time < 300 && (endT === null || w.time < endT + 3)) {
    if (!w.over) playerBot(w, tick);
    w.step(DT);
    tick++;
    r.ticks++;
    const acting = w.monsters.filter((m) => m.alive && (Math.hypot(m.vx, m.vy) > 5 || m.action));
    if (acting.length === 2) r.bothActive++;
    for (const team of [0, 1]) if (w.monsters.filter((m) => m.team === team && m.alive).length > 1) r.alliedOverlap++;
    // Enquanto o monstro do jogador troca, a IA inimiga continua agindo (sem pausa).
    const mine = w.fieldOf(0);
    const foeNow = w.fieldOf(1);
    if (mine?.switchState && foeNow?.alive && !foeNow.switchState) {
      r.playerSwitchTicks++;
      if (Math.hypot(foeNow.vx, foeNow.vy) > 5 || foeNow.action) r.enemyMoveDuringPlayerSwitch++;
    }
    for (const m of w.monsters) {
      if (!m.alive) continue;
      if (m.element !== 'fire' && m !== w.active) {
        const burning = w.terrain.fire[w.terrain.at(m.x, m.y)] > 0;
        if (burning) onFire.set(m.id, (onFire.get(m.id) || 0) + DT);
        else if (onFire.has(m.id)) { r.hazardEpisodes.push(onFire.get(m.id)); onFire.delete(m.id); }
      }
    }
    for (const e of w.drainEvents()) {
      r.events[e.type] = (r.events[e.type] || 0) + 1;
      if (e.type === 'cast') {
        if (endT !== null) r.castsAfterEnd++;
        const win = Math.floor(w.time / 5);
        const s = r.castWindows.get(win) || new Set();
        s.add(e.m.team);
        r.castWindows.set(win, s);
        r.castsSeq.push(`${e.m.id}${e.ab}@${w.time.toFixed(1)}`);
        if (e.m.team === 0) r.playerCasts++;
        if (e.m.team === 1 && mine?.switchState) r.enemyCastsDuringPlayerSwitch++;
        if (!e.m.onField || e.m.switchState) r.offFieldCasts++;
      }
      if (e.type === 'state' && e.state === 'escapeHazard' && e.m.element !== 'fire') r.escapeEntries++;
      if (e.type === 'matchEnd') endT = w.time;
    }
  }
  r.over = w.over;
  r.winner = w.winner;
  r.duration = w.endTime ?? w.time;
  r.losersDead = w.over && w.roster.filter((m) => m.team !== w.winner).every((m) => !m.alive && m.hp <= 0);
  r.fireIgnites = w.roster.filter((m) => m.element === 'fire').reduce((a, m) => a + m.stats.ignites, 0);
  r.waterDouses = w.roster.filter((m) => m.element === 'water').reduce((a, m) => a + m.stats.douses, 0);
  r.grown = w.roster.reduce((a, m) => a + (m.stats.grown || 0), 0);
  r.terrain = { ...w.terrain.stats };
  r.evaded = w.roster.reduce((a, m) => a + m.stats.evaded, 0);
  r.switches = [w.teams[0].switches, w.teams[1].switches];
  runs.push(r);
}
const ms = Date.now() - t0;
const sum = (f) => runs.reduce((a, r) => a + f(r), 0);
const ev = (k) => sum((r) => r.events[k] || 0);
const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[s.length >> 1] ?? 0; };

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

const both1 = sum((r) => r.bothActive) / sum((r) => r.ticks);
check('1. Os dois monstros em campo se movem e atacam ao mesmo tempo (1×1)', both1 > 0.6 && sum((r) => r.alliedOverlap) === 0,
  `${(both1 * 100).toFixed(0)}% dos ticks com os dois em ação; ${sum((r) => r.alliedOverlap)} ticks com 2 aliados em campo; ${ev('cast')} habilidades usadas`);

const windows = runs.flatMap((r) => [...r.castWindows.values()]);
const both = windows.filter((s) => s.size === 2).length / windows.length;
check('2. Sem turnos: os dois times atacam continuamente', both > 0.8,
  `${(both * 100).toFixed(0)}% das janelas de 5s têm ataques dos DOIS times`);

check('3. Projéteis viajam e colidem', ev('shoot') > 0 && ev('impact') > 0 && ev('hit') > 0 && ev('clash') > 0,
  `${ev('shoot')} disparos, ${ev('impact')} impactos, ${ev('clash')} choques fogo×água viraram vapor, ${ev('rootsErupt')} raízes brotaram`);

check('4. Esquivas e reposicionamento diante de ameaças', ev('dodge') > 0 && sum((r) => r.evaded) > 0 && ev('nearMiss') > 0,
  `${ev('dodge')} esquivas, ${sum((r) => r.evaded)} ataques anulados por invulnerabilidade, ${ev('nearMiss')} projéteis que passaram raspando`);

check('5. Ataques elementais mudam o ambiente', sum((r) => r.fireIgnites) > 0 && sum((r) => r.waterDouses) > 0 && sum((r) => r.grown) > 0 && ev('rooted') > 0,
  `${sum((r) => r.terrain.ignitions)} tiles incendiados, ${sum((r) => r.terrain.extinguished)} apagados, ${sum((r) => r.grown)} tiles de grama crescidos, ${ev('rooted')} monstros enraizados, ${ev('obstacleBreak')} obstáculos destruídos`);

const episodes = runs.flatMap((r) => r.hazardEpisodes);
check('6. IA reage a perigos do ambiente', med(episodes) < 0.6 && sum((r) => r.escapeEntries) > 0,
  `monstros de água/planta (IA) ficam ${med(episodes).toFixed(2)}s (mediana) sobre chamas por episódio; ${sum((r) => r.escapeEntries)} fugas de perigo`);

const keepMoving = sum((r) => r.enemyMoveDuringPlayerSwitch) / Math.max(1, sum((r) => r.playerSwitchTicks));
check('7. Trocas em tempo real: o inimigo não pausa e só um monstro por time age', sum((r) => r.playerCasts) > 0 && keepMoving > 0.5 && sum((r) => r.offFieldCasts) === 0 && sum((r) => r.switches[0]) > 0 && sum((r) => r.switches[1]) > 0,
  `jogador trocou ${sum((r) => r.switches[0])}x e a IA ${sum((r) => r.switches[1])}x; durante as trocas do jogador a IA seguiu agindo ${(keepMoving * 100).toFixed(0)}% do tempo e usou ${sum((r) => r.enemyCastsDuringPlayerSwitch)} habilidades; ${sum((r) => r.offFieldCasts)} habilidades usadas fora de campo`);

const ended = runs.filter((r) => r.over && r.losersDead && r.castsAfterEnd === 0);
check('8. Monstros podem ser derrotados e a partida termina', ended.length === N,
  `${ended.length}/${N} partidas terminaram com os 3 monstros do perdedor derrotados; ${ev('enter')} entradas em campo; nenhuma habilidade após o fim`);

const seqs = new Set(runs.map((r) => r.castsSeq.join(',')));
const durs = runs.map((r) => r.duration);
const wins = [runs.filter((r) => r.winner === 0).length, runs.filter((r) => r.winner === 1).length];
check('9. Sem sequências roteirizadas (resultado emerge do sistema)', seqs.size === N && wins[0] > 0 && wins[1] > 0,
  `${seqs.size}/${N} sequências de combate distintas; vitórias time do jogador ${wins[0]} × IA ${wins[1]}; duração ${Math.min(...durs).toFixed(0)}–${Math.max(...durs).toFixed(0)}s`);

console.log(`\nTeste de aceitação — ${N} partidas 1×1 (times de 3) com jogador sintético em ${ms}ms (${((sum((r) => r.ticks) / ms) * 1000 / 60).toFixed(0)}x tempo real)\n`);
for (const c of checks) console.log(`${c.ok ? '[OK] ' : '[FALHOU]'} ${c.name}\n       ${c.detail}`);
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} critério(s) falharam.` : '\nTodos os critérios passaram.');
process.exit(failed.length ? 1 : 0);
