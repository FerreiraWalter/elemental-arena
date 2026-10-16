// Avaliação de utilidade de cada habilidade. Cada função recebe o contexto percebido pela IA
// e devolve null (não usar) ou { score, aimPoint, target, point, dir, purpose }.
// A IA escolhe a melhor opção acima de um limiar, com um pouco de ruído para não ser previsível.

const reach = (c, extra) => c.m.r + c.t.r + extra;
// Bônus de mecânica própria: golpe de perto fortalecido (Ímpeto) e execução (Marca do Louva-a-deus).
const charged = (c) => (c.m.charged ? 0.35 : 0);
const execReady = (c) => (c.t.marks?.by === c.m.id && c.t.marks.n >= 3 ? 0.4 : 0);
// Sentinela inimiga visível e ao alcance (o fogo prefere queimá-las).
function enemySentry(c, range) {
  let best = null, bd = range;
  for (const o of c.w.obstacles) {
    if (!o.sentry || o.destroyed || o.team === c.m.team) continue;
    const d = Math.hypot(o.x - c.m.x, o.y - c.m.y);
    if (d < bd && c.w.los(c.m.x, c.m.y, o.x, o.y, { ignore: o })) { bd = d; best = o; }
  }
  return best;
}
// Onde plantar uma sentinela: entre mim e o alvo, um pouco para o lado (dá cobertura e mira).
function sentrySpot(c) {
  const m = c.m, a = Math.atan2(c.mem.y - m.y, c.mem.x - m.x) + (c.brain.strafeSign || 1) * 0.6;
  const d = Math.min(70, Math.max(30, c.d * 0.45));
  return { x: m.x + Math.cos(a) * d, y: m.y + Math.sin(a) * d };
}

export const TACTICS = {
  // ───────────── FOGO: agressivo, cria e usa terreno em chamas ─────────────
  claw(c) {
    if (!c.vis || c.d > reach(c, 19) || c.tGuarding) return null;
    return { score: 0.95 + (c.tBusy ? 0.2 : 0) + charged(c) + execReady(c), target: c.t };
  },
  flameWave(c) {
    if (!c.vis || c.d > 64 || c.tWhirl || c.tGuarding) return null;
    if (c.heatFull && c.d > 40) return null; // não superaquece à toa
    return { score: 0.72 + (c.tBusy ? 0.25 : 0) + (c.fuelNearTarget > 3 ? 0.15 : 0), target: c.t };
  },
  ember(c) {
    const sen = enemySentry(c, 170);
    if (sen && c.rng() < 0.5) return { score: 0.6, aimPoint: { x: sen.x, y: sen.y }, purpose: 'terrain' };
    if (c.tGuarding) return null;
    if (c.vis && c.d > 24 && c.d < 210) {
      // Às vezes mira a vegetação seca ao lado do alvo para negar área.
      if (c.fuelTileNearTarget && c.fuelNearTarget >= 3 && c.rng() < 0.22)
        return { score: 0.55, aimPoint: c.fuelTileNearTarget, purpose: 'terrain' };
      return { score: 0.5 + (c.d > 90 ? 0.15 : 0), target: c.t };
    }
    if (!c.vis && c.fuelTileNearTarget && c.fuelTileVisible)
      return { score: 0.42, aimPoint: c.fuelTileNearTarget, purpose: 'terrain' };
    return null;
  },
  fireDash(c) {
    if (c.onWater && c.d < 120) return { score: 0.75, aimPoint: c.safeDryPoint || c.awayPoint, purpose: 'escape' };
    if (c.inEnemyArea) return { score: 0.7, aimPoint: c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d > 70 && c.d < 165 && c.hpF > 0.3 && !c.tWhirl && !c.tGuarding)
      return { score: 0.55 + (c.tBusy ? 0.25 : 0) + (c.tRetreating ? 0.2 : 0) + charged(c), target: c.t };
    return null;
  },
  meteor(c) {
    if (c.d < 60 || c.d > 230 || c.sinceSeen > 1.2) return null;
    let s = 0.32;
    if (c.tChanneling || c.t.status.stun > 0) s += 0.5;
    if (c.tSpeed < 20) s += 0.25;
    if (c.tRetreating) s += 0.25;
    return { score: s, target: c.t, lob: true };
  },

  // ───────────── ÁGUA: posicional, controla distância e apaga o fogo ─────────────
  headbutt(c) {
    if (!c.vis || c.d > reach(c, 17) || c.tGuarding) return null;
    return { score: (c.m.cd.whirlpool > 0 ? 0.75 : 0.45) + (c.tBusy ? 0.2 : 0), target: c.t };
  },
  whirlpool(c) {
    if (c.d < 52) return { score: 0.9 + (c.tBusy ? 0.1 : 0), target: c.t };
    if (c.fireNearMe >= 7) return { score: 0.66, target: c.t, purpose: 'terrain' };
    if (c.embersIncoming >= 2) return { score: 0.6, target: c.t, purpose: 'defend' };
    return null;
  },
  hydroBeam(c) {
    if (!c.vis || c.d < 40 || c.d > 185) return null;
    return { score: 0.62 + (c.tBusy ? 0.3 : 0) + (c.tOnFire ? 0.12 : 0) + (c.tSpeed < 25 ? 0.1 : 0), target: c.t };
  },
  waterBolt(c) {
    if (c.fireNearMe >= 3 && c.fireCluster && (!c.vis || c.rng() < 0.35))
      return { score: 0.5, aimPoint: c.fireCluster, purpose: 'terrain' };
    if (c.tGuarding) return null;
    if (c.vis && c.d < 225) return { score: 0.5 + (c.tOnFire ? 0.1 : 0), target: c.t };
    return null;
  },
  // Casco Reflexo: a IA usa por reação (ver Brain.reactToThreats), nunca por iniciativa.
  shellGuard() { return null; },
  abyssGuard() { return null; },
  shellRoll(c) {
    if (c.vis && c.d < 34 && c.m.cd.whirlpool > 0.8 && c.hpF < 0.75) return { score: 0.62, aimPoint: c.awayPoint, purpose: 'escape' };
    if (c.hazardHere > 0 && c.safePoint) return { score: 0.5, aimPoint: c.safePoint, purpose: 'escape' };
    return null;
  },

  // ───────────── PLANTA: prende, puxa e transforma o terreno ─────────────
  vineWhip(c) {
    if (!c.vis || c.d > reach(c, 28) || c.tGuarding) return null;
    // Puxar um monstro de fogo para perto é perigoso: só quando ele está vulnerável.
    if (c.t.element === 'fire' && !c.tBusy) return { score: 0.35, target: c.t };
    return { score: 0.85 + (c.tBusy ? 0.2 : 0), target: c.t };
  },
  seedShot(c) {
    if (c.tGuarding) return null;
    if (c.vis && c.d > 24 && c.d < 205) return { score: 0.5 + (c.t.status.root > 0 ? 0.15 : 0) + (c.t.marks?.by === c.m.id && c.t.marks.n < 3 ? 0.08 : 0), target: c.t };
    return null;
  },
  // Brotos Sentinela: planta quando há poucas sentinelas e o alvo está por perto.
  plantSentry(c) {
    if (c.mySentries >= 2 || c.d > 190 || c.sinceSeen > 1.5) return null;
    const s = 0.62 + (c.mySentries === 0 ? 0.18 : 0) + (c.t.element === 'fire' ? -0.2 : 0) + (c.hpF < 0.6 ? 0.1 : 0);
    return { score: s, lob: true, point: sentrySpot(c), purpose: 'terrain', target: c.t };
  },
  ancientSentry(c) { return TACTICS.plantSentry(c); },
  rootSnare(c) {
    if (c.d < 45 || c.d > 170 || c.sinceSeen > 0.8 || c.t.status.root > 0) return null;
    let s = 0.42;
    if (c.tChanneling || c.t.status.stun > 0) s += 0.4;
    if (c.tSpeed < 25) s += 0.2;
    if (c.t.element === 'water') s += 0.1;
    return { score: s, target: c.t, lob: true };
  },
  overgrowth(c) {
    const fireNear = c.w.enemiesOf(c.m).some((e) => e.element === 'fire' && Math.hypot(e.x - c.m.x, e.y - c.m.y) < 110);
    if (fireNear) return null;
    if (c.hpF < 0.55) return { score: 0.72, target: c.t, purpose: 'terrain' };
    const hurtAlly = c.w.alliesOf(c.m).some((a) => a.hp / a.maxHp < 0.5 && Math.hypot(a.x - c.m.x, a.y - c.m.y) < 50);
    if (hurtAlly) return { score: 0.62, target: c.t, purpose: 'terrain' };
    return null;
  },
  leafDash(c) {
    if (c.hazardHere > 0 && c.safePoint) return { score: 0.55, aimPoint: c.safePoint, purpose: 'escape' };
    if (c.vis && c.d < 40 && c.t.element === 'fire') return { score: 0.6, aimPoint: c.awayPoint, purpose: 'escape' };
    return null;
  },

  // ───────────── FORMAS EVOLUÍDAS ─────────────
  volcanicClaw(c) {
    if (!c.vis || c.d > reach(c, 23) || c.tGuarding) return null;
    return { score: 1.0 + (c.tBusy ? 0.2 : 0) + charged(c), target: c.t };
  },
  magmaBall(c) {
    if (!c.vis || c.d < 22 || c.d > 215) return null;
    return { score: 0.55 + (c.tSpeed < 25 ? 0.15 : 0), target: c.t };
  },
  infernoBreath(c) {
    if (!c.vis || c.d > 80 || c.tWhirl || c.tGuarding) return null;
    if (c.heatFull && c.d > 50) return null;
    return { score: 0.8 + (c.tBusy ? 0.25 : 0), target: c.t };
  },
  eruptionDash(c) {
    if (c.onWater && c.d < 120) return { score: 0.75, aimPoint: c.safeDryPoint || c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d > 50 && c.d < 170 && !c.tWhirl && !c.tGuarding) return { score: 0.62 + (c.tBusy ? 0.25 : 0) + charged(c), target: c.t };
    return null;
  },
  heavyHop() { return null; },
  abyssBolt(c) { return TACTICS.waterBolt(c); },
  abyssPincer(c) {
    if (!c.vis || c.d > reach(c, 21) || c.tGuarding) return null;
    return { score: 0.7 + (c.tBusy ? 0.2 : 0), target: c.t };
  },
  tidalWave(c) {
    if (!c.vis || c.d < 25 || c.d > 190) return null;
    return { score: 0.62 + (c.d < 70 ? 0.2 : 0) + (c.tBusy ? 0.2 : 0) + (c.embersIncoming ? 0.15 : 0), target: c.t };
  },
  bubbleShield(c) {
    if (c.m.status.shield > 0) return null;
    if ((c.d < 110 && c.hpF < 0.75) || c.embersIncoming >= 1 || c.m.status.burn > 0) return { score: 0.72, target: c.t, purpose: 'defend' };
    return null;
  },
  abyssCurrent(c) { return TACTICS.shellRoll(c); },
  thornShot(c) { return TACTICS.seedShot(c); },
  ancientWhip(c) {
    if (!c.vis || c.d > reach(c, 36)) return null;
    if (c.t.element === 'fire' && !c.tBusy) return { score: 0.35, target: c.t };
    return { score: 0.85 + (c.tBusy ? 0.2 : 0), target: c.t };
  },
  ancientRoots(c) {
    const r = TACTICS.rootSnare(c);
    return r && { ...r, score: r.score + 0.1 };
  },
  ancientGrove(c) {
    // Barreira de mata: boa contra água e contra quem corre para cima; ruim contra fogo (queima).
    if (c.t.element === 'fire' && c.hpF > 0.35) return null;
    if (c.d < 110 && c.vis) return { score: 0.6 + (c.hpF < 0.6 ? 0.15 : 0), target: c.t, purpose: 'terrain' };
    return null;
  },
  barkStep(c) { return TACTICS.leafDash(c); },

  hop() { return null; },

  // ───────────── NOVOS MONSTROS ─────────────
  prick(c) { return TACTICS.claw(c); },
  quillShot(c) { return TACTICS.ember(c); },
  quillBurst(c) {
    if (!c.vis || c.d > reach(c, 38) || c.tGuarding) return null;
    return { score: 0.78 + (c.tBusy ? 0.2 : 0) + charged(c), target: c.t };
  },
  blazeRush(c) { return TACTICS.fireDash(c); },
  curlRoll() { return null; },
  magmaQuill(c) { return TACTICS.magmaBall(c); },
  lavaBite(c) { return TACTICS.volcanicClaw(c); },
  quillStorm(c) { return TACTICS.infernoBreath(c); },
  volcanoRush(c) { return TACTICS.eruptionDash(c); },
  burrow(c) {
    // Emboscada: mergulha de longe (mesmo sem ver) e irrompe embaixo do alvo.
    if (c.d < 45 || c.d > 230 || c.sinceSeen > 2) return null;
    return { score: 0.76 + (c.tBusy ? 0.2 : 0) + (c.tChanneling ? 0.15 : 0) + (c.d > 100 ? 0.08 : 0), target: c.t };
  },
  bubbleShot(c) { return TACTICS.waterBolt(c); },
  tentacleSlap(c) {
    if (!c.vis || c.d > reach(c, 25) || c.tGuarding) return null;
    return { score: 0.7 + (c.tBusy ? 0.2 : 0), target: c.t };
  },
  inkCloud(c) {
    if (c.m.status.cloak > 0) return null;
    if ((c.d < 120 && c.hpF < 0.75) || c.embersIncoming >= 1 || c.m.status.burn > 0 || (c.vis && c.d < 70)) return { score: 0.68, target: c.t, purpose: 'defend' };
    return null;
  },
  jetDash(c) { return TACTICS.shellRoll(c); },
  krakenJet(c) { return TACTICS.shellRoll(c); },
  tentacleSweep(c) {
    if (!c.vis || c.d > reach(c, 33) || c.tGuarding) return null;
    return { score: 0.82 + (c.tBusy ? 0.2 : 0), target: c.t };
  },
  krakenGrip(c) {
    if (!c.vis || c.d > reach(c, 46) || c.tGuarding) return null;
    return { score: 0.9 + (c.tBusy ? 0.15 : 0), target: c.t };
  },
  inkStorm(c) {
    if (!c.vis || c.d > 150 || c.d < 30 || c.m.status.cloak > 0) return null;
    return { score: 0.58 + (c.hpF < 0.6 ? 0.15 : 0), target: c.t, purpose: 'defend' };
  },
  scytheSlash(c) { return TACTICS.claw(c); },
  leafBlade(c) { return TACTICS.seedShot(c); },
  sporePuff(c) {
    if (!c.vis || c.d > 58 || c.t.status.root > 0) return null;
    return { score: 0.72 + (c.tBusy ? 0.15 : 0), target: c.t };
  },
  longLeap(c) {
    if (c.hazardHere > 0 && c.safePoint) return { score: 0.6, aimPoint: c.safePoint, purpose: 'escape' };
    if (c.vis && c.d < 45 && c.hpF < 0.45) return { score: 0.66, aimPoint: c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d > 85 && c.d < 170) return { score: 0.56 + (c.tBusy ? 0.2 : 0) + execReady(c), target: c.t };
    return null;
  },
  wingDash() { return null; },
  mantisClaw(c) {
    if (!c.vis || c.d > reach(c, 35) || c.tGuarding) return null;
    return { score: 0.88 + (c.tBusy ? 0.2 : 0) + execReady(c), target: c.t };
  },
  bladeStorm(c) { return TACTICS.seedShot(c); },
  sporeStorm(c) {
    if (!c.vis || c.d > 82 || c.t.status.root > 0) return null;
    return { score: 0.78 + (c.tBusy ? 0.2 : 0), target: c.t };
  },
  skyLeap(c) {
    if (c.vis && c.d < 50 && c.hpF < 0.4) return { score: 0.66, aimPoint: c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d > 110 && c.d < 250) return { score: 0.6 + (c.tBusy ? 0.25 : 0) + execReady(c), target: c.t };
    return null;
  },
};
