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

  passable(i, swimmer) {
    if (i < 0 || this.blockedObs[i]) return false;
    const tr = this.w.terrain;
    const bad = (j) => { const p = props(tr.type[j]); return p.solid || (p.deep && !swimmer); };
    if (bad(i)) return false;
    // Folga de 1 tile de paredes e água funda (o corpo do monstro é maior que um tile).
    const c = i % COLS, r = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = tr.idx(c + dx, r + dy); if (j >= 0 && bad(j)) return false; }
    return true;
  }

  // Caminho (lista de pontos no centro dos tiles) de (x0,y0) até (x1,y1); null se não houver.
  find(x0, y0, x1, y1, swimmer, maxNodes = 2600) {
    this.refresh();
    const tr = this.w.terrain;
    const start = tr.at(x0, y0), goal0 = tr.at(x1, y1);
    if (start < 0 || goal0 < 0) return null;
    // Se o destino não é passável (ex.: inimigo nadando), mira o tile passável mais próximo dele.
    let goal = goal0;
    if (!this.passable(goal, swimmer)) {
      let best = -1, bd = Infinity;
      const gc = goal0 % COLS, gr = (goal0 / COLS) | 0;
      for (let r = gr - 6; r <= gr + 6; r++) for (let c = gc - 6; c <= gc + 6; c++) {
        const j = tr.idx(c, r);
        if (j < 0 || !this.passable(j, swimmer)) continue;
        const d = Math.hypot(c - gc, r - gr);
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) return null;
      goal = best;
    }
    const gc = goal % COLS, gr = (goal / COLS) | 0;
    const g = new Map([[start, 0]]);
    const came = new Map();
    const open = [[Math.hypot((start % COLS) - gc, ((start / COLS) | 0) - gr), start]];
    const closed = new Set();
    let found = false, n = 0;
    while (open.length && n++ < maxNodes) {
      // fila de prioridade simples (a grade é pequena: 80×45)
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) { found = true; break; }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cc = cur % COLS, cr = (cur / COLS) | 0;
      for (const [dx, dy, cost] of N8) {
        const j = tr.idx(cc + dx, cr + dy);
        if (j < 0 || closed.has(j) || (!this.passable(j, swimmer) && j !== start)) continue;
        if (Math.abs(tr.height[j] - tr.height[cur]) > 0.55) continue;
        if (dx && dy && (!this.passable(tr.idx(cc + dx, cr), swimmer) || !this.passable(tr.idx(cc, cr + dy), swimmer))) continue;
        const step = cost * (1 + (props(tr.type[j]).water && !swimmer ? 0.8 : 0) + (tr.fire[j] > 0 ? 3 : 0));
        const ng = g.get(cur) + step;
        if (ng < (g.get(j) ?? Infinity)) {
          g.set(j, ng);
          came.set(j, cur);
          open.push([ng + Math.hypot(cc + dx - gc, cr + dy - gr), j]);
        }
      }
    }
    if (!found) return null;
    const out = [];
    for (let c = goal; c !== undefined && c !== start; c = came.get(c)) out.push({ x: tr.cx(c), y: tr.cy(c) });
    return out.reverse();
  }

  // Linha reta caminhável? (para pular o A* quando não há nada no caminho)
  walkable(x0, y0, x1, y1, swimmer) {
    this.refresh();
    const tr = this.w.terrain;
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 6));
    let prev = tr.at(x0, y0);
    for (let k = 1; k <= n; k++) {
      const i = tr.at(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
      if (i < 0 || !this.passable(i, swimmer)) return false;
      if (prev >= 0 && Math.abs(tr.height[i] - tr.height[prev]) > 0.55) return false;
      prev = i;
    }
    return true;
  }
}
