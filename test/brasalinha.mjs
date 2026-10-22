// Brasalinha → Fornalhonte (fogo de longe): brasas no chão, Centelha Ativa / Forja Ardente, Ignição,
// jato de fogo, recuo para trás, salva das chaminés, tranco que recolhe brasas e sincronização online.
// node test/brasalinha.mjs
import { World } from '../src/sim/world.js';
import { DT, EVOLUTION } from '../src/config.js';
import { SPECIES, ROSTER } from '../src/sim/species.js';
import * as Forge from '../src/sim/forge.js';
import { T } from '../src/sim/tiles.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };
const until = (w, pred, s = 5) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };

function setup(foe = 'brotossauro', { gap = 80, evolved = false } = {}) {
  const w = World.match(5, [['brasalisco', 'hidrocasco', 'brotossauro'], [foe, 'brasalisco', 'hidrocasco']], 0, 'quadra');
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  const A = w.fieldOf(0), B = w.fieldOf(1);
  A.controller = null; w.humans.clear();
  until(w, () => w.monsters.every((m) => !m.switchState), 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 300, o.y - 250) < 220) { o.destroyed = true; o.solid = false; }
  if (evolved) { A.energy = EVOLUTION.threshold; w.requestEvolve(A); until(w, () => A.evolved && A.evolveT <= 0, 3); }
  // Chão limpo e seco em volta (nada de água apagando as brasas).
  const tr = w.terrain;
  for (let y = 150; y <= 350; y += 8) for (let x = 120; x <= 480; x += 8) { const i = tr.at(x, y); if (i >= 0) { tr.type[i] = T.GROUND; tr.wet[i] = 0; tr.fire[i] = 0; tr.roots[i] = 0; } }
  A.x = A.px = 250; A.y = A.py = 250; A.facing = 0;
  B.x = B.px = 250 + gap; B.y = B.py = 250; B.kx = B.ky = 0; B.hp = B.maxHp; for (const s in B.status) B.status[s] = 0;
  for (const m of w.monsters) m.level = tr.heightAt(m.x, m.y);
  for (const k in A.cd) A.cd[k] = 0;
  return { w, A, B };
}
const cast = (w, m, id, extra = {}) => m.cast(w, m.ability(id), { aim: 0, dir: 0, aimPoint: { x: 450, y: 250 }, point: { x: 330, y: 250 }, ...extra });
const coals = (w, m) => Forge.coalsOf(w, m);

test('Brasalinha está no elenco, evolui para Fornalhonte e tem os 6 botões, com básico de longe', () => {
  assert(ROSTER.includes('brasalisco'), 'Brasalinha fora do elenco');
  const b = SPECIES.brasalisco, e = SPECIES.brasaliscoAscendido;
  assert(b.name === 'Brasalinha' && e.name === 'Fornalhonte' && b.evolvesTo === 'brasaliscoAscendido', 'nomes/evolução');
  assert(b.controls.primary === 'coalShot' && b.controls.melee === 'smokeTail' && b.controls.q === 'flameJet' && b.controls.e === 'ignition' && b.controls.f === 'shyLeap' && b.controls.dodge === 'sparkHop', 'controles da base');
  assert(e.controls.primary === 'forgeShot' && e.controls.melee === 'forgeStomp' && e.controls.q === 'chimneyVolley' && e.controls.e === 'forgeEruption' && e.controls.f === 'colossusRam' && e.controls.dodge === 'emberRoll', 'controles do Fornalhonte');
  assert(b.abilities.find((a) => a.id === 'coalShot').range >= 150, 'o básico deveria ser de longe');
  assert(b.sig.kind === 'forge' && e.sig.kind === 'forge', 'mecânica própria');
});

test('Sem debuff próprio: atirar sem parar não deixa a Brasalinha lenta, fraca nem sem poderes', () => {
  const { w, A } = setup('brotossauro', { gap: 120 });
  const sp0 = A.speedMult(w);
  for (let k = 0; k < 12; k++) { A.action = null; A.cd.coalShot = 0; cast(w, A, 'coalShot'); step(w, 0.3); }
  A.action = null;
  assert(A.speedMult(w) >= sp0 - 1e-6, 'ficou lenta depois de atacar muito');
  assert(A.ready('flameJet') && A.ready('ignition') && A.ready('shyLeap'), 'perdeu os poderes depois de atacar muito');
});

test('Pedra em Brasa: acerta de longe e deixa uma BRASA aos pés do alvo (que arma depois de meio segundo)', () => {
  const { w, A, B } = setup('brotossauro', { gap: 140 });
  assert(cast(w, A, 'coalShot', { aimPoint: { x: B.x, y: B.y } }), 'não atirou');
  until(w, () => B.hp < B.maxHp, 1.5);
  assert(B.hp < B.maxHp, 'pedra não acertou a 140 px');
  const c = coals(w, A);
  assert(c.length === 1 && Math.hypot(c[0].x - B.x, c[0].y - B.y) < B.r + 8, 'brasa não caiu aos pés do alvo');
  assert(c[0].age < Forge.FORGE.arm, 'brasa já nasceu armada');
});

test('Brasa armada: inimigo que pisa faz ela ESTOURAR (dano e queimadura); quem voa passa por cima', () => {
  const { w, A, B } = setup('brotossauro', { gap: 120 });
  const z = Forge.dropCoal(w, A, B.x, B.y);
  const hp = B.hp;
  until(w, () => z.life <= 0, 1.5);
  assert(z.life <= 0 && B.hp < hp, 'brasa armada não estourou debaixo do inimigo');
  assert(B.status.burn > 0 || B.element === 'fire', 'estouro não queimou');
  // Araralvo voa baixo: não dispara a brasa.
  const r = setup('araralvo', { gap: 120 });
  const z2 = Forge.dropCoal(r.w, r.A, r.B.x, r.B.y);
  step(r.w, 1.2);
  assert(z2.life > 0, 'quem voa não deveria pisar na brasa');
});

test('Centelha Ativa: recolher uma brasa dá DISPARADA e uma CENTELHA; o próximo tiro sai INCANDESCENTE e explode', () => {
  const { w, A, B } = setup('brotossauro', { gap: 120 });
  const z = Forge.dropCoal(w, A, A.x + 30, A.y);
  step(w, Forge.FORGE.arm + 0.05);
  A.x = z.x; A.y = z.y; step(w, 0.05);
  assert(z.life <= 0 && A.spark === 1, 'não recolheu a brasa');
  assert(A.status.haste > 0 && A.speedMult(w) > 1.15, 'recolher não deu disparada');
  A.x = 250; A.y = 250; B.hp = B.maxHp;
  let boom = false;
  assert(cast(w, A, 'coalShot', { aimPoint: { x: B.x, y: B.y } }), 'não atirou');
  for (let k = 0; k < 1.5 / DT && !boom; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'explosion') boom = true; }
  assert(A.spark === 0, 'tiro incandescente não gastou a centelha');
  assert(boom && B.hp < B.maxHp, 'tiro incandescente não explodiu no alvo');
  // Cheia de centelhas, não recolhe mais (a brasa fica para a Ignição).
  A.spark = Forge.sparkMax(A);
  const z2 = Forge.dropCoal(w, A, A.x, A.y + 30);
  step(w, Forge.FORGE.arm + 0.05);
  A.y = z2.y; step(w, 0.1);
  assert(z2.life > 0, 'recolheu brasa mesmo com as centelhas cheias');
});

test('Brasas: água apaga, e passar do limite apaga a mais velha', () => {
  const { w, A } = setup('brotossauro', { gap: 160 });
  const z = Forge.dropCoal(w, A, 220, 300);
  w.douseArea(220, 300, 10, 5, null);
  step(w, 0.05);
  assert(z.life <= 0, 'água não apagou a brasa');
  const first = Forge.dropCoal(w, A, 150, 180);
  for (let k = 1; k <= 5; k++) Forge.dropCoal(w, A, 150 + k * 30, 180);
  assert(first.life <= 0 && coals(w, A).length === 5, 'limite de brasas não respeitado');
});

test('Ignição: TODAS as brasas explodem; o mesmo alvo pego por várias leva menos nas repetições', () => {
  const { w, A, B } = setup('brotossauro', { gap: 120 });
  for (const [dx, dy] of [[-12, 0], [12, 0], [0, 12]]) Forge.dropCoal(w, A, B.x + dx, B.y + dy);
  for (const z of coals(w, A)) z.age = 0.2; // ainda não armadas: só a Ignição as detona
  const hp = B.hp;
  assert(cast(w, A, 'ignition'), 'não usou');
  step(w, 0.4);
  const lost = hp - B.hp;
  assert(coals(w, A).length === 0, 'sobrou brasa');
  assert(lost > 6 && lost < 6 * 3, `dano da Ignição fora do esperado (${lost.toFixed(1)})`);
});

test('Jato de Fogo: raio contínuo que queima quem está na linha, acende o chão e detona as brasas no caminho', () => {
  const { w, A, B } = setup('brotossauro', { gap: 110 });
  const z = Forge.dropCoal(w, A, A.x + 55, A.y);
  z.age = 1;
  let blasts = 0;
  assert(cast(w, A, 'flameJet', { aimPoint: { x: B.x, y: B.y } }), 'não usou');
  for (let k = 0; k < 1.6 / DT; k++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'explosion') blasts++; }
  assert(B.hp < B.maxHp - 6, `jato quase não feriu (${(B.maxHp - B.hp).toFixed(1)})`);
  assert(z.life <= 0 && blasts >= 1, 'jato não detonou a brasa no caminho');
  let lit = 0;
  for (let x = A.x + 20; x < B.x; x += 8) if (w.terrain.fire[w.terrain.at(x, A.y)] > 0 || w.terrain.soot[w.terrain.at(x, A.y)] > 0) lit++;
  assert(lit > 0, 'jato não acendeu o chão');
});

test('Recuo Arredio: salta PARA TRÁS (contra a mira), invulnerável, deixando 2 brasas onde estava', () => {
  const { w, A } = setup('brotossauro', { gap: 60 });
  const x0 = A.x;
  assert(cast(w, A, 'shyLeap'), 'não saltou');
  assert(A.status.invuln > 0, 'não ficou invulnerável');
  until(w, () => !A.action, 1);
  assert(A.x < x0 - 60, `não recuou (andou ${(A.x - x0).toFixed(0)} px)`);
  const c = coals(w, A);
  assert(c.length === 2 && c.every((z) => Math.abs(z.x - x0) < 12), 'não deixou 2 brasas no ponto de partida');
});

test('Rabada Fumegante: empurra para longe quem está em volta (inclusive atrás)', () => {
  const { w, A, B } = setup('pugilar', { gap: -24 });
  const d0 = Math.hypot(B.x - A.x, B.y - A.y);
  assert(cast(w, A, 'smokeTail'), 'não usou');
  step(w, 0.4);
  assert(B.hp < B.maxHp && Math.hypot(B.x - A.x, B.y - A.y) > d0 + 15, 'rabada não acertou/empurrou quem estava atrás');
});

test('Fornalhonte: recolher brasa dá CENTELHA e COURAÇA (escudo), com limite', () => {
  const { w, A } = setup('brotossauro', { gap: 160, evolved: true });
  assert(A.def.key === 'brasaliscoAscendido', 'não evoluiu');
  const sig = A.def.sig;
  for (let k = 0; k < 4; k++) {
    const z = Forge.dropCoal(w, A, A.x + 30, A.y + k * 3);
    z.age = 1; A.x = z.x; A.y = z.y; step(w, 0.05); A.x -= 30;
  }
  assert(A.spark === 3, `centelhas: ${A.spark}`);
  assert(A.status.shield > 0 && A.shieldHp === sig.armorMax, `couraça: ${A.shieldHp}`);
});

test('Salva das Chaminés: 3 bombas em arco caem na área marcada, ferem e deixam brasas', () => {
  const { w, A, B } = setup('brotossauro', { gap: 140, evolved: true });
  const hp = B.hp;
  assert(cast(w, A, 'chimneyVolley', { point: { x: B.x, y: B.y }, aimPoint: { x: B.x, y: B.y } }), 'não lançou');
  step(w, 0.45);
  assert(w.projectiles.filter((p) => p.kind === 'forgeBomb').length === 3, 'não saíram 3 bombas');
  step(w, 1.4);
  assert(B.hp < hp, 'bombas não feriram o alvo');
  assert(coals(w, A).length >= 2, 'bombas não deixaram brasas');
});

test('Tranco do Colosso: atropela, arremessa e RECOLHE as brasas no caminho', () => {
  const { w, A, B } = setup('brotossauro', { gap: 110, evolved: true });
  for (const x of [A.x + 40, A.x + 70]) Forge.dropCoal(w, A, x, A.y).age = 1;
  B.y = A.y + 2;
  assert(cast(w, A, 'colossusRam'), 'não investiu');
  until(w, () => !A.action, 1.5);
  assert(B.hp < B.maxHp, 'tranco não acertou');
  assert(A.spark === 2 && coals(w, A).length === 0, 'tranco não recolheu as brasas do caminho');
});

test('Partida inteira com a Brasalinha (IA): usa as habilidades, espalha e recolhe brasas, termina', () => {
  let picks = 0, drops = 0, casts = new Set();
  for (const arena of ['quadra', 'abismo']) {
    const w = World.duel(4, 'brasalisco', 'raiolua', arena);
    while (!w.over && w.time < 240) {
      w.step(DT);
      for (const e of w.drainEvents()) {
        if (e.type === 'coalPick') picks++;
        if (e.type === 'coalDrop') drops++;
        if (e.type === 'cast' && e.m.line === 'brasalisco') casts.add(e.ab);
      }
    }
    assert(w.over, `partida em ${arena} não terminou`);
  }
  assert(drops > 5 && picks > 0, `brasas: ${drops} caíram, ${picks} recolhidas`);
  for (const id of ['coalShot', 'flameJet', 'ignition']) assert(casts.has(id), `IA nunca usou ${id}`);
});

let fails = 0;
console.log('\nBrasalinha / Fornalhonte (fogo de longe)\n');
for (const r of results) { console.log(`[${r.ok ? 'OK' : 'FALHOU'}]  ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) fails++; }
console.log(fails ? `\n${fails} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(fails ? 1 : 0);
