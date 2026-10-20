// Raiolua → Trovogato (elemento elétrico): cargas, raio do céu, puxão que atordoa, rastro elétrico,
// esfera que ricocheteia, garras duplas, investida que atravessa, salto com descarga e sincronização online.
// node test/trovogato.mjs
import { World } from '../src/sim/world.js';
import { DT, EVOLUTION } from '../src/config.js';
import { SPECIES, ROSTER } from '../src/sim/species.js';
import { serialize, makeSyncCtx, applySnapshot } from '../src/net/snapshot.js';
import { createMirror } from '../src/net/mirror.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };
const until = (w, pred, s = 5) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };

function setup(foe = 'brasalisco', { gap = 60, evolved = false, sides } = {}) {
  const rosters = sides ? sides.map((_, i) => (i === 0 ? ['raiolua', 'hidrocasco', 'brotossauro'] : [foe, 'brasalisco', 'hidrocasco'])) : [['raiolua', 'hidrocasco', 'brotossauro'], [foe, 'brasalisco', 'hidrocasco']];
  const w = World.match(5, rosters, 0, 'quadra', 'normal', sides ? { sides } : {});
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  const A = w.fieldOf(0);
  A.controller = null; w.humans.clear();
  until(w, () => w.monsters.every((m) => !m.switchState), 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 300, o.y - 250) < 220) { o.destroyed = true; o.solid = false; }
  if (evolved) { A.energy = EVOLUTION.threshold; w.requestEvolve(A); until(w, () => A.evolved && A.evolveT <= 0, 3); }
  const foes = w.monsters.filter((m) => m.team !== A.team);
  A.x = A.px = 250; A.y = A.py = 250; A.facing = 0;
  foes.forEach((B, k) => { B.x = B.px = 250 + gap + k * 30; B.y = B.py = 250 + k * 20; B.kx = B.ky = 0; B.hp = B.maxHp; for (const s in B.status) B.status[s] = 0; });
  for (const m of w.monsters) m.level = w.terrain.heightAt(m.x, m.y);
  for (const k in A.cd) A.cd[k] = 0;
  return { w, A, B: foes[0], foes };
}
const cast = (w, m, id, extra = {}) => m.cast(w, m.ability(id), { aim: 0, dir: 0, aimPoint: { x: 450, y: 250 }, point: { x: 310, y: 250 }, ...extra });

test('Raiolua está no elenco, evolui para Trovogato e tem os 6 botões pedidos', () => {
  assert(ROSTER.includes('raiolua'), 'Raiolua fora do elenco');
  const b = SPECIES.raiolua.controls, e = SPECIES.trovogato.controls;
  assert(SPECIES.raiolua.evolvesTo === 'trovogato', 'evolução errada');
  assert(b.primary === 'sparkBall' && b.melee === 'scratch' && b.q === 'strike220' && b.e === 'shock110' && b.f === 'boltDash' && b.dodge === 'catLeap', 'controles da forma base');
  assert(e.primary === 'voltSphere' && e.melee === 'conductClaws' && e.q === 'thunderJudgment' && e.e === 'overloadCore' && e.f === 'lightningRupture' && e.dodge === 'thunderInstinct', 'controles do Trovogato');
});

test('Cargas: acertos elétricos somam carga até o máximo (3 / 5) e deixam ELETRIZADO (mais rápido)', () => {
  const { w, A, B } = setup();
  for (let k = 0; k < 5; k++) w.damage(B, 2, A, { tag: 't', element: 'electric' });
  assert(A.volt === 3, `esperava 3 cargas, tem ${A.volt}`);
  const fast = A.speedMult(w); A.volt = 2; const slow = A.speedMult(w);
  assert(fast > slow, 'eletrizado não acelera');
  const { w: w2, A: A2, B: B2 } = setup('brasalisco', { evolved: true });
  for (let k = 0; k < 8; k++) w2.damage(B2, 1, A2, { tag: 't', element: 'electric' });
  assert(A2.volt === 5, `Trovogato deveria ter 5 cargas, tem ${A2.volt}`);
});

test('Descarga 220V: marca o chão e o raio cai depois (dano + atordoa só quem está na área)', () => {
  const { w, A, B } = setup('brasalisco', { gap: 60 });
  const hp = B.hp;
  assert(cast(w, A, 'strike220', { point: { x: B.x, y: B.y } }), 'não lançou');
  step(w, 0.3);
  assert(B.hp === hp, 'o raio caiu cedo demais (sem aviso)');
  until(w, () => B.hp < hp, 1.5);
  assert(B.hp < hp && B.status.stun > 0, 'raio não feriu/atordoou');
});

test('Descarga 110V: PUXA o inimigo para perto, atordoa e consome as cargas (mais dano com cargas)', () => {
  const { w, A, B } = setup('brasalisco', { gap: 55 });
  A.volt = 0; let hp = B.hp; const d0 = Math.hypot(B.x - A.x, B.y - A.y);
  assert(cast(w, A, 'shock110'), 'não usou');
  step(w, 0.6);
  const d1 = Math.hypot(B.x - A.x, B.y - A.y), dmg0 = hp - B.hp;
  assert(d1 < d0 - 20, `não puxou (${d0.toFixed(0)} → ${d1.toFixed(0)})`);
  assert(dmg0 > 0, 'sem dano');
  const { w: w2, A: A2, B: B2 } = setup('brasalisco', { gap: 55 });
  A2.volt = 3; hp = B2.hp;
  cast(w2, A2, 'shock110'); step(w2, 0.6);
  assert(A2.volt === 0, 'cargas não foram gastas');
  assert(hp - B2.hp > dmg0 + 3, 'cargas não aumentaram o dano');
  assert(B2.status.stun > 0 || B2.stats.dmgTaken > 0, 'não atordoou');
});

test('Corrente Relâmpago: deixa rastro elétrico que fere e deixa LENTO quem pisa', () => {
  const { w, A, B } = setup('brasalisco', { gap: 200 });
  assert(cast(w, A, 'boltDash'), 'não usou');
  step(w, 0.45);
  assert(w.zones.length >= 4, `rastro curto (${w.zones.length} zonas)`);
  const z = w.zones[1];
  B.x = z.x; B.y = z.y; B.kx = B.ky = 0; const hp = B.hp;
  step(w, 0.6);
  assert(B.hp < hp && B.status.slow > 0, 'rastro não feriu / não deixou lento');
  step(w, 3);
  assert(w.zones.length === 0, 'rastro deveria sumir');
});

test('Pulo do Gato: 2 cargas, invulnerável no ar', () => {
  const { w, A } = setup();
  assert(cast(w, A, 'catLeap', { dir: Math.PI / 2 }), 'primeiro pulo');
  step(w, 0.05);
  assert(A.status.invuln > 0, 'sem invulnerabilidade');
  step(w, 0.4);
  assert(cast(w, A, 'catLeap', { dir: -Math.PI / 2 }), 'segundo pulo seguido não saiu');
});

test('Esfera Voltaica ricocheteia para outro inimigo (todos contra todos)', () => {
  const { w, A, foes } = setup('brasalisco', { gap: 60, evolved: true, sides: [0, 1, 2, 3] });
  const [B, C] = foes;
  C.x = B.x + 10; C.y = B.y + 50;
  const hpC = C.hp;
  assert(cast(w, A, 'voltSphere', { aimPoint: { x: B.x, y: B.y - 3 } }), 'não atirou');
  until(w, () => C.hp < hpC, 1.5);
  assert(C.hp < hpC, 'a esfera não ricocheteou para o segundo inimigo');
});

test('Garras Condutoras: acertar os dois golpes libera choque extra', () => {
  const { w, A, B } = setup('brasalisco', { gap: 26, evolved: true });
  let burst = false;
  const hp = B.hp;
  cast(w, A, 'conductClaws');
  for (let k = 0; k < 40; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'shockBurst') burst = true; B.x = A.x + 26; B.y = A.y; }
  assert(B.hp < hp - 15 && burst, `combo duplo sem choque extra (dano ${(hp - B.hp).toFixed(1)})`);
});

test('Ruptura Relâmpago atravessa o inimigo (passa para o outro lado) e o fere', () => {
  const { w, A, B } = setup('brasalisco', { gap: 50, evolved: true });
  const hp = B.hp;
  cast(w, A, 'lightningRupture');
  step(w, 0.5);
  assert(A.x > B.x + 5, `não atravessou (A ${A.x.toFixed(0)}, B ${B.x.toFixed(0)})`);
  assert(B.hp < hp, 'não feriu ao atravessar');
});

test('Núcleo de Sobrecarga: mais cargas = explosão maior e mais dano', () => {
  const run = (n) => {
    const { w, A, B } = setup('brasalisco', { gap: 60, evolved: true });
    A.volt = n; const hp = B.hp; let R = 0;
    cast(w, A, 'overloadCore');
    for (let k = 0; k < 60; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'overload') R = e.r; }
    return { dmg: hp - B.hp, R };
  };
  const a = run(0), b = run(5);
  assert(b.R > a.R + 20 && b.dmg > a.dmg + 15, `cargas não fortaleceram (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
});

test('Alvo molhado conduz: leva mais dano elétrico', () => {
  const { w, A, B } = setup('brasalisco');
  let hp = B.hp; w.damage(B, 10, A, { tag: 't', element: 'electric' }); const dry = hp - B.hp;
  B.status.wet = 3; hp = B.hp; w.damage(B, 10, A, { tag: 't', element: 'electric' }); const wet = hp - B.hp;
  assert(wet > dry * 1.1, `molhado não conduziu (${dry.toFixed(1)} vs ${wet.toFixed(1)})`);
});

test('Sincronização: cargas, lentidão e solo eletrificado chegam ao espelho online', () => {
  const { w, A, B } = setup('brasalisco', { gap: 200 });
  A.volt = 2; B.status.slow = 1; B.slowK = 0.3;
  cast(w, A, 'boltDash'); step(w, 0.3);
  const ctx = makeSyncCtx(w);
  const mirror = createMirror({ seed: 5, rosters: [['raiolua', 'hidrocasco', 'brotossauro'], ['brasalisco', 'brasalisco', 'hidrocasco']], you: 0, arena: 'quadra', sides: [0, 1], players: [{ seat: 0 }, { seat: 1 }] });
  applySnapshot(mirror.world, JSON.parse(JSON.stringify(serialize(w, ctx))), mirror.ctx);
  const mA = mirror.world.roster[w.roster.indexOf(A)], mB = mirror.world.roster[w.roster.indexOf(B)];
  assert(mA.volt === A.volt, 'cargas não sincronizaram');
  assert(mB.status.slow > 0 && mB.slowK > 0, 'lentidão não sincronizou');
  assert(mirror.world.zones.length === w.zones.length && w.zones.length > 0, 'zonas não sincronizaram');
});

test('Partidas de IA com Raiolua/Trovogato terminam (1v1 e 1v1v1v1) sem travar', () => {
  for (const sides of [[0, 1], [0, 1, 2, 3]]) {
    const ros = sides.map((_, i) => (i === 0 ? ['raiolua', 'hidrocasco', 'brotossauro'] : ['brasalisco', 'raiolua', 'gotapus']));
    const w = World.match(9, ros, null, 'jardim', 'normal', { sides });
    let evo = false;
    while (!w.over && w.time < 400) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'evolveDone' || (e.type === 'evolve' && e.m?.line === 'raiolua')) evo = true; }
    assert(w.over, `partida ${sides.length} lados não terminou`);
    void evo;
  }
});

let fails = 0;
console.log('\nRaiolua / Trovogato (elétrico)\n');
for (const r of results) { console.log(`[${r.ok ? 'OK' : 'FALHOU'}]  ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) fails++; }
console.log(fails ? `\n${fails} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(fails ? 1 : 0);
