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
function run({ owd, jitter, seconds = 4, script, seed = 1, rosters = ROSTERS, spikes = 0 }) {
  const rnd = mulberry32(seed);
  const server = World.match(7, rosters, null, 'quadra', 'normal', { sides: [0, 1], humans: [0, 1] });
  const sctx = makeSyncCtx(server);
  const start = { seed: 7, rosters, you: 0, arena: 'quadra', sides: [0, 1], players: [{ seat: 0 }, { seat: 1 }] };
  const mirror = createMirror(start);
  const cw = mirror.world;
  const sm = new NetSmoother();
  const toClient = [], toServer = []; // { at, data }
  let lastC = 0, lastS = 0;
  // spikes: a cada ~2 s a rede trava por esse tempo (retransmissão TCP / Wi-Fi) e o que estava parado chega de uma vez.
  const lat = (t) => owd + (rnd() - 0.5) * 2 * jitter + (spikes && (t % 2000) < spikes ? spikes - (t % 2000) : 0);
  const frames = [], casts = [];
  let ticks = 0;
  const pressed = new Set();
  const FR = 1000 / 60;
  let tms = 0;
  // Deixa a entrada do monstro e a troca inicial estabilizarem sem mexer.
  const pre = 1200;
  for (; tms < (seconds * 1000 + pre); tms += FR) {
    // servidor: entradas que chegaram
    while (toServer.length && toServer[0].at <= tms) {
      const d = toServer.shift().data, si = server.inputs[0];
      si.move.x = d.x; si.move.y = d.y;
      if (d.aim) { si.aim.x = d.aim.x; si.aim.y = d.aim.y; }
      if (d.press) si.presses.push(d.press);
    }
    { const a = tms / 700; server.inputs[1].move.x = Math.cos(a); server.inputs[1].move.y = Math.sin(a); }
    server.step(DT);
    if (++ticks % 3 === 0) { const s = JSON.parse(JSON.stringify(serialize(server, sctx))); const at = Math.max(lastC + 0.01, tms + lat(tms)); lastC = at; toClient.push({ at, data: s }); }
    // cliente: snapshots que chegaram
    while (toClient.length && toClient[0].at <= tms) sm.enqueue(toClient.shift().data, toClient[0] ? tms : tms, cw);
    // cliente: entrada desta quadro (após o pré-aquecimento)
    const t = Math.max(0, (tms - pre) / 1000);
    const dir = tms < pre ? { x: 0, y: 0 } : script(t, cw);
    cw.input.move.x = dir.x; cw.input.move.y = dir.y;
    if (dir.aim) { cw.input.aim.x = dir.aim.x; cw.input.aim.y = dir.aim.y; }
    const alpha = sm.pump(tms, cw, mirror.ctx);
    // Tecla: uma vez por rótulo (o roteiro devolve press enquanto a janela de tempo dura).
    let press = null;
    if (dir.press && !pressed.has(dir.key || dir.press)) { pressed.add(dir.key || dir.press); press = dir.press; sm.press(press, cw, tms, owd * 2); }
    const at = Math.max(lastS + 0.01, tms + lat(tms)); lastS = at; toServer.push({ at, data: { x: dir.x, y: dir.y, aim: dir.aim, press } });
    sm.lead(tms, FR / 1000, alpha, cw, false, owd * 2);
    for (const e of cw.drainEvents()) if (e.type === 'cast' && e.m === cw.active) casts.push({ t, ab: e.ab, local: !!e.local });
    const m = cw.active;
    if (m && tms >= pre) {
      const l = m.lead || { x: 0, y: 0 };
      const e = cw.fieldOf(1);
      frames.push({ t, x: m.px + (m.x - m.px) * alpha + l.x, y: m.py + (m.y - m.py) * alpha + l.y, sx: server.fieldOf(0).x, sy: server.fieldOf(0).y, dir, act: m.action?.ab.id, cd: { ...m.cd }, facing: m.facing,
        ex: e ? e.px + (e.x - e.px) * alpha : 0, ey: e ? e.py + (e.y - e.py) * alpha : 0 });
    }
  }
  return { frames, server, casts };
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

// Esquiva com ping alto: o desenho dispara no quadro do aperto e termina onde o servidor deixou.
test('Esquiva aparece na hora com ping 250 ms e termina no lugar do servidor', () => {
  const script = (t) => (t < 0.6 ? { x: 1, y: 0 } : t < 0.62 ? { x: 1, y: 0, press: 'dodge' } : t < 0.9 ? { x: 1, y: 0 } : { x: 0, y: 0 });
  const { frames, server } = run({ owd: 125, jitter: 30, script, seconds: 2.5 });
  const i0 = frames.findIndex((f) => f.t >= 0.6);
  const step = Math.hypot(frames[i0 + 2].x - frames[i0 + 1].x, frames[i0 + 2].y - frames[i0 + 1].y);
  assert(step > 4, `esquiva não respondeu na hora (passo de ${step.toFixed(1)} px por quadro)`);
  assert(frames[i0 + 1].act === 'sparkHop', 'pose da esquiva não apareceu na hora');
  const hop = server.fieldOf(0).cd.sparkHop;
  assert(hop > 0 && hop < 3.01, 'o servidor não fez a esquiva');
  const last = frames[frames.length - 1];
  const err = Math.hypot(last.x - last.sx, last.y - last.sy);
  assert(err < 3, `erro final em relação ao servidor: ${err.toFixed(1)} px`);
  let maxStep = 0;
  for (let i = 1; i < frames.length; i++) maxStep = Math.max(maxStep, Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y));
  assert(maxStep < 9, `salto visual de ${maxStep.toFixed(1)} px em um quadro`);
});

test('Salto do Mantifolha com ping 250 ms: sai na hora e cai no ponto do mouse', () => {
  const rosters = [['mantifolha', 'hidrocasco', 'brotossauro'], ROSTERS[1]];
  let target = null;
  const script = (t, cw) => {
    if (!target && cw.active) target = { x: cw.active.x + 90, y: cw.active.y + 20 };
    return t >= 0.5 && t < 0.52 ? { x: 0, y: 0, press: 'f', aim: target } : { x: 0, y: 0, aim: target || { x: 320, y: 180 } };
  };
  const { frames, server } = run({ owd: 125, jitter: 30, script, seconds: 2.2, rosters });
  const i0 = frames.findIndex((f) => f.t >= 0.5);
  assert(frames[i0 + 1].act === 'longLeap', 'salto não começou na hora');
  const me = server.fieldOf(0);
  const land = Math.hypot(me.x - target.x, me.y - target.y);
  assert(land < 6, `servidor caiu a ${land.toFixed(1)} px do mouse`);
  const last = frames[frames.length - 1];
  assert(Math.hypot(last.x - last.sx, last.y - last.sy) < 3, 'desenho não terminou no lugar do servidor');
  // Durante o voo o desenho está à frente do servidor (já saltando), não parado esperando a confirmação.
  const mid = frames.find((f) => f.t >= 0.5 + 0.22 + 0.2);
  const start = frames[i0];
  assert(Math.hypot(mid.x - start.x, mid.y - start.y) > 30, 'o desenho não saltou antes de o servidor confirmar');
});

test('Habilidade comum: recarga e som na hora, sem som repetido quando o servidor confirma', () => {
  const script = (t) => (t >= 0.5 && t < 0.52 ? { x: 0, y: 0, press: 'e', aim: { x: 400, y: 200 } } : { x: 0, y: 0, aim: { x: 400, y: 200 } });
  const { frames, casts, server } = run({ owd: 125, jitter: 30, script, seconds: 2 });
  const i0 = frames.findIndex((f) => f.t >= 0.5);
  assert(frames[i0 + 1].cd.ignition > 0, 'recarga não começou na hora');
  assert(server.fieldOf(0).cd.ignition > 0, 'servidor não lançou (a recarga não aparece)');
  const mc = casts.filter((c) => c.ab === 'ignition');
  assert(mc.length === 1 && mc[0].local, `esperava 1 som de lançamento local, veio ${JSON.stringify(mc)}`);
});

test('Olha para o mouse na hora (sem esperar o servidor)', () => {
  const script = (t) => ({ x: 0, y: 0, aim: t < 0.5 ? { x: 600, y: 180 } : { x: 10, y: 180 } });
  const { frames } = run({ owd: 125, jitter: 30, script, seconds: 1 });
  const f = frames.find((x) => x.t >= 0.52);
  assert(Math.cos(f.facing) < 0, 'ainda olhando para o lado antigo');
});

// O inimigo anda em círculo sem parar: no cliente ele não pode congelar nem dar saltos quando um snapshot atrasa.
for (const [name, cfg] of [['ping 120 ms (jitter 25)', { owd: 60, jitter: 25 }], ['ping 250 ms (jitter 60)', { owd: 125, jitter: 60 }], ['ping 80 ms com travadas de 200 ms', { owd: 40, jitter: 8, spikes: 200 }]]) {
  test(`Outros monstros andam sem engasgar — ${name}`, () => {
    const { frames } = run({ ...cfg, script: () => ({ x: 0, y: 0 }), seconds: 5, seed: 3 });
    let frozen = 0, maxStep = 0;
    for (let i = 1; i < frames.length; i++) {
      const d = Math.hypot(frames[i].ex - frames[i - 1].ex, frames[i].ey - frames[i - 1].ey);
      if (d < 0.05) frozen++;
      maxStep = Math.max(maxStep, d);
    }
    const per = 80 / 60; // velocidade ~ 80 px/s
    console.log(`      inimigo (${name}): ${frozen} quadros congelados de ${frames.length}, maior salto ${maxStep.toFixed(1)} px`);
    assert(frozen <= frames.length * 0.03, `inimigo congelou em ${frozen} quadros`);
    assert(maxStep < per * 3.5, `inimigo saltou ${maxStep.toFixed(1)} px em um quadro`);
  });
}

let failed = 0;
console.log('\nSuavização de rede (simulação com latência e jitter)\n');
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) failed++; }
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
