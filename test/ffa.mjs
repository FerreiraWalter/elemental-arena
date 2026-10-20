// Modo 1v1v1v1 (todos contra todos): regras de eliminação/vitória/colocação (simulação) e sala/rede (servidor real).
// node test/ffa.mjs
import { World } from '../src/sim/world.js';
import { DT } from '../src/config.js';
import { ARENA_ORDER } from '../src/arenas/index.js';
import { createServer } from '../server/server.js';
import { NetClient } from '../src/net/client.js';
import { createMirror } from '../src/net/mirror.js';
import { applySnapshot } from '../src/net/snapshot.js';

const results = [];
const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 3).join(' | ') || e.message }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 8000, what = 'condição') => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error('tempo esgotado esperando ' + what); await wait(10); } };
const step = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) { w.step(DT); w.drainEvents(); } };
const TEAMS = [['brasalisco', 'hidrocasco', 'brotossauro'], ['ouriflama', 'gotapus', 'mantifolha'], ['mantifolha', 'ouriflama', 'hidrocasco'], ['gotapus', 'brasalisco', 'brotossauro']];
const SIDES = [0, 1, 2, 3];

// Mundo FFA parado: IAs desligadas, quatro monstros em campo em posições controladas.
function still(arena = 'quadra') {
  const w = World.match(7, TEAMS, null, arena, 'normal', { sides: SIDES });
  for (const m of w.roster) m.ai.update = () => { m.move.throttle = 0; };
  w.coaches = w.coaches.map(() => null);
  step(w, 1.2);
  return w;
}
const place = (m, x, y) => { m.x = m.px = x; m.y = m.py = y; m.level = m.level ?? 1; };
// Derrota todo o time de um lado (como se tivesse perdido os 3 monstros).
function wipe(w, slot, by) { for (const m of w.teamOf(slot)) if (m.alive) { w.damage(m, 9999, by || null, { tag: 'teste', noClose: true }); } }

// ───────────── Simulação ─────────────
await test('FFA: 4 vagas, 4 lados distintos, ninguém é aliado e cada um tem 3 inimigos', async () => {
  const w = still();
  assert(w.ffa && w.teams.length === 4, 'mundo não está em modo ffa');
  assert(new Set(w.teams.map((t) => t.side)).size === 4, 'lados repetidos (equipes acidentais)');
  assert(w.monsters.length === 4 && new Set(w.monsters.map((m) => m.id)).size === 4, 'esperava 4 monstros únicos em campo');
  for (const m of w.monsters) { assert(w.alliesOf(m).length === 0, 'aliado acidental'); assert(w.enemiesOf(m).length === 3, 'esperava 3 inimigos'); }
  assert(new Set(w.roster.map((m) => m.id)).size === 12, 'ids de monstros repetidos');
});

await test('Um ataque válido machuca só o alvo certo; o atacante não leva dano', async () => {
  const w = still();
  const [a, b, c, d] = w.monsters; // alvo = d (Gotapus, sem espinhos que devolvam dano)
  place(a, 150, 200); place(d, 215, 200); place(c, 150, 330); place(b, 400, 60);
  for (const m of w.monsters) { m.hp = m.maxHp; m.status.invuln = 0; m.status.stun = 0; m.action = null; }
  const hp = w.monsters.map((m) => m.hp);
  assert(a.cast(w, a.ability(a.def.controls.primary), { aim: 0, dir: 0, aimPoint: { x: 215, y: 200 }, point: { x: 215, y: 200 } }), 'não conseguiu atirar');
  step(w, 1.5);
  assert(d.hp < hp[3], 'alvo não levou dano');
  assert(a.hp === hp[0] && b.hp === hp[1] && c.hp === hp[2], 'dano em quem não era alvo (ou no atacante)');
});

await test('Dano de área não machuca o próprio dono, mas pega os três adversários próximos', async () => {
  const w = still();
  const [a, b, c, d] = w.monsters;
  a.def = a.def; place(a, 300, 200); place(b, 320, 200); place(c, 300, 222); place(d, 280, 200);
  for (const m of w.monsters) { m.hp = m.maxHp; m.status.invuln = 0; m.action = null; }
  w.projectiles.length = 0;
  w.spawnProjectile({ kind: 'meteor', owner: a, lob: true, flat: true, x: 300, y: 200, tx: 300, ty: 200, flight: 0.05, radius: 60, dmg: 30, burn: 0 });
  step(w, 1);
  assert(a.hp === a.maxHp, 'o dono levou o próprio dano de área');
  assert([b, c, d].some((m) => m.hp < m.maxHp), 'nenhum adversário levou dano de área');
});

await test('A derrota de um jogador NÃO encerra a partida; só resta um lado → vence; colocação correta', async () => {
  const w = still();
  const [a, b, c, d] = w.monsters;
  wipe(w, 1, a); step(w, 0.1);
  assert(!w.over, 'partida acabou com 3 jogadores vivos');
  assert(w.elim.length === 1 && w.elim[0].side === 1, 'eliminação não registrada');
  assert(w.enemiesOf(a).every((m) => m !== b), 'eliminado ainda é alvo');
  step(w, 1.5); wipe(w, 3, a); step(w, 0.1);
  assert(!w.over, 'partida acabou com 2 jogadores vivos');
  step(w, 1.5); wipe(w, 2, a); step(w, 0.1);
  assert(w.over && w.winner === 0, `vencedor errado: ${w.winner}`);
  const st = w.standings();
  assert(st.length === 4 && new Set(st.map((r) => r.side)).size === 4, 'colocação deve ter 4 linhas únicas');
  const rank = Object.fromEntries(st.map((r) => [r.side, r.rank]));
  assert(rank[0] === 1 && rank[2] === 2 && rank[3] === 3 && rank[1] === 4, `colocação: ${JSON.stringify(rank)}`);
  assert(st[0].kos >= 3 || st[0].side === 0, 'abates do vencedor');
  void c; void d;
});

await test('Eliminados não interferem: sem dano, sem ações, sem controle; eventos repetidos não duplicam eliminação/KO', async () => {
  const w = still();
  const [a, b] = w.monsters;
  const ko0 = a.stats.kos || 0;
  wipe(w, 1, a); step(w, 0.1);
  const kos = a.stats.kos;
  assert(kos - ko0 === w.teamOf(1).length, `KOs contados: ${kos - ko0}`);
  for (let k = 0; k < 5; k++) { w.kill(b, a); w.damage(b, 50, a, {}); w.checkEnd(); }
  step(w, 0.2);
  assert(w.elim.length === 1, 'eliminação duplicada');
  assert(a.stats.kos === kos, 'KO duplicado');
  assert(!b.alive && b.hp === 0, 'eliminado voltou à vida');
  assert(w.damage(b, 10, a, {}) === 0, 'dano em eliminado');
});

await test('Últimos dois lados caem no mesmo instante: empate (winner -1, colocação dividida)', async () => {
  const w = still();
  const [a] = w.monsters;
  wipe(w, 3, a); step(w, 1.5); wipe(w, 2, a); step(w, 1.5);
  assert(!w.over, 'partida acabou cedo');
  wipe(w, 0); wipe(w, 1); step(w, 0.1);
  assert(w.over && w.winner === -1, `esperava empate, winner=${w.winner}`);
  const rank = Object.fromEntries(w.standings().map((r) => [r.side, r.rank]));
  assert(rank[0] === 1 && rank[1] === 1 && rank[2] === 3 && rank[3] === 4, `colocação do empate: ${JSON.stringify(rank)}`);
});

await test('Todas as 4 arenas: 4 jogadores nascem em pontos livres e separados, e a partida de IA termina com 1 vencedor', async () => {
  for (const arena of ARENA_ORDER) {
    const w = World.match(11, TEAMS, null, arena, 'normal', { sides: SIDES });
    const pts = w.monsters.map((m) => ({ x: m.x, y: m.y, m }));
    assert(pts.length === 4, `${arena}: 4 em campo`);
    for (const p of pts) assert(w.standable({ r: p.m.r, element: p.m.element, level: w.terrain.heightAt(p.x, p.y) }, p.x, p.y) && !w.blocked(p.x, p.y, p.m.r), `${arena}: spawn inválido em ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 150, `${arena}: spawns muito próximos (${i},${j})`);
    while (!w.over && w.time < 400) { w.step(DT); w.drainEvents(); }
    assert(w.over && w.winner >= 0, `${arena}: partida não terminou com vencedor (t=${w.time.toFixed(0)})`);
    assert(w.standings()[0].side === w.winner && w.standings().filter((r) => r.rank === 1).length === 1, `${arena}: classificação inconsistente`);
  }
});

// ───────────── Servidor real ─────────────
const srv = await createServer({ port: 0, host: '127.0.0.1', timeScale: 10 });
const url = `ws://127.0.0.1:${srv.port}/ws`;
async function client(name) {
  const c = new NetClient();
  await c.connect(url);
  const st = { c, name, room: null, errors: [], mirror: null, seq: 0, start: null, ended: null, snaps: 0, id: null, code: null };
  c.on('room', (m) => { st.room = m; });
  c.on('joined', (m) => { st.id = m.id; st.code = m.code; st.token = m.token; st.joined = m; });
  c.on('error', (m) => st.errors.push(m));
  c.on('start', (m) => { st.start = m; st.mirror = createMirror(m); });
  c.on('snap', (m) => { if (!st.mirror) return; st.snaps++; st.seq = m.seq; applySnapshot(st.mirror.world, m, st.mirror.ctx); st.mirror.world.events.length = 0; });
  c.on('end', (m) => { st.ended = m; });
  return st;
}
async function room4() {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode: 'ffa' });
  await until(() => host.code && host.room, 3000, 'sala');
  const sts = [host];
  for (let i = 1; i < 4; i++) { const g = await client('g' + i); g.c.send({ t: 'join', code: host.code, name: 'J' + i }); await until(() => g.code, 3000, 'entrada'); sts.push(g); }
  return sts;
}
const ready = async (sts) => {
  sts.forEach((s, i) => s.c.send({ t: 'team', team: TEAMS[i] }));
  await until(() => sts[0].room.players.every((p) => p.team), 3000, 'times');
  sts.slice(1).forEach((s) => s.c.send({ t: 'ready', ready: true }));
  await until(() => sts[0].room.players.filter((p) => p.ready).length >= 3, 3000, 'prontos');
};

await test('Sala FFA: 4 entram uma vez cada, vagas e lados únicos; o 5º é recusado e não duplica ninguém', async () => {
  const sts = await room4();
  const r = sts[0].room;
  assert(r.mode === 'ffa' && r.seats === 4 && r.players.length === 4, 'sala ffa com 4 jogadores');
  assert(new Set(r.players.map((p) => p.seat)).size === 4 && new Set(r.players.map((p) => p.side)).size === 4, 'vagas/lados repetidos');
  assert(new Set(r.players.map((p) => p.id)).size === 4, 'jogador duplicado');
  const quinto = await client('quinto');
  quinto.c.send({ t: 'join', code: sts[0].code, name: 'Extra' });
  await until(() => quinto.errors.length, 2000, 'recusa');
  assert(quinto.errors[0].code === 'full', 'esperava sala cheia: ' + quinto.errors[0].code);
  await wait(100);
  assert(sts[0].room.players.length === 4, 'o 5º entrou mesmo assim');
  [...sts, quinto].forEach((s) => s.c.close());
});

await test('Início bloqueado: sem 4 jogadores e depois de iniciada a partida ninguém entra', async () => {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode: 'ffa' });
  await until(() => host.code, 2000);
  host.c.send({ t: 'start' });
  await until(() => host.errors.length, 2000);
  assert(host.errors[0].code === 'need_players', 'deveria exigir 4 vagas: ' + host.errors[0].code);
  host.c.send({ t: 'fillBots' });
  host.c.send({ t: 'team', team: TEAMS[0] });
  await until(() => host.room.players.length === 4 && host.room.players.every((p) => p.team), 3000, 'robôs e time');
  host.c.send({ t: 'start' });
  await until(() => host.start, 3000, 'início');
  const tarde = await client('tarde');
  tarde.c.send({ t: 'join', code: host.code, name: 'Tarde' });
  await until(() => tarde.errors.length, 2000, 'recusa');
  assert(tarde.errors[0].code === 'started', 'entrada tardia deveria ser recusada: ' + tarde.errors[0].code);
  [host, tarde].forEach((s) => s.c.close());
});

await test('Modo: trocar 1v1 ↔ ffa compacta as vagas sem repetir; ffa precisa de 4', async () => {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode: '1v1' });
  await until(() => host.code, 2000);
  const g = await client('g'); g.c.send({ t: 'join', code: host.code, name: 'Bia' }); await until(() => g.code, 2000);
  host.c.send({ t: 'config', mode: 'ffa' });
  await until(() => host.room.mode === 'ffa', 2000, 'modo ffa');
  assert(new Set(host.room.players.map((p) => p.seat)).size === 2 && host.room.players.every((p) => p.seat < 4), 'vagas inválidas');
  assert(new Set(host.room.players.map((p) => p.side)).size === 2, 'lados repetidos');
  host.c.send({ t: 'config', mode: '1v1' });
  await until(() => host.room.mode === '1v1', 2000, 'voltou 1v1');
  assert(host.room.players.map((p) => p.seat).sort().join() === '0,1', 'vagas do 1v1: ' + host.room.players.map((p) => p.seat));
  [host, g].forEach((s) => s.c.close());
});

await test('Partida FFA online completa: 4 humanos+bots, servidor autoritativo, mesma classificação para todos e espelhos idênticos', async () => {
  const sts = await room4();
  await ready(sts);
  sts.forEach((s) => { s.bot = true; });
  // bots simples: cada cliente mira o inimigo mais próximo e ataca
  for (const s of sts) s.c.on('snap', () => {
    const w = s.mirror?.world, seat = s.start?.you;
    if (!w || seat === undefined) return;
    const me = w.teams[seat].field;
    if (!me || !me.alive || me.switchState) return;
    const foes = w.monsters.filter((m) => m.alive && m.onField && m.team !== me.team).sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y));
    if (!foes.length) return;
    const f = foes[0], d = Math.hypot(f.x - me.x, f.y - me.y) || 1, ux = (f.x - me.x) / d, uy = (f.y - me.y) / d, rad = d > 70 ? 1 : d < 35 ? -1 : 0;
    const presses = []; if (s.seq % 9 === 0) presses.push('q'); if (s.seq % 13 === 4) presses.push('e'); if (d < 34) presses.push('melee');
    s.c.send({ t: 'input', mx: ux * rad, my: uy * rad, ax: f.x, ay: f.y, hp: true, hm: false, presses });
  });
  sts[0].c.send({ t: 'start' });
  await until(() => sts.every((s) => s.start), 3000, 'início');
  assert(sts.every((s) => s.start.sides.join() === '0,1,2,3'), 'sides do início');
  const room = srv.rooms.get(sts[0].code);
  let maxAlive = 0, minAlive = 4;
  const watcher = setInterval(() => { const w = room.world; if (!w || w.over) return; const a = w.sideIds().filter((s) => w.roster.some((m) => m.team === s && m.alive)).length; maxAlive = Math.max(maxAlive, a); minAlive = Math.min(minAlive, a); }, 20);
  if (process.env.V) setInterval(() => { const w = room.world; console.log('t', w.time.toFixed(0), w.monsters.map((m) => `${m.slot}:${m.hp.toFixed(0)}${m.alive ? '' : 'x'}@${m.x | 0},${m.y | 0}:${m.controller ? 'H' : 'ai'}`).join(' '), JSON.stringify(w.inputs[0].held), w.inputs[0].move); }, 5000).unref();
  try { await until(() => sts.every((s) => s.ended), 200000, 'fim'); } catch (e) { const w = room.world; throw new Error(`${e.message} | sala ${room.state} t=${w.time.toFixed(0)} over=${w.over} alive=${w.monsters.map((m) => m.slot + ':' + m.hp.toFixed(0) + (m.alive ? '' : 'x')).join(' ')} ended=${sts.map((s) => !!s.ended)} snaps=${sts.map((s) => s.snaps)}`); }
  clearInterval(watcher);
  await wait(150);
  const sw = room.world;
  assert(sw.over && sw.winner >= 0, 'servidor sem vencedor');
  const ref = JSON.stringify(sts[0].ended.standings);
  for (const s of sts) {
    assert(JSON.stringify(s.ended.standings) === ref, 'placar final diferente entre clientes');
    const cw = s.mirror.world;
    assert(cw.over && cw.winner === sw.winner, 'vencedor do cliente diverge');
    assert(JSON.stringify(cw.standings().map((r) => [r.side, r.rank])) === JSON.stringify(sw.standings().map((r) => [r.side, r.rank])), 'classificação do espelho diverge da do servidor');
    sw.roster.forEach((m, i) => assert(Math.abs(m.hp - cw.roster[i].hp) < 0.2 && m.alive === cw.roster[i].alive, `monstro ${i} diverge`));
  }
  const st = sts[0].ended.standings;
  assert(st.length === 4 && new Set(st.map((r) => r.side)).size === 4 && st.filter((r) => r.rank === 1).length === 1, 'placar com 4 linhas únicas e 1 campeão');
  assert(maxAlive === 4 && minAlive <= 2 && sw.elim.length >= 3, `a partida deveria ir de 4 lados vivos até sobrar 1 (viu ${maxAlive}→${minAlive}, eliminações ${sw.elim.length})`);
  console.log(`      FFA online: vencedor lado ${sw.winner} em ${sw.endTime.toFixed(0)}s simulados; placar ${st.map((r) => `${r.rank}º ${r.players.join('+')}`).join(' · ')}`);
  sts.forEach((s) => s.c.close());
});

await test('Desconexão e reconexão no FFA: sem fantasmas, sem entidades duplicadas, mesmo token só volta uma vez', async () => {
  const sts = await room4();
  await ready(sts);
  sts[0].c.send({ t: 'start' });
  await until(() => sts.every((s) => s.start), 3000, 'início');
  await until(() => sts[0].seq > 40, 3000, 'andando');
  const room = srv.rooms.get(sts[0].code);
  const n0 = room.world.roster.length, mons0 = room.world.monsters.length;
  const victim = sts[2], token = victim.token, seat = victim.start.you;
  victim.c.ws.close();
  await until(() => !room.world.humans.has(seat), 2000, 'IA assumir');
  assert(room.list().length === 4, 'jogador fantasma/duplicado na sala');
  assert(room.world.coaches[seat], 'IA não assumiu o time');
  const v2 = await client('v2');
  v2.c.send({ t: 'rejoin', code: room.code, token });
  await until(() => v2.start, 3000, 'retomada');
  assert(v2.start.you === seat && v2.start.resumed, 'retomou na vaga errada');
  assert(room.list().length === 4 && room.world.roster.length === n0 && room.world.monsters.length >= 1 && room.world.monsters.length <= mons0 + 1, 'entidades duplicadas após reconectar');
  assert(room.world.humans.has(seat) && !room.world.coaches[seat], 'controle humano não voltou');
  const v3 = await client('v3');
  v3.c.send({ t: 'rejoin', code: room.code, token });
  await until(() => v3.errors.length, 2000, 'recusa');
  assert(v3.errors[0].code === 'gone', 'mesmo token não pode entrar duas vezes');
  assert(room.list().length === 4, 'segundo rejoin criou jogador');
  // Saída voluntária: IA mantém o time; o token morre; a partida continua e termina com 4 linhas.
  v2.c.send({ t: 'leave' });
  await wait(100);
  [sts[0], sts[1], sts[3]].forEach((s) => { s.bot = true; });
  for (const s of [sts[0], sts[1], sts[3]]) s.c.on('snap', () => {
    const w = s.mirror.world, me = w.teams[s.start.you].field; if (!me || !me.alive) return;
    const f = w.monsters.filter((m) => m.alive && m.onField && m.team !== me.team)[0]; if (!f) return;
    s.c.send({ t: 'input', mx: Math.sign(f.x - me.x), my: Math.sign(f.y - me.y), ax: f.x, ay: f.y, hp: true, hm: false, presses: [] });
  });
  await until(() => sts[0].ended, 200000, 'fim com IA assumindo');
  assert(sts[0].ended.standings.length === 4, 'placar sem os 4 lados');
  [sts[0], sts[1], sts[3], v3].forEach((s) => s.c.close());
});

await test('Todos os humanos saem: a sala encerra e não fica partida fantasma', async () => {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode: 'ffa' });
  await until(() => host.code, 2000);
  host.c.send({ t: 'fillBots' }); host.c.send({ t: 'team', team: TEAMS[0] });
  await until(() => host.room.players.length === 4 && host.room.players.every((p) => p.team), 3000);
  host.c.send({ t: 'start' });
  await until(() => host.start, 3000);
  const code = host.code;
  host.c.send({ t: 'leave' });
  await until(() => !srv.rooms.has(code), 3000, 'sala removida');
  host.c.close();
});

await srv.close();
let failed = 0;
console.log('\nModo 1v1v1v1 (todos contra todos)\n');
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) failed++; }
console.log(failed ? `\n${failed} teste(s) falharam.` : '\nTodos os testes do FFA passaram.');
process.exit(failed ? 1 : 0);
