import { TILE, COLS, ROWS } from '../config.js';
import { props } from '../sim/tiles.js';

// Pathfinding A* na grade de tiles, com as mesmas regras de passagem do movimento:
// tiles sólidos, água funda (só nadadores), degraus de altura (no máximo meio nível) e obstáculos.
const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]];

export class PathGrid {
  constructor(w) {
    this.w = w;
    this.version = -1;
    this.blockedObs = new Uint8Array(COLS * ROWS);
  }

  // Marca tiles ocupados por obstáculos sólidos (refeito quando algo é criado ou destruído).
  refresh() {
    const w = this.w;
    if (this.version === w.obstacleVersion) return;
    this.version = w.obstacleVersion;
    this.blockedObs.fill(0);
    for (const o of w.obstacles) {
      if (o.destroyed || !o.solid) continue;
      const R = o.r + 5;
      for (let r = Math.floor((o.y - R) / TILE); r <= Math.floor((o.y + R) / TILE); r++)
        for (let c = Math.floor((o.x - R) / TILE); c <= Math.floor((o.x + R) / TILE); c++) {
          if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
          if (Math.hypot(c * TILE + 4 - o.x, r * TILE + 4 - o.y) <= R) this.blockedObs[r * COLS + c] = 1;
        }
    }
    for (const wl of w.walls) {
      for (let r = Math.floor((wl.y - 6) / TILE); r <= Math.floor((wl.y + wl.h + 6) / TILE); r++)
        for (let c = Math.floor((wl.x - 6) / TILE); c <= Math.floor((wl.x + wl.w + 6) / TILE); c++)
          if (c >= 0 && r >= 0 && c < COLS && r < ROWS) this.blockedObs[r * COLS + c] = 1;
    }
  }

  // Faixa de borda: o corpo real é barrado a r+4 px do limite (world.blocked), então a grade não traça rotas por ali.
  static EDGE = 3;

  passable(i, swimmer) {
    if (i < 0 || this.blockedObs[i]) return false;
    const ec = i % COLS, er = (i / COLS) | 0, E = PathGrid.EDGE;
    if (ec < E || er < E || ec >= COLS - E || er >= ROWS - E) return false;
    const tr = this.w.terrain;
    const bad = (j) => { const p = props(tr.type[j]); return p.solid || (p.deep && !swimmer); };
    if (bad(i)) return false;
    // Folga de 1 tile de paredes e água funda (o corpo do monstro é maior que um tile).
    const c = i % COLS, r = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = tr.idx(c + dx, r + dy); if (j >= 0 && bad(j)) return false; }
    return true;
  }

  // Caminho (lista de pontos no centro dos tiles) de (x0,y0) até (x1,y1); null se não houver.
  // Desempenho (servidor com várias lutas de IA ao mesmo tempo, ver server/match.js): fila de prioridade em heap
  // binário (antes: varredura da lista inteira a cada passo, quadrático), passagem de cada tile calculada uma vez por
  // busca e custos/origens em arrays tipados reaproveitados (antes: Map/Set novos a cada chamada).
  find(x0, y0, x1, y1, swimmer, maxNodes = 2600, waterCost = 0) {
    this.refresh();
    const tr = this.w.terrain;
    const start = tr.at(x0, y0), goal0 = tr.at(x1, y1);
    if (start < 0 || goal0 < 0) return null;
    const N = COLS * ROWS;
    if (!this.gBuf) { this.gBuf = new Float64Array(N); this.came = new Int32Array(N); this.seen = new Uint32Array(N); this.done = new Uint32Array(N); this.pass = new Int8Array(N); this.passGen = new Uint32Array(N); this.gen = 0; this.heap = []; }
    const gen = ++this.gen;
    const gB = this.gBuf, came = this.came, seen = this.seen, done = this.done, pass = this.pass, passGen = this.passGen;
    const ok = (j) => { if (j < 0) return false; if (passGen[j] !== gen) { passGen[j] = gen; pass[j] = this.passable(j, swimmer) ? 1 : 0; } return pass[j] === 1; };
    // Se o destino não é passável (ex.: inimigo nadando), mira o tile passável mais próximo dele.
    let goal = goal0;
    if (!ok(goal)) {
      let best = -1, bd = Infinity;
      const gc = goal0 % COLS, gr = (goal0 / COLS) | 0;
      for (let r = gr - 6; r <= gr + 6; r++) for (let c = gc - 6; c <= gc + 6; c++) {
        const j = tr.idx(c, r);
        if (j < 0 || !ok(j)) continue;
        const d = Math.hypot(c - gc, r - gr);
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) return null;
      goal = best;
    }
    const gc = goal % COLS, gr = (goal / COLS) | 0;
    // Heap de pares [f, tile] (menor f no topo).
    const heap = this.heap; heap.length = 0;
    const push = (f, j) => { heap.push([f, j]); let i = heap.length - 1; while (i > 0) { const pi = (i - 1) >> 1; if (heap[pi][0] <= heap[i][0]) break; [heap[pi], heap[i]] = [heap[i], heap[pi]]; i = pi; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    seen[start] = gen; gB[start] = 0; came[start] = -1;
    push(Math.hypot((start % COLS) - gc, ((start / COLS) | 0) - gr), start);
    let found = false, n = 0;
    while (heap.length && n++ < maxNodes) {
      const cur = pop()[1];
      if (cur === goal) { found = true; break; }
      if (done[cur] === gen) continue;
      done[cur] = gen;
      const cc = cur % COLS, cr = (cur / COLS) | 0, gCur = gB[cur];
      for (const [dx, dy, cost] of N8) {
        const j = tr.idx(cc + dx, cr + dy);
        if (j < 0 || done[j] === gen || (!ok(j) && j !== start)) continue;
        if (Math.abs(tr.height[j] - tr.height[cur]) > 0.55) continue;
        if (dx && dy && (!ok(tr.idx(cc + dx, cr)) || !ok(tr.idx(cc, cr + dy)))) continue;
        // Quem evita água (a direção da IA recusa tiles aquáticos) contorna por pontes em vez de planejar pela água.
        const step = cost * (1 + (props(tr.type[j]).water && !swimmer ? 0.8 + Math.max(0, waterCost) * 6 : 0) + (tr.fire[j] > 0 ? 3 : 0));
        const ng = gCur + step;
        if (seen[j] !== gen || ng < gB[j]) {
          seen[j] = gen; gB[j] = ng; came[j] = cur;
          push(ng + Math.hypot(cc + dx - gc, cr + dy - gr), j);
        }
      }
    }
    if (!found) return null;
    const out = [];
    for (let c = goal; c >= 0 && c !== start; c = came[c]) out.push({ x: tr.cx(c), y: tr.cy(c) });
    return out.reverse();
  }

  // Linha reta caminhável? (para pular o A* quando não há nada no caminho)
  walkable(x0, y0, x1, y1, swimmer, avoidWater = false) {
    this.refresh();
    const tr = this.w.terrain;
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 6));
    let prev = tr.at(x0, y0);
    for (let k = 1; k <= n; k++) {
      const i = tr.at(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
      if (i < 0 || !this.passable(i, swimmer)) return false;
      if (avoidWater && !swimmer && props(tr.type[i]).water) return false;
      if (prev >= 0 && Math.abs(tr.height[i] - tr.height[prev]) > 0.55) return false;
      prev = i;
    }
    return true;
  }
}
