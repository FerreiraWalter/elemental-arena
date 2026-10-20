// Brotossauro suporte (pulso de cura + escudo de 3 s no 2v2) e Quebra de Combo.
// node test/support.mjs
import { World } from '../src/sim/world.js';
import { DT, COMBO_BREAK } from '../src/config.js';
import { serialize, makeSyncCtx, applySnapshot } from '../src/net/snapshot.js';
import { createMirror } from '../src/net/mirror.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 2).join(' | ') }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };

function duo() {
  const rosters = [['brotossauro', 'hidrocasco', 'brasalisco'], ['mantifolha', 'ouriflama', 'gotapus'], ['hidrocasco', 'brotossauro', 'brasalisco'], ['ouriflama', 'gotapus', 'mantifolha']];
  const w = World.match(3, rosters, null, 'quadra', 'normal', { sides: [0, 0, 1, 1] });
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  step(w, 1.5);
  const [a, b, c, d] = w.monsters;
  a.x = b.x = 200; a.y = 200; b.y = 225; c.x = d.x = 600; c.y = 100; d.y = 300;
  return { w, a, b, c, d };
}

test('Casca Viva: parceiro no alcance recebe redução de dano + cura contínua; em você é mais fraca; inimigo longe nada', () => {
  const { w, a, b, c } = duo();
  assert(a.def.key === 'brotossauro', 'esperava Brotossauro na vaga 0');
  b.x = a.x + 120; b.y = a.y; // longe do corpo, mas dentro do alcance (150)
  a.hp = a.maxHp - 40; b.hp = b.maxHp - 40; c.hp = c.maxHp - 40;
  const hpB = b.hp, hpC = c.hp;
  assert(a.cast(w, a.ability('barkGuard'), { aim: 0 }), 'não conseguiu usar a Casca Viva');
  step(w, 0.4);
  assert(a.status.dr > 0 && b.status.dr > 0, 'sem casca em você e no parceiro');
  assert(b.drK > a.drK, 'a casca deveria ser mais forte no parceiro');
  assert(c.status.dr <= 0 && c.hp === hpC, 'inimigo não deve ser afetado');
  step(w, 2);
  assert(b.hp > hpB + 8, 'parceiro não regenerou');
  // Redução de dano real: o mesmo golpe dói menos em quem está de casca.
  const before = b.hp; w.damage(b, 20, c, { tag: 't', element: 'earth' });
  assert(before - b.hp < 20 * (1 - 0.3), `casca não reduziu o dano (${(before - b.hp).toFixed(1)})`);
  step(w, 3);
  assert(b.status.dr <= 0, 'casca deveria acabar em ~4 s');
});

test('Seiva e flores carnívoras: ataques do Brotossauro deixam LENTO e a sentinela morde quem encosta', () => {
  const { w, a, c } = duo();
  c.x = a.x + 30; c.y = a.y;
  w.damage(c, 5, a, { tag: 't', element: 'plant', slow: [1.5, 0.3] });
  assert(c.status.slow > 1 && Math.abs(c.slowK - 0.3) < 1e-6, 'lentidão não aplicada');
  const o = w.addObstacle('sentry', c.x + 12, c.y, 6);
  o.sentry = true; o.owner = a; o.team = a.team; o.life = 10; o.fireT = 99;
  const hp = c.hp; step(w, 0.3);
  assert(c.hp < hp, 'sentinela não mordeu quem encostou');
  assert(w.obstacles.find((q) => q.kind === 'sentry').def.shot.range >= 150, 'alcance da sentinela deveria ser >= 150');
});

test('Sentinela do Brotossauro cura também o aliado', () => {
  const { w, a, b } = duo();
  a.hp = a.maxHp; b.hp = b.maxHp - 50;
  const o = w.addObstacle('sentry', 205, 212, 6);
  o.sentry = true; o.owner = a; o.team = a.team; o.life = 10; o.fireT = 99;
  step(w, 3);
  assert(b.hp > b.maxHp - 50 + 4, 'aliado perto da sentinela não curou');
});

test('Quebra de Combo: libertar de atordoamento gasta energia, dá invulnerabilidade e tem recarga', () => {
  const { w, a, c } = duo();
  a.status.stun = 1; a.energy = 100;
  assert(w.canBreakCombo(a), 'deveria poder quebrar');
  assert(w.breakCombo(a), 'falhou ao quebrar');
  assert(a.status.stun === 0 && a.status.invuln > 0, 'não libertou / sem invulnerabilidade');
  assert(Math.abs(a.energy - (100 - COMBO_BREAK.cost)) < 0.01, 'energia não foi gasta');
  a.status.stun = 1;
  assert(!w.canBreakCombo(a), 'recarga deveria bloquear nova quebra');
  const { w: w2, a: a2 } = duo();
  a2.status.stun = 1; a2.energy = 5;
  assert(!w2.canBreakCombo(a2), 'sem energia não deve quebrar');
  void c;
});

test('Quebra de Combo e escudo sincronizam pela rede', () => {
  const { w, a } = duo();
  a.status.stun = 1; a.energy = 100; w.breakCombo(a);
  const ctx = makeSyncCtx(w);
  const rosters = w.roster.map(() => null);
  void rosters;
  const mirror = createMirror({ seed: 3, rosters: [['brotossauro', 'hidrocasco', 'brasalisco'], ['mantifolha', 'ouriflama', 'gotapus'], ['hidrocasco', 'brotossauro', 'brasalisco'], ['ouriflama', 'gotapus', 'mantifolha']], you: 0, arena: 'quadra', sides: [0, 0, 1, 1], players: [{ seat: 0 }, { seat: 1 }, { seat: 2 }, { seat: 3 }] });
  applySnapshot(mirror.world, JSON.parse(JSON.stringify(serialize(w, ctx))), mirror.ctx);
  const ma = mirror.world.roster.find((m) => m.id === a.id) || mirror.world.roster[0];
  assert(ma && ma.breakCd > 10, 'recarga da quebra de combo não chegou ao espelho');
});

let fails = 0;
for (const r of results) { console.log(`[${r.ok ? 'OK' : 'FALHOU'}]  ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) fails++; }
console.log(fails ? `\n${fails} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(fails ? 1 : 0);
