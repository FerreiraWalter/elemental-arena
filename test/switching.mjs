// Cenários do 1×1 com times de 3 (troca, persistência, substituição, banco, fim de partida).
// Uso: node test/switching.mjs
import { World } from '../src/sim/world.js';
import { DT, SWITCH } from '../src/config.js';

const results = [];
const test = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.message }); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);

function step(w, secs, inv) { for (let k = 0; k < Math.round(secs / DT); k++) { w.step(DT); w.drainEvents(); inv?.(w); } }
function stepUntil(w, pred, maxS = 10, inv) {
  for (let k = 0; k < maxS / DT; k++) { if (pred()) return true; w.step(DT); w.drainEvents(); inv?.(w); }
  return pred();
}
// Partida em que o inimigo fica parado longe (isola as regras de troca do combate).
function quietMatch(seed = 1) {
  const w = World.match(seed, undefined, 0);
  for (const m of w.teamOf(1)) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches[1] = null;
  const foe = w.fieldOf(1);
  foe.x = foe.px = 600; foe.y = foe.py = 330;
  stepUntil(w, () => !w.fieldOf(0).switchState, 2); // espera a animação de entrada inicial
  return w;
}
const clean = (m) => { for (const k in m.status) m.status[k] = 0; };
// Invariantes verificadas a cada passo: no máximo 1 monstro vivo em campo por time, nada duplicado.
function invariants(w) {
  for (const team of [0, 1]) {
    const onField = w.monsters.filter((m) => m.team === team && m.alive);
    assert(onField.length <= 1, `time ${team} com ${onField.length} monstros vivos em campo`);
    const acting = w.monsters.filter((m) => m.team === team && m.action);
    assert(acting.length <= 1, `time ${team} com 2 monstros agindo ao mesmo tempo`);
  }
  assert(w.roster.length === 6 && new Set(w.roster.map((m) => m.id)).size === 6, 'roster duplicado ou alterado');
  assert(new Set(w.monsters).size === w.monsters.length, 'monstro duplicado em campo');
}

test('Trocar com 70% de vida e voltar depois: continua com 70%', () => {
  const w = quietMatch();
  const [A, B] = w.teamOf(0);
  clean(A);
  A.hp = A.maxHp * 0.7;
  A.cd.meteor = 10;
  assert(w.requestSwitch(0, B), 'troca recusada');
  assert(stepUntil(w, () => B.onField && !B.switchState, 3, invariants), 'B não entrou');
  assert(!A.onField, 'A ainda em campo');
  near(A.hp, A.maxHp * 0.7, 1e-9, 'vida de A mudou ao sair');
  const cdOut = A.cd.meteor, tOut = w.time;
  step(w, 5, invariants);
  near(A.cd.meteor, Math.max(0, cdOut - (w.time - tOut)), 0.02, 'recarga não continuou no banco');
  near(A.hp, A.maxHp * 0.7, 1e-9, 'vida de A mudou no banco');
  assert(w.requestSwitch(0, A), 'troca de volta recusada');
  assert(stepUntil(w, () => A.onField && !A.switchState, 3, invariants), 'A não voltou');
  near(A.hp / A.maxHp, 0.7, 1e-9, 'A não voltou com 70%');
  assert(w.teamOf(0)[0] === A && w.active === A, 'instância recriada ou controle não voltou');
});

test('Trocas repetidas: sem duplicar monstros nem resetar estado', () => {
  const w = quietMatch(2);
  const team = w.teamOf(0);
  team.forEach((m, k) => { clean(m); m.hp = m.maxHp * (0.9 - k * 0.2); });
  const ids = team.map((m) => m.id);
  for (let n = 0; n < 24; n++) {
    stepUntil(w, () => w.teams[0].cooldown <= 0 && !w.fieldOf(0).switchState, 6, invariants);
    const cur = w.fieldOf(0);
    const next = team[(team.indexOf(cur) + 1) % 3];
    const hpBefore = next.hp;
    assert(w.requestSwitch(0, next), `troca ${n} recusada`);
    assert(stepUntil(w, () => next.onField && !next.switchState, 2, invariants), `troca ${n} não completou`);
    near(next.hp, hpBefore, 0.5, `vida mudou na troca ${n}`); // pequena regeneração do terreno é permitida
  }
  assert(team.every((m, k) => m.id === ids[k] && w.roster.includes(m)), 'instâncias trocadas');
});

test('Regras da troca: recarga, alvo em campo e troca durante a animação', () => {
  const w = quietMatch(3);
  const [A, B, C] = w.teamOf(0);
  assert(!w.requestSwitch(0, A), 'trocou para o monstro já em campo');
  assert(w.requestSwitch(0, B), 'primeira troca recusada');
  assert(!w.requestSwitch(0, C), 'trocou durante a animação de saída');
  stepUntil(w, () => B.onField && !B.switchState, 2);
  assert(w.teams[0].cooldown > 0 && !w.requestSwitch(0, C), 'trocou durante a recarga');
  step(w, SWITCH.cooldown + 0.1);
  assert(w.requestSwitch(0, C), 'troca recusada após a recarga');
});

test('Trocar no meio de um ataque cancela o ataque; dano durante a animação ainda acontece', () => {
  const w = quietMatch(4);
  const [, B, C] = w.teamOf(0);
  w.requestSwitch(0, B);
  stepUntil(w, () => B.onField && !B.switchState, 2);
  step(w, SWITCH.cooldown + 0.1);
  clean(B);
  const ok = B.cast(w, B.ability('hydroBeam'), { aim: 0, aimPoint: { x: 600, y: B.y } });
  assert(ok && B.action, 'não iniciou o ataque');
  assert(w.requestSwitch(0, C), 'troca recusada no meio do ataque');
  assert(B.action === null, 'ataque não foi cancelado');
  const hp = B.hp;
  w.damage(B, 10, null, { element: 'fire' });
  assert(B.hp < hp, 'monstro saindo ficou invulnerável');
  stepUntil(w, () => C.onField, 2);
  assert(C.switchState === 'entering', 'C não está entrando');
  const hc = C.hp;
  w.damage(C, 10, null, { element: 'fire' });
  assert(SWITCH.entryInvulnerable ? C.hp === hc : C.hp < hc, 'vulnerabilidade de entrada diferente da configuração');
  assert(!C.ready('shockWave') && !C.ready('burstSeed') && !C.ready('emberLash'), 'monstro entrando pode atacar');
});

test('Derrotar o monstro em campo: o próximo vivo entra sozinho', () => {
  const w = quietMatch(5);
  const [A] = w.teamOf(0);
  const t0 = w.time;
  w.damage(A, 9999, w.fieldOf(1));
  assert(!A.alive && w.active === null, 'A não foi marcado como derrotado');
  assert(stepUntil(w, () => w.fieldOf(0) !== A && w.fieldOf(0)?.alive, 3, invariants), 'substituto não entrou');
  near(w.time - t0, SWITCH.replaceDelay, 0.05, 'atraso da substituição');
  assert(w.active === w.fieldOf(0), 'controle do jogador não passou para o substituto');
  assert(!w.requestSwitch(0, A), 'trocou para um derrotado');
});

test('Monstro derrotado no banco (queimadura persistente) não pode mais entrar', () => {
  const w = quietMatch(6);
  const [A, B, C] = w.teamOf(0); // B = Hidrocasco
  assert(w.requestSwitch(0, B), 'troca recusada');
  stepUntil(w, () => B.onField && !B.switchState, 2);
  step(w, SWITCH.cooldown + 0.1);
  assert(w.requestSwitch(0, C), 'troca recusada');
  stepUntil(w, () => C.onField && !C.switchState, 2);
  B.hp = 2;
  B.status.burn = 3;
  step(w, 1.5);
  assert(!B.alive && !B.onField, 'B não foi derrotado no banco');
  step(w, SWITCH.cooldown);
  assert(!w.requestSwitch(0, B), 'trocou para quem caiu no banco');
  w.damage(C, 9999, null);
  stepUntil(w, () => w.fieldOf(0)?.alive, 3);
  assert(w.fieldOf(0) === A, 'substituto escolhido foi o derrotado');
});

test('Derrotar os três: a partida termina com o vencedor certo', () => {
  const w = quietMatch(7);
  for (let k = 0; k < 3; k++) {
    stepUntil(w, () => w.fieldOf(0)?.alive && !w.fieldOf(0).switchState, 3, invariants);
    w.damage(w.fieldOf(0), 9999, null);
    step(w, 0.05);
  }
  assert(w.over && w.winner === 1, `fim incorreto: over=${w.over} winner=${w.winner}`);
  step(w, 3, invariants);
  assert(w.teamOf(0).every((m) => !m.alive), 'alguém voltou à vida');
});

test('Derrotas simultâneas dos últimos monstros: empate', () => {
  const w = World.match(8, [['hidrocasco'], ['brotossauro']], null);
  stepUntil(w, () => !w.fieldOf(0).switchState && !w.fieldOf(1).switchState, 2);
  for (const m of w.roster) { m.ai.update = () => { m.move.throttle = 0; }; clean(m); m.hp = 0.001; m.status.burn = 2; }
  step(w, 0.1);
  assert(w.over && w.winner === -1, `esperado empate, veio winner=${w.winner}`);
});

test('Derrota durante a animação de saída: o escolhido entra como substituto', () => {
  const w = quietMatch(9);
  const [A, B, C] = w.teamOf(0);
  assert(w.requestSwitch(0, C), 'troca recusada');
  w.damage(A, 9999, null);
  assert(stepUntil(w, () => w.fieldOf(0)?.alive, 3), 'ninguém entrou');
  assert(w.fieldOf(0) === C && B.alive && !B.onField, 'substituto não foi o escolhido');
});

test('IA inimiga segue as mesmas regras (partidas completas)', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const w = World.match(seed, undefined, null);
    const last = [-99, -99];
    const expect = []; // derrotas em campo que exigem substituto
    while (!w.over && w.time < 400) {
      w.step(DT);
      invariants(w);
      for (const ex of expect) if (!ex.done && w.time > ex.t + SWITCH.replaceDelay + 0.1 && !w.over) throw new Error(`seed ${seed}: substituto não entrou após a derrota`);
      for (const e of w.drainEvents()) {
        if (e.type === 'enter' && e.reason === 'switch') {
          assert(w.time - last[e.m.team] >= SWITCH.cooldown + SWITCH.exitTime - 0.05, `IA trocou durante a recarga (seed ${seed})`);
          last[e.m.team] = w.time;
        }
        if (e.type === 'enter' && e.reason === 'replace') {
          assert(e.m.alive, 'IA trouxe um derrotado');
          const ex = expect.find((x) => !x.done && x.team === e.m.team);
          assert(ex, 'substituição sem derrota');
          ex.done = true;
        }
        if (e.type === 'death' && !e.bench && w.teamOf(e.m.team).some((m) => m.alive)) expect.push({ team: e.m.team, t: w.time });
        if (e.type === 'cast') assert(e.m.onField && !e.m.switchState, 'monstro fora de campo/trocando usou habilidade');
      }
    }
    assert(w.over, `seed ${seed} não terminou`);
    assert(w.coaches.some((c) => c.log.length > 0), `seed ${seed}: IA nunca trocou voluntariamente`);
  }
});

let failed = 0;
console.log('\nCenários de troca (1×1, times de 3)\n');
for (const r of results) {
  console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : `\n       ${r.err}`}`);
  if (!r.ok) failed++;
}
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
