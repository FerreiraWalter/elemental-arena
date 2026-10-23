// Torneio online (servidor real, robôs completando a sala): chave de 4 e de 8 no 1v1, "passa direto" com 5,
// duplas sorteadas no 2v2, lutas da mesma fase ao mesmo tempo, espectadores, campeão e volta à sala.
// node test/tournament.mjs
import { createServer } from '../server/server.js';
import { NetClient } from '../src/net/client.js';
import { createMirror } from '../src/net/mirror.js';
import { applySnapshot } from '../src/net/snapshot.js';
import { PHASE_T } from '../server/tournament.js';

const results = [];
const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 3).join(' | ') || e.message }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 8000, what = 'condição') => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error('tempo esgotado esperando ' + what); await wait(10); } };
const TEAM = ['brasalisco', 'hidrocasco', 'brotossauro'];

const srv = await createServer({ port: 0, host: '127.0.0.1', timeScale: 25 });
const url = `ws://127.0.0.1:${srv.port}/ws`;
async function client(name) {
  const c = new NetClient();
  await c.connect(url);
  const st = { c, name, room: null, errors: [], tour: null, tours: [], starts: [], ends: [], mirror: null, snaps: 0 };
  c.on('room', (m) => { st.room = m; });
  c.on('joined', (m) => { st.id = m.id; st.code = m.code; st.token = m.token; });
  c.on('error', (m) => st.errors.push(m));
  c.on('tour', (m) => { st.tour = m; st.tours.push(m.phase); });
  c.on('start', (m) => { st.starts.push(m); st.mirror = createMirror(m); });
  c.on('snap', (m) => { if (!st.mirror || (m.match ?? 0) !== st.mirror.match) return; st.snaps++; applySnapshot(st.mirror.world, m, st.mirror.ctx); st.mirror.world.events.length = 0; });
  c.on('end', (m) => { st.ends.push(m); });
  return st;
}
// Sala de torneio com o anfitrião e `bots` robôs (+ amigos humanos extras).
async function tourRoom(mode, bots, friends = 0) {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode });
  await until(() => host.code && host.room, 3000, 'sala');
  const sts = [host];
  for (let i = 0; i < friends; i++) { const g = await client('g' + i); g.c.send({ t: 'join', code: host.code, name: 'Amigo' + i }); await until(() => g.code, 3000, 'entrada'); sts.push(g); }
  for (const s of sts) s.c.send({ t: 'team', team: TEAM });
  for (let i = 0; i < bots; i++) host.c.send({ t: 'addBot' });
  await until(() => host.room.players.length === 1 + friends + bots && host.room.players.every((p) => p.team), 3000, 'robôs e times');
  sts.slice(1).forEach((s) => s.c.send({ t: 'ready', ready: true }));
  await until(() => host.room.players.filter((p) => p.ready).length >= host.room.players.length - 1, 3000, 'prontos');
  return sts;
}
const champion = (st, ms = 60000) => until(() => st.tour?.phase === 'champion', ms, 'campeão');

await test('Sala de torneio: 8 vagas, modos TORNEIO 1v1/2v2 e no máximo 8 pessoas', async () => {
  const [h] = await tourRoom('tour1', 7);
  assert(h.room.mode === 'tour1' && h.room.seats === 8 && h.room.players.length === 8, 'sala de 8');
  h.c.send({ t: 'addBot' });
  await until(() => h.errors.length, 2000, 'recusa');
  assert(h.errors[0].code === 'full', 'o 9º deveria ser recusado: ' + h.errors[0].code);
  h.c.close();
});

await test('Torneio precisa de 4+ jogadores; 2v2 precisa de número par', async () => {
  const [h] = await tourRoom('tour1', 2);
  h.c.send({ t: 'start' });
  await until(() => h.errors.length, 2000, 'recusa');
  assert(h.errors[0].code === 'need_players', 'com 3 deveria recusar: ' + h.errors[0].code);
  h.c.close();
  const [h2] = await tourRoom('tour2', 4);
  h2.c.send({ t: 'start' });
  await until(() => h2.errors.length, 2000, 'recusa');
  assert(h2.errors[0].code === 'need_even', '2v2 com 5 deveria recusar: ' + h2.errors[0].code);
  h2.c.close();
});

await test('1v1 com 4: semifinal (2 lutas ao mesmo tempo) e final; campeão e volta à sala', async () => {
  const [h] = await tourRoom('tour1', 3);
  h.c.send({ t: 'start' });
  await until(() => h.tour, 3000, 'chave');
  assert(h.tour.size === 4 && h.tour.rounds.map((r) => r.name).join() === 'SEMIFINAL,FINAL', 'fases: ' + h.tour.rounds.map((r) => r.name));
  assert(h.tour.phase === 'draw' && h.tour.entrants.length === 4, 'sorteio com 4');
  await until(() => h.tour.phase === 'round', (PHASE_T.draw * 1000) / 25 + 3000, 'semifinal');
  assert(h.tour.rounds[0].matches.filter((m) => m.state === 'live').length === 2, 'as duas semis deveriam rodar juntas');
  const my = h.starts.at(-1);
  assert(my && my.tour?.round === 'SEMIFINAL' && my.hold > 0, 'o anfitrião deveria receber a luta dele com a tela de VS');
  await champion(h);
  const t = h.tour, f = t.rounds[1].matches[0];
  assert(f.state === 'done' && t.champion === f[f.winner], 'campeão é o vencedor da final');
  assert(t.rounds[0].matches.every((m) => m.state === 'done'), 'semis concluídas');
  assert(h.ends.some((e) => e.tour && (e.tour.you === 'win' || e.tour.you === 'lose')), 'resultado com você venceu/perdeu');
  h.c.send({ t: 'rematch' });
  await until(() => h.room.state === 'lobby', 3000, 'volta à sala');
  assert(h.room.players.length === 4, 'todo mundo volta para a sala');
  h.c.close();
});

await test('1v1 com 8: quartas, semifinal e final (7 lutas)', async () => {
  const [h] = await tourRoom('tour1', 7);
  h.c.send({ t: 'start' });
  await until(() => h.tour, 3000, 'chave');
  assert(h.tour.size === 8 && h.tour.rounds.map((r) => r.name).join() === 'QUARTAS DE FINAL,SEMIFINAL,FINAL', 'fases do 8');
  await champion(h, 90000);
  const done = h.tour.rounds.flatMap((r) => r.matches).filter((m) => m.state === 'done').length;
  assert(done === 7, `esperava 7 lutas, foram ${done}`);
  h.c.close();
});

await test('1v1 com 5: chave de 8 com 3 "passa direto" espalhados (nunca vazio contra vazio)', async () => {
  const [h] = await tourRoom('tour1', 4);
  h.c.send({ t: 'start' });
  await until(() => h.tour, 3000, 'chave');
  const q = h.tour.rounds[0].matches;
  assert(h.tour.size === 8 && q.every((m) => m.a !== null || m.b !== null), 'luta vazia na chave');
  assert(q.filter((m) => m.a === null || m.b === null).length === 3, '3 byes');
  await until(() => h.tour.phase === 'round', 5000, 'quartas');
  assert(h.tour.rounds[0].matches.filter((m) => m.state === 'bye').length === 3, 'byes resolvidos na hora');
  await champion(h, 90000);
  h.c.close();
});

await test('2v2 com 8: duplas sorteadas (4), semifinal e final, cada luta com 4 vagas', async () => {
  const [h] = await tourRoom('tour2', 7);
  h.c.send({ t: 'start' });
  await until(() => h.tour, 3000, 'chave');
  const t = h.tour;
  assert(t.entrants.length === 4 && t.entrants.every((e) => e.players.length === 2 && e.name.includes(' & ')), 'duplas');
  assert(new Set(t.entrants.flatMap((e) => e.players.map((p) => p.id))).size === 8, 'alguém em duas duplas');
  assert(t.rounds.map((r) => r.name).join() === 'SEMIFINAL,FINAL', 'semis e final');
  await until(() => h.starts.length, 8000, 'luta');
  assert(h.starts[0].sides.join() === '0,0,1,1' && h.starts[0].players.length === 4, 'luta 2v2');
  await champion(h, 90000);
  h.c.close();
});

await test('Quem não está lutando assiste ao vivo; eliminado volta a assistir; pode trocar de luta e voltar à chave', async () => {
  // 2 humanos + 6 robôs: o anfitrião não se mexe (perde rápido) e passa a assistir as outras lutas.
  const [h, g] = await tourRoom('tour1', 6, 1);
  h.c.send({ t: 'start' });
  await until(() => h.tour?.phase === 'round', 6000, 'quartas');
  const myRound0 = h.starts.at(-1);
  assert(!myRound0.spectate, 'o anfitrião luta nas quartas');
  await until(() => h.ends.length, 30000, 'fim da luta do anfitrião');
  // Depois do resultado, assiste outra luta que ainda está rolando (se houver) ou espera a próxima fase.
  await until(() => h.starts.some((s) => s.spectate) || h.tour.phase !== 'round', 20000, 'assistir');
  if (h.tour.phase === 'round' && h.tour.rounds[0].matches.some((m) => m.state === 'live')) {
    const live = h.tour.rounds[0].matches.find((m) => m.state === 'live');
    const n = h.starts.length;
    h.c.send({ t: 'watch', match: live.id });
    await until(() => h.starts.length > n || h.tour.phase !== 'round', 5000, 'trocar de luta');
    h.c.send({ t: 'watch', match: null });
    await until(() => h.tour.watch === null, 3000, 'voltar à chave');
  }
  await champion(h, 120000);
  assert(g.tour.phase === 'champion', 'o amigo também viu o campeão');
  [h, g].forEach((s) => s.c.close());
});

await test('Queda no meio do torneio: a IA assume e o jogador volta com o token', async () => {
  const [h, g] = await tourRoom('tour1', 2, 1);
  h.c.send({ t: 'start' });
  await until(() => g.tour?.phase === 'round' && g.starts.length, 8000, 'semi do amigo');
  const room = srv.rooms.get(h.code);
  const token = g.token, code = g.code;
  g.c.close();
  await until(() => room.list().some((p) => !p.connected), 3000, 'queda');
  const g2 = await client('volta');
  g2.c.send({ t: 'rejoin', code, token });
  await until(() => g2.tour, 3000, 'chave de volta');
  assert(g2.errors.length === 0, 'erro ao voltar: ' + g2.errors.map((e) => e.code));
  await champion(h, 90000);
  [h, g2].forEach((s) => s.c.close());
});

await srv.close();
let fail = 0;
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n        ' + r.err}`); if (!r.ok) fail++; }
console.log(fail ? `\n${fail} teste(s) do torneio falharam.` : '\nTodos os testes do torneio passaram.');
process.exit(fail ? 1 : 0);
