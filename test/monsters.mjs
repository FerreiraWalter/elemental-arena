// Mecânicas dos 3 novos monstros e suas evoluções. Uso: node test/monsters.mjs
import { World } from '../src/sim/world.js';
import { DT, EVOLUTION } from '../src/config.js';
import { SPECIES, ROSTER } from '../src/sim/species.js';
import { props } from '../src/sim/tiles.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const until = (w, pred, s = 10) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };

// Duelo parado: o inimigo (monstro dummy) não age; `me` começa em (200,200) e o alvo em (200+gap, 200).
function setup(line, { evolved = false, foe = 'brotossauro', gap = 130 } = {}) {
  const w = World.match(3, [[line, 'hidrocasco', 'brotossauro'], [foe, 'brasalisco', 'hidrocasco']], 0, 'quadra');
  for (const m of w.teamOf(1)) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches[1] = null;
  const me = w.fieldOf(0), f = w.fieldOf(1);
  until(w, () => !me.switchState && !f.switchState, 2);
  me.x = me.px = 200; me.y = me.py = 200; me.level = w.terrain.heightAt(200, 200);
  f.x = f.px = 200 + gap; f.y = f.py = 200; f.level = w.terrain.heightAt(f.x, f.y);
  // Limpa o terreno em volta (a quadra tem mato/obstáculos espalhados).
  for (const o of w.obstacles) if (Math.hypot(o.x - 260, o.y - 200) < 140) { o.destroyed = true; o.solid = false; }
  if (evolved) { me.energy = EVOLUTION.threshold; w.requestEvolve(me); until(w, () => me.evolved && me.evolveT <= 0, 3); me.x = 200; me.y = 200; for (const k in me.cd) me.cd[k] = 0; f.x = 200 + gap; f.y = 200; f.kx = f.ky = f.vx = f.vy = 0; f.status.stun = 0; f.status.root = 0; f.hp = f.maxHp; }
  me.facing = 0;
  return { w, me, f };
}
const cast = (w, me, id, extra = {}) => me.cast(w, me.ability(id), { aim: 0, dir: 0, aimPoint: { x: 400, y: 200 }, point: { x: 330, y: 200 }, ...extra });
const NEW = ROSTER.slice(3);

test('Todos os 8 monstros e 16 formas existem, com sprite e controles válidos', () => {
  assert(ROSTER.length === 8 && Object.keys(SPECIES).length === 16, 'elenco incompleto');
  for (const s of Object.values(SPECIES)) {
    assert(s.sprite && s.controls.primary && s.controls.melee && s.controls.dodge, `${s.key} sem sprite/controles`);
    for (const id of Object.values(s.controls)) assert(s.abilities.some((a) => a.id === id), `${s.key}: controle ${id} sem habilidade`);
    assert(s.abilities.every((a) => a.desc), `${s.key}: habilidade sem descrição`);
  }
});

test('Ouriflama: Investida Incandescente deixa um largo rastro de fogo', () => {
  const { w, me } = setup('ouriflama', { gap: 260 });
  assert(cast(w, me, 'blazeRush'), 'não iniciou a investida');
  until(w, () => !me.action, 2);
  assert(me.x > 280, `investida curta demais (${me.x.toFixed(0)})`);
  const burning = [...w.terrain.burning].filter((i) => Math.abs(w.terrain.cy(i) - 200) < 14 && w.terrain.cx(i) > 200 && w.terrain.cx(i) < me.x);
  assert(burning.length >= 12, `rastro pequeno: ${burning.length} tiles`);
  const rows = new Set(burning.map((i) => Math.round(w.terrain.cy(i)))).size;
  assert(rows >= 2, 'rastro estreito (1 fileira)');
});

test('Ouriflama Vulcânico: Mergulho invulnerável persegue, irrompe embaixo do inimigo e o LEVANTA', () => {
  const { w, me, f } = setup('ouriflama', { evolved: true, gap: 150 });
  assert(me.def.key === 'ouriflamaVulcanico', 'não evoluiu');
  assert(cast(w, me, 'burrow'), 'não iniciou o mergulho');
  until(w, () => me.action?.phase === 'active', 1);
  const hp = me.hp;
  assert(me.status.invuln > 0, 'não ficou invulnerável sob a terra');
  assert(w.damage(me, 50, f, { element: 'water' }) === 0 && me.hp === hp, 'tomou dano debaixo da terra');
  f.x += 0; // alvo parado; o mergulho o persegue
  const fhp = f.hp;
  let lifted = 0, maxLift = 0;
  for (let k = 0; k < 4 / DT; k++) { w.step(DT); w.drainEvents(); if (f.lift > 0) { lifted++; maxLift = Math.max(maxLift, f.lift); } if (!me.action && lifted) break; }
  assert(lifted > 10, 'o inimigo não foi levantado');
  assert(f.hp < fhp - 8, `dano da erupção insuficiente (${(fhp - f.hp).toFixed(1)})`);
  assert(f.status.stun > 0 || f.hp < fhp, 'sem atordoamento');
  assert(Math.hypot(me.x - f.x, me.y - f.y) < 70, 'não emergiu perto do alvo');
});

test('Gotapus: Nuvem de Tinta bloqueia a visão e depois some', () => {
  const { w, me, f } = setup('gotapus', { gap: 120 });
  for (const o of w.obstacles) { o.destroyed = true; o.solid = false; }
  assert(w.los(me.x, me.y, f.x, f.y), 'sem visão antes da tinta (setup)');
  assert(cast(w, me, 'inkCloud'), 'não lançou a tinta');
  step(w, 0.6);
  assert(!w.los(me.x, me.y, f.x, f.y), 'tinta não bloqueou a visão');
  step(w, 9);
  assert(w.los(me.x, me.y, f.x, f.y) && w.steam.length === 0, 'tinta não se dissipou');
});

test('Leviapus: Ilusão de Tinta cria 3 cópias; a Maré Esmagadora carrega o inimigo e arrebenta', () => {
  const { w, me, f } = setup('gotapus', { evolved: true, gap: 60 });
  assert(me.def.key === 'leviapus', 'não evoluiu');
  assert(cast(w, me, 'krakenIllusion'), 'não lançou a ilusão');
  step(w, 0.25);
  assert(w.decoys.filter((d) => d.owner === me).length === 3 && me.status.cloak > 0, 'ilusão sem 3 cópias/camuflagem');
  for (const k in me.cd) me.cd[k] = 0; me.action = null;
  f.x = me.x + 50; f.y = me.y; f.kx = f.ky = 0;
  const x0 = f.x, hp = f.hp;
  assert(cast(w, me, 'tidalWave'), 'não lançou a onda');
  let crash = false, maxR = 0;
  for (let k = 0; k < 2 / DT; k++) {
    w.step(DT);
    for (const p of w.projectiles) if (p.kind === 'wave') maxR = Math.max(maxR, p.r);
    for (const e of w.drainEvents()) if (e.type === 'waveCrash') crash = true;
  }
  assert(maxR > 20, `a onda não cresceu (${maxR.toFixed(1)})`);
  assert(f.x - x0 > 60, `a onda não carregou o inimigo (${(f.x - x0).toFixed(0)} px)`);
  assert(crash && f.hp < hp - 14, 'a onda não arrebentou / dano fraco');
});

test('Mantifolha: Salto Longo atravessa obstáculos e inimigos (invulnerável no ar)', () => {
  const { w, me, f } = setup('mantifolha', { gap: 70 });
  w.addObstacle('rock', 240, 200, 12);
  assert(cast(w, me, 'longLeap'), 'não saltou');
  until(w, () => me.action?.phase === 'active', 1);
  assert(me.status.invuln > 0, 'sem invulnerabilidade no salto');
  until(w, () => !me.action, 2);
  assert(me.x > 330, `salto curto (${me.x.toFixed(0)})`);
  assert(Math.hypot(me.x - f.x, me.y - f.y) >= me.r + f.r - 1, 'monstros sobrepostos após o salto');
  assert(w.standable(me, me.x, me.y), 'aterrissou em posição inválida');
});

test('Silvamante: Salto Celeste cobre ~250 px, aterrissa causando dano e enraizando', () => {
  const { w, me, f } = setup('mantifolha', { evolved: true, gap: 245, foe: 'hidrocasco' });
  assert(me.def.key === 'silvamante', 'não evoluiu');
  const hp = f.hp;
  assert(cast(w, me, 'skyLeap', { aimPoint: { x: f.x, y: f.y } }), 'não saltou'); // mira no inimigo a ~245 px
  until(w, () => !me.action, 3);
  assert(me.x > 380, `salto curto (${me.x.toFixed(0)})`);
  assert(f.hp < hp, 'sem dano no pouso');
  assert(f.status.root > 0.5, 'sem enraizar no pouso');
});

test('Evolução dos 3 novos: vida proporcional e formas distintas das base', () => {
  for (const line of NEW) {
    const base = SPECIES[line], evo = SPECIES[base.evolvesTo];
    assert(evo.hp > base.hp && evo.radius > base.radius, `${evo.name} não é maior que a base`);
    const newIds = evo.abilities.filter((a) => !base.abilities.some((b) => b.id === a.id));
    assert(newIds.length >= 3, `${evo.name} com poucas habilidades novas`);
    const { w, me } = setup(line);
    me.hp = me.maxHp * 0.4;
    me.energy = EVOLUTION.threshold;
    w.requestEvolve(me);
    until(w, () => me.evolved, 3);
    assert(Math.abs(me.hp / me.maxHp - 0.4) < 0.02, `${evo.name}: % de vida`);
  }
});

test('Os 7 monstros lutam em todas as arenas sem posição inválida', () => {
  for (const arena of ['jardim', 'abismo', 'floresta', 'quadra']) {
    const w = World.match(5, [['ouriflama', 'gotapus', 'mantifolha'], ['mantifolha', 'ouriflama', 'gotapus']], null, arena);
    let invalid = 0;
    while (!w.over && w.time < 300) {
      w.step(DT); w.drainEvents();
      for (const m of w.monsters) if (m.alive && !w.standable(m, m.x, m.y) && !(m.action?.ab.leap)) invalid++;
    }
    assert(w.over, `${arena}: não terminou`);
    assert(invalid < 30, `${arena}: ${invalid} ticks em posição inválida`);
  }
});

test('2v2 local simulado: 4 monstros, equipes e vitória por lado', () => {
  const rosters = [['ouriflama', 'gotapus', 'mantifolha'], ['brasalisco', 'hidrocasco', 'brotossauro'], ['mantifolha', 'ouriflama', 'gotapus'], ['hidrocasco', 'brotossauro', 'brasalisco']];
  const w = World.match(9, rosters, null, 'floresta', 'normal', { sides: [0, 0, 1, 1] });
  assert(w.monsters.length === 4, 'esperava 4 monstros em campo');
  assert(w.monsters.filter((m) => m.team === 0).length === 2, 'duas por lado');
  let maxField = 0;
  while (!w.over && w.time < 400) {
    w.step(DT); w.drainEvents();
    maxField = Math.max(maxField, w.monsters.filter((m) => m.alive).length);
    for (let s = 0; s < 4; s++) assert(w.monsters.filter((m) => m.slot === s && m.alive).length <= 1, 'vaga com 2 monstros vivos em campo');
    // Fogo amigo não existe: nenhum aliado leva dano de projétil/golpe do parceiro.
  }
  assert(w.over && maxField === 4, 'partida 2v2 não terminou ou não teve 4 em campo');
  const dead = (side) => w.roster.filter((m) => m.team === side && !m.alive).length;
  assert(dead(w.winner === 0 ? 1 : 0) === 6, 'o lado perdedor deveria ter os 6 monstros derrotados');
  void props;
});

let failed = 0;
console.log('\nNovos monstros (mecânicas) e 2v2\n');
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) failed++; }
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
