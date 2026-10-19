// Rasterizador de pixel art: desenha formas sombreadas pixel a pixel (sem anti-aliasing),
// com rampa de cores, pontilhado ordenado e contorno — base de todos os sprites procedurais.

// Cor empacotada (ABGR). É chamada pixel a pixel em muitos desenhos: guarda as já convertidas (sem reinterpretar o texto).
const RGBA_CACHE = new Map();
export function rgba(hex, a = 255) {
  let row = RGBA_CACHE.get(hex);
  if (!row) { row = new Array(256); RGBA_CACHE.set(hex, row); }
  a &= 255;
  let v = row[a];
  if (v === undefined) {
    const n = parseInt(hex.slice(1), 16);
    v = row[a] = (a << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
  }
  return v;
}
export const ramp = (...hexes) => hexes.map((h) => rgba(h));

const BAYER = [0, 0.5, 0.75, 0.25];
const LX = -0.5, LY = -0.62, LZ = 0.6;
const LL = Math.hypot(LX, LY, LZ);

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export class PixelBuf {
  // track: camadas de efeitos que são limpas e redesenhadas a cada quadro. Guardam a região desenhada e só
  // limpam/enviam essa região (antes: a tela inteira duas vezes por quadro, mesmo quase vazia).
  constructor(w, h, track = false) {
    this.w = w; this.h = h;
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.px = new Uint32Array(this.img.data.buffer);
    this.track = track;
    this.x0 = w; this.y0 = h; this.x1 = -1; this.y1 = -1; // região desenhada neste quadro
    this.cx0 = w; this.cy0 = h; this.cx1 = -1; this.cy1 = -1; // região limpa (precisa ir para a tela também)
  }
  clear() {
    if (!this.track) { this.px.fill(0); return; }
    if (this.x1 < 0) return;
    for (let y = this.y0; y <= this.y1; y++) this.px.fill(0, y * this.w + this.x0, y * this.w + this.x1 + 1);
    this.cx0 = Math.min(this.cx0, this.x0); this.cy0 = Math.min(this.cy0, this.y0);
    this.cx1 = Math.max(this.cx1, this.x1); this.cy1 = Math.max(this.cy1, this.y1);
    this.x0 = this.w; this.y0 = this.h; this.x1 = -1; this.y1 = -1;
  }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
    if (this.track) {
      if (x < this.x0) this.x0 = x;
      if (x > this.x1) this.x1 = x;
      if (y < this.y0) this.y0 = y;
      if (y > this.y1) this.y1 = y;
    }
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }

  // Elipse sombreada. r = rampa (escuro → claro). edge: borda interna mais escura (separa partes).
  ellipse(cx, cy, rx, ry, r, { edge = true, flat = false, shift = 0 } = {}) {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    const inside = (x, y) => {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      return nx * nx + ny * ny <= 1;
    };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      let idx;
      if (edge && (!inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1))) idx = 0;
      else if (flat) idx = r.length - 2;
      else {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lam = (nx * LX + ny * LY + nz * LZ) / LL;
        const v = lam * 0.5 + 0.5 + shift;
        idx = Math.floor(v * (r.length - 1) + BAYER[(x & 1) + ((y & 1) << 1)] * 0.9 - 0.2);
        idx = Math.max(edge ? 1 : 0, Math.min(r.length - 1, idx));
      }
      this.set(x, y, r[idx]);
    }
  }

  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Contorno externo de 1px ao redor de todos os pixels opacos.
  outline(c) {
    const { w, h, px } = this;
    const src = px.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) || (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x]))
        px[y * w + x] = c;
    }
  }

  // Substitui todas as cores opacas (flash de dano).
  fill(c) { const p = this.px; for (let i = 0; i < p.length; i++) if (p[i]) p[i] = c; }

  // Mistura todas as cores com um tom (cinza de cinzas, etc).
  tint(hex, k) {
    const n = parseInt(hex.slice(1), 16), tr = n >> 16, tg = (n >> 8) & 255, tb = n & 255;
    const p = this.px;
    for (let i = 0; i < p.length; i++) {
      const v = p[i];
      if (!v) continue;
      const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255, a = v >>> 24;
      p[i] = (a << 24) | ((b + (tb - b) * k) << 16) | ((g + (tg - g) * k) << 8) | (r + (tr - r) * k);
    }
  }

  commit() {
    if (!this.track) { this.ctx.putImageData(this.img, 0, 0); return this.canvas; }
    const x0 = Math.min(this.x0, this.cx0), y0 = Math.min(this.y0, this.cy0);
    const x1 = Math.max(this.x1, this.cx1), y1 = Math.max(this.y1, this.cy1);
    if (x1 >= x0 && y1 >= y0) this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    this.cx0 = this.w; this.cy0 = this.h; this.cx1 = -1; this.cy1 = -1;
    return this.canvas;
  }
}
