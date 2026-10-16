// Geometria, nascimento, colisão e navegação de todas as arenas.
// node test/maps.mjs
import { World } from '../src/sim/world.js';
import { DT, WORLD_W, WORLD_H, TILE, COLS, ROWS } from '../src/config.js';
import { ARENA_ORDER } from '../src/arenas/index.js';
import { SPECIES } from '../src/sim/species.js';
import { PathGrid } from '../src/ai/path.js';
import { props, T } from '../src/sim/tiles.js';
import { navRun } from '../tools/navtest.mjs';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

// Corpos de todos os tamanhos e estilos (menor, médio, o maior terrestre, o maior aquático, nadadores).
const BODIES = ['gotapus', 'brasalisco', 'brotossauroAncestral', 'hidrocascoAbissal', 'leviapus', 'silvamante'];

for (const arena of ARENA_ORDER) {
  test(`${arena}: dimensões e pontos de nascimento (1v1 e 2v2) válidos para todos os tamanhos de monstro`, () => {
    assert(WORLD_W === 704 && WORLD_H === 400, 'dimensões inesperadas');
    for (const mode of ['1v1', '2v2']) for (const key of BODIES) {
      const sides = mode === '1v1' ? [0, 1] : [0, 0, 1, 1];
      const w = World.match(3, sides.map(() => [key, 'brasalisco', 'hidrocasco']), null, arena, 'normal', { sides });
      for (let slot = 0; slot < sides.length; slot++) {
        const m = w.fieldOf(slot);
        const i = w.terrain.at(m.x, m.y);
        const p = props(w.terrain.type[i]);
        assert(i >= 0 && !p.solid, `${arena}/${mode}/${key}: nasceu em tile sólido`);
        assert(!(p.deep && m.element !== 'water'), `${arena}/${mode}/${key}: nasceu na água funda`);
        assert(!w.blocked(m.x, m.y, m.r), `${arena}/${mode}/${key}: nasceu dentro de um sólido`);
        assert(w.standable(m, m.x, m.y), `${arena}/${mode}/${key}: posição de nascimento não suporta o corpo`);
        const at = w.spawnFor(slot);
        assert(Math.hypot(at.x - m.x, at.y - m.y) < 70, `${arena}/${mode}/${key}: foi empurrado para longe do ponto de nascimento (${Math.hypot(at.x - m.x, at.y - m.y).toFixed(0)} px)`);
      }
    }
  });

  test(`${arena}: pontos de nascimento equilibrados (simetria rotacional, mesma distância ao centro)`, () => {
    const w = World.match(3, undefined, null, arena);
    const [a, b] = w.spawns;
    assert(Math.abs(a.x + b.x - WORLD_W) < 1 && Math.abs(a.y + b.y - WORLD_H) < 1, `${arena}: spawns não são espelhados`);
    const sym = (x, y) => w.terrain.type[w.terrain.at(WORLD_W - x, WORLD_H - y)];
    let bad = 0, n = 0;
    for (let r = 4; r < ROWS - 4; r += 2) for (let c = 4; c < COLS - 4; c += 2) {
      n++;
      const i = r * COLS + c;
      if (props(w.terrain.type[i]).deep !== props(sym(c * TILE + 4, r * TILE + 4)).deep) bad++;
    }
    assert(bad / n < 0.03, `${arena}: água funda assimétrica em ${(bad / n * 100).toFixed(1)}% da arena`);
    const obs = w.obstacles.filter((o) => !o.sentry);
    for (const o of obs) {
      if (Math.hypot(o.x - WORLD_W / 2, o.y - WORLD_H / 2) < 2) continue; // objeto no centro é simétrico a si mesmo
      const mate = obs.find((p) => p !== o && p.kind === o.kind && Math.hypot(p.x - (WORLD_W - o.x), p.y - (WORLD_H - o.y)) < 2);
      assert(mate, `${arena}: ${o.kind} em ${o.x | 0},${o.y | 0} sem par simétrico`);
    }
  });

  test(`${arena}: os dois lados se alcançam por caminhos válidos para todos os tamanhos (e as rotas alternativas existem)`, () => {
    for (const key of BODIES) {
      const w = World.match(3, [[key], [key]], null, arena);
      const swim = SPECIES[key].element === 'water';
      const grid = new PathGrid(w);
      const [a, b] = w.spawns;
      const p = grid.find(a.x, a.y, b.x, b.y, swim, 1e9, swim ? 0 : 0.2);
      assert(p && p.length, `${arena}/${key}: sem caminho entre os nascimentos`);
      // Rota alternativa: bloqueando o trajeto do meio, ainda há outro caminho (flanquear).
      const mid = p[p.length >> 1];
      grid.refresh();
      const hole = new Set();
      for (let r = -4; r <= 4; r++) for (let c = -4; c <= 4; c++) { const j = w.terrain.at(mid.x + c * TILE, mid.y + r * TILE); if (j >= 0) hole.add(j); }
      const orig = grid.passable.bind(grid);
      grid.passable = (i, s) => !hole.has(i) && orig(i, s);
      const alt = grid.find(a.x, a.y, b.x, b.y, swim, 1e9, 0);
      assert(alt && alt.length, `${arena}/${key}: sem rota alternativa quando o meio está bloqueado`);
    }
  });

  test(`${arena}: o chão é decifrável — transitáveis nunca bloqueiam; sólidos bloqueiam; hitbox = desenho`, () => {
    const w = World.match(3, [['brasalisco'], ['brasalisco']], null, arena);
    const m = w.fieldOf(0);
    // Tiles transitáveis (grama, mato, musgo, folhas, mata baixa, canteiro, espinheiro, terra, areia, ponte, pedra) permitem ficar em pé.
    const free = new Set([T.SAND, T.GRASS, T.WEEDS, T.MOSS, T.LEAVES, T.UNDERGROWTH, T.FLOWERS, T.THORNS, T.DIRT, T.BRIDGE, T.STONE, T.WATER]);
    let checked = 0;
    for (let i = 0; i < w.terrain.type.length; i++) {
      if (!free.has(w.terrain.type[i])) continue;
      const x = w.terrain.cx(i), y = w.terrain.cy(i);
      if (x < 24 || y < 24 || x > WORLD_W - 24 || y > WORLD_H - 24) continue;
      const ring = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].every(([dx, dy]) => free.has(w.terrain.type[w.terrain.at(x + dx * TILE, y + dy * TILE)] ?? -1));
      const near = !ring || w.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 14) || w.walls.some((wl) => x > wl.x - 16 && x < wl.x + wl.w + 16 && y > wl.y - 16 && y < wl.y + wl.h + 16);
      if (near || w.terrain.height[i] !== w.terrain.heightAt(x, y)) continue;
      m.x = x; m.y = y; m.level = w.terrain.height[i];
      assert(w.standable(m, x, y), `${arena}: tile transitável (${props(w.terrain.type[i]).name}) em ${x},${y} bloqueia o corpo`);
      checked++;
    }
    assert(checked > 500, `${arena}: poucos tiles verificados (${checked})`);
    // Obstáculos sólidos e muros expulsam o corpo que entra neles (hitbox do tamanho do desenho).
    for (const o of w.obstacles) {
      if (!o.solid) continue;
      m.x = o.x + 1; m.y = o.y; m.vx = m.vy = m.kx = m.ky = 0;
      w.collideStatic(m);
      assert(Math.hypot(m.x - o.x, m.y - o.y) >= o.r + m.r - 0.5, `${arena}: ${o.kind} em ${o.x | 0},${o.y | 0} deixou o corpo entrar`);
      assert(w.blocked(o.x, o.y, 1), `${arena}: ${o.kind} não aparece como bloqueado`);
    }
    for (const wl of w.walls) {
      m.x = wl.x + wl.w / 2; m.y = wl.y < WORLD_H / 2 ? wl.y + wl.h + 2 : wl.y - 2; // encostado na face voltada para a arena
      w.collideStatic(m);
      assert(w.blocked(wl.x + 1, wl.y + 1, 1) && !(m.x > wl.x && m.x < wl.x + wl.w && m.y > wl.y && m.y < wl.y + wl.h), `${arena}: muro em ${wl.x},${wl.y} deixou o corpo entrar`);
    }
    // Destrutíveis desaparecem do bloqueio quando destruídos; permanentes nunca (o desenho avisa com anéis diferentes).
    for (const o of w.obstacles) assert(o.hp === Infinity ? !o.flammable : o.flammable || o.sentry || o.kind === 'thicket', `${arena}: ${o.kind} com regra de destruição incoerente`);
  });

  test(`${arena}: obstáculos não bloqueiam passagens e nada nasce preso (largura mínima de corredor)`, () => {
    const w = World.match(3, [['brotossauroAncestral'], ['brotossauroAncestral']], null, arena);
    const grid = new PathGrid(w);
    grid.refresh();
    // Fração do chão acessível ao maior monstro (a partir do nascimento) — nada de bolsões inúteis.
    const swim = false;
    const s = w.terrain.at(w.spawns[0].x, w.spawns[0].y);
    const seen = new Uint8Array(COLS * ROWS), q = [s];
    seen[s] = 1;
    let n = 0;
    while (q.length) {
      const i = q.pop(); n++;
      const c = i % COLS, r = (i / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = w.terrain.idx(c + dx, r + dy);
        if (j < 0 || seen[j] || !grid.passable(j, swim) || Math.abs(w.terrain.height[j] - w.terrain.height[i]) > 0.55) continue;
        seen[j] = 1; q.push(j);
      }
    }
    let land = 0;
    for (let i = 0; i < seen.length; i++) if (grid.passable(i, swim)) land++;
    assert(n / land > 0.97, `${arena}: ${((1 - n / land) * 100).toFixed(1)}% do chão transitável é inalcançável pelo maior monstro`);
    assert(n > 1500, `${arena}: área alcançável pequena demais (${n} tiles)`);
  });

  test(`${arena}: trajetos aleatórios de todos os corpos chegam ao destino (≥ 98%) e nenhum fica preso`, () => {
    let total = 0, fail = 0;
    for (const key of BODIES) {
      const r = navRun(arena, key, 25, 11);
      total += r.trials - r.unreachable; fail += r.fail.length;
    }
    assert(total > 100, `${arena}: poucos trajetos válidos (${total})`);
    assert(fail / total <= 0.02, `${arena}: ${fail}/${total} trajetos falharam`);
  });

  test(`${arena}: partida IA × IA em 1v1 e 2v2 termina com combate, sem monstro parado preso`, () => {
    for (const sides of [[0, 1], [0, 0, 1, 1]]) {
      const keys = ['hidrocasco', 'brotossauro', 'ouriflama', 'gotapus'];
      const w = World.match(5, sides.map((_, i) => [keys[i], 'brasalisco', 'mantifolha']), null, arena, 'normal', { sides });
      const hist = new Map();
      let hits = 0, worst = 0;
      while (!w.over && w.time < 150) {
        w.step(DT);
        for (const e of w.drainEvents()) if (e.type === 'hit' && !e.dot) hits++;
        if (w.tick % 30) continue;
        for (const m of w.monsters) {
          if (!m.alive || !m.onField || m.switchState) continue;
          const h = hist.get(m.id) || { x: m.x, y: m.y, t: w.time };
          const free = !m.action && !(m.status.stun > 0) && !(m.status.root > 0) && m.move.throttle > 0.5;
          if (Math.hypot(m.x - h.x, m.y - h.y) > 10 || !free) { h.x = m.x; h.y = m.y; h.t = w.time; }
          worst = Math.max(worst, w.time - h.t);
          hist.set(m.id, h);
        }
      }
      assert(hits > 15, `${arena}/${sides.length}: quase sem combate (${hits} golpes)`);
      assert(worst < 7, `${arena}/${sides.length}: monstro parado querendo andar por ${worst.toFixed(1)} s`);
    }
  });
}

test('Faixa de borda: a grade de navegação nunca traça rotas onde o corpo é barrado', () => {
  const w = World.match(3, undefined, null, 'quadra');
  const grid = new PathGrid(w);
  const maxR = Math.max(...Object.values(SPECIES).map((s) => s.radius));
  assert(PathGrid.EDGE * TILE >= maxR + 4, 'faixa de borda menor que o maior corpo + margem');
  for (const i of [0, 1, COLS * 2 + 5, COLS * ROWS - 1]) assert(!grid.passable(i, false), 'tile de borda marcado como passável');
});

test('Mapas ampliados com moderação: arena útil maior, sem alterar a escala dos monstros', () => {
  assert(WORLD_W * WORLD_H >= 640 * 360 * 1.19 && WORLD_W * WORLD_H <= 640 * 360 * 1.3, 'área fora do aumento moderado');
});

let failed = 0;
console.log('\nGeometria, nascimento, colisão e navegação das arenas\n');
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) failed++; }
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
