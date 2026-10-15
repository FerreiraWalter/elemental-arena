import { TILE, COLS, ROWS } from '../config.js';
import { T, TILE_PROPS, props } from './tiles.js';

export { T, TILE_PROPS, props };

const SPREAD = 0.85; // calor/s transmitido a um vizinho por um tile em chamas
const GROUND_SPREAD = 0.35; // fogo "solto" no chão (areia) espalha menos

export const IGNITE = { NONE: 0, FUEL: 1, GROUND: 2, STEAM: 3 };

const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 0.7], [-1, 1, 0.7], [1, -1, 0.7], [-1, -1, 0.7]];

export class Terrain {
  constructor(rng) {
    const n = COLS * ROWS;
    this.rng = rng;
    this.type = new Uint8Array(n);
    this.base = new Uint8Array(n); // tipo original, para rebrotar
    this.fuel = new Float32Array(n);
    this.fire = new Float32Array(n); // segundos restantes de queima (>0 = em chamas)
    this.fireMax = new Float32Array(n);
    this.heat = new Float32Array(n);
    this.wet = new Float32Array(n); // segundos restantes de umidade
    this.soot = new Float32Array(n); // fuligem visual (0..1)
    this.roots = new Float32Array(n); // segundos restantes de raízes (planta): retardam e são inflamáveis
    this.height = new Float32Array(n).fill(1); // nível do chão: 0 água, 1 chão, 2 plataforma; x.5 = rampa/escada
    this.flowX = new Float32Array(n); // correnteza (px/s) em tiles de água
    this.flowY = new Float32Array(n);
    this.rootSet = new Set();
    this.regrow = new Float32Array(n);
    this.variant = new Uint8Array(n);
    this.burning = new Set();
    this.wetSet = new Set();
    this.heated = new Set();
    this.scorchedSet = new Set();
    this.dirty = new Set(); // tiles cuja aparência base mudou (o renderer redesenha)
    this.stats = { ignitions: 0, spreadIgnitions: 0, extinguished: 0, burnedOut: 0, grown: 0 };
  }

  idx(c, r) { return c < 0 || r < 0 || c >= COLS || r >= ROWS ? -1 : r * COLS + c; }
  at(x, y) { return this.idx(Math.floor(x / TILE), Math.floor(y / TILE)); }
  cx(i) { return (i % COLS) * TILE + TILE / 2; }
  cy(i) { return Math.floor(i / COLS) * TILE + TILE / 2; }
  p(i) { return props(this.type[i]); }
  heightAt(x, y) { const i = this.at(x, y); return i < 0 ? 1 : this.height[i]; }

  setBase(i, t, h) {
    if (i < 0) return;
    this.type[i] = t;
    this.base[i] = t;
    this.fuel[i] = props(t).fuel || 0;
    if (h !== undefined) this.height[i] = h;
  }

  hasFuel(i) { return i >= 0 && this.fuel[i] > 0.05 && !!props(this.type[i]).fuel; }
  isFlammable(i) { return i >= 0 && (this.hasFuel(i) || this.roots[i] > 0); }
  isBurning(i) { return i >= 0 && this.fire[i] > 0; }
  isWater(i) { return i >= 0 && !!props(this.type[i]).water; }

  // Raízes da planta: crescem em chão firme sem fogo.
  growRoots(i, time) {
    if (i < 0) return false;
    const p = props(this.type[i]);
    if (p.water || p.solid || this.fire[i] > 0) return false;
    this.roots[i] = Math.max(this.roots[i], time);
    this.rootSet.add(i);
    return true;
  }

  // Vegetação nova (planta): vira grama ou espinheiro, que também são combustível para o fogo.
  growGrass(i, type = T.GRASS) {
    if (i < 0 || this.fire[i] > 0 || !props(this.type[i]).grow) return false;
    this.type[i] = type;
    this.fuel[i] = props(type).fuel;
    this.scorchedSet.delete(i);
    this.dirty.add(i);
    this.stats.grown++;
    return true;
  }

  // Tenta acender um tile. groundTime > 0 cria "chão em chamas" temporário mesmo sem vegetação.
  ignite(i, groundTime = 0) {
    if (i < 0) return IGNITE.NONE;
    const p = props(this.type[i]);
    if (p.water) return IGNITE.STEAM;
    if (p.solid) return IGNITE.NONE;
    if (this.wet[i] > 0) {
      // O fogo evapora parte da umidade em vez de acender.
      this.wet[i] = Math.max(0, this.wet[i] - 2.5);
      if (this.wet[i] <= 0) this.wetSet.delete(i);
      return IGNITE.STEAM;
    }
    if (this.fire[i] > 0) {
      if (!this.hasFuel(i) && groundTime > this.fire[i]) { this.fire[i] = groundTime; this.fireMax[i] = groundTime; }
      return IGNITE.NONE;
    }
    if (this.roots[i] > 0 && !this.hasFuel(i)) {
      // Raízes queimam rápido e somem.
      this.roots[i] = 0;
      this.rootSet.delete(i);
      this.fire[i] = this.fireMax[i] = Math.max(2, groundTime);
      this.burning.add(i);
      this.stats.ignitions++;
      return IGNITE.FUEL;
    }
    if (this.hasFuel(i)) {
      if (this.roots[i] > 0) { this.roots[i] = 0; this.rootSet.delete(i); }
      this.fire[i] = this.fireMax[i] = this.fuel[i] / p.burn;
      this.burning.add(i);
      this.heat[i] = 0;
      this.heated.delete(i);
      this.stats.ignitions++;
      return IGNITE.FUEL;
    }
    if (groundTime > 0) {
      this.fire[i] = this.fireMax[i] = groundTime;
      this.burning.add(i);
      return IGNITE.GROUND;
    }
    return IGNITE.NONE;
  }

  // Apaga e molha. Retorna true se havia fogo.
  douse(i, wetTime) {
    if (i < 0 || props(this.type[i]).solid) return false;
    let was = false;
    if (this.fire[i] > 0) {
      was = true;
      this.fire[i] = 0;
      this.burning.delete(i);
      this.soot[i] = Math.max(this.soot[i], 0.6);
      this.stats.extinguished++;
      if (this.fuel[i] < 0.35 && props(this.base[i]).fuel) this.scorch(i);
      this.dirty.add(i);
    }
    this.heat[i] = 0;
    this.heated.delete(i);
    if (!props(this.type[i]).water && wetTime > this.wet[i]) {
      if (this.wet[i] <= 0) this.dirty.add(i);
      this.wet[i] = wetTime;
      this.wetSet.add(i);
    }
    return was;
  }

  scorch(i) {
    this.type[i] = T.SCORCHED;
    this.fuel[i] = 0;
    this.regrow[i] = 45 + this.rng() * 35;
    this.scorchedSet.add(i);
    this.dirty.add(i);
  }

  update(dt) {
    const rng = this.rng;
    // Queima e propagação.
    for (const i of this.burning) {
      const p = props(this.type[i]);
      const fuelFire = !!p.fuel;
      if (fuelFire) {
        this.fuel[i] -= p.burn * dt;
        this.fire[i] = Math.max(0, this.fuel[i] / p.burn);
      } else {
        this.fire[i] -= dt;
      }
      if (this.fire[i] <= 0 || (fuelFire && this.fuel[i] <= 0)) {
        this.fire[i] = 0;
        this.burning.delete(i);
        this.soot[i] = 1;
        if (fuelFire) { this.scorch(i); this.stats.burnedOut++; }
        this.dirty.add(i);
        continue;
      }
      const c = i % COLS, r = (i / COLS) | 0;
      const power = fuelFire ? SPREAD : GROUND_SPREAD;
      for (const [dx, dy, w] of N8) {
        const j = this.idx(c + dx, r + dy);
        if (j < 0 || this.fire[j] > 0 || this.wet[j] > 0 || !this.isFlammable(j)) continue;
        this.heat[j] += power * w * (props(this.type[j]).flam || 1.6) * (0.5 + rng()) * dt;
        this.heated.add(j);
      }
    }
    for (const j of this.heated) {
      if (this.fire[j] > 0) { this.heated.delete(j); continue; }
      if (this.heat[j] >= 1) {
        if (this.ignite(j) === IGNITE.FUEL) this.stats.spreadIgnitions++;
        this.heated.delete(j);
        continue;
      }
      this.heat[j] -= 0.12 * dt;
      if (this.heat[j] <= 0) { this.heat[j] = 0; this.heated.delete(j); }
    }
    for (const i of this.rootSet) {
      this.roots[i] -= dt;
      if (this.roots[i] <= 0) { this.roots[i] = 0; this.rootSet.delete(i); }
    }
    // Secagem.
    for (const i of this.wetSet) {
      this.wet[i] -= dt;
      if (this.wet[i] <= 0) { this.wet[i] = 0; this.wetSet.delete(i); this.dirty.add(i); }
    }
    // Rebrota lenta da vegetação queimada.
    for (const i of this.scorchedSet) {
      if (this.fire[i] > 0) continue;
      this.regrow[i] -= dt * (this.wet[i] > 0 ? 1.6 : 1);
      this.soot[i] = Math.max(0, this.soot[i] - dt / 60);
      if (this.regrow[i] <= 0) {
        this.type[i] = this.base[i];
        this.fuel[i] = props(this.base[i]).fuel || 0;
        this.scorchedSet.delete(i);
        this.dirty.add(i);
      }
    }
  }
}
