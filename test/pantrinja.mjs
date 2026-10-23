// Pantrinja → Kagepantera (Sombra): Sombra Viva (lançar e ir até ela com F de novo), shuriken bumerangue (vai e volta,
// imitada pela sombra, com a regra do segundo acerto), crítico pelas costas e saindo da camuflagem, Rastro Invisível, Sombra Assassina, Noite
// Eterna e sincronização online das sombras.
// node test/pantrinja.mjs
import { World } from '../src/sim/world.js';
import { DT, EVOLUTION, ELEMENT_MULT } from '../src/config.js';
import { SPECIES, ROSTER } from '../src/sim/species.js';
import { PlayerController } from '../src/control/player.js';
import * as Shadow from '../src/sim/shadow.js';
import { serialize, makeSyncCtx, applySnapshot } from '../src/net/snapshot.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };
const until = (w, pred, s = 5) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };

// Pantera (vaga 0) contra um alvo parado, num chão aberto.
function setup(foe = 'hidrocasco', { gap = 80, evolved = false } = {}) {
  const w = World.match(5, [['pantrinja', 'hidrocasco', 'brotossauro'], [foe, 'brasalisco', 'raiolua']], 0, 'quadra');
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  const A = w.fieldOf(0), B = w.fieldOf(1);
  A.controller = null; w.humans.clear();
  until(w, () => w.monsters.every((m) => !m.switchState), 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 300, o.y - 250) < 220) { o.destroyed = true; o.solid = false; }
  if (evolved) { A.energy = EVOLUTION.threshold; w.requestEvolve(A); until(w, () => A.evolved && A.evolveT <= 0, 3); }
  A.x = A.px = 250; A.y = A.py = 250; A.facing = 0;
  B.x = B.px = 250 + gap; B.y = B.py = 250; B.kx = B.ky = 0; B.hp = B.maxHp; B.facing = Math.PI; for (const s in B.status) B.status[s] = 0;
  for (const m of w.monsters) m.level = w.terrain.heightAt(m.x, m.y);
  for (const k in A.cd) A.cd[k] = 0;
  return { w, A, B };
}
const cast = (w, m, id, aimPoint, extra = {}) => m.cast(w, m.ability(id), { aim: Math.atan2(aimPoint.y - m.y, aimPoint.x - m.x), dir: 0, aimPoint, point: aimPoint, ...extra });
const idle = (w, m) => until(w, () => !m.action, 2);

test('Pantrinja está no elenco, é do elemento Sombra e evolui para a Kagepantera', () => {
  assert(ROSTER.includes('pantrinja'), 'fora do elenco');
  const b = SPECIES.pantrinja, e = SPECIES.kagepantera;
  assert(b.element === 'dark' && e.element === 'dark' && b.evolvesTo === 'kagepantera', 'elemento/evolução');
  assert(b.controls.f === 'livingShadow' && e.controls.f === 'assassinShadow', 'F é a sombra');
  assert(ELEMENT_MULT.dark.psychic > 1 && ELEMENT_MULT.fire.dark > 1 && ELEMENT_MULT.psychic.dark < 1, 'triângulo da sombra');
});

test('Sombra Viva: voa até o ponto mirado, fica no chão e some sozinha', () => {
  const { w, A } = setup();
  assert(cast(w, A, 'livingShadow', { x: 250, y: 130 }), 'não lançou');
  until(w, () => w.shadows.length && !w.shadows[0].moving, 1);
  const s = w.shadows[0];
  assert(s && Math.hypot(s.x - 250, s.y - 130) < 4, `sombra fora do ponto (${s?.x}, ${s?.y})`);
  step(w, Shadow.SHADOW.life + 0.5);
  assert(!w.shadows.length, 'a sombra não sumiu');
});

test('F de novo (jogador) leva a pantera até a sombra, sem gastar outra recarga, e camufla', () => {
  const { w, A } = setup();
  w.humans.add(0); A.controller = new PlayerController(A, w, w.inputs[0]);
  w.inputs[0].aim = { x: 250, y: 140 };
  w.inputs[0].presses.push('f');
  until(w, () => w.shadows.length && !w.shadows[0].moving, 1.5);
  const cd = A.cd.livingShadow;
  idle(w, A);
  const sx = w.shadows[0].x, sy = w.shadows[0].y;
  w.inputs[0].presses.push('f');
  step(w, 0.05);
  assert(Math.hypot(A.x - sx, A.y - sy) < 3, `não foi até a sombra (${A.x.toFixed(0)}, ${A.y.toFixed(0)})`);
  assert(!w.shadows.length, 'a sombra continuou no chão');
  assert(A.status.cloak > 0, 'não camuflou ao chegar');
  assert(A.cd.livingShadow <= cd, 'ir até a sombra gastou outra recarga');
});

test('Q: a shuriken bumerangue vai, volta para a mão e acerta na ida e na volta; o básico não volta', () => {
  const { w, A, B } = setup('hidrocasco', { gap: 100 });
  let hits = 0, caught = false;
  const emit = w.emit.bind(w); w.emit = (e) => { if (e.type === 'hit' && e.m === B && !e.dot) hits++; if (e.type === 'fuumaCatch') caught = true; emit(e); };
  assert(cast(w, A, 'shadowFan', { x: B.x, y: B.y }), 'Q não saiu');
  until(w, () => caught, 3);
  assert(caught, 'a shuriken não voltou para a mão');
  assert(hits === 2, `esperava 2 acertos (ida e volta), foram ${hits}`);
  const b = setup('hidrocasco', { gap: 100 });
  assert(cast(b.w, b.A, 'shuriken', { x: b.B.x, y: b.B.y }), 'básico não saiu');
  step(b.w, 0.15);
  assert(b.w.projectiles.some((p) => p.kind === 'shuriken' && !p.boomerang), 'o básico deveria ser shuriken que não volta');
});

test('Q com a sombra no chão: ela lança outra; o segundo acerto do mesmo golpe no mesmo alvo causa metade', () => {
  const { w, A, B } = setup('hidrocasco', { gap: 90 });
  cast(w, A, 'livingShadow', { x: 340, y: 160 });
  until(w, () => w.shadows.length && !w.shadows[0].moving, 1);
  idle(w, A);
  assert(cast(w, A, 'shadowFan', { x: B.x, y: B.y }), 'Q não saiu');
  step(w, 0.2);
  assert(w.projectiles.filter((p) => p.kind === 'fuuma').length === 2, 'a sombra não lançou a shuriken dela');
  const t = B; t.hp = t.maxHp; for (const s in t.status) t.status[s] = 0;
  const d1 = Shadow.hitFrom(w, A, t, 10, { element: 'dark', castId: 999, proj: true });
  const d2 = Shadow.hitFrom(w, A, t, 10, { element: 'dark', castId: 999, proj: true, fromShadow: true });
  assert(Math.abs(d2 - d1 * Shadow.SHADOW.mirrorK) < 0.01, `segundo acerto ${d2.toFixed(2)} × primeiro ${d1.toFixed(2)}`);
});

test('Garra pelas costas é crítica; de frente não', () => {
  const front = setup('hidrocasco', { gap: 24 });
  front.B.facing = Math.PI; // olhando para a pantera
  cast(front.w, front.A, 'furtiveClaw', { x: front.B.x, y: front.B.y });
  until(front.w, () => front.B.hp < front.B.maxHp, 0.5);
  const dFront = front.B.maxHp - front.B.hp;
  const back = setup('hidrocasco', { gap: 24 });
  back.B.facing = 0; // de costas para a pantera
  back.B.controller = { update() { back.B.facing = 0; } };
  cast(back.w, back.A, 'furtiveClaw', { x: back.B.x, y: back.B.y });
  until(back.w, () => back.B.hp < back.B.maxHp, 0.5);
  const dBack = back.B.maxHp - back.B.hp;
  assert(dFront > 0 && dBack > dFront * 1.15, `de frente ${dFront.toFixed(1)}, pelas costas ${dBack.toFixed(1)}`);
});

test('Rastro Invisível: a esquiva camufla e o ataque que sai da camuflagem é emboscada (crítico)', () => {
  const { w, A, B } = setup('hidrocasco', { gap: 120 });
  assert(cast(w, A, 'shadowStep', { x: 250, y: 200 }), 'esquiva não saiu');
  until(w, () => !A.action || A.action.phase === 'recovery', 1);
  step(w, 0.02);
  assert(A.status.cloak > 0, 'não camuflou depois da esquiva');
  idle(w, A);
  let crit = false;
  const emit = w.emit.bind(w); w.emit = (e) => { if (e.type === 'shadowCrit' && e.ambush) crit = true; emit(e); };
  cast(w, A, 'shuriken', { x: B.x, y: B.y });
  until(w, () => B.hp < B.maxHp, 1);
  assert(crit, 'o tiro saindo da camuflagem não foi emboscada');
});

test('Sombra Assassina: chegar na sombra corta quem está em volta', () => {
  const { w, A, B } = setup('hidrocasco', { gap: 140, evolved: true });
  assert(A.def.key === 'kagepantera', 'não evoluiu');
  A.controller = { update() {} }; // sem a IA decidir ir até a sombra sozinha
  cast(w, A, 'assassinShadow', { x: B.x - 16, y: B.y });
  until(w, () => w.shadows.length && !w.shadows[0].moving, 1);
  idle(w, A);
  const hp = B.hp;
  assert(Shadow.swap(w, A), 'não foi até a sombra');
  assert(B.hp < hp, 'a chegada não cortou');
});

test('Noite Eterna: dentro da escuridão a Kagepantera se camufla sozinha e o inimigo fica lento', () => {
  const { w, A, B } = setup('hidrocasco', { gap: 40, evolved: true });
  assert(cast(w, A, 'eternalNight', { x: A.x + 20, y: A.y }), 'noite não saiu');
  idle(w, A);
  step(w, 1.4);
  assert(A.status.cloak > 0, 'não camuflou dentro da noite');
  assert(B.status.slow > 0, 'inimigo dentro da noite não ficou lento');
});

test('Online: sombras vão no snapshot e aparecem no mundo espelho', () => {
  const { w, A } = setup();
  cast(w, A, 'livingShadow', { x: 250, y: 150 });
  step(w, 0.4);
  const ctx = makeSyncCtx(w);
  const snap = JSON.parse(JSON.stringify(serialize(w, ctx)));
  const mirror = World.match(5, [['pantrinja', 'hidrocasco', 'brotossauro'], ['hidrocasco', 'brasalisco', 'raiolua']], 0, 'quadra', 'normal', { mirror: true });
  applySnapshot(mirror, snap, {});
  assert(mirror.shadows.length === 1 && mirror.shadows[0].owner === mirror.roster[0], 'sombra não chegou no espelho');
  assert(Math.abs(mirror.shadows[0].x - w.shadows[0].x) < 0.2, 'posição da sombra diferente');
});

test('IA com a pantera usa a sombra, vai até ela e consegue críticos numa luta de verdade', () => {
  const w = World.match(9, [['pantrinja', 'hidrocasco', 'brotossauro'], ['raiolua', 'gotapus', 'ouriflama']], null, 'quadra');
  const seen = new Set();
  for (let k = 0; k < 90 / DT && !w.over; k++) { w.step(DT); for (const e of w.drainEvents()) seen.add(e.type); }
  for (const t of ['shadowCast', 'shadowSwap', 'shadowCrit']) assert(seen.has(t), `a IA nunca fez ${t}`);
});

let fail = 0;
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n        ' + r.err}`); if (!r.ok) fail++; }
console.log(fail ? `\n${fail} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(fail ? 1 : 0);
