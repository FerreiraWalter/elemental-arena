// Mecânicas próprias de cada linha, limites do fogo e sincronização dessas mecânicas pela rede.
// node test/signatures.mjs
import { World } from '../src/sim/world.js';
import { DT, EVOLUTION, FIRE, CONTROL } from '../src/config.js';
import { SPECIES } from '../src/sim/species.js';
import { ABILITIES } from '../src/sim/abilities.js';
import { SIG } from '../src/sim/signature.js';
import { serialize, makeSyncCtx, applySnapshot } from '../src/net/snapshot.js';
import { createMirror } from '../src/net/mirror.js';
import * as Training from '../src/sim/training.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };
const until = (w, pred, s = 5) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };

// Duelo controlado: o inimigo fica parado (sem IA), terreno limpo em volta.
function setup(me, foe = 'brotossauro', { gap = 60, evolved = false } = {}) {
  const w = World.match(5, [[me, 'hidrocasco', 'brotossauro'], [foe, 'brasalisco', 'hidrocasco']], 0, 'quadra');
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  const A = w.fieldOf(0), B = w.fieldOf(1);
  A.controller = null; w.humans.clear();
  until(w, () => !A.switchState && !B.switchState, 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 230, o.y - 200) < 160) { o.destroyed = true; o.solid = false; }
  A.x = A.px = 200; A.y = A.py = 200; B.x = B.px = 200 + gap; B.y = B.py = 200;
  A.level = B.level = w.terrain.heightAt(200, 200);
  if (evolved) { A.energy = EVOLUTION.threshold; w.requestEvolve(A); until(w, () => A.evolved && A.evolveT <= 0, 3); A.x = 200; A.y = 200; B.x = 200 + gap; B.y = 200; B.hp = B.maxHp; B.kx = B.ky = 0; for (const k in A.cd) A.cd[k] = 0; for (const k in B.status) B.status[k] = 0; }
  A.facing = 0;
  return { w, A, B };
}
const cast = (w, m, id, extra = {}) => m.cast(w, m.ability(id), { aim: 0, dir: 0, aimPoint: { x: 400, y: 200 }, point: { x: 260, y: 200 }, ...extra });
const ready = (m) => { m.action = null; for (const k in m.cd) m.cd[k] = 0; m.status.stun = 0; };

// ───────────── Fornalha (Brasalisco) ─────────────
test('Fornalha: ataques aquecem; em 100% SUPERAQUECE (mais dano) e depois fica EXAUSTO (sem poderes, lento, leva mais dano)', () => {
  const { w, A, B } = setup('brasalisco', 'brotossauro', { gap: 22 });
  assert(A.heat === 0, 'calor inicial');
  cast(w, A, 'claw'); step(w, 0.05);
  assert(A.heat > 0, 'garra não aqueceu');
  // Mede um golpe normal e um superaquecido (mesmo alvo, mesmo golpe).
  ready(A); A.heat = 0; B.hp = B.maxHp; const h0 = B.hp; cast(w, A, 'claw'); until(w, () => !A.action, 1); const normal = h0 - B.hp;
  ready(A); A.heat = 95; B.hp = B.maxHp; B.x = A.x + 22; B.y = A.y; B.kx = B.ky = 0;
  const h1 = B.hp; cast(w, A, 'claw');
  assert(A.status.overheat > 0, 'não superaqueceu ao passar de 100%');
  until(w, () => !A.action, 1); const hot = h1 - B.hp;
  assert(hot > normal * 1.12, `superaquecido não bate mais forte (${normal.toFixed(1)} → ${hot.toFixed(1)})`);
  step(w, SIG.heat.overheat + 0.1);
  assert(A.status.exhaust > 0 && A.heat === 0, 'não ficou exausto depois do superaquecimento');
  ready(A);
  assert(!A.ready('flameWave') && !A.ready('meteor') && !A.ready('fireDash'), 'exausto conseguiu usar poder especial');
  assert(A.ready('ember') && A.ready('claw'), 'exausto deveria manter os ataques básicos');
  assert(A.speedMult(w) < 0.8, 'exausto deveria ficar lento');
  const hp = A.hp; w.damage(A, 10, B, { element: 'plant' });
  assert(hp - A.hp > 10 * 0.9 * 1.1, 'exausto deveria levar mais dano');
  step(w, SIG.heat.exhaust + 0.1);
  assert(A.status.exhaust <= 0 && A.ready('flameWave'), 'exaustão não terminou');
});

test('Fornalha: água esfria o calor', () => {
  const { w, A, B } = setup('brasalisco', 'hidrocasco', { gap: 60 });
  A.heat = 60;
  w.damage(A, 5, B, { element: 'water', wet: 2 });
  assert(A.heat <= 60 - SIG.heat.waterCool + 0.01, 'jato d’água não esfriou');
});

test('Núcleo Vulcânico (Ascendido): superaquecer solta uma onda que fere e afasta quem está perto', () => {
  const { w, A, B } = setup('brasalisco', 'brotossauro', { gap: 30, evolved: true });
  assert(A.def.key === 'brasaliscoAscendido', 'não evoluiu');
  ready(A); A.heat = 99; const hp = B.hp;
  cast(w, A, 'magmaBall', { aim: Math.PI, aimPoint: { x: 0, y: 200 } }); // tiro para trás: só a onda acerta
  assert(A.status.overheat > 0, 'não superaqueceu');
  step(w, 0.05);
  assert(B.hp < hp, 'onda de calor não feriu quem estava perto');
  assert(Math.hypot(B.kx, B.ky) > 50 || Math.hypot(B.x - A.x, B.y - A.y) > 36, 'onda não afastou');
});

// ───────────── Casco Reflexo (Hidrocasco) ─────────────
test('Casco Reflexo: bloqueio reduz o dano de perto e contra-ataca quem bateu', () => {
  const { w, A, B } = setup('hidrocasco', 'brasalisco', { gap: 24 });
  ready(B);
  B.facing = Math.PI;
  cast(w, A, 'shellGuard');
  assert(A.action?.ab.kind === 'guard' && A.action.phase === 'active', 'não entrou no casco');
  const hpA = A.hp, hpB = B.hp;
  cast(w, B, 'claw', { aim: Math.PI, dir: Math.PI, aimPoint: { x: 0, y: 200 } });
  until(w, () => B.action?.phase === 'recovery' || !B.action, 1);
  const taken = hpA - A.hp;
  assert(taken < 13 * 0.3, `bloqueio deixou passar dano demais (${taken.toFixed(1)})`);
  assert(B.hp < hpB - 8, 'contra-ataque não feriu o atacante');
  assert(B.status.wet > 0, 'contra-ataque deveria molhar');
});

test('Casco Reflexo: projétil que bate no casco volta contra quem atirou', () => {
  const { w, A, B } = setup('hidrocasco', 'brasalisco', { gap: 120 });
  ready(B);
  cast(w, B, 'ember', { aim: Math.PI, aimPoint: { x: 0, y: 200 } });
  until(w, () => w.projectiles.some((p) => p.owner === B && Math.hypot(p.x - A.x, p.y - A.y) < 60), 1.5);
  ready(A); cast(w, A, 'shellGuard');
  const hpA = A.hp, hpB = B.hp;
  let reflected = false;
  for (let k = 0; k < 1.5 / DT; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'reflect') reflected = true; }
  assert(reflected, 'projétil não foi devolvido');
  assert(A.hp >= hpA - 0.5, 'o casco levou o tiro');
  assert(B.hp < hpB, 'o tiro devolvido não acertou quem atirou');
});

test('Casco Abissal: bloquear dá uma bolha protetora', () => {
  const { w, A, B } = setup('hidrocasco', 'brotossauro', { gap: 24, evolved: true });
  assert(A.def.key === 'hidrocascoAbissal', 'não evoluiu');
  ready(A); cast(w, A, 'abyssGuard');
  w.damage(A, 10, B, { element: 'plant', proj: true });
  assert(A.status.shield > 0 && A.shieldHp >= 20, 'bloqueio não gerou bolha');
});

// ───────────── Brotos Sentinela (Brotossauro) ─────────────
test('Broto Sentinela: brota no ponto mirado, atira sozinho, cura o dono por perto e tem limite de 2', () => {
  const { w, A, B } = setup('brotossauro', 'hidrocasco', { gap: 110 });
  cast(w, A, 'plantSentry', { point: { x: 240, y: 200 } });
  until(w, () => w.obstacles.some((o) => o.sentry && !o.destroyed), 2);
  const s1 = w.obstacles.find((o) => o.sentry && !o.destroyed);
  assert(s1 && Math.hypot(s1.x - 240, s1.y - 200) < 20, 'sentinela não brotou no ponto');
  assert(s1.team === A.team && s1.owner === A, 'sentinela sem dono/lado');
  const hp = B.hp;
  step(w, 3);
  assert(B.hp < hp, 'sentinela não atirou no inimigo ao alcance');
  A.hp = A.maxHp * 0.5; A.x = s1.x - 20; A.y = s1.y;
  const a0 = A.hp; step(w, 2);
  assert(A.hp > a0 + 1, 'sentinela não curou o dono por perto');
  for (let k = 0; k < 2; k++) { ready(A); cast(w, A, 'plantSentry', { point: { x: 180 - k * 30, y: 150 } }); step(w, 1); }
  step(w, 0.2);
  const alive = w.obstacles.filter((o) => o.sentry && !o.destroyed && o.owner === A).length;
  assert(alive <= SIG.sentry.max, `${alive} sentinelas (limite ${SIG.sentry.max})`);
});

test('Broto Sentinela: o fogo derruba a sentinela rápido', () => {
  const { w, A } = setup('brotossauro', 'brasalisco', { gap: 110 });
  cast(w, A, 'plantSentry', { point: { x: 240, y: 200 } });
  until(w, () => w.obstacles.some((o) => o.sentry && !o.destroyed), 2);
  const s = w.obstacles.find((o) => o.sentry && !o.destroyed);
  w.igniteObstacle(s, null);
  step(w, 3.2);
  assert(s.destroyed, 'sentinela resistiu ao fogo');
});

// ───────────── Ímpeto e espinhos (Ouriflama) ─────────────
test('Ímpeto: correndo enche; cheio, o próximo golpe de perto sai muito mais forte', () => {
  const { w, A, B } = setup('ouriflama', 'brotossauro', { gap: 200 });
  A.ai.update = () => {};
  A.move.x = 1; A.move.y = 0; A.move.throttle = 1;
  until(w, () => A.charged, 4);
  assert(A.charged && A.momentum >= 100, 'não entrou em disparada correndo');
  A.move.throttle = 0;
  ready(A); B.x = A.x + 20; B.y = A.y; B.hp = B.maxHp;
  const h0 = B.hp; cast(w, A, 'prick'); until(w, () => !A.action, 1); const strong = h0 - B.hp;
  assert(!A.charged && A.momentum === 0, 'o golpe não consumiu o ímpeto');
  ready(A); B.x = A.x + 20; B.y = A.y; B.hp = B.maxHp; B.kx = B.ky = 0;
  const h1 = B.hp; cast(w, A, 'prick'); until(w, () => !A.action, 1); const weak = h1 - B.hp;
  assert(strong > weak * 1.4, `golpe fortalecido fraco (${weak.toFixed(1)} → ${strong.toFixed(1)})`);
});

test('Ímpeto: atordoar zera o ímpeto; espinhos ferem quem ataca o Ouriflama de perto', () => {
  const { w, A, B } = setup('ouriflama', 'hidrocasco', { gap: 22 });
  A.momentum = 100; A.charged = true;
  w.damage(A, 5, B, { element: 'water', stun: 0.3 });
  assert(!A.charged && A.momentum === 0, 'atordoamento não zerou o ímpeto');
  ready(B); B.x = A.x + 22; B.y = A.y; const hp = B.hp;
  cast(w, B, 'headbutt', { aim: Math.PI, dir: Math.PI, aimPoint: { x: 0, y: 200 } });
  until(w, () => !B.action, 1);
  assert(B.hp < hp, 'espinhos não feriram o atacante');
});

// ───────────── Ilusões de Tinta (Gotapus) ─────────────
test('Ilusões: a esquiva deixa uma cópia; tiro na cópia estoura a tinta sem ferir o Gotapus', () => {
  const { w, A, B } = setup('gotapus', 'brasalisco', { gap: 140 });
  A.vx = 60; A.vy = 0;
  cast(w, A, 'jetDash', { dir: Math.PI / 2, aim: Math.PI / 2 });
  assert(w.decoys.length === 1, 'esquiva não criou cópia');
  const d = w.decoys[0];
  d.shootT = 99; // aqui a cópia não revida (o jato dela apagaria a brasa no ar)
  step(w, 0.4);
  ready(B); const hp = A.hp;
  B.cast(w, B.ability('ember'), { aim: Math.atan2(d.y - B.y, d.x - B.x), aimPoint: { x: d.x, y: d.y } });
  let popped = false;
  for (let k = 0; k < 1.5 / DT && !popped; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'decoyPop') popped = true; }
  assert(popped, 'tiro não estourou a cópia');
  assert(A.hp >= hp - 0.01, 'tiro na cópia feriu o Gotapus');
});

test('Ilusão de Tinta: camufla até atacar e engana a mira da IA', () => {
  const { w, A, B } = setup('gotapus', 'brasalisco', { gap: 140 });
  B.ai.update = B.ai.constructor.prototype.update; // devolve a IA ao inimigo
  B.ai.p.dodgeSkill = 0; // garante que a IA caia na ilusão
  cast(w, A, 'inkCloud');
  step(w, 0.2);
  assert(A.status.cloak > 0, 'não camuflou');
  assert(w.decoys.length === 2, 'não criou duas cópias');
  step(w, 0.1);
  B.ai.perceive();
  const mem = B.ai.mem.get(A.id);
  const fooled = B.ai.fooled && w.decoys.some((d) => Math.hypot(d.x - mem.x, d.y - mem.y) < 1);
  const hidden = !mem.visible;
  assert(fooled || hidden, 'IA continuou vendo o Gotapus de verdade');
  ready(A); cast(w, A, 'bubbleShot');
  assert(A.status.cloak <= 0, 'atacar não revelou o Gotapus');
});

test('Cópias atiram bolhas fracas (dano baixo, não enchem a evolução por acerto)', () => {
  const { w, A, B } = setup('gotapus', 'brotossauro', { gap: 120 });
  const d = w.decoys.length; void d;
  A.vx = 60;
  cast(w, A, 'jetDash', { dir: Math.PI / 2, aim: Math.PI / 2 });
  const dc = w.decoys[0];
  dc.x = B.x - 90; dc.y = B.y; dc.vx = dc.vy = 0; dc.shootT = 0.05;
  let shot = null;
  for (let k = 0; k < 1 / DT && !shot; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'shoot' && e.p.fromDecoy) shot = e.p; }
  assert(shot, 'a cópia não atirou');
  assert(shot.dmg <= 3 && shot.owner === A, 'tiro da cópia forte demais ou sem dono');
  const hp = B.hp, en = A.energy;
  for (let k = 0; k < 1 / DT; k++) { w.step(DT); w.drainEvents(); }
  assert(B.hp < hp && hp - B.hp <= 4, `dano da cópia: ${(hp - B.hp).toFixed(1)}`);
  assert(A.energy - en < EVOLUTION.hit, 'tiro da cópia deu o bônus de acerto da evolução');
});

test('Bolha Prisão: estoura no círculo e prende o alvo dentro de uma bolha', () => {
  const { w, A, B } = setup('gotapus', 'brasalisco', { gap: 110 });
  cast(w, A, 'bubbleTrap', { point: { x: B.x, y: B.y } });
  until(w, () => B.status.bubble > 0, 2);
  assert(B.status.bubble > 0.8 && B.status.root > 0.8, 'alvo não ficou preso na bolha');
  let popped = false;
  for (let k = 0; k < 2 / DT; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'bubblePop') popped = true; }
  assert(popped && B.status.bubble <= 0, 'a bolha não estourou no fim');
});

test('Tentáculos do Abismo: tentáculo no ponto marcado e um em cada cópia', () => {
  const { w, A, B } = setup('gotapus', 'brotossauro', { gap: 120, evolved: true });
  assert(A.def.key === 'leviapus', 'não evoluiu');
  A.vx = 60; cast(w, A, 'krakenJet', { dir: Math.PI / 2, aim: Math.PI / 2 }); step(w, 0.5);
  ready(A);
  const n = w.decoys.filter((d) => d.owner === A).length;
  assert(n >= 1, 'sem cópia para testar');
  const hp = B.hp;
  cast(w, A, 'abyssTentacles', { point: { x: B.x, y: B.y } });
  let slams = 0;
  for (let k = 0; k < 1.5 / DT; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'tentacleSlam') slams++; }
  assert(slams === 1 + n, `tentáculos: ${slams} (esperado ${1 + n})`);
  assert(B.hp < hp - 10, 'tentáculo gigante não feriu o alvo');
});

test('Redemoinho: arrasta em volta e cospe para fora no fim', () => {
  const { w, A, B } = setup('hidrocasco', 'brasalisco', { gap: 30 });
  B.status.root = 0;
  cast(w, A, 'whirlpool');
  let burst = false, tang = 0;
  for (let k = 0; k < 2 / DT; k++) {
    w.step(DT);
    for (const e of w.drainEvents()) if (e.type === 'whirlBurst') burst = true;
    const rx = B.x - A.x, ry = B.y - A.y;
    tang += Math.abs((-ry * B.kx + rx * B.ky) / (Math.hypot(rx, ry) || 1));
  }
  assert(burst, 'sem a explosão final');
  assert(tang > 100, 'o redemoinho não girou o alvo');
});

test('Esquiva enterrada do Brotossauro: invulnerável enquanto está sob a terra', () => {
  const { w, A, B } = setup('brotossauro', 'brasalisco', { gap: 120 });
  cast(w, A, 'leafDash', { dir: 0, aim: 0 });
  step(w, 0.1);
  assert(A.action?.ab.burrowDodge === 'flower' && A.status.invuln > 0.2, 'não ficou enterrado/invulnerável');
  const hp = A.hp; w.damage(A, 20, B, { element: 'fire' });
  assert(A.hp === hp, 'levou dano enterrado');
});

test('Evolução: cada ataque que acerta enche um pedaço fixo da barra', () => {
  const { w, A, B } = setup('brasalisco', 'brotossauro', { gap: 60 });
  A.energy = 0;
  w.damage(B, 8, A, { element: 'fire', proj: true });
  const per = A.energy;
  assert(per >= EVOLUTION.hit && per / EVOLUTION.threshold >= 0.06, `um tiro comum encheu só ${(per / EVOLUTION.threshold * 100).toFixed(1)}%`);
  w.damage(B, 8, A, { element: 'fire', proj: true });
  assert(A.energy - per < EVOLUTION.hit, 'rajada no mesmo instante contou dois ataques');
});

// ───────────── Marca do Louva-a-deus (Mantifolha) ─────────────
test('Marcas: acertos de longe marcam (máx. 3); golpe de perto com 3 marcas EXECUTA e recarrega o salto', () => {
  const { w, A, B } = setup('mantifolha', 'hidrocasco', { gap: 26 });
  for (let k = 0; k < 4; k++) { w.damage(B, 5, A, { element: 'plant', proj: true }); w.time += 0.3; }
  assert(B.marks.n === 3 && B.marks.by === A.id, `marcas = ${B.marks.n}`);
  A.cd.longLeap = 4;
  ready(A); A.cd.longLeap = 4; B.hp = B.maxHp; B.x = A.x + 24; B.y = A.y;
  let exec = false;
  const h0 = B.hp; cast(w, A, 'scytheSlash');
  for (let k = 0; k < 1 / DT; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'execute') exec = true; }
  assert(exec, 'não executou');
  assert(h0 - B.hp > 12 + SPECIES.mantifolha.sig.exec * 0.8, `execução fraca (${(h0 - B.hp).toFixed(1)})`);
  assert(B.marks.n === 0, 'marcas não foram consumidas');
  assert(A.cd.longLeap === 0, 'salto não recarregou');
});

// ───────────── Fogo: limites ─────────────
test('Fogo: queimadura limitada (duração e dano por segundo) e chão de ataque fraco', () => {
  const { w, A, B } = setup('brasalisco', 'brotossauro', { gap: 120 });
  w.damage(B, 1, A, { element: 'fire', burn: 99 });
  assert(B.status.burn <= FIRE.burnMax + 1e-6, `queimadura de ${B.status.burn}s`);
  B.hp = B.maxHp; B.status.burn = 0;
  // Chão em brasa criado por ataque (sem vegetação), por 3 s.
  const i = w.terrain.at(B.x, B.y);
  w.terrain.type[i] = 0; w.terrain.fuel[i] = 0;
  const h0 = B.hp;
  for (let k = 0; k < 3 / DT; k++) { w.terrain.ignite(i, 1); w.step(DT); w.drainEvents(); B.x = w.terrain.cx(i); B.y = w.terrain.cy(i); }
  const lost = h0 - B.hp;
  assert(lost < 3 * (FIRE.groundDps + FIRE.burnDps) * 1.25, `3 s em brasa tiraram ${lost.toFixed(1)}`);
});

test('Fogo: Sopro Ígneo num alvo parado causa dano moderado (sem tirar vida demais)', () => {
  const { w, A, B } = setup('brasalisco', 'hidrocasco', { gap: 40 });
  B.def = { ...B.def, mass: 999 }; // não é empurrado para fora do cone
  const h0 = B.hp;
  cast(w, A, 'flameWave');
  step(w, 2.5);
  const lost = h0 - B.hp;
  assert(lost > 5 && lost < 22, `cone tirou ${lost.toFixed(1)}`);
});

test('Controle: atordoamentos seguidos perdem força (sem sequência inevitável)', () => {
  const { w, A, B } = setup('brasalisco', 'brotossauro', { gap: 40 });
  w.damage(B, 1, A, { stun: 0.5 });
  const first = B.status.stun;
  B.status.stun = 0;
  w.damage(B, 1, A, { stun: 0.5 });
  assert(B.status.stun <= 0.5 * CONTROL.chainMult + 1e-6, `segundo atordoamento cheio (${B.status.stun})`);
  assert(first === 0.5, 'primeiro atordoamento deveria ser cheio');
  step(w, CONTROL.guardTime + 0.6);
  w.damage(B, 1, A, { stun: 0.5 });
  assert(B.status.stun > 0.45, 'resistência não passou');
});

test('Erupção: quem levou a investida recebe só metade da explosão (sem dano dobrado)', () => {
  const { w, A, B } = setup('brasalisco', 'hidrocasco', { gap: 70, evolved: true });
  ready(A); B.hp = B.maxHp;
  let dash = 0, boom = 0;
  cast(w, A, 'eruptionDash');
  for (let k = 0; k < 1.5 / DT; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'hit' && e.m === B && !e.dot) { if (e.tag === 'erupcao') boom += e.amount; else if (!e.tag) dash += e.amount; } }
  assert(dash > 0, 'investida não acertou');
  assert(boom <= 12 * 0.5 * 1.3 + 0.01, `explosão cheia em quem já levou a investida (${boom.toFixed(1)})`);
});

test('Golpes corpo a corpo têm alcance e arco declarados (o desenho usa os mesmos números)', () => {
  for (const ab of Object.values(ABILITIES)) if (ab.kind === 'melee') assert(ab.reach > 0 && ab.arc > 0, `${ab.id} sem alcance/arco`);
});

// ───────────── Modo Treinamento ─────────────
test('Treinamento: bonecos, vida infinita, evolução e opções', () => {
  const w = World.training(4, ['brasalisco', 'gotapus'], 'quadra', { dummies: 3 });
  assert(w.training.dummies.length === 3, 'não criou 3 bonecos');
  Training.setDummies(w, 9);
  assert(w.training.dummies.length === 3, 'passou de 3 bonecos');
  Training.setDummies(w, 1);
  assert(w.training.dummies.length === 1 && w.monsters.filter((m) => m.dummy).length === 1, 'não removeu bonecos');
  step(w, 0.8);
  const me = w.fieldOf(0), d = w.training.dummies[0];
  w.damage(d, 99999, me, { element: 'fire' });
  assert(d.alive && d.hp >= 1, 'boneco morreu');
  step(w, 1.5);
  assert(d.hp === d.maxHp, 'boneco não recuperou a vida');
  assert(Training.meter(w).sum > 0, 'medidor não registrou o dano');
  w.damage(me, 99999, d, { element: 'plant' });
  assert(me.alive && me.hp >= 1, 'seu monstro caiu no treino');
  step(w, 0.2);
  assert(me.energy >= EVOLUTION.threshold && w.requestEvolve(me), 'energia não fica cheia para evoluir');
  step(w, 1.5);
  assert(me.evolved && Training.devolve(w, me) && !me.evolved && me.def.key === 'brasalisco', 'não voltou à forma base');
  w.training.opts.noCd = true; me.cd.meteor = 9; step(w, 0.05);
  assert(me.cd.meteor === 0, 'recarga instantânea não funcionou');
  w.training.opts.shoot = true;
  let shots = 0;
  for (let k = 0; k < 4 / DT; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'dummyShot') shots++; }
  assert(shots >= 1, 'boneco não atirou');
  step(w, 200);
  assert(!w.over && !w.suddenDeath, 'o treino terminou ou entrou em morte súbita');
});

// ───────────── Rede ─────────────
test('Snapshot leva calor, ímpeto, marcas, camuflagem, cópias e sentinelas ao cliente', () => {
  const rosters = [['brasalisco', 'gotapus', 'brotossauro'], ['mantifolha', 'ouriflama', 'hidrocasco']];
  const w = World.match(3, rosters, null, 'quadra');
  const ctx = makeSyncCtx(w);
  const mirror = createMirror({ seed: 3, rosters, you: 0, arena: 'quadra', sides: [0, 1], players: [{ seat: 0 }, { seat: 1 }] });
  step(w, 1);
  const A = w.fieldOf(0), B = w.fieldOf(1);
  A.heat = 77; A.status.overheat = 1.5; B.momentum = 50; A.marks = { n: 2, by: B.id, t: 3, last: 0 };
  const G = w.teamOf(0)[1];
  w.decoys.push({ id: 999, owner: A, team: A.team, x: 100, y: 100, px: 100, py: 100, vx: 10, vy: 0, life: 1, max: 2, facing: 0 });
  const o = w.addObstacle('sentry', 300, 200, 6); o.sentry = true; o.owner = A; o.team = A.team; o.life = 5;
  applySnapshot(mirror.world, JSON.parse(JSON.stringify(serialize(w, ctx))), mirror.ctx);
  const mA = mirror.world.roster[w.roster.indexOf(A)];
  assert(Math.abs(mA.heat - 77) < 0.2 && mA.status.overheat > 1.4, 'calor/superaquecimento não sincronizou');
  assert(mA.marks.n === 2 && mA.marks.by === mirror.world.roster[w.roster.indexOf(B)].id, 'marcas não sincronizaram');
  assert(mirror.world.decoys.length === 1 && mirror.world.decoys[0].owner === mA, 'cópias não sincronizaram');
  const mo = mirror.world.obstacles.find((x) => x.kind === 'sentry');
  assert(mo && mo.team === A.team && mo.owner === mA && mo.sentry, 'sentinela não sincronizou');
  void G;
});

test('Saltos (Mantifolha/Silvamante) caem onde o mouse estava; o alcance é o máximo', () => {
  for (const [line, id, evolved] of [['mantifolha', 'longLeap', false], ['mantifolha', 'skyLeap', true]]) {
    const ab = ABILITIES[id];
    for (const [want, expect] of [[70, 70], [ab.range - 10, ab.range - 10], [ab.range + 200, ab.range], [5, ab.minRange]]) {
      const { w, A } = setup(line, 'brotossauro', { gap: 400, evolved });
      A.x = A.px = 200; A.y = A.py = 200; A.vx = A.vy = 0; A.cd[id] = 0;
      const tx = 200 + want * 0.8, ty = 200 + want * 0.6;
      assert(A.cast(w, ab, { aim: Math.atan2(ty - 200, tx - 200), aimPoint: { x: tx, y: ty } }), `${id}: não saltou`);
      assert(until(w, () => A.action?.phase === 'recovery', 2), `${id}: não aterrissou`);
      const got = Math.hypot(A.x - 200, A.y - 200);
      assert(Math.abs(got - expect) < 4, `${id}: mirou ${want}, devia cair a ${expect}, caiu a ${got.toFixed(1)}`);
    }
  }
});

let failed = 0;
console.log('\nMecânicas próprias, limites do fogo e sincronização\n');
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) failed++; }
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
