// Araralvo → Araravento (voador): tornado de segurar e soltar (carga muda alcance e levanta), Presa no Ar,
// rajada que devolve projéteis, mergulho, vórtice que puxa e levanta, voo sobre o terreno e sincronização online.
// node test/araralvo.mjs
import { World } from '../src/sim/world.js';
import { DT, EVOLUTION } from '../src/config.js';
import { SPECIES, ROSTER } from '../src/sim/species.js';
import { T } from '../src/sim/tiles.js';
import { serialize, makeSyncCtx, applySnapshot } from '../src/net/snapshot.js';
import { createMirror } from '../src/net/mirror.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const until = (w, pred, s = 5) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };
const rosters = [['araralvo', 'hidrocasco', 'brotossauro'], ['brasalisco', 'brasalisco', 'hidrocasco']];

function setup({ gap = 100, evolved = false } = {}) {
  const w = World.match(5, rosters, 0, 'quadra');
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  const A = w.fieldOf(0);
  A.controller = null; w.humans.clear();
  until(w, () => w.monsters.every((m) => !m.switchState), 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 350, o.y - 250) < 260) { o.destroyed = true; o.solid = false; }
  w.relics = [];
  if (evolved) { A.energy = EVOLUTION.threshold; w.requestEvolve(A); until(w, () => A.evolved && A.evolveT <= 0, 3); }
  const B = w.monsters.find((m) => m.team !== A.team);
  A.x = A.px = 250; A.y = A.py = 250; A.facing = 0;
  B.x = B.px = 250 + gap; B.y = B.py = 250; B.kx = B.ky = 0; B.hp = B.maxHp; for (const s in B.status) B.status[s] = 0;
  for (const m of w.monsters) m.level = w.terrain.heightAt(m.x, m.y);
  for (const k in A.cd) A.cd[k] = 0;
  return { w, A, B };
}
const cast = (w, m, id, extra = {}) => m.cast(w, m.ability(id), { aim: 0, dir: 0, aimPoint: { x: 450, y: 250 }, point: { x: 330, y: 250 }, ...extra });
// Carrega o tornado por `hold` s (jogador segurando o botão) e solta.
function chargeAndRelease(w, A, id, hold) {
  assert(cast(w, A, id), 'não começou a carregar');
  const a = A.action;
  a.holding = true;
  until(w, () => A.action !== a || a.t >= a.ab.windup + hold, 3);
  a.holding = false;
  until(w, () => A.action !== a || a.phase !== 'windup', 1);
  return a;
}
const tornadoOf = (w, A) => w.projectiles.find((p) => p.kind === 'tornado' && p.owner === A);

test('Araralvo no elenco, voador, evolui para Araravento, com sprite e controles', () => {
  assert(ROSTER.includes('araralvo'), 'fora do elenco');
  assert(SPECIES.araralvo.element === 'air' && SPECIES.araralvo.evolvesTo === 'araravento' && SPECIES.araravento.hover, 'elemento/evolução/voo');
  for (const k of ['araralvo', 'araravento']) for (const id of Object.values(SPECIES[k].controls)) assert(SPECIES[k].abilities.some((a) => a.id === id), `${k}: ${id} sem habilidade`);
});

test('Tornado: segurar carrega (mais alcance, maior); solto rápido não levanta, carregado LEVANTA e atordoa', () => {
  let { w, A, B } = setup({ gap: 100 });
  chargeAndRelease(w, A, 'galeTornado', 0);
  const weak = tornadoOf(w, A);
  assert(weak && weak.charge < 0.1 && weak.lift === 0, `tornado fraco errado (carga ${weak?.charge})`);
  until(w, () => B.hp < B.maxHp, 2);
  assert(B.hp < B.maxHp && !(B.lift > 0), 'sem carga não deveria levantar');
  ({ w, A, B } = setup({ gap: 180 }));
  chargeAndRelease(w, A, 'galeTornado', 2);
  const full = tornadoOf(w, A);
  assert(full && full.charge >= 0.99 && full.range > weak.range + 80 && full.r > weak.r, 'carga cheia não cresceu');
  until(w, () => B.lift > 0, 2);
  assert(B.lift > 0.5 && B.status.stun > 0.4, `não levantou (lift ${B.lift}, stun ${B.status.stun})`);
});

test('Tornado atravessa: pega dois inimigos na linha', () => {
  const w = World.match(5, [['araralvo'], ['brasalisco'], ['hidrocasco']], 0, 'quadra', 'normal', { sides: [0, 1, 1] });
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  until(w, () => w.monsters.every((m) => !m.switchState), 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 350, o.y - 250) < 260) { o.destroyed = true; o.solid = false; }
  const A = w.fieldOf(0); A.controller = null; w.humans.clear();
  const [B, C] = w.monsters.filter((m) => m.team !== A.team);
  A.x = 250; A.y = 250; B.x = 320; B.y = 250; C.x = 380; C.y = 252;
  for (const k in A.cd) A.cd[k] = 0;
  chargeAndRelease(w, A, 'galeTornado', 1.2);
  until(w, () => B.lift > 0 && C.lift > 0, 2);
  assert(B.lift > 0 && C.lift > 0, 'não atravessou os dois');
});

test('IA: segura o tornado o suficiente para alcançar o alvo', () => {
  const { w, A, B } = setup({ gap: 200 });
  A.cast(w, A.ability('galeTornado'), { aim: 0, aimPoint: { x: B.x, y: B.y }, target: B });
  const a = A.action;
  until(w, () => a.phase !== 'windup', 3);
  assert(a.charge > 0.5, `carga baixa demais para 200 px (${a.charge})`);
});

test('Presa no Ar: golpe em quem está levantado causa +25%', () => {
  const { w, A, B } = setup({ gap: 20 });
  const h0 = B.hp; w.damage(B, 10, A, { element: 'air' }); const plain = h0 - B.hp;
  B.lift = B.liftMax = 0.8;
  const h1 = B.hp; w.damage(B, 10, A, { element: 'air' }); const air = h1 - B.hp;
  assert(Math.abs(air / plain - 1.25) < 0.02, `bônus ${(air / plain).toFixed(2)}`);
});

test('Rajada de Vento: empurra quem está perto e devolve projéteis inimigos', () => {
  const { w, A, B } = setup({ gap: 30 });
  const shot = w.spawnProjectile({ kind: 'ember', owner: B, ang: Math.PI, speed: 200, r: 3, range: 200, dmg: 6, x: A.x + 70, y: A.y - 20 });
  const x0 = B.x;
  assert(cast(w, A, 'galeBurst'), 'não usou');
  until(w, () => !A.action, 1);
  assert(B.x > x0 + 15, `não empurrou (${(B.x - x0).toFixed(1)})`);
  assert(shot.team === A.team && shot.vx > 0, 'não devolveu o projétil');
});

test('Mergulho Rasante: voa invulnerável e levanta quem está no pouso', () => {
  const { w, A, B } = setup({ gap: 120 });
  assert(cast(w, A, 'diveStrike', { aimPoint: { x: B.x, y: B.y }, aimLand: true }), 'não mergulhou');
  A.action.aimLand = true;
  until(w, () => B.lift > 0, 2);
  assert(B.lift > 0 && B.hp < B.maxHp, 'pouso não levantou');
});

test('Araravento: Olho da Tempestade puxa para o centro e levanta no fim; ciclone cheio deixa vórtice', () => {
  let { w, A, B } = setup({ gap: 110, evolved: true });
  assert(A.def.key === 'araravento', 'não evoluiu');
  assert(cast(w, A, 'eyeOfStorm', { point: { x: B.x - 30, y: B.y } }), 'não lançou');
  until(w, () => w.zones.some((z) => z.kind === 'wind'), 1);
  const z = w.zones.find((q) => q.kind === 'wind');
  const d0 = Math.hypot(B.x - z.x, B.y - z.y);
  until(w, () => B.lift > 0, 3.5);
  assert(Math.hypot(B.x - z.x, B.y - z.y) < d0 - 10, 'não puxou');
  assert(B.lift > 0, 'não levantou no fim');
  ({ w, A, B } = setup({ gap: 400, evolved: true }));
  chargeAndRelease(w, A, 'cycloneTornado', 2);
  until(w, () => !tornadoOf(w, A), 3);
  assert(w.zones.some((q) => q.kind === 'wind'), 'ciclone cheio sem vórtice');
});

test('Voo: água e espinhos não atrasam nem ferem a arara', () => {
  const { w, A } = setup();
  const i = w.terrain.at(A.x, A.y);
  w.terrain.setBase(i, T.WATER);
  const plain = SPECIES.brasalisco;
  assert(A.speedMult(w) === 1, `atrasou na água (${A.speedMult(w)})`);
  w.terrain.setBase(i, T.THORNS);
  const h = A.hp;
  for (let k = 0; k < 60; k++) w.updateMonster(A, DT);
  assert(A.hp === h && plain, 'espinhos feriram');
});

test('Online: tornado, levantar e vórtice sincronizam', () => {
  const { w, A, B } = setup({ gap: 120, evolved: true });
  chargeAndRelease(w, A, 'cycloneTornado', 2);
  until(w, () => B.lift > 0, 2);
  cast(w, A, 'eyeOfStorm', { point: { x: B.x, y: B.y } });
  until(w, () => w.zones.some((z) => z.kind === 'wind'), 1);
  const mirror = createMirror({ seed: 5, rosters, you: 0, arena: 'quadra', sides: [0, 1], players: [{ seat: 0 }, { seat: 1 }] });
  applySnapshot(mirror.world, JSON.parse(JSON.stringify(serialize(w, makeSyncCtx(w)))), mirror.ctx);
  const mB = mirror.world.roster[w.roster.indexOf(B)];
  assert(mB.lift > 0, 'levantar não sincronizou');
  assert(mirror.world.zones.some((z) => z.kind === 'wind' && z.lift > 0), 'vórtice não sincronizou');
});

for (const r of results) console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : `\n       ${r.err}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
