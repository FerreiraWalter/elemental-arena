// Arutchin → Anemokahn (Vento, Maestro dos 4 Braços): E/F zeram o Q e carregam a Brisa; Turbulência (E) vira crítico
// com ricochete no Q, micro-vácuo no E e Jaula de Vento no F; Q com 2 cargas dá escudo + disparada (duas lâminas na
// evolução); a Palma de Ar adianta o E; sincronização online da marca e das cargas.
// node test/zefirinho.mjs
import { World } from '../src/sim/world.js';
import { DT, EVOLUTION } from '../src/config.js';
import { SPECIES, ROSTER } from '../src/sim/species.js';
import { serialize, makeSyncCtx, applySnapshot } from '../src/net/snapshot.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };
const until = (w, pred, s = 5) => { for (let k = 0; k < s / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); } return pred(); };

// Gênio (vaga 0) contra um ou dois alvos parados (2v2 para ter dois inimigos), num chão aberto.
function setup({ gap = 90, evolved = false, two = false } = {}) {
  const rosters = two
    ? [['zefirinho', 'hidrocasco', 'brotossauro'], ['brotossauro', 'gotapus', 'raiolua'], ['hidrocasco', 'brasalisco', 'raiolua'], ['hidrocasco', 'mantifolha', 'raiolua']]
    : [['zefirinho', 'hidrocasco', 'brotossauro'], ['hidrocasco', 'brasalisco', 'raiolua']];
  const w = World.match(4, rosters, 0, 'quadra', 'normal', two ? { sides: [0, 1, 1, 1] } : {});
  for (const m of w.roster) { m.ai.update = () => { m.move.throttle = 0; }; m.controller = { update() {} }; }
  w.coaches = w.coaches.map(() => null);
  w.humans.clear();
  until(w, () => w.monsters.every((m) => !m.switchState), 2);
  for (const o of w.obstacles) if (Math.hypot(o.x - 300, o.y - 250) < 240) { o.destroyed = true; o.solid = false; }
  const A = w.fieldOf(0);
  if (evolved) { A.energy = EVOLUTION.threshold; w.requestEvolve(A); until(w, () => A.evolved && A.evolveT <= 0, 3); }
  A.x = A.px = 220; A.y = A.py = 250; A.facing = 0;
  const foes = w.monsters.filter((m) => m.team !== A.team);
  foes.forEach((B, k) => { B.x = B.px = 220 + gap; B.y = B.py = 250 + (k ? (k % 2 ? 1 : -1) * 34 * Math.ceil(k / 2) : 0); B.kx = B.ky = 0; B.hp = B.maxHp; for (const s in B.status) B.status[s] = 0; });
  for (const m of w.monsters) m.level = w.terrain.heightAt(m.x, m.y);
  for (const k in A.cd) A.cd[k] = 0;
  return { w, A, B: foes[0], foes };
}
const cast = (w, m, id, p) => m.cast(w, m.ability(id), { aim: Math.atan2(p.y - m.y, p.x - m.x), dir: 0, aimPoint: { x: p.x, y: p.y }, point: { x: p.x, y: p.y } });
const idle = (w, m) => until(w, () => !m.action, 2);
const watch = (w) => { const seen = []; const emit = w.emit.bind(w); w.emit = (e) => { seen.push(e); emit(e); }; return seen; };

test('Arutchin está no elenco, é de Vento, flutua e evolui para o Anemokahn', () => {
  assert(ROSTER.includes('zefirinho'), 'fora do elenco');
  const b = SPECIES.zefirinho, e = SPECIES.zefirao;
  assert(b.element === 'air' && e.element === 'air' && b.hover && b.evolvesTo === 'zefirao', 'elemento/voo/evolução');
  assert(b.sig.kind === 'maestro' && e.sig.twin, 'mecânica');
  assert(Math.abs(b.abilities.find((a) => a.id === 'vacuumBlade').cooldown - 3) < 0.05, 'recarga do Q deveria ser 3 s');
});

test('Fluxo: E zera a recarga do Q e guarda uma carga de Brisa (máx. 2)', () => {
  const { w, A, B } = setup();
  assert(cast(w, A, 'vacuumBlade', B), 'Q não saiu');
  idle(w, A);
  assert(A.cd.vacuumBlade > 1, 'o Q deveria estar recarregando');
  cast(w, A, 'turbulencePulse', B); idle(w, A);
  assert(A.cd.vacuumBlade === 0 && A.brisa === 1, `E não zerou o Q (${A.cd.vacuumBlade}) ou não carregou (${A.brisa})`);
  A.cd.turbulencePulse = 0; cast(w, A, 'turbulencePulse', B); idle(w, A);
  A.cd.turbulencePulse = 0; cast(w, A, 'turbulencePulse', B); idle(w, A);
  assert(A.brisa === 2, `a Brisa passou do máximo (${A.brisa})`);
});

test('Q em alvo com Turbulência: consome a marca e é crítico (mais dano que sem marca)', () => {
  const plain = setup(); cast(plain.w, plain.A, 'vacuumBlade', plain.B); until(plain.w, () => plain.B.hp < plain.B.maxHp, 1);
  const dPlain = plain.B.maxHp - plain.B.hp;
  const { w, A, B } = setup();
  cast(w, A, 'turbulencePulse', B); idle(w, A);
  assert(B.turb > 0, 'E não marcou');
  const hp = B.hp, seen = watch(w);
  A.brisa = 0; // sem sobrecarga, para comparar só o crítico
  cast(w, A, 'vacuumBlade', B); until(w, () => B.hp < hp, 1);
  assert(B.turb === 0, 'a marca não foi consumida');
  assert(seen.some((e) => e.type === 'vacuumCrit'), 'sem crítico');
  assert(hp - B.hp >= dPlain * 1.3, `crítico ${(hp - B.hp).toFixed(1)} × normal ${dPlain.toFixed(1)}`);
});

test('E em alvo marcado vira micro-vácuo: espalha a marca nos vizinhos e puxa; o Q crítico ricocheteia neles', () => {
  const { w, A, foes } = setup({ two: true, gap: 110 });
  const [B, C] = foes;
  cast(w, A, 'turbulencePulse', B); idle(w, A);
  A.cd.turbulencePulse = 0;
  const seen = watch(w);
  const dc0 = Math.hypot(C.x - B.x, C.y - B.y);
  cast(w, A, 'turbulencePulse', B); idle(w, A);
  assert(seen.some((e) => e.type === 'microVacuum'), 'sem micro-vácuo');
  assert(C.turb > 0, 'a marca não se espalhou');
  assert(Math.hypot(C.x - B.x, C.y - B.y) < dc0, 'o vizinho não foi puxado');
  A.brisa = 0;
  const hpC = C.hp;
  cast(w, A, 'vacuumBlade', B);
  until(w, () => C.hp < hpC, 1.5);
  assert(seen.some((e) => e.type === 'vacuumChain') && C.hp < hpC, 'o crítico não ricocheteou no outro marcado');
});

test('F: sem marca deixa lento; em alvo marcado vira Jaula de Vento (preso e levantado)', () => {
  const a = setup();
  cast(a.w, a.A, 'cyclonePressure', a.B); idle(a.w, a.A);
  assert(a.B.status.slow > 0 && !(a.B.lift > 0), 'sem marca deveria só deixar lento');
  const { w, A, B } = setup();
  cast(w, A, 'turbulencePulse', B); idle(w, A);
  cast(w, A, 'cyclonePressure', B);
  until(w, () => B.lift > 0, 1);
  assert(B.lift > 0 && B.status.root > 0 && B.turb === 0, 'a jaula não prendeu/levantou ou não consumiu a marca');
  assert(A.cd.vacuumBlade === 0, 'F não zerou o Q');
});

test('F sopra para longe os projéteis inimigos perto do gênio', () => {
  const { w, A, B } = setup();
  const p = w.spawnProjectile({ kind: 'seed', owner: B, ang: Math.PI, speed: 150, r: 3, range: 300, dmg: 5, x: A.x + 30, y: A.y });
  cast(w, A, 'cyclonePressure', { x: A.x + 60, y: A.y }); until(w, () => !A.action || A.action.phase !== 'windup', 1);
  step(w, 0.05);
  assert(p.dead || p.vx > 0, 'o projétil continuou vindo');
});

test('Q com 2 cargas de Brisa: escudo de vento + disparada; na evolução saem duas mãos de vento grandes', () => {
  const { w, A, B } = setup();
  A.brisa = 2;
  cast(w, A, 'vacuumBlade', B); step(w, 0.15);
  assert(A.brisa === 0 && A.status.shield > 0 && A.shieldHp > 0 && A.status.haste > 0, 'sem escudo/disparada');
  const e = setup({ evolved: true });
  assert(e.A.def.key === 'zefirao', 'não evoluiu');
  e.A.brisa = 2;
  cast(e.w, e.A, 'greaterVacuum', e.B); step(e.w, 0.13);
  const hands = e.w.projectiles.filter((p) => p.kind === 'windHand');
  assert(hands.length === 2, 'a evolução deveria soltar duas mãos de vento');
  assert(hands.every((p) => p.r >= 8), 'a mão de vento deveria ser grande (área de acerto)');
});

test('Palma de Ar que acerta adianta a recarga do E', () => {
  const { w, A, B } = setup({ gap: 70 });
  A.cd.turbulencePulse = 2;
  cast(w, A, 'airPalm', B);
  until(w, () => B.hp < B.maxHp, 1);
  assert(A.cd.turbulencePulse < 1.6, `E não adiantou (${A.cd.turbulencePulse.toFixed(2)})`);
});

test('Online: a marca de Turbulência e as cargas de Brisa vão no snapshot', () => {
  const { w, A, B } = setup();
  cast(w, A, 'turbulencePulse', B); idle(w, A);
  const snap = JSON.parse(JSON.stringify(serialize(w, makeSyncCtx(w))));
  const mirror = World.match(4, [['zefirinho', 'hidrocasco', 'brotossauro'], ['hidrocasco', 'brasalisco', 'raiolua']], 0, 'quadra', 'normal', { mirror: true });
  applySnapshot(mirror, snap, {});
  const mA = mirror.roster[w.roster.indexOf(A)], mB = mirror.roster[w.roster.indexOf(B)];
  assert(mA.brisa === 1, 'Brisa não chegou no espelho');
  assert(mB.turb > 0 && mB.turbBy === mA.id, 'Turbulência não chegou no espelho');
});

test('IA com o gênio faz os combos numa luta de verdade (marca, crítico, jaula e sobrecarga)', () => {
  const w = World.match(2, [['zefirinho', 'hidrocasco', 'brotossauro'], ['raiolua', 'pantrinja', 'ouriflama']], null, 'quadra');
  const seen = new Set();
  for (let k = 0; k < 120 / DT && !w.over; k++) { w.step(DT); for (const e of w.drainEvents()) seen.add(e.type); }
  for (const t of ['turbMark', 'qReset', 'vacuumCrit', 'windCage', 'windSurge']) assert(seen.has(t), `a IA nunca fez ${t}`);
});

let fail = 0;
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n        ' + r.err}`); if (!r.ok) fail++; }
console.log(fail ? `\n${fail} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(fail ? 1 : 0);
