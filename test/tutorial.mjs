// Tutorial do Professor Remendo: as 8 lições podem ser cumpridas só com as entradas do jogador (andar, mirar,
// teclas), a prova final derruba o Boneco Mestre e o tutorial termina.
// node test/tutorial.mjs
import { World } from '../src/sim/world.js';
import { DT } from '../src/config.js';
import { Tutorial, TUTORIAL_TEAM } from '../src/sim/tutorial.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = (w) => { w.step(DT); w.drainEvents(); };
const until = (w, pred, s = 10, each) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; each?.(); step(w); w.input.presses.length = 0; } return pred(); };

function setup() {
  const w = World.training(3, TUTORIAL_TEAM, 'quadra', { dummies: 1, shoot: false, noCd: false });
  const tut = new Tutorial(w);
  until(w, () => w.active && !w.active.switchState, 2);
  return { w, tut };
}
// Passa todas as falas (como o jogador tocando na tela).
const talk = (tut) => { let n = 0; while (tut.talking && !tut.finished && n++ < 50) tut.next(); };
const inp = (w) => w.input;
const moveTo = (w, p) => { const m = w.active, dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1; inp(w).move.x = dx / d; inp(w).move.y = dy / d; };
const stop = (w) => { inp(w).move.x = inp(w).move.y = 0; };
const aim = (w, p) => { inp(w).aim.x = p.x; inp(w).aim.y = p.y; };
const press = (w, slot) => inp(w).presses.push(slot);
const praiseThen = (w, tut) => { assert(tut.phase === 'praise', `esperava elogio, fase ${tut.phase}`); until(w, () => tut.phase !== 'praise', 4); };

test('Começa com o professor falando ao lado do aluno e um boneco de treino', () => {
  const { w, tut } = setup();
  assert(tut.talking && tut.i === 0, 'começa falando na apresentação');
  assert(w.training.dummies.length === 1, 'um boneco');
  assert(!tut.prof.moving, 'professor parado ao lado');
});

test('Lições 1–8 completas só com entradas do jogador, e o tutorial termina com o Boneco Mestre derrubado', () => {
  const { w, tut } = setup();
  talk(tut);
  // 1. Andar pelos 3 círculos.
  assert(tut.lesson.id === 'andar' && tut.phase === 'goal' && tut.marks.length === 3, 'objetivo de andar');
  until(w, () => tut.phase !== 'goal', 20, () => { const mk = tut.marks.find((q) => !q.done); if (mk) moveTo(w, mk); });
  stop(w); praiseThen(w, tut); talk(tut);
  // 2. Tiros no boneco.
  assert(tut.lesson.id === 'tiro', 'lição do tiro');
  until(w, () => tut.phase !== 'goal', 15, () => { aim(w, tut.dummy); press(w, 'primary'); });
  praiseThen(w, tut); talk(tut);
  // 3. Golpe de perto.
  assert(tut.lesson.id === 'golpe', 'lição do golpe');
  until(w, () => tut.phase !== 'goal', 15, () => { const d = tut.dummy, m = w.active; if (Math.hypot(d.x - m.x, d.y - m.y) > 20) moveTo(w, d); else stop(w); aim(w, d); press(w, 'melee'); });
  stop(w); praiseThen(w, tut); talk(tut);
  // 4. Esquiva: só vale com a bolinha perto; cedo demais dá dica.
  assert(tut.lesson.id === 'esquiva' && w.training.opts.shoot, 'boneco atira na esquiva');
  press(w, 'dodge'); step(w); w.input.presses.length = 0;
  assert(tut.tip && tut.n === 0, 'esquiva sem bolinha perto não conta e mostra dica');
  until(w, () => tut.phase !== 'goal', 25, () => {
    const m = w.active, p = w.projectiles.find((q) => !q.dead && q.owner?.dummy && Math.hypot(q.x - m.x, q.y - m.y) < 45);
    if (p) press(w, 'dodge');
  });
  praiseThen(w, tut); talk(tut);
  // 5. Poderes Q, E e F.
  assert(tut.lesson.id === 'poderes' && w.training.opts.noCd, 'recargas instantâneas nos poderes');
  for (const s of ['q', 'e', 'f']) { aim(w, tut.dummy); until(w, () => tut.checks[s], 3, () => press(w, s)); }
  praiseThen(w, tut); talk(tut);
  // 6. Evolução: G funciona já no primeiro quadro do objetivo.
  assert(tut.lesson.id === 'evo', 'lição da evolução');
  press(w, 'evolve');
  until(w, () => tut.phase !== 'goal', 6);
  assert(w.active.evolved, 'evoluiu');
  praiseThen(w, tut);
  assert(tut.lesson.id === 'troca' && tut.dummy.element === 'fire', 'boneco de fogo na lição de troca');
  talk(tut);
  // 7. Troca para a água e acertos no boneco de fogo.
  const hidro = w.teamOf(0).find((m) => m.element === 'water');
  w.requestSwitch(0, hidro);
  until(w, () => tut.phase !== 'goal', 20, () => { const d = tut.dummy, m = w.active; if (!m) return; if (Math.hypot(d.x - m.x, d.y - m.y) > 70) moveTo(w, d); else stop(w); aim(w, d); press(w, 'primary'); });
  stop(w); praiseThen(w, tut);
  assert(tut.lesson.id === 'prova' && tut.dummy.boss && tut.dummy.element === 'neutral', 'Boneco Mestre');
  talk(tut);
  // 8. Prova final: derrubar o Boneco Mestre.
  until(w, () => tut.phase !== 'goal', 90, () => { const d = tut.dummy, m = w.active; if (!d || !m) return; if (Math.hypot(d.x - m.x, d.y - m.y) > 60) moveTo(w, d); else stop(w); aim(w, d); press(w, 'primary'); press(w, 'melee'); press(w, 'q'); });
  assert(tut.boss.hp === 0 && w.training.dummies.length === 0, `Boneco Mestre caiu (vida ${tut.boss.hp})`);
  until(w, () => tut.phase === 'end', 4);
  talk(tut);
  assert(tut.finished, 'tutorial terminou');
});

test('Pular lição avança; pular a última vai para as falas finais', () => {
  const { tut } = setup();
  for (let k = 0; k < 8; k++) tut.skip();
  assert(tut.lesson.id === 'prova', 'chegou na prova');
  tut.skip();
  assert(tut.phase === 'end', 'falas finais');
  tut.skip();
  assert(tut.finished, 'terminou');
});

let fail = 0;
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n        ' + r.err}`); if (!r.ok) fail++; }
console.log(fail ? `\n${fail} teste(s) do tutorial falharam.` : '\nTodos os testes do tutorial passaram.');
process.exit(fail ? 1 : 0);
