import { angleDiff, angleTo, pointSeg, clamp, turnToward } from '../core/math.js';
import { TILE, WORLD_W, WORLD_H } from '../config.js';
import { T } from './tiles.js';
import { thorns, spawnDecoy, SIG, isGuarding } from './signature.js';
import * as Elec from './electric.js';

// Cada habilidade tem fases reais: preparação (windup, telegrafada), ativa (hitbox/efeito) e recuperação.
// move = multiplicador de deslocamento em cada fase; turn = rad/s de rastreio da mira em windup/ativa.

// Golpe corpo a corpo: acerta quem estiver no arco (alcance/arco definidos na habilidade e usados também no desenho).
function meleeTick(w, m, a, { reach, arc, dmg, kb, stun, extra }) {
  for (const t of w.enemiesOf(m)) {
    if (a.hit.has(t.id)) continue;
    const d = Math.hypot(t.x - m.x, t.y - m.y);
    if (d > m.r + reach + t.r) continue;
    const slack = d > 0 ? Math.asin(Math.min(1, t.r / d)) : Math.PI;
    if (Math.abs(angleDiff(a.aim, angleTo(m, t))) > arc / 2 + slack) continue;
    if (!w.los(m.x, m.y, t.x, t.y, { noSteam: true })) continue;
    a.hit.add(t.id);
    const dealt = w.damage(t, dmg, m, { kb, ang: a.aim, stun, element: m.element, ...extra });
    if (dealt > 0 || t.status.invuln <= 0) thorns(w, t, m); // couraça de espinhos fere quem bate
  }
  for (const d of [...w.decoys]) {
    if (d.team === m.team || a.hit.has('d' + d.id)) continue;
    const dd = Math.hypot(d.x - m.x, d.y - m.y);
    if (dd > m.r + reach + d.owner.r || Math.abs(angleDiff(a.aim, Math.atan2(d.y - m.y, d.x - m.x))) > arc / 2 + 0.4) continue;
    a.hit.add('d' + d.id);
    w.popDecoysIn(d.x, d.y, 1, m.team);
  }
}
const melee = (o) => ({ reach: o.reach, arc: o.arc, hit: o, onActiveTick(w, m, a) { meleeTick(w, m, a, this.hit); } });

function inCone(ox, oy, aim, len, half, x, y, r = 0) {
  const d = Math.hypot(x - ox, y - oy);
  if (d > len + r) return false;
  if (d < 1) return true;
  const slack = Math.asin(Math.min(1, r / d));
  return Math.abs(angleDiff(aim, Math.atan2(y - oy, x - ox))) <= half + slack;
}

function every(a, dt, period) {
  a.data.acc = (a.data.acc || 0) + dt;
  if (a.data.acc < period) return false;
  a.data.acc -= period;
  return true;
}

export const ABILITIES = {
  // ───────────── FOGO ─────────────
  ember: {
    id: 'ember', name: 'Brasa', element: 'fire', kind: 'projectile', heat: 5,
    cooldown: 0.95, windup: 0.2, active: 0.02, recovery: 0.2,
    move: [0.55, 0.55, 0.8], turn: [9, 0], range: 200, speed: 250,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'ember', owner: m, ang: a.aim, speed: 260, r: 3, range: 205, dmg: 10, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 3, aimPoint: a.aimPoint });
    },
  },
  claw: {
    id: 'claw', name: 'Garra Ígnea', element: 'fire', kind: 'melee', heat: 9,
    cooldown: 0.9, windup: 0.15, active: 0.1, recovery: 0.26,
    move: [0.3, 1, 0.4], turn: [10, 2], range: 16,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 120; m.ky += Math.sin(a.aim) * 120; },
    ...melee({ reach: 16, arc: 2.0, dmg: 13, kb: 150, stun: 0.22, extra: { burn: 1.2 } }),
  },
  flameWave: {
    id: 'flameWave', name: 'Sopro Ígneo', element: 'fire', kind: 'cone', heat: 25,
    cooldown: 7.5, windup: 0.5, active: 0.8, recovery: 0.5, superArmor: true,
    move: [0.15, 0.25, 0.5], turn: [6, 1.2], range: 68, len: 68, half: 0.48,
    onActiveTick(w, m, a, dt) { this.coneTick(w, m, a, dt, 1.6); },
    // Cone canalizado: dano a cada 0,1 s, empurra um pouco (dá para sair dele) e acende parte da vegetação.
    coneTick(w, m, a, dt, dmg) {
      if (!every(a, dt, 0.1)) return;
      const ox = m.x + Math.cos(a.aim) * m.r * 0.8, oy = m.y + Math.sin(a.aim) * m.r * 0.8 - 2;
      const { len, half } = this;
      for (const t of w.enemiesOf(m)) {
        if (inCone(ox, oy, a.aim, len, half, t.x, t.y, t.r) && w.los(ox, oy, t.x, t.y, { noSteam: true }))
          w.damage(t, dmg, m, { dot: true, burn: 1.4, element: 'fire', push: 28, ang: a.aim, tag: this.id });
      }
      const tr = w.terrain;
      const c0 = Math.floor((ox - len) / TILE), c1 = Math.floor((ox + len) / TILE);
      const r0 = Math.floor((oy - len) / TILE), r1 = Math.floor((oy + len) / TILE);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = tr.idx(c, r);
        if (i < 0) continue;
        const x = c * TILE + 4, y = r * TILE + 4;
        if (!inCone(ox, oy, a.aim, len * 0.85, half, x, y)) continue;
        if (w.rng() > 0.16) continue;
        if (!w.los(ox, oy, x, y, { noSteam: true })) continue;
        w.igniteTile(i, 1.1, m);
      }
      w.popDecoysIn(ox + Math.cos(a.aim) * len * 0.5, oy + Math.sin(a.aim) * len * 0.5, len * 0.4, m.team);
      for (const o of w.obstacles) if (o.flammable && !o.destroyed && inCone(ox, oy, a.aim, len, half, o.x, o.y, o.r)) {
        w.igniteObstacle(o, m);
        w.hurtObstacle(o, 1.5, m);
      }
      for (const p of w.projectiles) if (p.kind === 'waterBolt' && p.team !== m.team && inCone(ox, oy, a.aim, len, half, p.x, p.y)) w.clash(p, null);
    },
  },
  fireDash: {
    id: 'fireDash', name: 'Investida Flamejante', element: 'fire', kind: 'dash', heat: 18,
    cooldown: 6.5, windup: 0.25, active: 0.3, recovery: 0.4, superArmor: true,
    move: [0.1, 1, 0.3], turn: [8, 0], range: 110, dash: { speed: 360 },
    onActiveTick(w, m, a) {
      w.igniteTile(w.terrain.at(m.x, m.y), 1.6, m);
      dashHit(w, m, a, { dmg: 10, kb: 190, stun: 0.25, burn: 1.2 });
    },
  },
  meteor: {
    id: 'meteor', name: 'Meteoro', element: 'fire', kind: 'lob', heat: 18,
    charges: 2, chargeGap: 0.9, // 2 cargas; cada uma volta em 11 s
    cooldown: 11, windup: 0.4, active: 0.05, recovery: 0.35,
    move: [0.3, 0.3, 0.7], turn: [8, 0], range: 230, radius: 30, flight: 0.95,
    onActiveStart(w, m, a) {
      const ang = Math.atan2(a.point.y - m.y, a.point.x - m.x);
      const d = clamp(Math.hypot(a.point.x - m.x, a.point.y - m.y), 40, this.range);
      const tx = clamp(m.x + Math.cos(ang) * d, 10, WORLD_W - 10), ty = clamp(m.y + Math.sin(ang) * d, 10, WORLD_H - 10);
      w.spawnProjectile({ kind: 'meteor', owner: m, lob: true, x: m.x, y: m.y - 8, tx, ty, flight: this.flight, radius: this.radius, dmg: 20 });
    },
  },
  hop: {
    id: 'hop', name: 'Salto Lateral', element: 'fire', kind: 'dodge',
    cooldown: 3.4, windup: 0, active: 0.17, recovery: 0.1,
    move: [1, 1, 0.6], turn: [0, 0], dash: { speed: 330, invuln: true },
  },

  // ───────────── ÁGUA ─────────────
  waterBolt: {
    id: 'waterBolt', name: "Jato d'Água", element: 'water', kind: 'projectile',
    cooldown: 0.9, windup: 0.2, active: 0.02, recovery: 0.2,
    move: [0.55, 0.55, 0.8], turn: [9, 0], range: 220, speed: 265,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'waterBolt', owner: m, ang: a.aim, speed: 265, r: 3, range: 225, dmg: 8, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 3, aimPoint: a.aimPoint });
    },
  },
  headbutt: {
    id: 'headbutt', name: 'Cabeçada', element: 'water', kind: 'melee',
    cooldown: 1.1, windup: 0.16, active: 0.1, recovery: 0.26,
    move: [0.3, 1, 0.4], turn: [10, 2], range: 14,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 130; m.ky += Math.sin(a.aim) * 130; },
    ...melee({ reach: 14, arc: 1.8, dmg: 13, kb: 200, stun: 0.25, extra: { wet: 2 } }),
  },
  hydroBeam: {
    id: 'hydroBeam', name: 'Hidro-Raio', element: 'water', kind: 'beam',
    cooldown: 9, windup: 0.6, active: 1.1, recovery: 0.45, superArmor: true,
    move: [0.15, 0.1, 0.5], turn: [3, 0.85], range: 190, width: 5,
    beamEnd(w, m, a) {
      const ox = m.x + Math.cos(a.aim) * (m.r + 1), oy = m.y + Math.sin(a.aim) * (m.r + 1) - 3;
      const L = w.raycast(ox, oy, a.aim, this.range);
      return { ox, oy, ex: ox + Math.cos(a.aim) * L.len, ey: oy + Math.sin(a.aim) * L.len, hit: L.hit };
    },
    onActiveTick(w, m, a, dt) {
      const b = this.beamEnd(w, m, a);
      a.data.beam = b;
      const ca = Math.cos(a.aim), sa = Math.sin(a.aim);
      for (const t of w.enemiesOf(m)) {
        if (pointSeg(t.x, t.y, b.ox, b.oy, b.ex, b.ey).d > this.width + t.r) continue;
        w.damage(t, 14 * dt, m, { dot: true, wet: 2.5, element: 'water' });
        if (!isGuarding(t)) { t.kx += ca * 520 * dt; t.ky += sa * 520 * dt; }
      }
      const L = Math.hypot(b.ex - b.ox, b.ey - b.oy);
      if (every(a, dt, 0.05)) for (let s = 0; s <= L; s += 5) w.douseArea(b.ox + ca * s, b.oy + sa * s, 5, 7, m);
      if (b.hit && b.hit.burning > 0) w.douseObstacle(b.hit, m);
      for (const p of w.projectiles) if (p.kind === 'ember' && p.team !== m.team && pointSeg(p.x, p.y, b.ox, b.oy, b.ex, b.ey).d < this.width + p.r) w.clash(p, null);
    },
  },
  // Redemoinho: o Hidrocasco gira e ANDA dentro dele; quem está perto é arrastado em volta (e um pouco para
  // dentro) e, no fim, o redemoinho cospe todo mundo para fora.
  whirlpool: {
    id: 'whirlpool', name: 'Redemoinho', element: 'water', kind: 'aoe',
    cooldown: 9, windup: 0.3, active: 1.4, recovery: 0.35, superArmor: true,
    move: [0.4, 1.15, 0.7], turn: [0, 0], range: 46, radius: 46, // gira e AVANÇA: mais rápido que andando
    onActiveTick(w, m, a, dt) {
      const R = this.radius * Math.min(1, a.t / 0.35);
      a.data.R = R;
      m.status.burn = 0;
      for (const t of w.enemiesOf(m)) {
        const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy) || 1;
        if (d > R + t.r) continue;
        w.damage(t, 11 * dt, m, { dot: true, wet: 2, element: 'water', tag: 'whirlpool' });
        // Órbita: empurra de lado (giro) e puxa de leve para o centro.
        const tang = 210, pull = d > m.r + t.r + 6 ? 70 : -40;
        if (isGuarding(t)) continue; // guarda ativa não é arrastada
        t.kx += (-dy / d * tang - dx / d * pull) * dt * 3;
        t.ky += (dx / d * tang - dy / d * pull) * dt * 3;
      }
      if (every(a, dt, 0.1)) {
        const tr = w.terrain;
        const c0 = Math.floor((m.x - R) / TILE), c1 = Math.floor((m.x + R) / TILE);
        const r0 = Math.floor((m.y - R) / TILE), r1 = Math.floor((m.y + R) / TILE);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = tr.idx(c, r);
          if (i >= 0 && Math.hypot(c * TILE + 4 - m.x, r * TILE + 4 - m.y) <= R) w.douseTile(i, 8, m);
        }
        for (const o of w.obstacles) if (o.burning > 0 && Math.hypot(o.x - m.x, o.y - m.y) < R + o.r) w.douseObstacle(o, m);
      }
      for (const p of w.projectiles) if (p.kind === 'ember' && p.team !== m.team && Math.hypot(p.x - m.x, p.y - m.y) < R) w.clash(p, null);
    },
    // Fim do giro: o redemoinho arremessa quem estava dentro.
    onEnd(w, m) {
      w.emit({ type: 'whirlBurst', x: m.x, y: m.y, r: this.radius, m });
      for (const t of w.enemiesOf(m)) {
        const d = Math.hypot(t.x - m.x, t.y - m.y);
        if (d > this.radius + t.r + 4) continue;
        w.damage(t, 5, m, { tag: 'whirlpool', element: 'water', kb: 230, ang: Math.atan2(t.y - m.y, t.x - m.x), wet: 2, proj: true });
      }
    },
  },
  // Casco Reflexo: bloqueio curto. Projéteis voltam contra quem atirou; quem bate de perto leva o contra-ataque.
  shellGuard: {
    id: 'shellGuard', name: 'Casco Reflexo', element: 'water', kind: 'guard',
    cooldown: 5.5, windup: 0, active: 0.55, recovery: 0.35,
    move: [0.25, 0.25, 0.6], turn: [0, 0], counter: { dmg: 12 },
  },
  shellRoll: {
    id: 'shellRoll', name: 'Rolagem de Casco', element: 'water', kind: 'dodge',
    cooldown: 3.2, windup: 0, active: 0.26, recovery: 0.12,
    move: [1, 1, 0.6], turn: [0, 0], dash: { speed: 300, invuln: true },
    onActiveTick(w, m) { w.douseTile(w.terrain.at(m.x, m.y), 5, m); },
  },

  // ───────────── PLANTA: controladora, prende e recupera terreno ─────────────
  seedShot: {
    id: 'seedShot', name: 'Semente Afiada', element: 'plant', kind: 'projectile',
    cooldown: 0.88, windup: 0.18, active: 0.02, recovery: 0.2,
    move: [0.55, 0.55, 0.8], turn: [9, 0], range: 200, speed: 240,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'seed', owner: m, ang: a.aim, speed: 240, r: 3, range: 200, dmg: 8, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 3, aimPoint: a.aimPoint });
    },
  },
  vineWhip: {
    id: 'vineWhip', name: 'Chicote de Vinha', element: 'plant', kind: 'melee', vine: true,
    cooldown: 1.3, windup: 0.18, active: 0.12, recovery: 0.26,
    move: [0.3, 0.5, 0.4], turn: [10, 2], range: 26,
    // Knockback negativo: puxa o alvo para perto.
    ...melee({ reach: 26, arc: 1.3, dmg: 10, kb: -170, stun: 0.3, extra: { slow: [1.5, 0.3] } }),
  },
  rootSnare: {
    id: 'rootSnare', name: 'Raízes', element: 'plant', kind: 'lob',
    cooldown: 9, windup: 0.3, active: 0.05, recovery: 0.3,
    move: [0.4, 0.4, 0.7], turn: [8, 0], range: 170, radius: 22, flight: 0.6,
    onActiveStart(w, m, a) {
      const ang = Math.atan2(a.point.y - m.y, a.point.x - m.x);
      const d = clamp(Math.hypot(a.point.x - m.x, a.point.y - m.y), 20, this.range);
      const tx = clamp(m.x + Math.cos(ang) * d, 10, WORLD_W - 10), ty = clamp(m.y + Math.sin(ang) * d, 10, WORLD_H - 10);
      w.spawnProjectile({ kind: 'roots', owner: m, lob: true, flat: true, x: tx, y: ty, tx, ty, flight: this.flight, radius: this.radius, dmg: 8 });
    },
  },
  overgrowth: {
    id: 'overgrowth', name: 'Crescimento', element: 'plant', kind: 'aoe', harmless: true,
    cooldown: 12, windup: 0.4, active: 0.8, recovery: 0.3, superArmor: true,
    move: [0.2, 0.2, 0.6], turn: [0, 0], range: 52, radius: 52,
    onActiveTick(w, m, a, dt) {
      w.heal(m, 15 * dt);
      for (const ally of w.alliesOf(m)) if (Math.hypot(ally.x - m.x, ally.y - m.y) < this.radius + ally.r) w.heal(ally, 14 * dt);
      if (!every(a, dt, 0.1)) return;
      const R = this.radius * Math.min(1, a.t / 0.5);
      const tr = w.terrain;
      for (let k = 0; k < 14; k++) {
        const ang = w.rng() * Math.PI * 2, d = Math.sqrt(w.rng()) * R;
        const i = tr.at(m.x + Math.cos(ang) * d, m.y + Math.sin(ang) * d);
        if (i >= 0 && tr.growGrass(i)) { m.stats.grown = (m.stats.grown || 0) + 1; w.emit({ type: 'grow', x: tr.cx(i), y: tr.cy(i) }); }
      }
    },
  },
  // Brotos Sentinela: arremessa uma semente que vira uma torre viva (atira sozinha e cura o Brotossauro por perto).
  plantSentry: {
    id: 'plantSentry', name: 'Broto Sentinela', element: 'plant', kind: 'lob', sentry: true,
    charges: 2, chargeGap: 0.6, // 2 cargas: dá para plantar as duas sentinelas seguidas
    cooldown: 10, windup: 0.3, active: 0.05, recovery: 0.3,
    move: [0.4, 0.4, 0.7], turn: [8, 0], range: 170, radius: 10, flight: 0.55,
    onActiveStart(w, m, a) { sentryLob(w, m, a, this, 'sentry', 11); },
  },
  // Esquiva enterrada: o Brotossauro mergulha na terra (invulnerável) e só uma flor vermelha anda pela superfície.
  leafDash: {
    id: 'leafDash', name: 'Raiz Escondida', element: 'plant', kind: 'dodge', burrowDodge: 'flower',
    cooldown: 3.4, windup: 0, active: 0.45, recovery: 0.12,
    move: [1, 1, 0.6], turn: [0, 0], dash: { speed: 185, invuln: true },
    onEnd(w, m) { w.emit({ type: 'burrowOut', m, x: m.x, y: m.y }); w.sprout(m.x, m.y, T.GRASS, m); },
  },

  // ═════════════ FORMAS EVOLUÍDAS ═════════════
  // ───── Brasalisco Ascendido: pressão ofensiva, rastros de lava, investida explosiva ─────
  magmaBall: {
    id: 'magmaBall', name: 'Bola de Magma', element: 'fire', kind: 'projectile', heat: 6,
    cooldown: 1.2, windup: 0.24, active: 0.02, recovery: 0.22,
    move: [0.5, 0.5, 0.8], turn: [8, 0], range: 210, speed: 215,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'magma', owner: m, ang: a.aim, speed: 225, r: 4, range: 210, dmg: 13, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 4, aimPoint: a.aimPoint });
    },
  },
  volcanicClaw: {
    id: 'volcanicClaw', name: 'Garra Vulcânica', element: 'fire', kind: 'melee', heat: 9,
    cooldown: 1.0, windup: 0.18, active: 0.12, recovery: 0.3,
    move: [0.3, 1, 0.4], turn: [10, 2], range: 20,
    onActiveStart(w, m, a) {
      m.kx += Math.cos(a.aim) * 140; m.ky += Math.sin(a.aim) * 140;
      // A garra deixa um arco de chão em brasa à frente.
      for (const off of [-0.6, 0, 0.6]) w.igniteTile(w.terrain.at(m.x + Math.cos(a.aim + off) * (m.r + 14), m.y + Math.sin(a.aim + off) * (m.r + 14)), 1.4, m);
    },
    ...melee({ reach: 20, arc: 2.2, dmg: 19, kb: 210, stun: 0.25, extra: { burn: 1.6 } }),
  },
  infernoBreath: {
    id: 'infernoBreath', name: 'Sopro Infernal', element: 'fire', kind: 'cone', heat: 25,
    cooldown: 8, windup: 0.5, active: 0.9, recovery: 0.55, superArmor: true,
    move: [0.15, 0.25, 0.5], turn: [6, 1.1], range: 84, len: 84, half: 0.52,
    onActiveTick(w, m, a, dt) { ABILITIES.flameWave.coneTick.call(this, w, m, a, dt, 2.2); },
  },
  eruptionDash: {
    id: 'eruptionDash', name: 'Erupção', element: 'fire', kind: 'dash', heat: 20,
    cooldown: 7.5, windup: 0.3, active: 0.3, recovery: 0.5, superArmor: true,
    move: [0.1, 1, 0.3], turn: [8, 0], range: 120, dash: { speed: 400 },
    onActiveTick(w, m, a) {
      w.igniteTile(w.terrain.at(m.x, m.y), 1.6, m);
      dashHit(w, m, a, { dmg: 12, kb: 200, stun: 0.25, burn: 1.4 });
    },
    // No fim da investida, uma explosão em área (quem já levou a investida recebe metade: sem dano dobrado).
    onEnd(w, m, a) { eruption(w, m, a, 30, 12); },
  },
  heavyHop: {
    id: 'heavyHop', name: 'Salto Pesado', element: 'fire', kind: 'dodge',
    cooldown: 4.2, windup: 0, active: 0.18, recovery: 0.16,
    move: [1, 1, 0.5], turn: [0, 0], dash: { speed: 300, invuln: true },
  },

  // ───── Hidrocasco Abissal: mobilidade, posicionamento e defesa ─────
  abyssBolt: {
    id: 'abyssBolt', name: 'Jato Abissal', element: 'water', kind: 'projectile',
    cooldown: 0.8, windup: 0.18, active: 0.02, recovery: 0.18,
    move: [0.6, 0.6, 0.85], turn: [9, 0], range: 230, speed: 290,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'waterBolt', owner: m, ang: a.aim, speed: 290, r: 3, range: 235, dmg: 8, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 4, aimPoint: a.aimPoint });
    },
  },
  abyssPincer: {
    id: 'abyssPincer', name: 'Pinça Abissal', element: 'water', kind: 'melee',
    cooldown: 1.1, windup: 0.16, active: 0.1, recovery: 0.24,
    move: [0.3, 1, 0.4], turn: [10, 2], range: 18,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 130; m.ky += Math.sin(a.aim) * 130; },
    ...melee({ reach: 18, arc: 1.9, dmg: 15, kb: 240, stun: 0.25, extra: { wet: 3 } }),
  },
  // Maré Esmagadora: uma onda de verdade. Nasce do tamanho do monstro, CRESCE enquanto avança, CARREGA quem
  // pega (arrastando junto, inclusive contra paredes) e ARREBENTA no fim do caminho num estouro de água.
  tidalWave: {
    id: 'tidalWave', name: 'Maré Esmagadora', element: 'water', kind: 'projectile',
    cooldown: 8.5, windup: 0.45, active: 0.05, recovery: 0.4, superArmor: true,
    move: [0.2, 0.2, 0.6], turn: [5, 0], range: 250, speed: 235, wave: true,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'wave', owner: m, ang: a.aim, speed: 235, r: 14, r0: 14, rMax: 25, carryMax: 0.4, range: 250, dmg: 11, pierce: true, x: m.x + Math.cos(a.aim) * (m.r + 6), y: m.y + Math.sin(a.aim) * (m.r + 6), aimPoint: a.aimPoint });
    },
  },
  bubbleShield: {
    id: 'bubbleShield', name: 'Bolha Protetora', element: 'water', kind: 'buff',
    cooldown: 16, windup: 0.15, active: 0.05, recovery: 0.15,
    move: [0.6, 0.6, 0.8], turn: [0, 0],
    onActiveStart(w, m) {
      m.status.shield = 5;
      m.shieldHp = 30;
      m.status.burn = 0;
      w.emit({ type: 'shield', m, x: m.x, y: m.y });
    },
  },
  // Casco Abissal: bloqueio mais longo; ao bloquear o primeiro golpe, ganha uma bolha protetora.
  abyssGuard: {
    id: 'abyssGuard', name: 'Casco Abissal', element: 'water', kind: 'guard',
    cooldown: 6, windup: 0, active: 0.7, recovery: 0.35,
    move: [0.3, 0.3, 0.6], turn: [0, 0], counter: { dmg: 15 }, shieldOnBlock: 25,
  },
  abyssCurrent: {
    id: 'abyssCurrent', name: 'Corrente Abissal', element: 'water', kind: 'dodge',
    cooldown: 2.6, windup: 0, active: 0.32, recovery: 0.1,
    move: [1, 1, 0.7], turn: [0, 0], dash: { speed: 360, invuln: true },
    onActiveTick(w, m) { w.douseArea(m.x, m.y, 6, 6, m); },
  },

  // ───── Brotossauro Ancestral: controle de área e armadilhas, pouca mobilidade ─────
  thornShot: {
    id: 'thornShot', name: 'Espinho Ancestral', element: 'plant', kind: 'projectile',
    cooldown: 0.85, windup: 0.22, active: 0.02, recovery: 0.22,
    move: [0.5, 0.5, 0.8], turn: [9, 0], range: 200, speed: 230,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'thorn', owner: m, ang: a.aim, speed: 230, r: 3, range: 200, dmg: 11, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 4, aimPoint: a.aimPoint });
    },
  },
  ancientWhip: {
    id: 'ancientWhip', name: 'Açoite de Raiz', element: 'plant', kind: 'melee', vine: true,
    cooldown: 1.5, windup: 0.22, active: 0.14, recovery: 0.3,
    move: [0.3, 0.4, 0.4], turn: [10, 2], range: 34,
    ...melee({ reach: 34, arc: 1.2, dmg: 13, kb: -220, stun: 0.35, extra: { slow: [1.8, 0.35] } }),
  },
  ancientRoots: {
    id: 'ancientRoots', name: 'Raízes Ancestrais', element: 'plant', kind: 'lob',
    cooldown: 10, windup: 0.35, active: 0.05, recovery: 0.35,
    move: [0.3, 0.3, 0.6], turn: [8, 0], range: 180, radius: 32, flight: 0.65,
    onActiveStart(w, m, a) {
      const ang = Math.atan2(a.point.y - m.y, a.point.x - m.x);
      const d = clamp(Math.hypot(a.point.x - m.x, a.point.y - m.y), 20, this.range);
      const tx = clamp(m.x + Math.cos(ang) * d, 10, WORLD_W - 10), ty = clamp(m.y + Math.sin(ang) * d, 10, WORLD_H - 10);
      w.spawnProjectile({ kind: 'roots', owner: m, lob: true, flat: true, x: tx, y: ty, tx, ty, flight: this.flight, radius: this.radius, dmg: 12, rootTime: 2.4, rootTiles: 7 });
    },
  },
  ancientGrove: {
    id: 'ancientGrove', name: 'Bosque Antigo', element: 'plant', kind: 'aoe', harmless: true,
    cooldown: 14, windup: 0.45, active: 0.8, recovery: 0.35, superArmor: true,
    move: [0.1, 0.1, 0.5], turn: [0, 0], range: 52, radius: 52,
    onActiveStart(w, m, a) {
      // Ergue uma barreira de mata fechada entre a planta e o alvo: bloqueia passagem e tiros, mas queima.
      const foe = w.enemiesOf(m)[0];
      const ang = foe ? Math.atan2(foe.y - m.y, foe.x - m.x) : a.aim;
      const cx = m.x + Math.cos(ang) * 34, cy = m.y + Math.sin(ang) * 34;
      for (let k = -2; k <= 2; k++) {
        const x = cx - Math.sin(ang) * k * 14, y = cy + Math.cos(ang) * k * 14;
        const i = w.terrain.at(x, y);
        if (i < 0 || w.terrain.isWater(i) || w.blocked(x, y, 6) || w.monsters.some((o) => o.alive && Math.hypot(o.x - x, o.y - y) < o.r + 8)) continue;
        const o = w.addObstacle('thicket', x, y, 7);
        o.life = 10;
        w.emit({ type: 'grow', x, y, big: true });
      }
    },
    onActiveTick(w, m, a, dt) {
      w.heal(m, 12 * dt);
      if (!every(a, dt, 0.1)) return;
      const R = this.radius * Math.min(1, a.t / 0.5);
      for (let k = 0; k < 16; k++) {
        const ang = w.rng() * Math.PI * 2, d = Math.sqrt(w.rng()) * R;
        const i = w.terrain.at(m.x + Math.cos(ang) * d, m.y + Math.sin(ang) * d);
        if (i >= 0 && w.terrain.growGrass(i, w.rng() < 0.3 ? T.THORNS : T.GRASS)) { m.stats.grown = (m.stats.grown || 0) + 1; w.emit({ type: 'grow', x: w.terrain.cx(i), y: w.terrain.cy(i) }); }
      }
    },
  },
  ancientSentry: {
    id: 'ancientSentry', name: 'Guardião Ancestral', element: 'plant', kind: 'lob', sentry: true,
    charges: 2, chargeGap: 0.6,
    cooldown: 10, windup: 0.35, active: 0.05, recovery: 0.35,
    move: [0.3, 0.3, 0.6], turn: [8, 0], range: 185, radius: 12, flight: 0.6,
    onActiveStart(w, m, a) { sentryLob(w, m, a, this, 'ancientSentry', 14); },
  },
  // Ancestral: afunda e vira uma arvorezinha andando; ao brotar de volta, raízes empurram quem estiver colado.
  barkStep: {
    id: 'barkStep', name: 'Árvore Andante', element: 'plant', kind: 'dodge', burrowDodge: 'tree',
    cooldown: 4.6, windup: 0, active: 0.55, recovery: 0.16,
    move: [1, 1, 0.5], turn: [0, 0], dash: { speed: 150, invuln: true },
    onEnd(w, m) {
      w.emit({ type: 'burrowOut', m, x: m.x, y: m.y, big: true });
      for (const t of w.enemiesOf(m)) {
        const d = Math.hypot(t.x - m.x, t.y - m.y);
        if (d < m.r + t.r + 14 && !isGuarding(t)) { t.kx += (t.x - m.x) / (d || 1) * 180 / t.def.mass; t.ky += (t.y - m.y) / (d || 1) * 180 / t.def.mass; }
      }
      for (let k = 0; k < 10; k++) { const an = w.rng() * 6.28, r = 6 + w.rng() * 16; const i = w.terrain.at(m.x + Math.cos(an) * r, m.y + Math.sin(an) * r); if (i >= 0 && w.terrain.growGrass(i)) w.emit({ type: 'grow', x: w.terrain.cx(i), y: w.terrain.cy(i) }); }
    },
  },
  // ═════════════ NOVOS MONSTROS ═════════════
  // ───── Ouriflama (fogo): ágil, investida com rastro de fogo ─────
  quillShot: {
    id: 'quillShot', name: 'Espinhos em Brasa', element: 'fire', kind: 'projectile',
    cooldown: 0.85, windup: 0.16, active: 0.02, recovery: 0.18,
    move: [0.7, 0.7, 0.9], turn: [9, 0], range: 190, speed: 280,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'ember', tag: 'quillShot', owner: m, ang: a.aim, speed: 280, r: 3, range: 190, dmg: 7, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 3, aimPoint: a.aimPoint });
    },
  },
  prick: {
    id: 'prick', name: 'Espetada Ardente', element: 'fire', kind: 'melee',
    cooldown: 0.85, windup: 0.13, active: 0.1, recovery: 0.22,
    move: [0.3, 1, 0.4], turn: [10, 2], range: 15,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 130; m.ky += Math.sin(a.aim) * 130; },
    ...melee({ reach: 16, arc: 1.9, dmg: 11, kb: 130, stun: 0.2, extra: { burn: 1 } }),
  },
  quillBurst: {
    id: 'quillBurst', name: 'Eriçar', element: 'fire', kind: 'cone',
    cooldown: 5.5, windup: 0.3, active: 0.3, recovery: 0.35,
    move: [0.2, 0.3, 0.5], turn: [6, 0], range: 48, len: 48, half: 1.5,
    onActiveStart(w, m, a) {
      for (const t of w.enemiesOf(m)) {
        if (inCone(m.x, m.y, a.aim, this.len, this.half, t.x, t.y, t.r)) w.damage(t, 14, m, { tag: 'quillBurst', kb: 210, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.25, burn: 1.2, element: 'fire' });
      }
      w.popDecoysIn(m.x, m.y, this.len, m.team);
      w.igniteArea(m.x + Math.cos(a.aim) * 22, m.y + Math.sin(a.aim) * 22, 14, 1.4, m);
    },
  },
  blazeRush: {
    id: 'blazeRush', name: 'Investida Incandescente', element: 'fire', kind: 'dash',
    cooldown: 8, windup: 0.25, active: 0.4, recovery: 0.4, superArmor: true,
    move: [0.1, 1, 0.3], turn: [8, 0], range: 130, dash: { speed: 325 },
    // Rastro largo de chão em brasa por todo o caminho (dura pouco: é uma rota, não uma prisão).
    onActiveTick(w, m, a) {
      const px = -Math.sin(a.aim) * 7, py = Math.cos(a.aim) * 7;
      for (const k of [-1, 0, 1]) w.igniteTile(w.terrain.at(m.x + px * k, m.y + py * k), 2.4, m);
      dashHit(w, m, a, { dmg: 9, kb: 180, stun: 0.22, burn: 1.2, tag: this.id });
    },
  },
  curlRoll: {
    id: 'curlRoll', name: 'Rolo Eriçado', element: 'fire', kind: 'dodge',
    cooldown: 3, windup: 0, active: 0.24, recovery: 0.1,
    move: [1, 1, 0.6], turn: [0, 0], dash: { speed: 320, invuln: true },
    onActiveTick(w, m) { w.igniteTile(w.terrain.at(m.x, m.y), 0.9, m); },
  },
  // ───── Ouriflama Vulcânico: entra na terra e levanta o inimigo ─────
  magmaQuill: {
    id: 'magmaQuill', name: 'Espinho de Magma', element: 'fire', kind: 'projectile',
    cooldown: 1.0, windup: 0.18, active: 0.02, recovery: 0.2,
    move: [0.6, 0.6, 0.85], turn: [8, 0], range: 215, speed: 255,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'magma', tag: 'magmaQuill', owner: m, ang: a.aim, speed: 255, r: 4, range: 215, dmg: 8, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 4, aimPoint: a.aimPoint });
    },
  },
  burrow: {
    id: 'burrow', name: 'Mergulho Vulcânico', element: 'fire', kind: 'dash', burrow: true,
    cooldown: 13, windup: 0.35, active: 1.1, recovery: 0.6, superArmor: true,
    move: [0.1, 1, 0.3], turn: [8, 0], range: 190, dash: { speed: 175, invuln: true },
    // Debaixo da terra: invulnerável, persegue o alvo (curva limitada: dá para despistar correndo de lado)
    // e irrompe embaixo dele, lançando-o para cima. O montinho de terra e o tremor avisam onde ele está.
    onActiveTick(w, m, a, dt) {
      const foe = w.enemiesOf(m).sort((p, q) => Math.hypot(p.x - m.x, p.y - m.y) - Math.hypot(q.x - m.x, q.y - m.y))[0];
      if (foe) {
        a.dir = turnToward(a.dir, Math.atan2(foe.y - m.y, foe.x - m.x), 3.2 * dt);
        a.aim = a.dir;
        if (Math.hypot(foe.x - m.x, foe.y - m.y) < m.r + foe.r + 5) a.t = this.active; // chegou: irrompe agora
      }
      if (every(a, dt, 0.07)) w.emit({ type: 'dig', x: m.x, y: m.y });
    },
    onEnd(w, m) {
      w.emit({ type: 'burrowEruption', x: m.x, y: m.y, r: 30, m });
      for (const t of w.enemiesOf(m)) {
        const d = Math.hypot(t.x - m.x, t.y - m.y);
        if (d > 30 + t.r) continue;
        w.damage(t, 14, m, { tag: 'burrow', kb: 90, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.55, lift: 0.7, burn: 1.4, element: 'fire' });
      }
      w.popDecoysIn(m.x, m.y, 30, m.team);
      w.igniteArea(m.x, m.y, 16, 2, m);
      // Sai da terra embalado: o Ímpeto enche.
      m.momentum = 100; m.charged = true; w.emit({ type: 'charged', m, x: m.x, y: m.y });
    },
  },

  // ───── Gotapus (água): bolhas, tinta e jato ─────
  bubbleShot: {
    id: 'bubbleShot', name: 'Bolhas', element: 'water', kind: 'projectile',
    cooldown: 0.85, windup: 0.18, active: 0.02, recovery: 0.2,
    move: [0.6, 0.6, 0.85], turn: [9, 0], range: 210, speed: 255,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'waterBolt', tag: 'bubbleShot', owner: m, ang: a.aim, speed: 255, r: 3, range: 215, dmg: 7, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 3, aimPoint: a.aimPoint });
    },
  },
  tentacleSlap: {
    id: 'tentacleSlap', name: 'Chicotada', element: 'water', kind: 'melee',
    cooldown: 1.0, windup: 0.16, active: 0.1, recovery: 0.24,
    move: [0.3, 1, 0.4], turn: [10, 2], range: 22,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 100; m.ky += Math.sin(a.aim) * 100; },
    ...melee({ reach: 22, arc: 2.6, dmg: 12, kb: 150, stun: 0.22, extra: { wet: 2 } }),
  },
  // Bolha Prisão: uma bolha em arco (mais rápida que o meteoro) que estoura e prende quem estiver no círculo.
  bubbleTrap: {
    id: 'bubbleTrap', name: 'Bolha Prisão', element: 'water', kind: 'lob',
    cooldown: 10, windup: 0.3, active: 0.05, recovery: 0.3,
    move: [0.4, 0.4, 0.7], turn: [8, 0], range: 190, radius: 20, flight: 0.5,
    onActiveStart(w, m, a) {
      const ang = Math.atan2(a.point.y - m.y, a.point.x - m.x);
      const d = clamp(Math.hypot(a.point.x - m.x, a.point.y - m.y), 30, this.range);
      const tx = clamp(m.x + Math.cos(ang) * d, 10, WORLD_W - 10), ty = clamp(m.y + Math.sin(ang) * d, 10, WORLD_H - 10);
      w.spawnProjectile({ kind: 'bubble', owner: m, lob: true, x: m.x, y: m.y - 6, tx, ty, flight: this.flight, radius: this.radius, dmg: 5, trap: 1.1 });
    },
  },
  // Ilusão de Tinta: nuvem de tinta + duas cópias falsas correndo; o Gotapus fica camuflado até atacar.
  inkCloud: {
    id: 'inkCloud', name: 'Ilusão de Tinta', element: 'water', kind: 'buff',
    cooldown: 11, windup: 0.15, active: 0.05, recovery: 0.25,
    move: [0.6, 0.6, 0.8], turn: [0, 0],
    onActiveStart(w, m) { illusion(w, m, 28, 2, 1.6); },
  },
  jetDash: {
    id: 'jetDash', name: 'Jato Propulsor', element: 'water', kind: 'dodge',
    cooldown: 2.8, windup: 0, active: 0.28, recovery: 0.1,
    move: [1, 1, 0.7], turn: [0, 0], dash: { speed: 340, invuln: true },
    // Deixa para trás uma cópia de tinta que segue o caminho que você fazia.
    onActiveStart(w, m, a) { w.puffInk(m.x, m.y, 12); jetDecoy(w, m, a); },
    onActiveTick(w, m) { w.douseTile(w.terrain.at(m.x, m.y), 5, m); },
  },
  // ───── Leviapus: agarra, cobre tudo de tinta, domina o campo ─────
  tentacleSweep: {
    id: 'tentacleSweep', name: 'Varredura de Tentáculos', element: 'water', kind: 'melee',
    cooldown: 1.1, windup: 0.2, active: 0.12, recovery: 0.28,
    move: [0.3, 0.7, 0.4], turn: [10, 2], range: 30,
    ...melee({ reach: 30, arc: 3.4, dmg: 18, kb: 290, stun: 0.3, extra: { wet: 3 } }),
  },
  krakenGrip: {
    id: 'krakenGrip', name: 'Abraço do Kraken', element: 'water', kind: 'melee',
    cooldown: 7, windup: 0.35, active: 0.14, recovery: 0.4, superArmor: true,
    move: [0.2, 0.3, 0.4], turn: [8, 2], range: 44,
    ...melee({ reach: 44, arc: 1.1, dmg: 17, kb: -320, stun: 0.4, extra: { wet: 3, root: 1.5 } }),
  },
  inkStorm: {
    id: 'inkStorm', name: 'Tempestade de Tinta', element: 'water', kind: 'buff',
    cooldown: 14, windup: 0.25, active: 0.05, recovery: 0.3,
    move: [0.4, 0.4, 0.6], turn: [0, 0],
    onActiveStart(w, m) {
      illusion(w, m, 34, 3, 2.2);
      for (const t of w.enemiesOf(m)) w.puffInk(t.x, t.y, 26); // cega o inimigo onde ele estiver
    },
  },
  // Tentáculos do Abismo: marca um ponto; um tentáculo gigante irrompe lá e, onde houver cópias suas,
  // irrompem tentáculos menores. As ilusões viram emboscadas.
  abyssTentacles: {
    id: 'abyssTentacles', name: 'Tentáculos do Abismo', element: 'water', kind: 'lob',
    cooldown: 11, windup: 0.35, active: 0.05, recovery: 0.35,
    move: [0.3, 0.3, 0.6], turn: [8, 0], range: 185, radius: 24, flight: 0.65,
    onActiveStart(w, m, a) {
      const ang = Math.atan2(a.point.y - m.y, a.point.x - m.x);
      const d = clamp(Math.hypot(a.point.x - m.x, a.point.y - m.y), 30, this.range);
      const tx = clamp(m.x + Math.cos(ang) * d, 12, WORLD_W - 12), ty = clamp(m.y + Math.sin(ang) * d, 12, WORLD_H - 12);
      w.spawnProjectile({ kind: 'tentacle', big: true, owner: m, lob: true, flat: true, x: tx, y: ty, tx, ty, flight: this.flight, radius: this.radius, dmg: 18 });
      for (const dc of w.decoys.filter((x) => x.owner === m).slice(0, 3)) {
        w.spawnProjectile({ kind: 'tentacle', owner: m, lob: true, flat: true, x: dc.x, y: dc.y, tx: dc.x, ty: dc.y, flight: this.flight, radius: 16, dmg: 8 });
      }
    },
  },
  krakenJet: {
    id: 'krakenJet', name: 'Jato do Kraken', element: 'water', kind: 'dodge',
    cooldown: 2.6, windup: 0, active: 0.32, recovery: 0.1,
    move: [1, 1, 0.7], turn: [0, 0], dash: { speed: 360, invuln: true },
    onActiveStart(w, m, a) { w.puffInk(m.x, m.y, 14); jetDecoy(w, m, a); },
    onActiveTick(w, m) { w.douseArea(m.x, m.y, 6, 6, m); },
  },

  // ───── Mantifolha (planta): ágil, saltos longos e esporos ─────
  leafBlade: {
    id: 'leafBlade', name: 'Lâmina de Folha', element: 'plant', kind: 'projectile',
    cooldown: 0.82, windup: 0.15, active: 0.02, recovery: 0.18,
    move: [0.6, 0.6, 0.85], turn: [9, 0], range: 200, speed: 285,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'seed', tag: 'leafBlade', owner: m, ang: a.aim, speed: 285, r: 3, range: 200, dmg: 7, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 3, aimPoint: a.aimPoint });
    },
  },
  scytheSlash: {
    id: 'scytheSlash', name: 'Foice Verde', element: 'plant', kind: 'melee',
    cooldown: 0.85, windup: 0.14, active: 0.1, recovery: 0.22,
    move: [0.3, 1, 0.4], turn: [10, 2], range: 26,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 110; m.ky += Math.sin(a.aim) * 110; },
    ...melee({ reach: 26, arc: 2.1, dmg: 12, kb: 110, stun: 0.2, extra: {} }),
  },
  sporePuff: {
    id: 'sporePuff', name: 'Nuvem de Esporos', element: 'plant', kind: 'cone',
    cooldown: 6, windup: 0.3, active: 0.6, recovery: 0.3, superArmor: true,
    move: [0.25, 0.4, 0.5], turn: [6, 1.4], range: 58, len: 58, half: 0.6,
    onActiveTick(w, m, a, dt) { ABILITIES.sporePuff.sporeTick.call(this, w, m, a, dt, 1.4, 1.0); },
    // Pequeno dano contínuo e enraíza quem entra no cone (uma vez por uso).
    sporeTick(w, m, a, dt, dmg, rootT) {
      if (!every(a, dt, 0.1)) return;
      for (const t of w.enemiesOf(m)) {
        if (!inCone(m.x, m.y, a.aim, this.len, this.half, t.x, t.y, t.r) || !w.los(m.x, m.y, t.x, t.y, { noSteam: true })) continue;
        w.damage(t, dmg, m, { dot: true, element: 'plant', tag: this.id, push: 12, ang: a.aim });
        if (!a.hit.has(t.id)) { a.hit.add(t.id); w.applyRoot(t, rootT); }
      }
    },
  },
  longLeap: {
    id: 'longLeap', name: 'Salto Longo', element: 'plant', kind: 'dash', leap: true,
    cooldown: 5.5, windup: 0.22, active: 0.46, recovery: 0.2,
    move: [0.1, 1, 0.4], turn: [8, 0], range: 155, minRange: 30, landR: 24, dash: { speed: 335, invuln: true },
    onEnd(w, m) {
      w.emit({ type: 'leapLand', x: m.x, y: m.y, r: 24, m });
      for (const t of w.enemiesOf(m)) if (Math.hypot(t.x - m.x, t.y - m.y) < 24 + t.r) w.damage(t, 10, m, { tag: 'longLeap', kb: 170, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.25, element: 'plant', leap: true });
      w.popDecoysIn(m.x, m.y, 24, m.team);
      w.sprout(m.x, m.y, T.GRASS, m);
    },
  },
  wingDash: {
    id: 'wingDash', name: 'Voo Curto', element: 'plant', kind: 'dodge',
    cooldown: 2.8, windup: 0, active: 0.22, recovery: 0.1,
    move: [1, 1, 0.6], turn: [0, 0], dash: { speed: 300, invuln: true },
  },
  // ───── Silvamante: salto celeste, tempestade de lâminas ─────
  mantisClaw: {
    id: 'mantisClaw', name: 'Garras de Mantis', element: 'plant', kind: 'melee',
    cooldown: 0.95, windup: 0.17, active: 0.11, recovery: 0.24,
    move: [0.3, 0.8, 0.4], turn: [10, 2], range: 32,
    ...melee({ reach: 32, arc: 2.3, dmg: 16, kb: -160, stun: 0.3, extra: {} }),
  },
  bladeStorm: {
    id: 'bladeStorm', name: 'Tempestade de Lâminas', element: 'plant', kind: 'projectile',
    cooldown: 1.3, windup: 0.22, active: 0.02, recovery: 0.24,
    move: [0.5, 0.5, 0.8], turn: [8, 0], range: 190, speed: 270,
    onActiveStart(w, m, a) {
      for (const off of [-0.24, 0, 0.24]) {
        const ang = a.aim + off;
        w.spawnProjectile({ kind: 'seed', tag: 'bladeStorm', owner: m, ang, speed: 270, r: 3, range: 190, dmg: 7, x: m.x + Math.cos(ang) * (m.r + 2), y: m.y + Math.sin(ang) * (m.r + 2) - 3 });
      }
    },
  },
  sporeStorm: {
    id: 'sporeStorm', name: 'Tempestade de Esporos', element: 'plant', kind: 'cone',
    cooldown: 9, windup: 0.4, active: 0.9, recovery: 0.35, superArmor: true,
    move: [0.15, 0.3, 0.5], turn: [6, 1.2], range: 80, len: 80, half: 0.8,
    onActiveTick(w, m, a, dt) { ABILITIES.sporePuff.sporeTick.call(this, w, m, a, dt, 2.4, 1.4); },
  },
  skyLeap: {
    id: 'skyLeap', name: 'Salto Celeste', element: 'plant', kind: 'dash', leap: true,
    cooldown: 8, windup: 0.3, active: 0.6, recovery: 0.3, superArmor: true,
    move: [0.1, 1, 0.3], turn: [8, 0], range: 250, minRange: 40, landR: 34, dash: { speed: 420, invuln: true },
    onEnd(w, m) {
      w.emit({ type: 'rootsErupt', x: m.x, y: m.y, r: 34, src: m });
      for (const t of w.enemiesOf(m)) {
        if (Math.hypot(t.x - m.x, t.y - m.y) > 34 + t.r) continue;
        w.damage(t, 18, m, { tag: 'skyLeap', kb: 270, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.3, element: 'plant', root: 1.3, leap: true });
      }
      w.popDecoysIn(m.x, m.y, 34, m.team);
      for (let k = 0; k < 24; k++) {
        const an = w.rng() * 6.28, d = w.rng() * 34;
        w.terrain.growRoots(w.terrain.at(m.x + Math.cos(an) * d, m.y + Math.sin(an) * d), 4);
      }
    },
  },
};

// Variações de habilidades existentes, com nomes próprios.
ABILITIES.lavaBite = { ...ABILITIES.volcanicClaw, id: 'lavaBite', name: 'Mordida de Lava', heat: 0 };
ABILITIES.quillStorm = {
  ...ABILITIES.infernoBreath, id: 'quillStorm', name: 'Tempestade de Espinhos', len: 78, range: 78, heat: 0,
  onActiveTick(w, m, a, dt) { ABILITIES.flameWave.coneTick.call(this, w, m, a, dt, 1.8); },
};
// Ilusão de Tinta do Leviapus: três cópias que atiram e camuflagem um pouco maior.
ABILITIES.krakenIllusion = {
  ...ABILITIES.inkCloud, id: 'krakenIllusion', name: 'Ilusão de Tinta', cooldown: 12,
  onActiveStart(w, m) { illusion(w, m, 32, 3, 1.8); },
};
ABILITIES.volcanoRush = {
  ...ABILITIES.blazeRush, id: 'volcanoRush', name: 'Investida Vulcânica', cooldown: 9, dash: { speed: 380 }, range: 150, recovery: 0.5,
  onEnd(w, m, a) { eruption(w, m, a, 30, 12); },
};

// Contato de investida: acerta cada alvo uma vez por uso.
function dashHit(w, m, a, { dmg, kb, stun, burn, tag }) {
  for (const t of w.enemiesOf(m)) {
    if (a.hit.has(t.id) || Math.hypot(t.x - m.x, t.y - m.y) > m.r + t.r + 3) continue;
    a.hit.add(t.id);
    w.damage(t, dmg, m, { tag, kb, ang: a.aim, stun, burn, element: 'fire' });
  }
  w.popDecoysIn(m.x, m.y, m.r + 3, m.team);
}

// Explosão no fim da investida. Quem já levou a investida recebe metade (não é um segundo golpe cheio).
function eruption(w, m, a, R, dmg) {
  w.emit({ type: 'explosion', x: m.x, y: m.y, r: R, src: m });
  for (const t of w.enemiesOf(m)) {
    const d = Math.hypot(t.x - m.x, t.y - m.y);
    if (d > R + t.r) continue;
    const k = a?.hit.has(t.id) ? 0.5 : 1;
    w.damage(t, dmg * k, m, { tag: 'erupcao', kb: 230, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.25 * k, burn: 1.4, element: 'fire', proj: true });
  }
  w.popDecoysIn(m.x, m.y, R, m.team);
  w.igniteArea(m.x, m.y, 18, 2, m);
}

// Semente de sentinela: voa em arco até o ponto mirado (marcado no chão) e brota lá.
function sentryLob(w, m, a, ab, kind, life) {
  const ang = Math.atan2(a.point.y - m.y, a.point.x - m.x);
  const d = clamp(Math.hypot(a.point.x - m.x, a.point.y - m.y), 24, ab.range);
  const tx = clamp(m.x + Math.cos(ang) * d, 12, WORLD_W - 12), ty = clamp(m.y + Math.sin(ang) * d, 12, WORLD_H - 12);
  w.spawnProjectile({ kind: 'sentrySeed', sentryKind: kind, life, owner: m, lob: true, x: m.x, y: m.y - 6, tx, ty, flight: ab.flight, radius: ab.radius, dmg: 0 });
}

// Ilusão: nuvem de tinta, cópias correndo em leque e camuflagem até o próximo ataque.
function illusion(w, m, inkR, n, cloak) {
  w.puffInk(m.x, m.y, inkR);
  const base = Math.hypot(m.vx, m.vy) > 10 ? Math.atan2(m.vy, m.vx) : m.facing;
  for (let k = 0; k < n; k++) spawnDecoy(w, m, base + (k - (n - 1) / 2) * 1.6 + (n === 1 ? 0 : 0), SIG.decoy.life + 0.4);
  m.status.cloak = cloak;
  w.emit({ type: 'cloak', m, x: m.x, y: m.y });
}

// Esquiva a jato: a cópia segue a direção em que você andava (ou o oposto da esquiva, se estava parado).
function jetDecoy(w, m, a) {
  const moving = Math.hypot(m.vx, m.vy) > 20;
  const ang = moving ? Math.atan2(m.vy, m.vx) : a.dir + Math.PI;
  const d = spawnDecoy(w, m, Math.abs(angleDiff(ang, a.dir)) < 0.5 ? ang + Math.PI * 0.6 : ang);
  d.life = d.max = 1.8;
}

// Descrições curtas (bestiário e HUD).
const DESC = {
  ember: 'Projétil de fogo; queima o alvo e incendeia onde cai.',
  claw: 'Golpe corpo a corpo com avanço; deixa o alvo em chamas.',
  flameWave: 'Cone de fogo canalizado; incendeia a vegetação à frente.',
  fireDash: 'Investida que deixa um rastro de chão em brasa.',
  meteor: 'Bola de fogo em arco com área marcada no chão. 2 cargas.',
  hop: 'Salto lateral com invulnerabilidade breve.',
  waterBolt: 'Jato que molha o alvo e apaga o fogo pelo caminho.',
  headbutt: 'Cabeçada com empurrão forte; molha o alvo.',
  hydroBeam: 'Raio d’água contínuo que empurra e apaga o terreno.',
  whirlpool: 'Redemoinho móvel: você anda girando, arrasta quem estiver perto em volta e cospe todos no fim.',
  shellRoll: 'Rolagem no casco com invulnerabilidade.',
  seedShot: 'Semente afiada; onde cai, brota grama.',
  vineWhip: 'Chicote que puxa o inimigo para perto.',
  rootSnare: 'Raízes brotam na área marcada e prendem quem estiver lá.',
  overgrowth: 'Faz crescer grama ao redor e cura a planta.',
  leafDash: 'Mergulha na terra (invulnerável); só uma flor vermelha se move na superfície.',
  magmaBall: 'Projétil pesado que deixa uma poça de lava ardendo.',
  volcanicClaw: 'Garra mais forte que incendeia um arco de chão à frente.',
  infernoBreath: 'Cone de fogo maior, mais longo e mais quente.',
  eruptionDash: 'Investida que explode em área ao terminar.',
  heavyHop: 'Esquiva mais lenta de recarregar (pouca defesa).',
  abyssBolt: 'Jato mais rápido e de maior alcance.',
  abyssPincer: 'Pinçada que empurra longe e encharca.',
  tidalWave: 'ONDA que cresce enquanto avança, CARREGA quem pegar (até contra paredes) e arrebenta no fim.',
  bubbleShield: 'Bolha que absorve 30 de dano por 5 s.',
  abyssCurrent: 'Esquiva longa que molha o caminho.',
  thornShot: 'Espinho que faz brotar espinheiro onde cai.',
  ancientWhip: 'Açoite de longo alcance que puxa com força.',
  ancientRoots: 'Raízes maiores e mais duradouras (recarga longa).',
  ancientGrove: 'Ergue uma barreira de mata fechada e espalha vegetação.',
  barkStep: 'Afunda e anda como uma arvorezinha (invulnerável); ao brotar, empurra quem estiver colado e espalha grama.',
  shellGuard: 'BLOQUEIO de 0,55 s: reduz o dano em 85%, devolve projéteis e contra-ataca quem bate de perto.',
  abyssGuard: 'Bloqueio mais longo; bloquear um golpe dá uma bolha que absorve 25 de dano.',
  plantSentry: 'Planta uma FLOR SENTINELA (11 s): atira sementes de longe (alcance 150, deixam LENTO), MORDE quem encosta e cura o time por perto. 2 cargas, até 2 em campo.',
  ancientSentry: 'GUARDIÃO ANCESTRAL: flor carnívora maior (alcance 175), espinhos que deixam lento, mordida forte e cura maior. Máx. 2.',
  krakenJet: 'Esquiva a jato que deixa uma cópia de tinta para enganar o inimigo.',
  bubbleTrap: 'Bolha em arco, rápida: estoura no círculo marcado e PRENDE quem estiver dentro por ~1 s.',
  abyssTentacles: 'Um tentáculo gigante irrompe no ponto marcado (ergue e molha); onde houver cópias suas, irrompem tentáculos menores.',
};
for (const [id, d] of Object.entries(DESC)) ABILITIES[id].desc = d;

ABILITIES.quillShot.desc = 'Espinhos em brasa; queimam e incendeiam onde caem.';
ABILITIES.prick.desc = 'Espetada rápida que deixa o alvo em chamas.';
ABILITIES.quillBurst.desc = 'Eriça os espinhos num leque curto: empurra e queima.';
ABILITIES.blazeRush.desc = 'Investida que deixa um LARGO rastro de fogo no chão.';
ABILITIES.curlRoll.desc = 'Esquiva enrolado em bola, deixando brasas.';
ABILITIES.magmaQuill.desc = 'Espinho de magma; deixa lava ardendo onde cai.';
ABILITIES.burrow.desc = 'Mergulha na terra (invulnerável), persegue o alvo e irrompe embaixo dele, LEVANTANDO-O. Sai em disparada.';
ABILITIES.lavaBite.desc = 'Mordida que incendeia um arco de chão à frente.';
ABILITIES.quillStorm.desc = 'Cone enorme de espinhos incandescentes.';
ABILITIES.volcanoRush.desc = 'Investida com rastro de fogo que explode ao terminar.';
ABILITIES.bubbleShot.desc = 'Bolhas que molham o alvo e apagam o fogo.';
ABILITIES.tentacleSlap.desc = 'Chicotada larga com tentáculos; encharca.';
ABILITIES.inkCloud.desc = 'Nuvem de tinta + 2 CÓPIAS falsas; você fica camuflado até atacar.';
ABILITIES.krakenIllusion.desc = 'Nuvem de tinta + 3 CÓPIAS que correm e atiram; você fica camuflado até atacar.';
ABILITIES.jetDash.desc = 'Esquiva a jato que deixa uma cópia sua seguindo o caminho antigo.';
ABILITIES.tentacleSweep.desc = 'Varredura ampla que empurra longe.';
ABILITIES.krakenGrip.desc = 'Agarra o inimigo, puxa e o prende por 1,5 s.';
ABILITIES.inkStorm.desc = 'Tinta sobre você e o inimigo, 3 cópias e camuflagem mais longa.';
ABILITIES.leafBlade.desc = 'Lâmina de folha veloz; brota grama onde cai.';
ABILITIES.scytheSlash.desc = 'Foice rápida com avanço.';
ABILITIES.sporePuff.desc = 'Cone de esporos que enraíza quem entra.';
ABILITIES.longLeap.desc = 'SALTO LONGO até onde está a mira (alcance máximo), por cima de obstáculos; aterrissa causando dano.';
ABILITIES.wingDash.desc = 'Esquiva curta batendo as asas.';
ABILITIES.mantisClaw.desc = 'Garras longas que puxam o alvo para perto.';
ABILITIES.bladeStorm.desc = 'Leque de três lâminas de folha.';
ABILITIES.sporeStorm.desc = 'Tempestade de esporos: grande cone que enraíza.';
ABILITIES.skyLeap.desc = 'Salto celeste até onde está a mira (alcance enorme); ao cair, enraíza e arremessa quem estiver perto.';

// ───────────── Golpes básicos (combate focado em skills) ─────────────
// Cada monstro tem um golpe próprio no botão esquerdo, de alcance curto ou médio, com impacto. Nenhum é um tiro
// longo repetido: quem quer dano de longe precisa das habilidades. Acertar o básico acelera as habilidades (Ritmo).

// Chicote: golpe em linha estreita e comprida (usa o mesmo corpo a corpo, com arco fino).
function lineGround(w, m, a, reach, fn) {
  for (let s = m.r; s <= m.r + reach; s += 6) fn(m.x + Math.cos(a.aim) * s, m.y + Math.sin(a.aim) * s);
}
// Projétil em arco que estoura numa área pequena (bolha d'água ou semente que vira raízes).
function lobBasic(kind) {
  return function onActiveStart(w, m, a) {
    const p = a.point || a.aimPoint || { x: m.x + Math.cos(a.aim) * this.range, y: m.y + Math.sin(a.aim) * this.range };
    const ang = Math.atan2(p.y - m.y, p.x - m.x);
    const d = clamp(Math.hypot(p.x - m.x, p.y - m.y), 30, this.range);
    const tx = clamp(m.x + Math.cos(ang) * d, 10, WORLD_W - 10), ty = clamp(m.y + Math.sin(ang) * d, 10, WORLD_H - 10);
    w.spawnProjectile({ kind, tag: this.id, owner: m, lob: true, x: m.x, y: m.y - 6, tx, ty, flight: this.flight, radius: this.radius, dmg: this.dmg, rootTiles: this.rootTiles, slow: this.slow });
  };
}
// Leque de espinhos de curto alcance (espingarda).
function fan(n, spread, range, dmg, speed = 270) {
  return function onActiveStart(w, m, a) {
    for (let k = 0; k < n; k++) {
      const ang = a.aim + (n === 1 ? 0 : (k / (n - 1) - 0.5) * spread * 2);
      w.spawnProjectile({ kind: 'ember', tag: this.id, owner: m, ang, speed, r: 2, range, dmg, x: m.x + Math.cos(ang) * (m.r + 2), y: m.y + Math.sin(ang) * (m.r + 2) - 3, minorShot: k > 0 });
    }
  };
}

Object.assign(ABILITIES, {
  // Brasalisco: chicote de brasa que deixa o chão em brasa ao longo da linha.
  emberLash: {
    id: 'emberLash', name: 'Chicote de Brasa', element: 'fire', kind: 'melee', heat: 4, basic: true,
    cooldown: 1.15, windup: 0.18, active: 0.1, recovery: 0.24,
    move: [0.5, 0.7, 0.8], turn: [10, 1], range: 58,
    ...melee({ reach: 58, arc: 0.6, dmg: 12.5, kb: 90, stun: 0.12, extra: { burn: 1.2 } }),
    onActiveStart(w, m, a) { lineGround(w, m, a, 58, (x, y) => w.igniteTile(w.terrain.at(x, y), 2.2, m)); },
    desc: 'CHICOTE DE BRASA: golpe em linha (alcance médio) que queima e deixa o chão em brasa.',
  },
  magmaLash: {
    id: 'magmaLash', name: 'Chicote de Magma', element: 'fire', kind: 'melee', heat: 5, basic: true,
    cooldown: 1.12, windup: 0.2, active: 0.12, recovery: 0.28,
    move: [0.5, 0.7, 0.8], turn: [10, 1], range: 66,
    ...melee({ reach: 66, arc: 0.7, dmg: 17, kb: 120, stun: 0.15, extra: { burn: 1.6 } }),
    onActiveStart(w, m, a) { lineGround(w, m, a, 66, (x, y) => w.igniteTile(w.terrain.at(x, y), 3.2, m)); },
    desc: 'CHICOTE DE MAGMA: linha longa de lava que queima e deixa o chão ardendo.',
  },
  // Hidrocasco: pancada de casco que solta uma onda de choque curta e larga (empurra e molha).
  // Hidrocasco: pancada de casco que solta uma onda curta: atravessa alvos, empurra e apaga o fogo no caminho.
  shockWave: {
    id: 'shockWave', name: 'Onda de Choque', element: 'water', kind: 'projectile', basic: true, wave: true,
    cooldown: 1.3, windup: 0.2, active: 0.05, recovery: 0.26,
    move: [0.4, 0.7, 0.7], turn: [9, 0], range: 95, speed: 230,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'wave', small: true, tag: this.id, owner: m, ang: a.aim, speed: 230, r: 8, r0: 8, rMax: 11, carryMax: 0, range: 95, dmg: 11, kb: 150, stun: 0.12, pierce: true, x: m.x + Math.cos(a.aim) * (m.r + 4), y: m.y + Math.sin(a.aim) * (m.r + 4), aimPoint: a.aimPoint });
    },
    desc: 'ONDA DE CHOQUE: onda curta que atravessa todos no caminho, EMPURRA, molha e apaga o fogo.',
  },
  abyssShock: {
    id: 'abyssShock', name: 'Maremoto', element: 'water', kind: 'projectile', basic: true, wave: true,
    cooldown: 1.4, windup: 0.22, active: 0.05, recovery: 0.28,
    move: [0.4, 0.7, 0.7], turn: [9, 0], range: 110, speed: 235,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'wave', small: true, tag: this.id, owner: m, ang: a.aim, speed: 235, r: 10, r0: 10, rMax: 14, carryMax: 0, range: 110, dmg: 14, kb: 190, stun: 0.15, pierce: true, x: m.x + Math.cos(a.aim) * (m.r + 4), y: m.y + Math.sin(a.aim) * (m.r + 4), aimPoint: a.aimPoint });
    },
    desc: 'MAREMOTO: onda maior que atravessa, empurra longe e apaga o fogo.',
  },
  // Brotossauro: semente em arco que estoura e cobre o chão de raízes (atrasa quem não é planta).
  burstSeed: {
    id: 'burstSeed', name: 'Semente Explosiva', element: 'plant', kind: 'lob', basic: true,
    cooldown: 1.5, windup: 0.22, active: 0.05, recovery: 0.25,
    move: [0.5, 0.5, 0.8], turn: [8, 0], range: 160, radius: 18, flight: 0.5, dmg: 9, rootTiles: 3, slow: [1.4, 0.25],
    onActiveStart: lobBasic('splashSeed'),
    desc: 'SEMENTE DE SEIVA: arco até a mira; estoura em área, deixa raízes e cobre o alvo de seiva (LENTO 25% por 1,4 s).',
  },
  ancientSeed: {
    id: 'ancientSeed', name: 'Semente Ancestral', element: 'plant', kind: 'lob', basic: true,
    cooldown: 1.4, windup: 0.24, active: 0.05, recovery: 0.26,
    move: [0.5, 0.5, 0.8], turn: [8, 0], range: 170, radius: 24, flight: 0.52, dmg: 16.5, rootTiles: 4, slow: [1.8, 0.35],
    onActiveStart: lobBasic('splashSeed'),
    desc: 'SEMENTE ANCESTRAL: estouro maior, raízes e seiva grossa (LENTO 35% por 1,8 s).',
  },
  // Ouriflama: leque de espinhos em brasa de perto (espingarda).
  quillFan: {
    id: 'quillFan', name: 'Leque de Espinhos', element: 'fire', kind: 'projectile', basic: true,
    cooldown: 1.1, windup: 0.16, active: 0.02, recovery: 0.2,
    move: [0.6, 0.6, 0.85], turn: [9, 0], range: 100, speed: 270,
    onActiveStart: fan(3, 0.24, 90, 2.9),
    desc: 'LEQUE DE ESPINHOS: 3 espinhos em brasa de perto; quanto mais perto, mais acertam.',
  },
  magmaFan: {
    id: 'magmaFan', name: 'Leque de Magma', element: 'fire', kind: 'projectile', basic: true,
    cooldown: 1.2, windup: 0.18, active: 0.02, recovery: 0.22,
    move: [0.6, 0.6, 0.85], turn: [9, 0], range: 112, speed: 280,
    onActiveStart: fan(5, 0.32, 112, 2.8),
    desc: 'LEQUE DE MAGMA: 5 espinhos de magma em leque curto.',
  },
  // Gotapus: bolha lenta em arco que estoura, molha e apaga o fogo.
  bounceBubble: {
    id: 'bounceBubble', name: 'Bolha Saltitante', element: 'water', kind: 'lob', basic: true,
    cooldown: 1.35, windup: 0.2, active: 0.05, recovery: 0.24,
    move: [0.6, 0.6, 0.85], turn: [8, 0], range: 150, radius: 20, flight: 0.55, dmg: 8,
    onActiveStart: lobBasic('splashBubble'),
    desc: 'BOLHA SALTITANTE: bolha em arco até a mira; estoura em área, molha e apaga o fogo.',
  },
  krakenBubble: {
    id: 'krakenBubble', name: 'Bolha do Kraken', element: 'water', kind: 'lob', basic: true,
    cooldown: 1.65, windup: 0.22, active: 0.05, recovery: 0.26,
    move: [0.6, 0.6, 0.85], turn: [8, 0], range: 160, radius: 22, flight: 0.58, dmg: 8,
    onActiveStart: lobBasic('splashBubble'),
    desc: 'BOLHA DO KRAKEN: estouro largo que molha e empurra.',
  },
  // Mantifolha: combo rápido de foices com avanço (corpo a corpo puro).
  twinScythe: {
    id: 'twinScythe', name: 'Foice Dupla', element: 'plant', kind: 'melee', basic: true,
    cooldown: 0.85, windup: 0.12, active: 0.1, recovery: 0.18,
    move: [0.6, 1, 0.8], turn: [12, 2], range: 34,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 150; m.ky += Math.sin(a.aim) * 150; },
    ...melee({ reach: 34, arc: 2.2, dmg: 8.5, kb: 60, stun: 0.12, extra: {} }),
    desc: 'FOICE DUPLA: golpe rápido com avanço; ótimo para acumular Marcas.',
  },
  mantisFlurry: {
    id: 'mantisFlurry', name: 'Rajada de Foices', element: 'plant', kind: 'melee', basic: true,
    cooldown: 0.8, windup: 0.13, active: 0.12, recovery: 0.2,
    move: [0.6, 1, 0.8], turn: [12, 2], range: 40,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 170; m.ky += Math.sin(a.aim) * 170; },
    ...melee({ reach: 40, arc: 2.4, dmg: 11, kb: 70, stun: 0.14, extra: {} }),
    desc: 'RAJADA DE FOICES: avanço com foices largas.',
  },
});

// ───────────── Brasalisco Ascendido: Bola Infernal ─────────────
ABILITIES.infernoOrb = {
  id: 'infernoOrb', name: 'Bola Infernal', element: 'fire', kind: 'projectile', heat: 25,
  cooldown: 8.5, windup: 0.45, active: 0.05, recovery: 0.4, superArmor: true,
  move: [0.2, 0.2, 0.6], turn: [5, 0], range: 240, speed: 210,
  onActiveStart(w, m, a) {
    w.spawnProjectile({ kind: 'inferno', owner: m, ang: a.aim, speed: 210, r: 8, r0: 8, rMax: 15, range: 240, dmg: 18, x: m.x + Math.cos(a.aim) * (m.r + 6), y: m.y + Math.sin(a.aim) * (m.r + 6) - 3, aimPoint: a.aimPoint });
  },
  desc: 'BOLA INFERNAL: bola de fogo enorme que cresce em voo, deixa rastro de chamas e EXPLODE em área ao bater.',
};

// ───────────── Linha corpo a corpo (Terra): Pugilar e Lutapacho ─────────────
// Lutadores: golpe rápido no botão esquerdo, golpe pesado no direito; as skills aproximam, afastam e punem.
// Elemento Terra: neutro no triângulo (sem vantagem nem fraqueza).
const lunge = (k) => function onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * k; m.ky += Math.sin(a.aim) * k; };
function landHit(r, dmg, tag) {
  return function onEnd(w, m) {
    w.emit({ type: 'leapLand', x: m.x, y: m.y, r, m });
    for (const t of w.enemiesOf(m)) if (Math.hypot(t.x - m.x, t.y - m.y) < r + t.r) w.damage(t, dmg, m, { tag, kb: 200, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.3, element: 'earth', leap: true });
    w.popDecoysIn(m.x, m.y, r, m.team);
  };
}
Object.assign(ABILITIES, {
  jab: {
    id: 'jab', name: 'Jab', element: 'earth', kind: 'melee', basic: true,
    cooldown: 0.45, windup: 0.08, active: 0.08, recovery: 0.14,
    move: [0.7, 1, 0.9], turn: [12, 2], range: 20,
    onActiveStart: lunge(90),
    ...melee({ reach: 20, arc: 1.4, dmg: 5.5, kb: 40, stun: 0.08, extra: {} }),
    desc: 'JAB: soco rápido com passo à frente. Encadeia COMBO.',
  },
  cross: {
    id: 'cross', name: 'Direto', element: 'earth', kind: 'melee', superArmor: true,
    cooldown: 1.4, windup: 0.26, active: 0.1, recovery: 0.3,
    move: [0.3, 1, 0.4], turn: [10, 1], range: 24,
    onActiveStart: lunge(170),
    ...melee({ reach: 24, arc: 1.2, dmg: 15, kb: 240, stun: 0.3, extra: {} }),
    desc: 'DIRETO: soco pesado que avança, ARREMESSA e atordoa.',
  },
  kangarooHop: {
    id: 'kangarooHop', name: 'Salto Canguru', element: 'earth', kind: 'dash', leap: true,
    cooldown: 8, windup: 0.18, active: 0.36, recovery: 0.2,
    move: [0.1, 1, 0.4], turn: [8, 0], range: 120, minRange: 30, landR: 24, dash: { speed: 333, invuln: true },
    onEnd: landHit(24, 11, 'kangarooHop'),
    desc: 'SALTO CANGURU: pulo até a mira (por cima de tudo); cai com um soco que atordoa.',
  },
  tailSweep: {
    id: 'tailSweep', name: 'Rabada', element: 'earth', kind: 'melee', superArmor: true,
    cooldown: 9, windup: 0.22, active: 0.14, recovery: 0.3,
    move: [0.2, 0.6, 0.4], turn: [0, 0], range: 32,
    ...melee({ reach: 32, arc: 6.3, dmg: 10, kb: 250, stun: 0.25, extra: {} }),
    desc: 'RABADA: giro com a cauda que acerta TODOS em volta e empurra longe.',
  },
  counterGuard: {
    id: 'counterGuard', name: 'Contra-Golpe', element: 'earth', kind: 'guard',
    cooldown: 8, windup: 0, active: 0.5, recovery: 0.3,
    move: [0.3, 0.3, 0.6], turn: [0, 0], counter: { dmg: 16, element: 'earth', tag: 'contraGolpe', kb: 300, stun: 0.45 },
    desc: 'CONTRA-GOLPE: guarda alta. Bloqueia e, se baterem de perto, devolve um soco que atordoa.',
  },
  bobWeave: {
    id: 'bobWeave', name: 'Gingado', element: 'earth', kind: 'dodge',
    cooldown: 2.4, windup: 0, active: 0.18, recovery: 0.08,
    move: [1, 1, 0.7], turn: [0, 0], dash: { speed: 340, invuln: true },
    desc: 'Esquiva curta e rápida de boxeador.',
  },
  armoredJab: {
    id: 'armoredJab', name: 'Soco Blindado', element: 'earth', kind: 'melee', basic: true,
    cooldown: 0.55, windup: 0.1, active: 0.1, recovery: 0.16,
    move: [0.6, 1, 0.85], turn: [11, 2], range: 24,
    onActiveStart: lunge(90),
    ...melee({ reach: 24, arc: 1.5, dmg: 10, kb: 60, stun: 0.1, extra: {} }),
    desc: 'SOCO BLINDADO: soco rápido de couraça. Encadeia COMBO.',
  },
  clawRip: {
    id: 'clawRip', name: 'Garra Rasgante', element: 'earth', kind: 'melee', superArmor: true,
    cooldown: 1.5, windup: 0.3, active: 0.12, recovery: 0.32,
    move: [0.3, 1, 0.4], turn: [10, 1], range: 30,
    onActiveStart: lunge(160),
    ...melee({ reach: 30, arc: 1.6, dmg: 19, kb: 250, stun: 0.35, extra: {} }),
    desc: 'GARRA RASGANTE: garrada pesada que arremessa e atordoa.',
  },
  rockThrow: {
    id: 'rockThrow', name: 'Arremesso de Pedra', element: 'earth', kind: 'projectile', superArmor: true,
    cooldown: 9, windup: 0.55, active: 0.05, recovery: 0.35,
    move: [0.3, 0.3, 0.7], turn: [6, 0], range: 230, speed: 250,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'rock', owner: m, ang: a.aim, speed: 240, r: 9, range: 230, dmg: 16, x: m.x + Math.cos(a.aim) * (m.r + 4), y: m.y + Math.sin(a.aim) * (m.r + 4) - 10, aimPoint: a.aimPoint });
    },
    desc: 'ARREMESSO DE PEDRA: arranca uma pedra do chão e arremessa. Quem for atingido fica ATORDOADO.',
  },
  // Tremor: salta até a mira e cai socando o chão (aproxima o lutador lento e atordoa todos em volta).
  quakeSlam: {
    id: 'quakeSlam', name: 'Tremor', element: 'earth', kind: 'dash', leap: true, superArmor: true,
    cooldown: 11, windup: 0.3, active: 0.42, recovery: 0.4,
    move: [0.1, 1, 0.3], turn: [8, 0], range: 130, minRange: 30, landR: 40, dash: { speed: 310, invuln: true },
    onEnd(w, m) {
      w.emit({ type: 'quake', m, x: m.x, y: m.y, r: 44 });
      for (const t of w.enemiesOf(m)) if (Math.hypot(t.x - m.x, t.y - m.y) < 44 + t.r) w.damage(t, 14, m, { tag: 'quakeSlam', kb: 220, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.45, element: 'earth', leap: true });
      w.popDecoysIn(m.x, m.y, 44, m.team);
    },
    desc: 'TREMOR: salta até a mira e cai socando o chão; todos em volta são arremessados e atordoados.',
  },
  armorGuard: {
    id: 'armorGuard', name: 'Couraça', element: 'earth', kind: 'guard',
    cooldown: 8, windup: 0, active: 0.75, recovery: 0.32,
    move: [0.2, 0.2, 0.6], turn: [0, 0], counter: { dmg: 20, element: 'earth', tag: 'contraGolpe', kb: 320, stun: 0.5 },
    desc: 'COURAÇA: fecha a carapaça. Bloqueia e contra-ataca quem bater de perto.',
  },
  armorRoll: {
    id: 'armorRoll', name: 'Rolagem Blindada', element: 'earth', kind: 'dodge',
    cooldown: 3, windup: 0, active: 0.3, recovery: 0.1,
    move: [1, 1, 0.6], turn: [0, 0], dash: { speed: 300, invuln: true },
    desc: 'Enrola-se como um tatu e rola para longe.',
  },
});


// Casca Viva do Brotossauro: veste você e os aliados no alcance com uma casca de raízes por alguns segundos:
// REDUÇÃO DE DANO + CURA CONTÍNUA (mais forte no parceiro do que em você — no 1v1 a planta não fica imortal).
function barkUp(w, m, B) {
  const allies = w.alliesOf(m).filter((t) => t.alive && t.onField && Math.hypot(t.x - m.x, t.y - m.y) <= B.range + t.r);
  Elec.applyBark(w, m, B.time, B.self.dr, B.self.regen);
  w.emit({ type: 'barkUp', m, x: m.x, y: m.y, self: true });
  for (const t of allies) {
    Elec.applyBark(w, t, B.time, B.ally.dr, B.ally.regen);
    w.heal(t, B.ally.heal);
    w.emit({ type: 'barkUp', m: t, src: m, x: t.x, y: t.y, x0: m.x, y0: m.y });
  }
  w.emit({ type: 'lifePulse', m, x: m.x, y: m.y, r: 26 });
}

// ───────────── Brotossauro: suporte (F) ─────────────
Object.assign(ABILITIES, {
  barkGuard: {
    id: 'barkGuard', name: 'Casca Viva', element: 'plant', kind: 'buff', support: true,
    cooldown: 11, windup: 0.18, active: 0.12, recovery: 0.25, superArmor: true,
    move: [0.4, 0.4, 0.8], turn: [0, 0], range: 150,
    bark: { range: 150, time: 4, self: { dr: 0.2, regen: 1.5 }, ally: { dr: 0.35, regen: 4, heal: 8 } },
    onActiveStart(w, m) { barkUp(w, m, this.bark); },
    desc: 'CASCA VIVA: veste você e o parceiro (até 150 px) com casca de raízes por 4 s: REDUZ o dano (35% no parceiro, 20% em você) e CURA sem parar.',
  },
  ancientBark: {
    id: 'ancientBark', name: 'Casca da Montanha', element: 'plant', kind: 'buff', support: true,
    cooldown: 11, windup: 0.2, active: 0.12, recovery: 0.28, superArmor: true,
    move: [0.3, 0.3, 0.7], turn: [0, 0], range: 190,
    bark: { range: 190, time: 5, self: { dr: 0.3, regen: 3 }, ally: { dr: 0.4, regen: 5, heal: 12 } },
    onActiveStart(w, m) { barkUp(w, m, this.bark); },
    desc: 'CASCA DA MONTANHA: casca de pedra e raiz por 5 s em você e no parceiro (até 190 px): REDUZ o dano (40% / 30%) e CURA sem parar.',
  },
});
ABILITIES.shellGuard.desc = 'CASCO REFLEXO: bloqueia QUALQUER ataque; devolve projéteis e, se baterem de perto, contra-ataca e molha.';
ABILITIES.abyssGuard.desc = 'CASCO ABISSAL: bloqueia QUALQUER ataque, devolve projéteis, contra-ataca e cria uma bolha protetora.';

// ═════════════ ELÉTRICO: Raiolua → Trovogato ═════════════
// Gato ágil: tiros rápidos, arranhões, raios que caem do céu, puxão que atordoa e investidas que deixam rastro elétrico.
// Cada golpe elétrico que acerta soma uma CARGA (ver electric.js); o E consome as cargas para bater mais forte.
function elecDashHit(w, m, a, { dmg, kb, stun, tag }) {
  for (const t of w.enemiesOf(m)) {
    if (a.hit.has(t.id) || Math.hypot(t.x - m.x, t.y - m.y) > m.r + t.r + 4) continue;
    a.hit.add(t.id);
    w.damage(t, dmg, m, { tag, kb, ang: a.aim, stun, element: 'electric' });
    w.emit({ type: 'zap', x: t.x, y: t.y - 4, x0: m.x, y0: m.y - 4 });
  }
  w.popDecoysIn(m.x, m.y, m.r + 4, m.team);
}
function thunderLob(w, m, a, ab, extra) {
  const p = a.point || a.aimPoint || { x: m.x + Math.cos(a.aim) * ab.range, y: m.y + Math.sin(a.aim) * ab.range };
  const ang = Math.atan2(p.y - m.y, p.x - m.x);
  const d = clamp(Math.hypot(p.x - m.x, p.y - m.y), 20, ab.range);
  const tx = clamp(m.x + Math.cos(ang) * d, 10, WORLD_W - 10), ty = clamp(m.y + Math.sin(ang) * d, 10, WORLD_H - 10);
  w.spawnProjectile({ kind: 'thunder', tag: ab.id, owner: m, lob: true, flat: true, x: tx, y: ty, tx, ty, flight: ab.flight, radius: ab.radius, ...extra });
}
// Descarga em área ao redor: PUXA os inimigos para perto, atordoa e consome as cargas (mais dano e mais atordoamento).
function shockPull(w, m, ab) {
  const n = Elec.spendVolt(w, m);
  const R = ab.radius;
  w.emit({ type: 'shockPull', m, x: m.x, y: m.y, r: R, n, big: !!ab.overload });
  for (const t of w.enemiesOf(m)) {
    const d = Math.hypot(t.x - m.x, t.y - m.y);
    if (d > R + t.r) continue;
    const blocked = isGuarding(t);
    if (!blocked) Elec.pullTo(t, m.x, m.y, m.r + t.r + 4);
    w.damage(t, ab.dmg + ab.perCharge * n, m, { tag: ab.id, element: 'electric', stun: ab.stun + 0.08 * n, noVolt: true, big: n >= 2 });
    w.emit({ type: 'zap', x: t.x, y: t.y - 4, x0: m.x, y0: m.y - 6 });
  }
  w.popDecoysIn(m.x, m.y, R, m.team);
  return n;
}

Object.assign(ABILITIES, {
  // ───── Raiolua (base) ─────
  sparkBall: {
    id: 'sparkBall', name: 'Bola de Raio', element: 'electric', kind: 'projectile', basic: true,
    cooldown: 0.85, windup: 0.13, active: 0.02, recovery: 0.18,
    move: [0.7, 0.7, 0.9], turn: [10, 0], range: 165, speed: 280,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'spark', tag: this.id, owner: m, ang: a.aim, speed: 280, r: 3, range: 165, dmg: 5, stun: 0.05, x: m.x + Math.cos(a.aim) * (m.r + 2), y: m.y + Math.sin(a.aim) * (m.r + 2) - 4, aimPoint: a.aimPoint });
    },
    desc: 'BOLA DE RAIO: tiro rápido e fraco. Cada acerto soma 1 CARGA.',
  },
  scratch: {
    id: 'scratch', name: 'Arranhada', element: 'electric', kind: 'melee',
    cooldown: 0.7, windup: 0.08, active: 0.1, recovery: 0.14,
    move: [0.6, 1, 0.9], turn: [12, 2], range: 18,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 170; m.ky += Math.sin(a.aim) * 170; },
    ...melee({ reach: 18, arc: 2.3, dmg: 9, kb: 70, stun: 0.14, extra: {} }),
    desc: 'ARRANHADA: bote curto e muito rápido com as garras eletrizadas.',
  },
  strike220: {
    id: 'strike220', name: 'Descarga 220V', element: 'electric', kind: 'lob',
    cooldown: 7.5, windup: 0.22, active: 0.05, recovery: 0.22,
    move: [0.6, 0.6, 0.9], turn: [8, 0], range: 210, radius: 26, flight: 0.8,
    onActiveStart(w, m, a) { thunderLob(w, m, a, this, { dmg: 13, stun: 0.3 }); },
    desc: 'DESCARGA 220V: marca o chão e, num instante, um RAIO cai do céu na área: dano alto e atordoa.',
  },
  shock110: {
    id: 'shock110', name: 'Descarga 110V', element: 'electric', kind: 'aoe',
    cooldown: 10, windup: 0.3, active: 0.1, recovery: 0.32, superArmor: true,
    move: [0.3, 0.2, 0.6], turn: [0, 0], range: 62, radius: 62, dmg: 6, perCharge: 2, stun: 0.35,
    onActiveStart(w, m) { shockPull(w, m, this); },
    desc: 'DESCARGA 110V: choque em volta que PUXA os inimigos para perto de você e ATORDOA. Gasta as cargas: +3 de dano e mais atordoamento por carga.',
  },
  boltDash: {
    id: 'boltDash', name: 'Corrente Relâmpago', element: 'electric', kind: 'dash',
    cooldown: 7.5, windup: 0.12, active: 0.28, recovery: 0.22, superArmor: true,
    move: [0.2, 1, 0.4], turn: [10, 0], range: 125, dash: { speed: 440 },
    onActiveTick(w, m, a) {
      Elec.trail(w, m, a, { r: 10, life: 1.8, dps: 4, slow: 0.25, tag: 'rastroRaio' });
      elecDashHit(w, m, a, { dmg: 8, kb: 120, stun: 0.25, tag: this.id });
    },
    desc: 'CORRENTE RELÂMPAGO: dispara como um raio e deixa um CAMINHO ELÉTRICO que dá choque e deixa lento.',
  },
  catLeap: {
    id: 'catLeap', name: 'Pulo do Gato', element: 'electric', kind: 'dodge', hop: true,
    charges: 2, chargeGap: 0.32, cooldown: 3.2, windup: 0, active: 0.2, recovery: 0.06,
    move: [1, 1, 0.85], turn: [0, 0], dash: { speed: 330, invuln: true },
    desc: 'PULO DO GATO: salto ágil e invulnerável. 2 cargas: dá para pular duas vezes seguidas.',
  },

  // ───── Trovogato (evoluído) ─────
  voltSphere: {
    id: 'voltSphere', name: 'Esfera Voltaica', element: 'electric', kind: 'projectile', basic: true,
    cooldown: 0.9, windup: 0.14, active: 0.02, recovery: 0.18,
    move: [0.7, 0.7, 0.9], turn: [10, 0], range: 170, speed: 290,
    onActiveStart(w, m, a) {
      w.spawnProjectile({ kind: 'voltOrb', tag: this.id, owner: m, ang: a.aim, speed: 290, r: 4, range: 170, dmg: 10, stun: 0.08, bounces: 2, bounceR: 130, x: m.x + Math.cos(a.aim) * (m.r + 3), y: m.y + Math.sin(a.aim) * (m.r + 3) - 6, aimPoint: a.aimPoint });
    },
    desc: 'ESFERA VOLTAICA: esfera que RICOCHETEIA entre inimigos (até 2 saltos). Cada acerto soma 1 CARGA.',
  },
  conductClaws: {
    id: 'conductClaws', name: 'Garras Condutoras', element: 'electric', kind: 'melee',
    cooldown: 0.95, windup: 0.1, active: 0.3, recovery: 0.18,
    move: [0.6, 1, 0.9], turn: [12, 4], range: 24, reach: 24, arc: 2.3,
    onActiveStart(w, m, a) { m.kx += Math.cos(a.aim) * 160; m.ky += Math.sin(a.aim) * 160; },
    onActiveTick(w, m, a) {
      const hit = { reach: 24, arc: 2.3, dmg: 7.5, kb: 50, stun: 0.12, extra: {} };
      if (!a.data.s1) { a.data.s1 = true; meleeTick(w, m, a, hit); a.data.first = new Set(a.hit); return; }
      if (a.t >= 0.14 && !a.data.s2) {
        a.data.s2 = true;
        m.kx += Math.cos(a.aim) * 90; m.ky += Math.sin(a.aim) * 90;
        a.hit = new Set();
        meleeTick(w, m, a, { ...hit, dmg: 8.5 });
        // Acertou os dois golpes no mesmo alvo: choque extra.
        for (const id of a.hit) {
          if (!a.data.first.has(id)) continue;
          const t = w.monsters.find((q) => q.id === id);
          if (!t || !t.alive) continue;
          w.emit({ type: 'shockBurst', m: t, x: t.x, y: t.y - 4, src: m });
          w.damage(t, 7, m, { tag: 'garrasCondutoras', element: 'electric', stun: 0.3, kb: 90, ang: a.aim, big: true });
        }
      }
    },
    desc: 'GARRAS CONDUTORAS: dois golpes seguidos; acertar OS DOIS no mesmo alvo libera um choque extra que atordoa.',
  },
  thunderJudgment: {
    id: 'thunderJudgment', name: 'Julgamento do Trovão', element: 'electric', kind: 'lob',
    cooldown: 8, windup: 0.25, active: 0.05, recovery: 0.25,
    move: [0.5, 0.5, 0.9], turn: [8, 0], range: 230, radius: 36, flight: 0.75,
    onActiveStart(w, m, a) { thunderLob(w, m, a, this, { dmg: 22, stun: 0.45, zone: { r: 34, life: 3, dps: 7, slow: 0.35 } }); },
    desc: 'JULGAMENTO DO TROVÃO: raio gigante na área marcada; atordoa e deixa o SOLO ELETRIFICADO por 3 s (choque e lentidão).',
  },
  overloadCore: {
    id: 'overloadCore', name: 'Núcleo de Sobrecarga', element: 'electric', kind: 'aoe', overload: true,
    cooldown: 9.5, windup: 0.3, active: 0.32, recovery: 0.3, superArmor: true,
    move: [0.2, 0.1, 0.6], turn: [0, 0], range: 74, radius: 74, dmg: 9, perCharge: 3, stun: 0.6,
    onActiveStart(w, m, a) { a.data.n = shockPull(w, m, this); },
    onEnd(w, m, a) {
      const n = a.data.n || 0, R = 30 + 8 * n;
      w.emit({ type: 'overload', m, x: m.x, y: m.y, r: R, n });
      for (const t of w.enemiesOf(m)) {
        if (Math.hypot(t.x - m.x, t.y - m.y) > R + t.r) continue;
        w.damage(t, 6 + 3 * n, m, { tag: 'sobrecarga', element: 'electric', kb: 170 + 15 * n, ang: Math.atan2(t.y - m.y, t.x - m.x), noVolt: true, big: true });
      }
      w.popDecoysIn(m.x, m.y, R, m.team);
    },
    desc: 'NÚCLEO DE SOBRECARGA: puxa todos para perto, atordoa e EXPLODE. Cada carga gasta aumenta o dano, o atordoamento e o tamanho da explosão.',
  },
  lightningRupture: {
    id: 'lightningRupture', name: 'Ruptura Relâmpago', element: 'electric', kind: 'dash', ghost: true,
    cooldown: 6.5, windup: 0.1, active: 0.3, recovery: 0.2, superArmor: true,
    move: [0.2, 1, 0.4], turn: [10, 0], range: 140, dash: { speed: 470 },
    onActiveTick(w, m, a) {
      Elec.trail(w, m, a, { r: 12, life: 2.6, dps: 8, slow: 0.32, tag: 'rastroRaio' });
      elecDashHit(w, m, a, { dmg: 12, kb: 0, stun: 0.3, tag: this.id });
    },
    desc: 'RUPTURA RELÂMPAGO: investida que ATRAVESSA os inimigos (fere todos no caminho) e deixa um rastro elétrico.',
  },
  thunderInstinct: {
    id: 'thunderInstinct', name: 'Instinto do Trovão', element: 'electric', kind: 'dodge', hop: true,
    cooldown: 3.8, windup: 0, active: 0.24, recovery: 0.1,
    move: [1, 1, 0.8], turn: [0, 0], dash: { speed: 320, invuln: true },
    onEnd(w, m) {
      w.emit({ type: 'thunderLand', m, x: m.x, y: m.y, r: 36 });
      for (const t of w.enemiesOf(m)) {
        if (Math.hypot(t.x - m.x, t.y - m.y) > 36 + t.r) continue;
        w.damage(t, 8, m, { tag: 'instintoTrovao', element: 'electric', stun: 0.25, kb: 140, ang: Math.atan2(t.y - m.y, t.x - m.x) });
      }
      w.popDecoysIn(m.x, m.y, 36, m.team);
    },
    desc: 'INSTINTO DO TROVÃO: salto evasivo invulnerável; ao aterrissar solta uma descarga que atordoa quem estiver perto.',
  },
});
