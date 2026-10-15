// Jogador-robô para testar o multiplayer sozinho: entra numa sala e joga de verdade pela rede.
//   node tools/bot.mjs CODIGO [ws://localhost:8140/ws] [monstro1,monstro2,monstro3]
// Ex.: node tools/bot.mjs K7QM
import { NetClient } from '../src/net/client.js';
import { createMirror } from '../src/net/mirror.js';
import { applySnapshot } from '../src/net/snapshot.js';
import { matchup } from '../src/ai/coach.js';
import { ROSTER } from '../src/sim/species.js';

const [code, url = 'ws://localhost:8140/ws', teamArg] = process.argv.slice(2);
if (!code) { console.log('uso: node tools/bot.mjs CODIGO [ws://servidor/ws] [m1,m2,m3]'); process.exit(1); }
const team = teamArg ? teamArg.split(',') : [...ROSTER].sort(() => Math.random() - 0.5).slice(0, 3);

const c = new NetClient();
await c.connect(url);
let mirror = null, start = null, seq = 0, myId = null;
c.on('error', (m) => console.log('erro:', m.message));
c.on('joined', (m) => { myId = m.id; console.log('entrei na sala', code, 'com', team.join(', ')); c.send({ t: 'team', team }); setTimeout(() => c.send({ t: 'ready', ready: true }), 300); });
c.on('room', (m) => { const me = m.players.find((p) => p.id === myId); if (m.state === 'lobby' && me && me.team && !me.ready) setTimeout(() => c.send({ t: 'ready', ready: true }), 300); if (m.state === 'lobby') console.log(`sala ${m.code}: ${m.players.map((p) => p.name + (p.ready ? '✓' : '')).join(', ')} (${m.mode}, ${m.arena})`); });
c.on('start', (m) => { start = m; mirror = createMirror(m); console.log('partida iniciada! vaga', m.you); });
c.on('end', (m) => console.log('fim da partida; lado vencedor:', m.winnerSide));
c.on('closed', () => { console.log('conexão encerrada'); process.exit(0); });
c.on('snap', (s) => {
  if (!mirror) return;
  seq = s.seq;
  applySnapshot(mirror.world, s, mirror.ctx);
  mirror.world.events.length = 0;
  const w = mirror.world, seat = start.you, me = w.teams[seat].field;
  if (!me || !me.alive || me.switchState || me.evolveT > 0) return;
  const foes = w.monsters.filter((m) => m.alive && m.onField && m.team !== me.team);
  if (!foes.length) return;
  const f = foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  const d = Math.hypot(f.x - me.x, f.y - me.y) || 1, ux = (f.x - me.x) / d, uy = (f.y - me.y) / d;
  const rad = d > 90 ? 1 : d < 50 ? -1 : 0, side = Math.sin(w.time * 1.3) > 0 ? 1 : -1;
  const presses = [];
  if (seq % 12 === 0) presses.push('q');
  if (seq % 17 === 4) presses.push('e');
  if (seq % 21 === 8) presses.push('f');
  if (seq % 25 === 7) presses.push('dodge');
  if (d < 32) presses.push('melee');
  if (me.canEvolve && d > 60) presses.push('evolve');
  c.send({ t: 'input', mx: ux * rad - uy * side * 0.6, my: uy * rad + ux * side * 0.6, ax: f.x, ay: f.y, hp: true, hm: false, presses });
  if (seq % 40 === 0 && w.time - me.enteredAt > 6) {
    const bench = w.teamOf(seat).filter((x) => x.alive && !x.onField);
    if (bench.length && (matchup(me, f) < 0 || me.hp / me.maxHp < 0.25)) {
      bench.sort((a, b) => (matchup(b, f) + b.hp / b.maxHp) - (matchup(a, f) + a.hp / a.maxHp));
      c.send({ t: 'switch', idx: w.teamOf(seat).indexOf(bench[0]) });
    }
  }
});
c.send({ t: 'join', code, name: 'Robô' });
