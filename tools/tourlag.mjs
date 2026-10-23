// Diagnóstico de travamento online (SLOW=4 imita um servidor mais lento): mede, no cliente, o intervalo entre snapshots da luta (deveria ser ~50 ms) e,
// no servidor, o atraso do laço de eventos — numa partida 1v1 comum e num torneio de 8 (4 lutas ao mesmo tempo).
//   node tools/tourlag.mjs
import { createServer } from '../server/server.js';
import { NetClient } from '../src/net/client.js';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { World } from '../src/sim/world.js';

// SLOW=4 simula um servidor 4× mais lento (como a VPS de 1 núcleo): cada passo da simulação custa 4× o tempo.
const SLOW = +(process.env.SLOW || 1);
if (SLOW > 1) { const step = World.prototype.step; World.prototype.step = function (dt) { const t = performance.now(); step.call(this, dt); const d = performance.now() - t; const end = performance.now() + d * (SLOW - 1); while (performance.now() < end) { /* gasta CPU */ } }; }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TEAM = ['brasalisco', 'hidrocasco', 'brotossauro'];
const srv = await createServer({ port: 0, host: '127.0.0.1' });
const url = `ws://127.0.0.1:${srv.port}/ws`;

async function measure(mode, bots, secs = 12) {
  const c = new NetClient();
  await c.connect(url);
  const st = { gaps: [], last: 0, match: null, bytes: 0, starts: 0 };
  c.on('room', (m) => { st.room = m; });
  c.on('start', (m) => { st.match = m.match ?? 0; st.starts++; st.last = 0; });
  c.on('snap', (m) => { if ((m.match ?? 0) !== st.match) return; const now = performance.now(); if (st.last) st.gaps.push(now - st.last); st.last = now; });
  c.ws?.addEventListener?.('message', (e) => { st.bytes += e.data.length || 0; });
  c.send({ t: 'create', name: 'Medidor', mode });
  while (!st.room) await wait(20);
  c.send({ t: 'team', team: TEAM });
  for (let i = 0; i < bots; i++) c.send({ t: 'addBot' });
  await wait(300);
  c.send({ t: 'start' });
  // Torneio: espera a fase de lutas começar.
  const t0 = Date.now();
  while (!st.starts && Date.now() - t0 < 20000) await wait(20);
  await wait(4500); // contagem do VS
  st.gaps.length = 0;
  const h = monitorEventLoopDelay({ resolution: 5 }); h.enable();
  // Fica mandando entradas como um jogador andando em círculos.
  let k = 0;
  const iv = setInterval(() => { k++; c.send({ t: 'input', mx: Math.cos(k / 10), my: Math.sin(k / 10), ax: 500, ay: 300, hp: false, hm: false, presses: [] }); }, 25);
  await wait(secs * 1000);
  clearInterval(iv); h.disable();
  const g = st.gaps.sort((a, b) => a - b), pct = (p) => g[Math.min(g.length - 1, Math.floor(g.length * p))]?.toFixed(1);
  console.log(`${mode.padEnd(6)} bots ${bots}: snapshots ${g.length} em ${secs}s · intervalo med ${pct(0.5)} p95 ${pct(0.95)} p99 ${pct(0.99)} máx ${g.at(-1)?.toFixed(1)} ms · atraso do laço do servidor med ${(h.percentile(50) / 1e6).toFixed(1)} p99 ${(h.percentile(99) / 1e6).toFixed(1)} máx ${(h.max / 1e6).toFixed(1)} ms`);
  c.close();
  await wait(500);
}

const only = process.env.ONLY;
for (const [m, b] of [['1v1', 1], ['tour1', 7], ['tour2', 7]]) if (!only || only === m) await measure(m, b);
await srv.close();
process.exit(0);
