// Testes de rede: servidor real (porta aleatória) + clientes WebSocket reais + bots.
// node test/net.mjs
import { WORLD_W, WORLD_H } from '../src/config.js';
import { createServer } from '../server/server.js';
import { NetClient } from '../src/net/client.js';
import { createMirror } from '../src/net/mirror.js';
import { applySnapshot } from '../src/net/snapshot.js';
import { matchup } from '../src/ai/coach.js';

const results = [];
const test = async (name, fn) => { if (process.env.V) console.error('>>', name); try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.stack?.split('\n').slice(0, 3).join(' | ') || e.message }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 8000, what = 'condição') => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error('tempo esgotado esperando ' + what); await wait(10); } };
const TEAMS = [['brasalisco', 'hidrocasco', 'brotossauro'], ['ouriflama', 'gotapus', 'mantifolha'], ['mantifolha', 'ouriflama', 'hidrocasco'], ['gotapus', 'brasalisco', 'brotossauro']];

const srv = await createServer({ port: 0, host: '127.0.0.1', timeScale: 10 });
const url = `ws://127.0.0.1:${srv.port}/ws`;

// Cliente de teste: conecta, guarda a sala, o mundo espelho e (opcionalmente) joga como um bot.
async function client(name) {
  const c = new NetClient();
  await c.connect(url);
  const st = { c, name, room: null, errors: [], mirror: null, seq: 0, start: null, ended: null, snaps: 0, closed: false, bot: false, id: null, code: null };
  c.on('room', (m) => { st.room = m; });
  c.on('joined', (m) => { st.id = m.id; st.code = m.code; st.token = m.token; st.joined = m; });
  c.on('error', (m) => st.errors.push(m));
  c.on('closed', () => { st.closed = true; });
  c.on('start', (m) => { st.start = m; st.mirror = createMirror(m); });
  c.on('snap', (m) => {
    if (!st.mirror) return;
    st.snaps++; st.seq = m.seq;
    applySnapshot(st.mirror.world, m, st.mirror.ctx);
    st.mirror.world.events.length = 0;
    if (st.bot) bot(st);
  });
  c.on('end', (m) => { st.ended = m; });
  return st;
}

function bot(st) {
  const w = st.mirror.world, seat = st.start.you;
  const me = w.teams[seat].field;
  if (!me || !me.alive || me.switchState) return;
  const foes = w.monsters.filter((m) => m.alive && m.onField && m.team !== me.team);
  if (!foes.length) return;
  const f = foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  const d = Math.hypot(f.x - me.x, f.y - me.y) || 1, ux = (f.x - me.x) / d, uy = (f.y - me.y) / d;
  const rad = d > 90 ? 1 : d < 50 ? -1 : 0, side = Math.sin(w.time * 1.3) > 0 ? 1 : -1;
  const presses = [];
  const tick = st.seq;
  if (tick % 9 === 0) presses.push('q');
  if (tick % 14 === 4) presses.push('e');
  if (tick % 17 === 8) presses.push('f');
  if (tick % 20 === 7) presses.push('dodge');
  if (d < 32) presses.push('melee');
  if (me.canEvolve && d > 60) presses.push('evolve');
  st.c.send({ t: 'input', mx: ux * rad - uy * side * 0.6, my: uy * rad + ux * side * 0.6, ax: f.x, ay: f.y, hp: true, hm: false, presses });
  if (tick % 40 === 0 && w.time - me.enteredAt > 6) {
    const bench = w.teamOf(seat).filter((x) => x.alive && !x.onField);
    const bad = matchup(me, f) < 0, low = me.hp / me.maxHp < 0.25;
    if (bench.length && (bad || low)) {
      bench.sort((a, b) => (matchup(b, f) + b.hp / b.maxHp) - (matchup(a, f) + a.hp / a.maxHp));
      st.c.send({ t: 'switch', idx: w.teamOf(seat).indexOf(bench[0]) });
    }
  }
}

async function lobby(mode, n) {
  const sts = [];
  const host = await client('anfitrião');
  host.c.send({ t: 'create', name: 'Ana', mode });
  await until(() => host.code && host.room, 3000, 'sala criada');
  sts.push(host);
  for (let i = 1; i < n; i++) {
    const g = await client('convidado' + i);
    g.c.send({ t: 'join', code: host.code.toLowerCase(), name: 'Jogador' + i }); // aceita minúsculas
    await until(() => g.code, 3000, 'entrada na sala');
    sts.push(g);
  }
  sts.forEach((s, i) => s.c.send({ t: 'team', team: TEAMS[i] }));
  await until(() => host.room.players.every((p) => p.team), 3000, 'times escolhidos');
  sts.slice(1).forEach((s) => s.c.send({ t: 'ready', ready: true }));
  await until(() => host.room.players.filter((p) => p.ready).length >= n - 1, 3000, 'prontidão');
  return sts;
}

// Compara o espelho de um cliente com o mundo do servidor (a sala fica em srv.rooms).
function compareWithServer(st) {
  const room = srv.rooms.get(st.code);
  const sw = room.world, cw = st.mirror.world;
  assert(sw.over && cw.over, 'partida não terminou nos dois lados');
  assert(sw.winner === cw.winner, `vencedor diferente: servidor ${sw.winner} cliente ${cw.winner}`);
  sw.roster.forEach((m, i) => {
    const c = cw.roster[i];
    assert(Math.abs(m.hp - c.hp) < 0.2 && m.alive === c.alive && m.def.key === c.def.key && m.evolved === c.evolved, `monstro ${i} (${m.name}) diverge: hp ${m.hp.toFixed(1)} x ${c.hp.toFixed(1)}, forma ${m.def.key} x ${c.def.key}`);
  });
}

await test('Código inválido, sala inexistente e mensagens malformadas', async () => {
  const c = await client('x');
  c.c.send({ t: 'join', code: 'ZZZZ', name: 'A' });
  await until(() => c.errors.length, 2000, 'erro');
  assert(c.errors[0].code === 'not_found', 'código inválido deveria dar not_found');
  c.c.send({ t: 'ready', ready: true });
  await until(() => c.errors.length > 1, 2000, 'erro 2');
  assert(c.errors[1].code === 'no_room', 'deveria exigir sala');
  c.c.ws.send('isto nao e json{');
  await until(() => c.errors.length > 2, 2000, 'erro 3');
  assert(c.errors[2].code === 'bad_json', 'json inválido');
  c.c.close();
});

await test('Criar sala, entrar com o código, sala cheia e início bloqueado sem times/anfitrião', async () => {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode: '1v1' });
  await until(() => host.code, 2000);
  assert(/^[A-HJ-NP-Z2-9]{4}$/.test(host.code), 'formato do código: ' + host.code);
  const g = await client('g');
  g.c.send({ t: 'join', code: host.code, name: 'Bia' });
  await until(() => g.code, 2000);
  await until(() => host.room.players.length === 2, 2000, 'dois jogadores');
  const lateral = await client('l');
  lateral.c.send({ t: 'join', code: host.code, name: 'Cia' });
  await until(() => lateral.errors.length, 2000);
  assert(lateral.errors[0].code === 'full', 'esperava sala cheia, veio ' + lateral.errors[0].code);
  g.c.send({ t: 'start' });
  await until(() => g.errors.length, 2000);
  assert(g.errors[0].code === 'not_host', 'convidado não pode iniciar');
  host.c.send({ t: 'start' });
  await until(() => host.errors.length, 2000);
  assert(['not_ready', 'need_players'].includes(host.errors[0].code), 'não deveria iniciar sem times: ' + host.errors[0].code);
  [host, g, lateral].forEach((s) => s.c.close());
});

await test('1v1 online: partida completa, servidor autoritativo e espelhos idênticos ao servidor', async () => {
  const [a, b] = await lobby('1v1', 2);
  a.bot = b.bot = true;
  a.c.send({ t: 'start' });
  await until(() => a.start && b.start, 3000, 'início');
  assert(a.start.you !== b.start.you && a.start.seed === b.start.seed, 'vagas/seed');
  await until(() => a.ended && b.ended, 90000, 'fim da partida');
  await wait(100);
  compareWithServer(a); compareWithServer(b);
  assert(a.snaps > 200 && b.snaps > 200, `poucos snapshots (${a.snaps})`);
  assert(a.ended.winnerSide === b.ended.winnerSide, 'resultados diferentes');
  const room = srv.rooms.get(a.code);
  const evolved = room.world.roster.filter((m) => m.evolved).length;
  const switches = room.world.teams.reduce((s, t) => s + t.switches, 0);
  console.log(`      1v1: vencedor lado ${a.ended.winnerSide}, ${a.ended.duration.toFixed(0)}s simulados, ${a.snaps} snapshots, ${evolved} evoluções, ${switches} trocas`);
  a.c.close(); b.c.close();
});

await test('Servidor valida entradas: NaN, valores enormes e teclas inválidas não quebram nem trapaceiam', async () => {
  const [a, b] = await lobby('1v1', 2);
  a.c.send({ t: 'start' });
  await until(() => a.start && b.start, 3000, 'início');
  const room = srv.rooms.get(a.code);
  a.c.send({ t: 'input', mx: 'abc', my: 9999, ax: NaN, ay: 1e9, hp: 1, presses: ['q', 'hack', '__proto__', 'evolve', 1, null] });
  b.c.send({ t: 'switch', idx: 99 });
  b.c.send({ t: 'switch', idx: -1 });
  await wait(150);
  const inp = room.world.inputs[a.start.you];
  assert(Math.abs(inp.move.y) <= 1 && Number.isFinite(inp.move.x) && inp.aim.y <= WORLD_H && inp.aim.x <= WORLD_W, 'entrada não foi limitada');
  const m = room.world.fieldOf(a.start.you);
  assert(!m.evolved, 'evoluiu sem energia');
  const before = JSON.stringify(room.world.inputs[a.start.you].move);
  b.c.send({ t: 'input', mx: 1, my: 1, ax: 0, ay: 0, hp: false, presses: [] });
  await wait(100);
  assert(JSON.stringify(room.world.inputs[a.start.you].move) === before, 'um cliente alterou a entrada do outro');
  a.c.close(); b.c.close();
});

await test('2v2 online: 4 jogadores, equipes, combate simultâneo, mesmo estado para todos', async () => {
  const sts = await lobby('2v2', 4);
  const host = sts[0];
  assert(host.room.mode === '2v2' && host.room.players.length === 4, 'sala 2v2 com 4 jogadores');
  const sides = host.room.players.map((p) => p.side).sort().join('');
  assert(sides === '0011', 'equipes: ' + sides);
  sts.forEach((s) => { s.bot = true; });
  host.c.send({ t: 'start' });
  await until(() => sts.every((s) => s.start), 3000, 'início');
  const room = srv.rooms.get(host.code);
  let maxField = 0, simult = 0, samples = 0, bad = null;
  const watcher = setInterval(() => {
    const w = room.world; if (!w || w.over) return;
    for (let slot = 0; slot < 4; slot++) if (w.monsters.filter((m) => m.slot === slot && m.alive).length > 1) bad = 'vaga com 2 monstros em campo';
    maxField = Math.max(maxField, w.monsters.filter((m) => m.alive).length);
    if (w.monsters.filter((m) => m.alive && m.action).length >= 2) simult++;
    samples++;
  }, 20);
  await until(() => sts.every((s) => s.ended), 150000, 'fim 2v2');
  clearInterval(watcher);
  await wait(100);
  assert(!bad, bad);
  sts.forEach(compareWithServer);
  assert(maxField === 4, `esperava 4 monstros simultâneos em campo, máx ${maxField}`);
  assert(simult / samples > 0.5, 'pouca ação simultânea');
  const w = room.world;
  console.log(`      2v2: vencedor lado ${w.winner}, ${w.endTime.toFixed(0)}s simulados, ação simultânea em ${(100 * simult / samples).toFixed(0)}% das amostras`);
  sts.forEach((s) => s.c.close());
});

await test('Desconexão no meio da partida: a IA assume e a partida termina para quem ficou', async () => {
  const [a, b] = await lobby('1v1', 2);
  a.bot = b.bot = true;
  a.c.send({ t: 'start' });
  await until(() => a.start && b.start, 3000, 'início');
  await until(() => a.seq > 100, 3000, 'partida andando');
  b.c.close();
  await until(() => a.room.players.some((p) => !p.connected), 3000, 'aviso de saída');
  const room = srv.rooms.get(a.code);
  assert(!room.world.humans.has(b.start.you), 'vaga do desconectado ainda marcada como humana');
  assert(room.world.coaches[b.start.you], 'IA não assumiu a vaga');
  await until(() => a.ended, 120000, 'fim da partida');
  compareWithServer(a);
  a.c.close();
});

await test('Lobby: anfitrião sai e outro assume; sala vazia é removida', async () => {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode: '1v1' });
  await until(() => host.code, 2000);
  const g = await client('g');
  g.c.send({ t: 'join', code: host.code, name: 'Bia' });
  await until(() => g.code, 2000);
  host.c.send({ t: 'leave' });
  await until(() => g.room && g.room.players.length === 1, 2000, 'saída do anfitrião');
  assert(g.room.host === g.id, 'o convidado deveria virar anfitrião');
  const code = host.code;
  g.c.close();
  await until(() => !srv.rooms.has(code), 3000, 'sala removida');
  host.c.close();
});

await test('Anfitrião muda modo e arena; 2v2 precisa de 4 jogadores', async () => {
  const [a, b] = await lobby('1v1', 2);
  a.c.send({ t: 'config', mode: '2v2', arena: 'abismo' });
  await until(() => a.room.mode === '2v2' && a.room.arena === 'abismo', 2000, 'config');
  assert(a.room.players.every((p) => !p.ready), 'prontidão deveria ser desfeita');
  const sides = a.room.players.map((p) => p.side).sort().join('');
  assert(sides === '01', 'oponentes devem ficar em lados opostos: ' + sides);
  b.c.send({ t: 'ready', ready: true });
  a.c.send({ t: 'start' });
  await until(() => a.errors.some((e) => e.code === 'need_players'), 2000, 'erro de jogadores');
  b.c.send({ t: 'config', mode: '1v1' });
  await until(() => b.errors.some((e) => e.code === 'not_host'), 2000, 'só o anfitrião configura');
  a.c.close(); b.c.close();
});


await test('Robôs: o anfitrião completa um 2v2 com robôs, joga sozinho e todos veem o mesmo estado', async () => {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode: '2v2' });
  await until(() => host.code && host.room, 3000, 'sala');
  host.c.send({ t: 'team', team: TEAMS[0] });
  host.c.send({ t: 'config', botLevel: 'hard' });
  host.c.send({ t: 'fillBots' });
  await until(() => host.room.players.length === 4 && host.room.botLevel === 'hard', 3000, 'robôs nas vagas');
  const bots = host.room.players.filter((p) => p.bot);
  assert(bots.length === 3 && bots.every((b) => b.ready && b.team?.length === 3), 'robôs sem time ou não prontos');
  const seat = bots[0].seat, before = bots[0].team.join();
  host.c.send({ t: 'botTeam', seat });
  await until(() => host.room.players.find((p) => p.seat === seat).team.join() !== before, 3000, 'time do robô sorteado de novo');
  host.bot = true;
  host.c.send({ t: 'start' });
  await until(() => host.start, 3000, 'início');
  assert(host.start.players.filter((p) => p.bot).length === 3, 'start sem marcar os robôs');
  const room = srv.rooms.get(host.code);
  assert(room.world.humans.size === 1 && room.world.coaches.filter(Boolean).length === 3, 'robôs não ficaram com a IA');
  await until(() => host.ended, 120000, 'fim da partida com robôs');
  compareWithServer(host);
  host.c.close();
});

await test('Robôs: amigo que entra com a sala cheia toma a vaga de um robô; só o anfitrião mexe; sala só de robôs fecha', async () => {
  const host = await client('h');
  host.c.send({ t: 'create', name: 'Ana', mode: '1v1' });
  await until(() => host.code && host.room, 3000, 'sala');
  host.c.send({ t: 'addBot' });
  await until(() => host.room.players.length === 2, 3000, 'robô adicionado');
  const g = await client('g');
  g.c.send({ t: 'join', code: host.code, name: 'Bia' });
  await until(() => g.code && g.room, 3000, 'amigo entrou');
  assert(g.room.players.length === 2 && !g.room.players.some((p) => p.bot), 'o amigo não tomou a vaga do robô');
  g.c.send({ t: 'addBot' });
  await until(() => g.errors.length, 2000, 'recusa');
  assert(g.errors[0].code === 'not_host', 'convidado conseguiu mexer nos robôs');
  host.c.send({ t: 'config', mode: '2v2' });
  await until(() => host.room.mode === '2v2', 2000, '2v2');
  host.c.send({ t: 'addBot', seat: 1 });
  await until(() => host.room.players.some((p) => p.bot && p.seat === 1), 2000, 'robô na vaga 1');
  host.c.send({ t: 'config', mode: '1v1' });
  await until(() => host.room.mode === '1v1', 2000, 'voltou a 1v1');
  assert(host.room.players.length === 2 && !host.room.players.some((p) => p.bot), 'robô não saiu para caber no 1v1');
  g.c.close();
  await until(() => host.room.players.length === 1, 2000, 'amigo saiu');
  host.c.send({ t: 'fillBots' });
  await until(() => host.room.players.length === 2, 2000, 'robô de novo');
  const code = host.code;
  host.c.send({ t: 'leave' });
  await until(() => !srv.rooms.has(code), 3000, 'sala só com robôs deveria fechar');
  host.c.close();
});

await test('Falha ao conectar rejeita sem emitir "closed" (não é conexão perdida) e tenta o próximo endereço', async () => {
  const c = new NetClient();
  let closed = false;
  c.on('closed', () => { closed = true; });
  let rejected = false;
  await c.connect('ws://127.0.0.1:1/ws', 2000).catch(() => { rejected = true; });
  assert(rejected, 'deveria rejeitar');
  await wait(100);
  assert(!closed, 'falha ao conectar não pode virar "closed"');
  const used = await c.connect(['ws://127.0.0.1:1/ws', url], 2000);
  assert(used === url && c.open, 'deveria cair no segundo endereço');
  c.close();
});

await test('/health responde e arquivos estáticos saem comprimidos; caminhos fora do jogo dão 404', async () => {
  const base = `http://127.0.0.1:${srv.port}`;
  const h = await (await fetch(base + '/health')).json();
  assert(h.ok === true && typeof h.rooms === 'number', 'health inválido');
  const r = await fetch(base + '/src/main.js', { headers: { 'accept-encoding': 'gzip' } });
  assert(r.status === 200 && r.headers.get('content-encoding') === 'gzip', 'sem gzip');
  assert((await r.text()).includes('import'), 'conteúdo inválido');
  for (const bad of ['/package.json', '/server/server.js', '/node_modules/ws/package.json', '/..%2fpackage.json', '/src/../package.json']) {
    assert((await fetch(base + bad)).status === 404, 'deveria negar ' + bad);
  }
});

await test('Reconexão: quem cai no meio da partida volta com o token e reassume o controle', async () => {
  const [a, b] = await lobby('1v1', 2);
  a.bot = true;
  a.c.send({ t: 'start' });
  await until(() => a.start && b.start, 3000, 'início');
  await until(() => a.seq > 40, 3000, 'partida andando');
  const token = b.token, code = b.code, seat = b.start.you;
  b.c.ws.close();
  const room = srv.rooms.get(code);
  await until(() => !room.world.humans.has(seat), 2000, 'IA assumir');
  const b2 = await client('b2');
  b2.c.send({ t: 'rejoin', code, token: 'token-errado' });
  await until(() => b2.errors.length, 2000, 'recusa');
  assert(b2.errors[0].code === 'gone', 'token errado deveria ser recusado');
  b2.c.send({ t: 'rejoin', code, token });
  await until(() => b2.start, 3000, 'start de retomada');
  assert(b2.start.resumed && b2.start.you === seat, 'retomada na vaga errada');
  assert(b2.joined.rejoined === true, 'joined deveria indicar rejoined');
  assert(room.world.humans.has(seat) && !room.world.coaches[seat], 'controle humano não voltou');
  assert(room.world.fieldOf(seat).controller, 'monstro sem controlador');
  const n0 = b2.snaps;
  await until(() => b2.snaps > n0 + 5, 3000, 'snapshots após voltar');
  b2.c.send({ t: 'input', mx: 1, my: 0, ax: 300, ay: 100, hp: false, hm: false, presses: [] });
  await wait(300);
  assert(room.world.inputs[seat].move.x === 1, 'entrada não chegou');
  // Saída voluntária invalida o token.
  b2.c.send({ t: 'leave' });
  await wait(100);
  const b3 = await client('b3');
  b3.c.send({ t: 'rejoin', code, token });
  await until(() => b3.errors.length, 2000, 'recusa após sair');
  [a, b3].forEach((s) => s.c.close());
});

await test('Limites: origem não permitida e excesso de conexões por IP são recusados', async () => {
  const s2 = await createServer({ port: 0, host: '127.0.0.1', allowedOrigins: ['https://meujogo.example'], maxConnPerIp: 2 });
  const u2 = `ws://127.0.0.1:${s2.port}/ws`;
  const bad = new NetClient();
  let rej = false;
  await bad.connect(u2, 2000).catch(() => { rej = true; });
  assert(rej, 'conexão sem origem permitida deveria ser recusada');
  const { WebSocket: WS } = await import('ws');
  const open = (origin) => new Promise((res) => { const w = new WS(u2, { headers: { Origin: origin } }); w.on('open', () => res(w)); w.on('error', () => res(null)); w.on('unexpected-response', () => res(null)); });
  const w1 = await open('https://meujogo.example'), w2 = await open('https://meujogo.example'), w3 = await open('https://meujogo.example');
  assert(w1 && w2, 'as duas primeiras deveriam entrar');
  assert(w3 === null, 'a terceira (mesmo IP) deveria ser recusada');
  w1.close(); w2.close();
  await s2.close();
});

await test('Limite de mensagens: inundar o servidor não derruba as salas', async () => {
  const flood = await client('f');
  for (let i = 0; i < 3000; i++) flood.c.send({ t: 'ping' });
  await wait(300);
  const ok = await client('ok');
  ok.c.send({ t: 'create', name: 'Ana', mode: '1v1' });
  await until(() => ok.code, 2000, 'sala criada após flood');
  flood.c.close(); ok.c.close();
});

await test('Encerramento gracioso: salas avisadas e conexões fechadas', async () => {
  const s3 = await createServer({ port: 0, host: '127.0.0.1' });
  const c = new NetClient();
  let closed = false;
  c.on('closed', () => { closed = true; });
  await c.connect(`ws://127.0.0.1:${s3.port}/ws`);
  await s3.close();
  await until(() => closed, 2000, 'conexão fechada');
});

await srv.close();
let failed = 0;
console.log('\nTestes de rede (servidor real + clientes WebSocket)\n');
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) failed++; }
console.log(failed ? `\n${failed} teste(s) falharam.` : '\nTodos os testes de rede passaram.');
process.exit(failed ? 1 : 0);
