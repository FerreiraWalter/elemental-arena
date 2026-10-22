// Efeitos da forja (Brasalinha / Fornalhonte): brasas no chão, pedras em brasa, jato de fogo, bombas e eventos.
import { hash2 } from '../core/math.js';
import { rgba } from './pixel.js';

const LAVA = [rgba('#fff7c2'), rgba('#ffd84a'), rgba('#ff9a1f'), rgba('#e0461a'), rgba('#8a1e0c')];
const ROCK = [rgba('#1a1210'), rgba('#3a2a26'), rgba('#5a4440'), rgba('#7a6058')];

// Brasa no chão: pedrinha escura com rachaduras em brasa que pulsam; armada = mais viva, com faíscas.
// Nos últimos 1,5 s ela pisca (vai apagar); recém-caída ainda está "fria" (não estoura).
export function drawCoal(g, z, t, particles) {
  const age = z.max - z.life, armed = age >= 0.5, R = Math.max(3, Math.round(z.r * 0.6));
  if (z.life < 1.5 && Math.floor(t * 10) % 2) return;
  const x = Math.round(z.x), y = Math.round(z.y);
  // Brilho no chão em volta (pontilhado, só quando armada).
  if (armed) {
    const gr = z.r + 1 + Math.round(Math.sin(t * 6 + z.id) * 1);
    for (let q = 0; q < 18; q++) {
      const a = (q / 18) * Math.PI * 2 + t * 0.8;
      if ((q + Math.floor(t * 6)) % 3) continue;
      g.set(x + Math.cos(a) * gr, y + Math.sin(a) * gr * 0.6, LAVA[3]);
    }
  }
  const pulse = 0.5 + 0.5 * Math.sin(t * 7 + z.id * 1.7);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
    const d = Math.hypot(dx / 1.2, dy / 0.8);
    if (d > R) continue;
    let c;
    if (d > R - 0.8) c = ROCK[0];
    else {
      const crack = hash2(dx + z.id, dy, 7) > 0.62 || (dx === 0 && Math.abs(dy) < R - 1);
      c = crack ? LAVA[armed ? Math.max(0, Math.round(2 - pulse * 2)) : 3] : ROCK[dy < 0 ? 3 : dy === 0 ? 2 : 1];
    }
    g.set(x + dx, y + dy - 1, c);
  }
  if (armed && particles && Math.random() < (z.big ? 0.12 : 0.08)) particles.add({ ramp: 'fire', x: x + (Math.random() - 0.5) * R * 2, y: y - 2, vz: 25, life: 0.4, add: true });
}

// Pedra em brasa em voo: pedra escura com miolo de lava; a incandescente é maior, branca no centro e solta fumaça.
export function drawCoalRock(g, p, x, y, t, particles) {
  const R = Math.max(2, Math.round(p.r)), hot = p.r >= 5, hy = y - 4;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > R + 0.3) continue;
    const k = d / (R + 0.01);
    const c = hot ? LAVA[Math.min(4, Math.floor(k * 3.6 + (hash2(dx, dy, Math.floor(t * 14)) > 0.75 ? 1 : 0)))]
      : k > 0.75 ? ROCK[0] : hash2(dx, dy, Math.floor(t * 10)) > 0.55 ? LAVA[2] : ROCK[2];
    g.set(x + dx, hy + dy, c);
  }
  particles.add({ ramp: 'fire', x, y: hy, vx: -p.vx * 0.12 + (Math.random() - 0.5) * 16, vy: -p.vy * 0.12 + (Math.random() - 0.5) * 16, life: hot ? 0.45 : 0.3, add: true, size: hot ? 2 : 1 });
  if (Math.random() < (hot ? 0.5 : 0.15)) particles.add({ ramp: 'smoke', x, y: hy, vz: 8, life: 0.7, size: 2, grow: 2, alpha: 0.4 });
}

// Jato de fogo: núcleo quase branco, bordas amarelo → laranja → vermelho, largura ondulando como labareda; a ponta
// abre em leque de faíscas onde bate. Some suave no último 0,15 s.
export function drawFlameJet(g, b, ab, a, t, particles) {
  const L = Math.hypot(b.ex - b.ox, b.ey - b.oy), ca = (b.ex - b.ox) / (L || 1), sa = (b.ey - b.oy) / (L || 1);
  const fade = Math.min(1, (ab.active - a.t) / 0.15, a.t / 0.08);
  for (let s = 0; s <= L; s += 0.8) {
    const wob = Math.sin(s * 0.3 - t * 34) * 1.3 + Math.sin(s * 0.11 + t * 9) * 0.8;
    const W = (3.2 + Math.sin(s * 0.45 - t * 46) * 1.1 + s / L * 1.6) * fade;
    for (let q = -W; q <= W; q += 0.8) {
      const k = 1 - Math.abs(q) / (W + 0.01);
      const ci = k > 0.82 ? 0 : k > 0.6 ? 1 : k > 0.35 ? 2 : k > 0.15 ? 3 : 4;
      g.set(b.ox + ca * s - sa * (q + wob), b.oy + sa * s + ca * (q + wob), LAVA[ci]);
    }
  }
  particles.burst(b.ex, b.ey, 2, { ramp: 'fire', speed: 80, life: 0.3, add: true, vz: 40 });
  if (Math.random() < 0.6) { const s = Math.random() * L; particles.add({ ramp: 'fire', x: b.ox + ca * s, y: b.oy + sa * s, vx: -sa * 30 * (Math.random() - 0.5), vy: -20, vz: 30, life: 0.35, add: true }); }
  if (Math.random() < 0.25) particles.add({ ramp: 'smoke', x: b.ex, y: b.ey, vz: 20, life: 0.8, size: 2, grow: 2, alpha: 0.4 });
}

// Preparação do jato: brasa crescendo na boca e faíscas sendo sugadas para ela.
export function drawJetCharge(g, m, a, ab, t, particles) {
  const r = 1 + (a.t / ab.windup) * 3.5;
  const x = m.x + Math.cos(a.aim) * (m.r + 2), y = m.y + Math.sin(a.aim) * (m.r + 2) - 4;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const d = Math.hypot(dx, dy); if (d <= r) g.set(x + dx, y + dy, LAVA[Math.min(4, Math.floor((d / r) * 3.5))]); }
  if (Math.random() < 0.7) { const an = Math.random() * 6.28; particles.add({ ramp: 'fire', x: x + Math.cos(an) * 14, y: y + Math.sin(an) * 14, vx: -Math.cos(an) * 60, vy: -Math.sin(an) * 60, life: 0.22, drag: 0, add: true }); }
}

// Bomba de magma das chaminés: sombra crescendo no chão + rocha em brasa no alto deixando fumaça.
export function drawForgeBomb(r, g, p, x, y, t) {
  const l = r.l, k = p.t / p.flight;
  l.globalAlpha = 0.4; l.fillStyle = '#000';
  l.beginPath(); l.ellipse(Math.round(x), Math.round(y), 3 + k * 4, 2 + k * 2, 0, 0, Math.PI * 2); l.fill();
  l.globalAlpha = 1;
  const hy = y - p.h;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > 4.2) continue;
    g.set(x + dx, hy + dy, d > 3.4 ? ROCK[0] : hash2(dx, dy, Math.floor(t * 12)) > 0.5 ? LAVA[1 + (d > 2 ? 1 : 0)] : ROCK[2]);
  }
  if (Math.random() < 0.6) r.particles.add({ ramp: 'smoke', x, y: hy, life: 0.9, size: 2, grow: 3, alpha: 0.55 });
  if (Math.random() < 0.5) r.particles.add({ ramp: 'fire', x, y: hy, vy: -8, life: 0.3, add: true, size: 2 });
}

// Eventos visuais (o renderer repassa os da forja para cá).
export function onEvent(r, e, P) {
  switch (e.type) {
    case 'coalDrop':
      P.burst(e.x, e.y, e.big ? 6 : 4, { ramp: 'fire', speed: 40, life: 0.3, add: true, vz: 30 });
      break;
    case 'coalOut':
      if (!e.quiet) P.burst(e.x, e.y - 2, 5, { ramp: 'smoke', speed: 12, life: 0.8, vz: 20, size: 2, grow: 2, alpha: 0.5 });
      break;
    case 'coalPick':
      P.burst(e.x, e.y, 10, { ramp: 'spark', speed: 60, life: 0.35, add: true, vz: 40 });
      r.rings.push({ x: e.m.x, y: e.m.y, r: 3, max: 14, t: 0, color: e.armor ? '#ffb040' : '#ffe066' });
      r.addText({ x: e.m.x, y: e.m.y - 30, text: e.armor ? `CENTELHA ${e.n} + COURAÇA` : `CENTELHA ${e.n}`, t: 0, color: '#ffb040' });
      break;
    case 'sparkShot':
      P.burst(e.m.x, e.m.y - 8, 10, { ramp: 'fire', speed: 70, life: 0.35, add: true, size: 2 });
      break;
    case 'ignition':
      // Linhas de fogo de você até cada brasa (mostra o que vai explodir) e um anel em volta.
      for (const [cx, cy] of e.coals || []) {
        const L = Math.hypot(cx - e.x, cy - e.y);
        for (let s = 0; s < L; s += 6) { const k = s / L; P.add({ ramp: 'fire', x: e.x + (cx - e.x) * k, y: e.y - 4 + (cy - e.y + 4) * k, vz: 10, life: 0.18 + k * 0.15, add: true }); }
      }
      r.rings.push({ x: e.x, y: e.y, r: 4, max: e.r, t: 0, color: '#ff7a1a', thick: true });
      r.shake = Math.max(r.shake, 4);
      break;
    case 'smokePuff':
      P.burst(e.x, e.y - 4, 14, { ramp: 'smoke', speed: 30, life: 1, vz: 20, size: 2, grow: 3, alpha: 0.6 });
      break;
  }
}
