// Cenários de evolução e das arenas. Uso: node test/evolution.mjs
import { World } from '../src/sim/world.js';
import { mulberry32 } from '../src/core/math.js';
import { DT, EVOLUTION, SWITCH } from '../src/config.js';
import { SPECIES, ROSTER, DEFAULT_TEAM } from '../src/sim/species.js';
// Sorteia 3 monstros distintos dos 6 (determinístico por seed), para cobrir todo o elenco.
const pick3 = (seed, k) => { const r = mulberry32(seed * 131 + k * 17 + 5); const a = [...ROSTER]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 3); };
import { ARENA_ORDER, ARENAS } from '../src/arenas/index.js';
import { props } from '../src/sim/tiles.js';

const results = [];
const test = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.message }); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };
const until = (w, pred, s = 10) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };
function quiet(seed = 1, team = [...DEFAULT_TEAM], arena = 'quadra') {
  const w = World.match(seed, [team, [...DEFAULT_TEAM]], 0, arena);
  for (const m of w.teamOf(1)) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches[1] = null;
  const foe = w.fieldOf(1);
  foe.x = foe.px = 600; foe.y = foe.py = 320;
  until(w, () => !w.fieldOf(0).switchState, 2);
  return w;
}

for (const line of ROSTER) {
  const evo = SPECIES[SPECIES[line].evolvesTo];
  test(`${SPECIES[line].name} evolui para ${evo.name} mantendo a % de vida e as recargas`, () => {
    const w = quiet(1, [line, ...DEFAULT_TEAM.filter((k) => k !== line)].slice(0, 3));
    const m = w.fieldOf(0);
    m.hp = m.maxHp * 0.4;
    m.energy = EVOLUTION.threshold;
    const shared = m.def.abilities.map((a) => a.id).find((id) => evo.abilities.some((b) => b.id === id));
    if (shared) m.cd[shared] = 5;
    const cdBefore = shared ? m.cd[shared] : 0;
    assert(w.requestEvolve(m), 'evolução recusada');
    assert(!w.requestEvolve(m), 'evoluiu duas vezes ao mesmo tempo');
    until(w, () => m.evolveT <= 0, 3);
    assert(m.def === evo && m.evolved && m.stage === 2, 'forma não mudou');
    near(m.hp / m.maxHp, 0.4, 0.02, 'porcentagem de vida');
    assert(m.maxHp === evo.hp, 'vida máxima da forma evoluída');
    if (shared) near(m.cd[shared], cdBefore - EVOLUTION.transformTime, 0.05, `recarga de ${shared} preservada`);
    assert(w.roster.includes(m) && w.teamOf(0)[0] === m, 'instância recriada');
    m.energy = EVOLUTION.threshold;
    assert(!w.requestEvolve(m), 'evoluiu duas vezes na mesma partida');
  });
}

test('Exemplo do enunciado: 40/100 → 60/150 (proporcional)', () => {
  const w = quiet(2);
  const m = w.fieldOf(0);
  const evo = SPECIES[m.def.evolvesTo];
  m.hp = m.maxHp * 0.4;
  m.energy = EVOLUTION.threshold;
  w.requestEvolve(m);
  until(w, () => m.evolved, 3);
  near(m.hp, evo.hp * 0.4, 0.5, 'vida proporcional');
});

test('Cada forma evoluída tem habilidades próprias e usa em combate', () => {
  for (const line of ROSTER) {
    const base = SPECIES[line], evo = SPECIES[base.evolvesTo];
    const newIds = evo.abilities.filter((a) => !base.abilities.some((b) => b.id === a.id)).map((a) => a.id);
    assert(newIds.length >= 3, `${evo.name} tem só ${newIds.length} habilidades novas`);
    assert(evo.hp !== base.hp && evo.speed !== base.speed && evo.radius !== base.radius, `${evo.name}: atributos iguais à base`);
  }
  const used = {};
  for (let seed = 1; seed <= 30; seed++) {
    const w = World.match(seed, [pick3(seed, 0), pick3(seed, 1)], null, 'quadra');
    while (!w.over && w.time < 300) {
      w.step(DT);
      for (const e of w.drainEvents()) if (e.type === 'cast' && e.m.evolved) used[e.ab] = (used[e.ab] || 0) + 1;
    }
  }
  for (const line of ROSTER) {
    const base = SPECIES[line], evo = SPECIES[base.evolvesTo];
    const fresh = evo.abilities.filter((a) => !base.abilities.some((b) => b.id === a.id) && a.kind !== 'dodge');
    const usedFresh = fresh.filter((a) => used[a.id]);
    assert(usedFresh.length >= 2, `${evo.name} usou só ${usedFresh.map((a) => a.id)} em combate`);
  }
});

test('Energia persiste no banco; derrotado não evolui; IA evolui sozinha', () => {
  const w = quiet(3);
  const [A, B] = w.teamOf(0);
  A.energy = 90;
  w.requestSwitch(0, B);
  until(w, () => B.onField && !B.switchState, 2);
  step(w, 4);
  near(A.energy, 90, 1e-9, 'energia mudou no banco');
  B.energy = EVOLUTION.threshold;
  w.damage(B, 9999, null);
  assert(!w.requestEvolve(B), 'derrotado evoluiu');
  // IA: em partidas IA × IA, monstros evoluem sem comando do jogador.
  let evolved = 0;
  const w2 = World.match(4, undefined, null, 'jardim');
  while (!w2.over && w2.time < 300) { w2.step(DT); for (const e of w2.drainEvents()) if (e.type === 'evolveSwap') evolved++; }
  assert(evolved > 0, 'IA nunca evoluiu');
});

test('A transformação não pausa a batalha (inimigo continua agindo)', () => {
  const w = World.match(5, undefined, 0, 'quadra');
  const m = w.fieldOf(0);
  until(w, () => !m.switchState && !w.fieldOf(1).switchState, 2);
  m.energy = EVOLUTION.threshold;
  w.requestEvolve(m);
  let foeActs = 0;
  for (let k = 0; k < EVOLUTION.transformTime / DT; k++) {
    w.step(DT);
    for (const e of w.drainEvents()) if (e.type === 'cast' && e.m.team === 1) foeActs++;
    const f = w.fieldOf(1);
    if (Math.hypot(f.vx, f.vy) > 5) foeActs += 0.01;
  }
  assert(foeActs > 0, 'inimigo ficou parado durante a evolução');
});

for (const id of ARENA_ORDER) {
  test(`Arena ${ARENAS[id].name}: carrega geometria própria, IA navega, luta, troca e termina`, () => {
    let ends = 0, switches = 0, hits = 0, invalid = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const w = World.match(seed, undefined, null, id);
      assert(w.arenaId === id, 'arena errada carregada');
      for (const sp of w.spawns) assert(w.standable({ r: 13, element: 'fire', level: w.terrain.heightAt(sp.x, sp.y) }, sp.x, sp.y), 'ponto de nascimento inválido');
      while (!w.over && w.time < 300) {
        w.step(DT);
        for (const e of w.drainEvents()) { if (e.type === 'hit' && !e.dot) hits++; if (e.type === 'enter' && e.reason === 'switch') switches++; }
        for (const m of w.monsters) if (m.alive && !w.standable(m, m.x, m.y)) invalid++;
      }
      if (w.over) ends++;
    }
    assert(ends === 3, `${3 - ends} partidas não terminaram`);
    assert(hits > 60, `pouco combate (${hits} golpes)`);
    assert(switches > 0, 'ninguém trocou de monstro');
    assert(invalid === 0, `${invalid} ticks com monstro em posição inválida`);
  });
}

test('Arenas têm geometria e regras distintas', () => {
  const sig = {};
  for (const id of ARENA_ORDER) {
    const w = new World(1, id);
    const kinds = new Set(w.obstacles.map((o) => o.kind));
    const types = new Set(w.terrain.type);
    sig[id] = { kinds: [...kinds].sort().join(), types: [...types].sort().join(), walls: w.walls.length, hazards: w.hazards.map((h) => h.kind).join(), heights: new Set(w.terrain.height).size };
  }
  const uniq = new Set(Object.values(sig).map((s) => JSON.stringify(s)));
  assert(uniq.size === ARENA_ORDER.length, 'duas arenas iguais');
  assert(sig.jardim.hazards.includes('rootVent') && sig.jardim.types.includes('8'), 'jardim sem raízes/espinheiros');
  assert(sig.abismo.heights >= 4 && sig.abismo.hazards.includes('geyser'), 'abismo sem níveis/gêiseres');
  assert(sig.floresta.kinds.includes('tree') && sig.floresta.kinds.includes('log'), 'floresta sem árvores/troncos');
});

test('Abismo: água funda bloqueia quem não nada; plataforma alta bloqueia tiros de baixo', () => {
  const w = World.match(1, undefined, null, 'abismo');
  const tr = w.terrain;
  // Um tile de água funda cercado de água funda, longe da borda do mundo.
  const deep = tr.type.findIndex((t, i) => props(t).deep && [[-2, 0], [2, 0], [0, -2], [0, 2]].every(([dx, dy]) => { const j = tr.idx(i % 80 + dx, ((i / 80) | 0) + dy); return j >= 0 && props(tr.type[j]).deep; }) && i % 80 > 3 && (i / 80 | 0) > 3);
  const fire = w.roster.find((m) => m.element === 'fire'), water = w.roster.find((m) => m.element === 'water');
  const lvl = (m) => ({ r: m.r, element: m.element, level: 0 });
  assert(!w.standable(lvl(fire), tr.cx(deep), tr.cy(deep)), 'fogo entrou na água funda');
  assert(w.standable(lvl(water), tr.cx(deep), tr.cy(deep)), 'água não nada na água funda');
  const P = w.platform;
  const top = { x: P.x + P.w / 2, y: P.y + P.h / 2 }, below = { x: P.x - 30, y: P.y + P.h / 2 };
  assert(tr.heightAt(top.x, top.y) === 2.5 && tr.heightAt(below.x, below.y) === 1, 'alturas inesperadas');
  assert(!w.los(below.x, below.y, top.x, top.y), 'de baixo enxerga/atira em cima');
  assert(w.los(top.x, top.y, below.x, below.y), 'de cima não atira para baixo');
  // Um monstro não sobe o penhasco direto, só pela escada.
  const probe = { r: 9, element: 'fire', level: 1 };
  assert(!w.standable(probe, P.x + 4, P.y + 20), 'subiu o penhasco sem escada');
  assert(w.standable({ ...probe, level: 1 }, P.x + P.w / 2, P.y - 12), 'escada inacessível');
});

let failed = 0;
console.log('\nCenários de evolução e arenas\n');
for (const r of results) {
  console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : `\n       ${r.err}`}`);
  if (!r.ok) failed++;
}
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
void SWITCH;
process.exit(failed ? 1 : 0);
