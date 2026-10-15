// Build de produção: o jogo é estático (ES modules, sem bundler). Este script valida e copia para dist/.
// Verifica: sintaxe de todos os módulos, imports relativos resolvidos, assets usados presentes,
// e que a simulação carrega e roda uma partida em cada arena.
import { readdirSync, readFileSync, statSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } };
walk(join(root, 'src'));
walk(join(root, 'server'));
let errors = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f]); } catch (e) { errors++; console.error('sintaxe:', relative(root, f)); }
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
    if (!existsSync(resolve(dirname(f), m[1]))) { errors++; console.error('import quebrado:', relative(root, f), '->', m[1]); }
  }
}
const { ART_NAMES } = { ART_NAMES: readFileSync(join(root, 'src/render/renderer.js'), 'utf8').match(/ART_NAMES = \[([^\]]+)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, '')) };
for (const n of ART_NAMES) if (!existsSync(join(root, 'assets/monsters', n + '.png'))) { errors++; console.error('asset ausente:', n); }
const { World } = await import('../src/sim/world.js');
const { ARENA_ORDER } = await import('../src/arenas/index.js');
for (const id of ARENA_ORDER) {
  const w = World.match(1, undefined, 0, id);
  for (let k = 0; k < 600; k++) w.step(1 / 60);
}
if (errors) { console.error(`\n${errors} erro(s); build abortado.`); process.exit(1); }
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
cpSync(join(root, 'index.html'), join(dist, 'index.html'));
cpSync(join(root, 'src'), join(dist, 'src'), { recursive: true });
cpSync(join(root, 'server'), join(dist, 'server'), { recursive: true });
for (const f of ['package.json', 'package-lock.json', 'Dockerfile', 'DEPLOY.md', 'render.yaml']) if (existsSync(join(root, f))) cpSync(join(root, f), join(dist, f));
mkdirSync(join(dist, 'assets'));
cpSync(join(root, 'assets/monsters'), join(dist, 'assets/monsters'), { recursive: true, filter: (p) => !p.endsWith('preview.png') });
console.log(`Build ok: ${files.length} módulos verificados (cliente + servidor), ${ART_NAMES.length} sprites, ${ARENA_ORDER.length} arenas simuladas → dist/`);
