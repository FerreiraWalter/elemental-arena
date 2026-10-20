// Auditoria de colisão e alcance das arenas (4 jogadores).
// node test/collision.mjs
import { World } from '../src/sim/world.js';
import { DT, WORLD_W, WORLD_H, TILE, COLS, ROWS } from '../src/config.js';
import { ARENA_ORDER } from '../src/arenas/index.js';
import { PathGrid } from '../src/ai/path.js';
import { SPECIES } from '../src/sim/species.js';

const results = [];
const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const BODIES = ['gotapus', 'brasalisco', 'brotossauroAncestral', 'hidrocascoAbissal'];
const ffa = (arena, key = 'brasalisco', seed = 3) => World.match(seed, [0, 1, 2, 3].map(() => [key, 'brasalisco', 'hidrocasco']), null, arena, 'normal', { sides: [0, 1, 2, 3] });

for (const arena of ARENA_ORDER) {
  test(`${arena}: 4 pontos de nascimento livres, separados e todos se alcançam (corpos de todos os tamanhos)`, () => {
    for (const key of BODIES) {
      const w = ffa(arena, key);
      const ms = [0, 1, 2, 3].map((s) => w.fieldOf(s));
      for (const m of ms) {
        assert(w.standable(m, m.x, m.y) && !w.blocked(m.x, m.y, m.r), `${arena}/${key}: nascimento inválido`);
        assert(m.x > 24 && m.y > 24 && m.x < WORLD_W - 24 && m.y < WORLD_H - 24, `${arena}/${key}: nascimento na borda`);
      }
      const grid = new PathGrid(w);
      const swim = ms[0].element === 'water';
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
        assert(Math.hypot(ms[a].x - ms[b].x, ms[a].y - ms[b].y) > 200, `${arena}/${key}: nascimentos ${a}-${b} muito próximos`);
        assert(grid.walkable(ms[a].x, ms[a].y, ms[b].x, ms[b].y, swim, false) || grid.find(ms[a].x, ms[a].y, ms[b].x, ms[b].y, swim, 1e9, 0), `${arena}/${key}: ${a} não alcança ${b}`);
      }
    }
  });

  test(`${arena}: sem bolsões — tudo que o corpo pode pisar está ligado ao conjunto principal`, () => {
    // Flood-fill em grade de 8 px com o maior corpo terrestre; células de pé fora do componente que contém os nascimentos = bolsão.
    const w = ffa(arena, 'brotossauroAncestral');
    const m = w.fieldOf(0);
    const ok = (c, r, lvl) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !w.blocked(c * TILE + 4, r * TILE + 4, m.r) &&
      w.standable({ r: m.r, element: 'earth', level: lvl }, c * TILE + 4, r * TILE + 4);
    const seen = new Uint8Array(COLS * ROWS), stack = [];
    for (let s = 0; s < 4; s++) { const f = w.fieldOf(s); stack.push([f.x / TILE | 0, f.y / TILE | 0]); }
    while (stack.length) {
      const [c, r] = stack.pop();
      const k = r * COLS + c; if (seen[k]) continue;
      const lvl = w.terrain.height[k];
      if (!ok(c, r, lvl)) continue;
      seen[k] = 1;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (Math.abs(w.terrain.height[nr * COLS + nc] - lvl) <= 0.55) stack.push([nc, nr]);
      }
    }
    let good = 0, pocket = 0;
    for (let r = 4; r < ROWS - 4; r++) for (let c = 4; c < COLS - 4; c++) {
      const k = r * COLS + c;
      if (seen[k]) { good++; continue; }
      if (ok(c, r, w.terrain.height[k])) pocket++;
    }
    assert(good > 4000, `${arena}: área principal pequena (${good} células)`);
    assert(pocket / (good + pocket) < 0.01, `${arena}: ${pocket} células transitáveis isoladas (bolsões)`);
  });

  test(`${arena}: nocaute em alta velocidade nunca tira o corpo do mundo nem o deixa preso em sólido`, () => {
    for (const s of [0, 1, 2, 3]) for (let k = 0; k < 8; k++) {
      const w = ffa(arena, 'gotapus');
      const m = w.fieldOf(s);
      const a = k * Math.PI / 4;
      m.kx = Math.cos(a) * 4000; m.ky = Math.sin(a) * 4000;
      for (let t = 0; t < 120; t++) { w.step(DT); w.drainEvents(); }
      assert(Number.isFinite(m.x) && m.x >= 0 && m.y >= 0 && m.x <= WORLD_W && m.y <= WORLD_H, `${arena}: corpo saiu do mundo (slot ${s}, ang ${k})`);
      assert(!w.blocked(m.x, m.y, m.r * 0.5), `${arena}: corpo terminou dentro de um sólido (slot ${s}, ang ${k}) em ${m.x | 0},${m.y | 0}`);
      assert(w.standable(m, m.x, m.y) || m.status.drown > 0 || !m.alive, `${arena}: corpo terminou em posição inválida (slot ${s}, ang ${k}) em ${m.x | 0},${m.y | 0}`);
    }
  });

  test(`${arena}: projéteis são barrados por árvores, rochas, pilares, estátuas, faróis e muros`, () => {
    const w = ffa(arena, 'brasalisco');
    const owner = w.fieldOf(0);
    let n = 0;
    const solids = w.obstacles.filter((o) => o.solid && !o.sentry && ['tree', 'rock', 'pillar', 'lighthouse', 'statue'].includes(o.kind));
    for (const o of solids) {
      w.projectiles.length = 0;
      for (const mm of w.monsters) if (mm !== owner) mm.onField = false;
      const sx = o.x - (o.r + 34), sy = o.y;
      if (w.blocked(sx, sy, 2)) continue; // ponto de partida dentro de outro sólido
      const p = w.spawnProjectile({ kind: 'seed', owner, ang: 0, speed: 240, r: 3, range: 200, dmg: 1, x: sx, y: sy });
      const pr = p || w.projectiles[w.projectiles.length - 1];
      for (let t = 0; t < 120 && !pr.dead; t++) w.updateProjectiles(DT);
      assert(pr.x < o.x + o.r * 0.6, `${arena}: projétil atravessou ${o.kind} em ${o.x | 0},${o.y | 0}`);
      n++;
    }
    assert(n >= 4 && n >= solids.length * 0.5, `${arena}: poucos sólidos verificados (${n})`);
  });
}

let failed = 0;
console.log('\nAuditoria de colisão e alcance das arenas\n');
for (const r of results) { console.log(`${r.ok ? '[OK] ' : '[FALHOU]'} ${r.name}${r.ok ? '' : '\n       ' + r.err}`); if (!r.ok) failed++; }
console.log(failed ? `\n${failed} cenário(s) falharam.` : '\nTodos os cenários passaram.');
process.exit(failed ? 1 : 0);
