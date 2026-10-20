// Benchmark de renderização no navegador (cole no console ou carregue via import): mesma partida (seed fixa),
// mesma sequência de quadros, para comparar antes/depois. Retorna ms por quadro (média, p95, máx) e por etapa.
export async function renderBench({ arena = 'jardim', seed = 7, warm = 45, frames = 600, ffa = false } = {}) {
  const { World } = await import('../sim/world.js');
  const { Renderer } = await import('../render/renderer.js');
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 720;
  const r = new Renderer(cv);
  await r.loadArt();
  const rosters = [['brasalisco', 'ouriflama', 'mantifolha'], ['brotossauro', 'gotapus', 'hidrocasco']];
  if (ffa) rosters.push(['pugilar', 'hidrocasco', 'brasalisco'], ['mantifolha', 'ouriflama', 'gotapus']);
  const w = World.match(seed, rosters, null, arena, 'normal', ffa ? { sides: [0, 1, 2, 3] } : {});
  for (let i = 0; i < warm * 60; i++) w.step(1 / 60);
  r.reset(w);
  const ui = { dpr: 1, speed: 1, paused: false, started: true };
  for (let i = 0; i < 60; i++) { w.step(1 / 60); r.render(w, 1, 1 / 60, ui); }
  const ft = [], sim = [];
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now(); w.step(1 / 60); const t1 = performance.now();
    r.render(w, 1, 1 / 60, ui);
    ft.push(performance.now() - t1); sim.push(t1 - t0);
  }
  const st = (v) => { const s = [...v].sort((a, b) => a - b); return { avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(1) }; };
  return { arena, ffa, render: st(ft), sim: st(sim), burning: w.terrain.burning.size, particles: r.particles.list?.length ?? null };
}
