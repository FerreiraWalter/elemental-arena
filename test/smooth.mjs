// Suavização de rede: simula servidor + rede com latência/jitter e mede o que o jogador VÊ.
// node test/smooth.mjs
import { World } from '../src/sim/world.js';
import { DT } from '../src/config.js';
import { serialize, makeSyncCtx } from '../src/net/snapshot.js';
import { createMirror } from '../src/net/mirror.js';
import { NetSmoother } from '../src/net/smooth.js';
import { mulberry32 } from '../src/core/math.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

const ROSTERS = [['brasalisco', 'hidrocasco', 'brotossauro'], ['ouriflama', 'gotapus', 'mantifolha']];

// owd = latência de ida (ms); jitter = variação aleatória (ms); script(t) → direção desejada {x,y} em t segundos.
function run({ owd, jitter, seconds = 4, script, seed = 1 }) {
  const rnd = mulberry32(seed);
  const server = World.match(7, ROSTERS, null, 'quadra', 'normal', { sides: [0, 1], humans: [0, 1] });
  const sctx = makeSyncCtx(server);
  const start = { seed: 7, rosters: ROSTERS, you: 0, arena: 'quadra', sides: [0, 1], players: [{ seat: 0 }, { seat: 1 }] };
  const mirror = createMirror(start);
  const cw = mirror.world;
  const sm = new NetSmoother();
  const toClient = [], toServer = []; // { at, data }
  let lastC = 0, lastS = 0;
  const lat = () => owd + (rnd() - 0.5) * 2 * jitter;
  const frames = [];
  let ticks = 0;
  const FR = 1000 / 60;
  let tms = 0;
  // Deixa a entrada do monstro e a troca inicial estabilizarem sem mexer.
  const pre = 1200;
  for (; tms < (seconds * 1000 + pre); tms += FR) {
    // servidor: entradas que chegaram
    while (toServer.length && toServer[0].at <= tms) { const d = toServer.shift().data; server.inputs[0].move.x = d.x; server.inputs[0].move.y = d.y; }
    server.step(DT);
    if (++ticks % 3 === 0) { const s = JSON.parse(JSON.stringify(serialize(server, sctx))); const at = Math.max(lastC + 0.01, tms + lat()); lastC = at; toClient.push({ at, data: s }); }
    // cliente: snapshots que chegaram
    while (toClient.length && toClient[0].at <= tms) sm.enqueue(toClient.shift().data, toClient[0] ? tms : tms, cw);
    // cliente: entrada desta quadro (após o pré-aquecimento)
    const t = Math.max(0, (tms - pre) / 1000);
    const dir = tms < pre ? { x: 0, y: 0 } : script(t);
    cw.input.move.x = dir.x; cw.input.move.y = dir.y;
    const at = Math.max(lastS + 0.01, tms + lat()); lastS = at; toServer.push({ at, data: dir });
    const alpha = sm.pump(tms, cw, mirror.ctx);
    sm.lead(tms, FR / 1000, alpha, cw, false, owd * 2);
    const m = cw.active;
    if (m && tms >= pre) {
      const l = m.lead || { x: 0, y: 0 };
      frames.push({ t, x: m.px + (m.x - m.px) * alpha + l.x, y: m.py + (m.y - m.py) * alpha + l.y, sx: server.fieldOf(0).x, sy: server.fieldOf(0).y, dir });
    }
  }
  return { frames, server };
}


const zigzag = (t) => (t < 0.4 ? { x: 0, y: 0 } : t < 1.2 ? { x: 1, y: 0 } : t < 1.6 ? { x: 0, y: 0 } : t < 2.4 ? { x: -1, y: 0 } : t < 3.0 ? { x: 0, y: 1 } : { x: 0, y: 0 });

function analyse(frames, speed = 80) {
  let maxStep = 0, backward = 0, maxJumpErr = 0;
  for (let i = 1; i < frames.length; i++) {
    const dx = frames[i].x - frames[i - 1].x, dy = frames[i].y - frames[i - 1].y;
    maxStep = Math.max(maxStep, Math.hypot(dx, dy));
    const d = frames[i].dir;
    if ((d.x || d.y) && dx * d.x + dy * d.y < -0.3) backward++; // andando para trás enquanto segura a tecla
  }
  void speed; void maxJumpErr;
  return { maxStep, backward };
}

for (const [name, cfg] of [['ping 40 ms (jitter 5)', { owd: 20, jitter: 5 }], ['ping 120 ms (jitter 25)', { owd: 60, jitter: 25 }], ['ping 250 ms (jitter 60)', { owd: 125, jitter: 60 }]]) {
  test(`Movimento suave e responsivo — ${name}`, () => {
    const { frames, server } = run({ ...cfg, script: zigzag, seconds: 4.2 });
    assert(frames.length > 100, 'sem quadros');
    const a = analyse(frames);
    const perFrame = 80 / 60;
    assert(a.maxStep < perFrame * 4, `salto visual de ${a.maxStep.toFixed(1)} px em um quadro (limite ${(perFrame * 4).toFixed(1)})`);
    assert(a.backward <= 2, `${a.backward} quadros andando para trás com a tecla pressionada`);
    // Resposta: depois de apertar a tecla (t=0.4), o desenho do jogador se move em até 60 ms.
    const f0 = frames.find((f) => f.t >= 0.4);
    const moved = frames.find((f) => f.t > 0.4 && Math.hypot(f.x - f0.x, f.y - f0.y) > 1.0);
    assert(moved && (moved.t - 0.4) * 1000 <= 70, `resposta lenta: ${moved ? ((moved.t - 0.4) * 1000).toFixed(0) : '∞'} ms`);
    // Ao final (parado há um tempo) o desenho coincide com o servidor.
    const last = frames[frames.length - 1];
    const err = Math.hypot(last.x - last.sx, last.y - last.sy);
    assert(err < 3, `erro final em relação ao servidor: ${err.toFixed(1)} px`);
    void server;
  });
}

test('Sem rede ruim: o desenho nunca se afasta mais que ~1 s de movimento do servidor (parede/colisão)', () => {
  const { frames } = run({ owd: 60, jitter: 25, script: () => ({ x: 1, y: 0 }), seconds: 6 });
  const worst = Math.max(...frames.map((f) => Math.hypot(f.x - f.sx, f.y - f.sy)));
  assert(worst < 40, `distância máxima do servidor: ${worst.toFixed(1)} px`);
});

let failed = 0;
console.log('\nSuavização de rede (simulação com latência e jitter)\n');
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) failed++; }
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
