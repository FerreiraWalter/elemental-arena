// Sapomental → Sapofilósofo (elemento psíquico): transe e hipnose, imunidade, quebra de combo, orbes que bloqueiam
// tiros, troca mental, espiral/mandala, coro de orbes, projeção astral e sincronização online.
// node test/sapomental.mjs
import { World } from '../src/sim/world.js';
import { DT, EVOLUTION } from '../src/config.js';
import { SPECIES, ROSTER } from '../src/sim/species.js';
import { PSY, addTrance } from '../src/sim/psychic.js';
import { serialize, makeSyncCtx, applySnapshot } from '../src/net/snapshot.js';
import { createMirror } from '../src/net/mirror.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };
const until = (w, pred, s = 5) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };

function setup(foe = 'brasalisco', { gap = 60, evolved = false } = {}) {
  const rosters = [['sapomental', 'hidrocasco', 'brotossauro'], [foe, 'brasalisco', 'hidrocasco']];
  const w = World.match(5, rosters, 0, 'quadra');
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  const A = w.fieldOf(0);
  A.controller = null; w.humans.clear();
  until(w, () => w.monsters.every((m) => !m.switchState), 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 300, o.y - 250) < 220) { o.destroyed = true; o.solid = false; }
  if (evolved) { A.energy = EVOLUTION.threshold; w.requestEvolve(A); until(w, () => A.evolved && A.evolveT <= 0, 3); }
  const B = w.monsters.find((m) => m.team !== A.team);
  A.x = A.px = 250; A.y = A.py = 250; A.facing = 0;
  B.x = B.px = 250 + gap; B.y = B.py = 250; B.kx = B.ky = 0; B.hp = B.maxHp; for (const s in B.status) B.status[s] = 0;
  for (const m of w.monsters) m.level = w.terrain.heightAt(m.x, m.y);
  for (const k in A.cd) A.cd[k] = 0;
  return { w, A, B };
}
const cast = (w, m, id, extra = {}) => m.cast(w, m.ability(id), { aim: 0, dir: 0, aimPoint: { x: 450, y: 250 }, point: { x: 310, y: 250 }, ...extra });

test('Sapomental no elenco, evolui para Sapofilósofo, com sprite e controles', () => {
  assert(ROSTER.includes('sapomental'), 'fora do elenco');
  assert(SPECIES.sapomental.evolvesTo === 'sapofilosofo' && SPECIES.sapofilosofo.element === 'psychic', 'evolução/elemento');
  for (const k of ['sapomental', 'sapofilosofo']) for (const id of Object.values(SPECIES[k].controls)) assert(SPECIES[k].abilities.some((a) => a.id === id), `${k}: ${id} sem habilidade`);
});

test('Transe: 3 acertos psíquicos hipnotizam; o hipnotizado anda até o sapo e não usa habilidades', () => {
  const { w, A, B } = setup('brasalisco', { gap: 120 });
  for (let k = 0; k < 2; k++) addTrance(w, B, A, 1);
  assert(B.trance === 2 && !(B.status.charm > 0), 'transe não acumulou');
  addTrance(w, B, A, 1);
  assert(B.status.charm > 0 && B.trance === 0 && B.charmBy === A, 'não hipnotizou');
  assert(!B.ready(B.def.controls.primary), 'hipnotizado ainda pode atacar');
  const d0 = Math.hypot(B.x - A.x, B.y - A.y);
  step(w, 0.8);
  assert(Math.hypot(B.x - A.x, B.y - A.y) < d0 - 15, 'hipnotizado não andou até o sapo');
});

test('Imunidade: logo depois da hipnose o alvo não junta transe de novo; quebra de combo liberta', () => {
  const { w, A, B } = setup();
  addTrance(w, B, A, 3);
  step(w, PSY.charm + 0.1);
  assert(!(B.status.charm > 0), 'hipnose não acabou');
  addTrance(w, B, A, 3);
  assert(!(B.status.charm > 0) && !(B.trance > 0), 'virou trava infinita (sem imunidade)');
  const { w: w2, A: A2, B: B2 } = setup();
  addTrance(w2, B2, A2, 3);
  B2.energy = 100;
  assert(w2.canBreakCombo(B2) && w2.breakCombo(B2) && B2.status.charm === 0, 'quebra de combo não libertou');
});

test('Bolha Psíquica persegue o alvo e soma transe', () => {
  const { w, A, B } = setup('brasalisco', { gap: 120 });
  B.y = B.py = 280;
  cast(w, A, 'psyBubble', { aim: 0, aimPoint: { x: 400, y: 250 } });
  assert(until(w, () => B.trance > 0, 2), 'bolha teleguiada não acertou alvo fora da linha');
});

test('Língua Hipnótica puxa o alvo para perto', () => {
  const { w, A, B } = setup('brasalisco', { gap: 50 });
  const d0 = B.x - A.x;
  cast(w, A, 'tongueLash');
  step(w, 0.5);
  assert(B.x - A.x < d0 - 8 && B.trance > 0, `não puxou (${d0} → ${(B.x - A.x).toFixed(1)})`);
});

test('Orbes Mentais bloqueiam projéteis inimigos e batem em quem encosta', () => {
  const { w, A, B } = setup('brasalisco', { gap: 120 });
  cast(w, A, 'mindOrbs');
  step(w, 0.4);
  const orbs = () => w.projectiles.filter((p) => p.orbit && p.owner === A).length;
  assert(orbs() === 3, 'não criou 3 orbes');
  const hp = A.hp;
  for (let k = 0; k < 8; k++) { w.spawnProjectile({ kind: 'ember', owner: B, ang: Math.PI, speed: 200, r: 3, range: 200, dmg: 8, x: B.x - 20, y: A.y - 6 }); step(w, 0.15); }
  step(w, 0.5);
  assert(orbs() < 3 && A.hp > hp - 60, `orbes não interceptaram nada (orbes ${orbs()}, vida ${hp.toFixed(0)} → ${A.hp.toFixed(0)})`);
});

test('Troca Mental troca de lugar com o inimigo mirado; sem alvo, teleporta', () => {
  const { w, A, B } = setup('brasalisco', { gap: 120 });
  const a0 = { x: A.x, y: A.y }, b0 = { x: B.x, y: B.y };
  cast(w, A, 'mindSwap', { aimPoint: { x: B.x, y: B.y } });
  step(w, 0.3);
  assert(Math.hypot(A.x - b0.x, A.y - b0.y) < 12 && Math.hypot(B.x - a0.x, B.y - a0.y) < 12, 'não trocou de lugar');
  const { w: w2, A: A2 } = setup('brasalisco', { gap: 300 });
  const x0 = A2.x;
  cast(w2, A2, 'mindSwap', { aimPoint: { x: A2.x + 200, y: A2.y } });
  step(w2, 0.3);
  assert(A2.x > x0 + 60, 'sem alvo não teleportou');
});

test('Espiral Hipnótica deixa lento e pulsa transe', () => {
  const { w, A, B } = setup('brasalisco', { gap: 100 });
  cast(w, A, 'hypnoSpiral', { point: { x: B.x, y: B.y }, aimPoint: { x: B.x, y: B.y } });
  step(w, 1.5);
  assert(B.status.slow > 0 && (B.trance > 0 || B.status.charm > 0), 'espiral não fez efeito');
});

test('Sapofilósofo: Coro de Orbes dispara teleguiado; Troca Astral troca de lugar com o inimigo de longe (260 px)', () => {
  const { w, A, B } = setup('brasalisco', { gap: 150, evolved: true });
  assert(A.def.key === 'sapofilosofo', 'não evoluiu');
  assert(A.def.controls.f === 'astralSwap', 'F não é a Troca Astral');
  const hp = B.hp;
  cast(w, A, 'orbChorus');
  step(w, 2.5);
  assert(B.hp < hp, 'coro de orbes não acertou');
  const { w: w2, A: A2, B: B2 } = setup('brasalisco', { gap: 235, evolved: true });
  const a0 = { x: A2.x, y: A2.y }, b0 = { x: B2.x, y: B2.y }, hp2 = B2.hp;
  cast(w2, A2, 'astralSwap', { aimPoint: { x: B2.x, y: B2.y } });
  step(w2, 0.3);
  assert(Math.hypot(A2.x - b0.x, A2.y - b0.y) < 12 && Math.hypot(B2.x - a0.x, B2.y - a0.y) < 12, 'não trocou a 235 px');
  assert(B2.hp < hp2 && (B2.trance > 0 || B2.status.charm > 0), 'troca não feriu/somou transe');
});

test('Troca Astral resgata o aliado (2v2): troca de lugar, deixa invulnerável e solta das raízes', () => {
  const w = World.match(5, [['sapomental'], ['hidrocasco'], ['brasalisco'], ['brasalisco']], 0, 'quadra', 'normal', { sides: [0, 0, 1, 1] });
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  const A = w.fieldOf(0); A.controller = null; w.humans.clear();
  until(w, () => w.monsters.every((m) => !m.switchState), 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 350, o.y - 250) < 260) { o.destroyed = true; o.solid = false; }
  A.energy = EVOLUTION.threshold; w.requestEvolve(A); until(w, () => A.evolved && A.evolveT <= 0, 3);
  const Al = w.fieldOf(1);
  A.x = A.px = 250; A.y = A.py = 250; Al.x = Al.px = 460; Al.y = Al.py = 250;
  Al.status.root = 2; Al.status.invuln = 0;
  for (const k in A.cd) A.cd[k] = 0;
  const hp = Al.hp;
  cast(w, A, 'astralSwap', { aimPoint: { x: Al.x, y: Al.y } });
  until(w, () => A.action?.phase !== 'windup', 1);
  step(w, 0.05);
  assert(Math.hypot(A.x - 460, A.y - 250) < 12 && Math.hypot(Al.x - 250, Al.y - 250) < 12, 'não trocou com o aliado');
  assert(Al.status.invuln > 0 && !(Al.status.root > 0) && Al.hp === hp, 'resgate sem proteção (ou feriu o aliado)');
});

test('Sincronização: transe, hipnose e zona psíquica chegam ao espelho online', () => {
  const { w, A, B } = setup();
  addTrance(w, B, A, 2);
  cast(w, A, 'hypnoSpiral', { point: { x: 300, y: 250 }, aimPoint: { x: 300, y: 250 } });
  step(w, 0.5);
  const rosters = [['sapomental', 'hidrocasco', 'brotossauro'], ['brasalisco', 'brasalisco', 'hidrocasco']];
  const mirror = createMirror({ seed: 5, rosters, you: 0, arena: 'quadra', sides: [0, 1], players: [{ seat: 0 }, { seat: 1 }] });
  applySnapshot(mirror.world, JSON.parse(JSON.stringify(serialize(w, makeSyncCtx(w)))), mirror.ctx);
  const mB = mirror.world.roster[w.roster.indexOf(B)];
  assert(mB.trance === B.trance, 'transe não sincronizou');
  assert(mirror.world.zones.some((z) => z.kind === 'psy'), 'zona psíquica não sincronizou');
  addTrance(w, B, A, 3);
  applySnapshot(mirror.world, JSON.parse(JSON.stringify(serialize(w, makeSyncCtx(w)))), mirror.ctx);
  assert(mB.status.charm > 0 && mB.charmBy === mirror.world.roster[w.roster.indexOf(A)], 'hipnose não sincronizou');
});

for (const r of results) console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : `\n       ${r.err}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
