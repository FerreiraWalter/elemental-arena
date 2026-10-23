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


// Chicote em linha: precisa de linha de visão e o alvo dentro do alcance.
function lash(c, len) {
  if (!c.vis || c.d > reach(c, len) || c.tGuarding) return null;
  return { score: 0.8 + (c.tBusy ? 0.2 : 0) + (c.d > 30 ? 0.1 : 0) + charged(c), target: c.t };
}
// Arco até onde o alvo vai estar; não usa colado (o estouro também pegaria perto de mim).
function lobShot(c, range) {
  if (c.d < 30 || c.d > range + 10 || c.sinceSeen > 0.8) return null;
  return { score: 0.62 + (c.tSpeed < 25 ? 0.15 : 0) + (c.tBusy ? 0.1 : 0), target: c.t, lob: true };
}

// Alvo suspenso no ar (tornado/mergulho): a arara aproveita a Presa no Ar.
const airborne = (c) => (c.t.lift > 0 && c.m.def.sig?.kind === 'gale' ? 0.3 : 0);
function tornadoShot(c, range) {
  if (!c.vis || c.d < 24 || c.d > range + 10 || c.tGuarding) return null;
  return { score: 0.62 + (c.tBusy ? 0.2 : 0) + (c.tSpeed < 25 ? 0.1 : 0), target: c.t };
}
function featherFan(c, range) {
  if (!c.vis || c.d < 20 || c.d > range) return null;
  return { score: 0.6 + (c.tSpeed < 25 ? 0.1 : 0) + airborne(c), target: c.t };
}

export const TACTICS = {
  // ───────────── FOGO: agressivo, cria e usa terreno em chamas ─────────────
  claw(c) {
    if (!c.vis || c.d > reach(c, 19) || c.tGuarding) return null;
    return { score: 0.95 + (c.tBusy ? 0.2 : 0) + charged(c) + execReady(c), target: c.t };
  },
  flameWave(c) {
    if (!c.vis || c.d > 64 || c.tWhirl || c.tGuarding) return null;
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
  // Casca Viva: usada por reação de suporte (Brain.reactToThreats).
  barkGuard() { return null; },
  ancientBark() { return null; },
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
    if (!c.vis || c.d < 25 || c.d > 240) return null;
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
  krakenIllusion(c) { return TACTICS.inkCloud(c); },
  // Bolha Prisão: como as raízes, melhor em alvo lento, parado ou canalizando.
  bubbleTrap(c) {
    if (c.d < 40 || c.d > 190 || c.sinceSeen > 0.8 || c.t.status.root > 0 || c.tGuarding) return null;
    let s = 0.45;
    if (c.tChanneling || c.t.status.stun > 0) s += 0.4;
    if (c.tSpeed < 25) s += 0.2;
    if (c.t.element === 'fire') s += 0.1;
    return { score: s, target: c.t, lob: true };
  },
  // Tentáculos do Abismo: vale mais com cópias em campo (cada uma vira um tentáculo).
  abyssTentacles(c) {
    if (c.d < 30 || c.d > 185 || c.sinceSeen > 1) return null;
    const decoys = c.w.decoys.filter((d) => d.owner === c.m).length;
    let s = 0.5 + decoys * 0.12;
    if (c.tChanneling || c.t.status.stun > 0 || c.t.status.root > 0) s += 0.35;
    if (c.tSpeed < 25) s += 0.15;
    return { score: s, target: c.t, lob: true };
  },
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
  // ───── Golpes básicos do combate focado em skills ─────
  // Chicotes (linha): acertam de média distância; ótimos contra quem está parado ou canalizando.
  emberLash(c) { return lash(c, 58); },
  magmaLash(c) { return lash(c, 66); },
  // Ondas de choque: de perto, empurram para longe (bom para tirar inimigo de cima).
  shockWave(c) {
    if (!c.vis || c.d > 115 || c.tGuarding) return null;
    return { score: 0.8 + (c.tBusy ? 0.15 : 0) + (c.d < 50 ? 0.1 : 0), target: c.t };
  },
  abyssShock(c) {
    if (!c.vis || c.d > 115 || c.tGuarding) return null;
    return { score: 0.85 + (c.tBusy ? 0.15 : 0) + (c.d < 55 ? 0.1 : 0), target: c.t };
  },
  // Projéteis em arco (bolha, semente): de média distância, mirando onde o alvo vai estar.
  burstSeed(c) { return lobShot(c, 150); },
  ancientSeed(c) { return lobShot(c, 160); },
  bounceBubble(c) { return lobShot(c, 150); },
  krakenBubble(c) { return lobShot(c, 165); },
  // Leques de espinhos: espingarda — só vale de perto.
  quillFan(c) {
    if (!c.vis || c.d > 95 || c.tGuarding) return null;
    return { score: 0.65 + (c.d < 55 ? 0.3 : 0) + charged(c), target: c.t };
  },
  magmaFan(c) {
    if (!c.vis || c.d > 105 || c.tGuarding) return null;
    return { score: 0.7 + (c.d < 60 ? 0.3 : 0) + charged(c), target: c.t };
  },
  // Foices: corpo a corpo com avanço; acumulam Marcas para a execução.
  twinScythe(c) {
    if (!c.vis || c.d > reach(c, 46) || c.tGuarding) return null;
    return { score: 0.92 + (c.tBusy ? 0.2 : 0) + execReady(c), target: c.t };
  },
  mantisFlurry(c) {
    if (!c.vis || c.d > reach(c, 54) || c.tGuarding) return null;
    return { score: 0.95 + (c.tBusy ? 0.2 : 0) + execReady(c), target: c.t };
  },
  // ───── Terra: lutadores ─────
  jab(c) {
    if (!c.vis || c.d > reach(c, 24) || c.tGuarding) return null;
    return { score: 0.88 + (c.tBusy ? 0.15 : 0) + execReady(c), target: c.t };
  },
  armoredJab(c) { return TACTICS.jab(c); },
  cross(c) {
    if (!c.vis || c.d > reach(c, 28) || c.tGuarding) return null;
    return { score: 0.92 + (c.tBusy ? 0.25 : 0) + charged(c) + execReady(c), target: c.t };
  },
  clawRip(c) { return TACTICS.cross(c); },
  kangarooHop(c) {
    if (!c.vis || c.d < 50 || c.d > 125 || c.tGuarding) return null;
    return { score: 0.62 + (c.tBusy ? 0.2 : 0) + execReady(c), target: c.t };
  },
  tailSweep(c) {
    if (!c.vis || c.d > reach(c, 32)) return null;
    const near = c.w.enemiesOf(c.m).filter((e) => Math.hypot(e.x - c.m.x, e.y - c.m.y) < e.r + c.m.r + 32).length;
    return { score: 0.7 + (near > 1 ? 0.3 : 0) + (c.tBusy ? 0.1 : 0), target: c.t };
  },
  quakeSlam(c) {
    if (!c.vis || c.d < 40 || c.d > 135 || c.tGuarding) return null;
    return { score: 0.72 + (c.tBusy ? 0.2 : 0) + (c.tChanneling ? 0.2 : 0), target: c.t };
  },
  // ───── Elétrico: Raiolua e Trovogato ─────
  sparkBall(c) {
    if (c.tGuarding || !c.vis || c.d < 20 || c.d > 170) return null;
    return { score: 0.55 + (c.d > 70 ? 0.1 : 0) + (c.t.status.wet > 0 ? 0.08 : 0), target: c.t };
  },
  voltSphere(c) {
    if (c.tGuarding || !c.vis || c.d < 20 || c.d > 175) return null;
    const many = c.w.enemiesOf(c.m).filter((e) => Math.hypot(e.x - c.m.x, e.y - c.m.y) < 240).length;
    return { score: 0.6 + (many > 1 ? 0.15 : 0) + (c.d > 70 ? 0.08 : 0), target: c.t };
  },
  scratch(c) {
    if (!c.vis || c.d > reach(c, 24) || c.tGuarding) return null;
    return { score: 0.9 + (c.tBusy ? 0.2 : 0), target: c.t };
  },
  conductClaws(c) {
    if (!c.vis || c.d > reach(c, 30) || c.tGuarding) return null;
    return { score: 0.95 + (c.tBusy ? 0.25 : 0), target: c.t };
  },
  strike220(c) {
    if (c.d < 40 || c.d > 215 || c.sinceSeen > 1) return null;
    let s = 0.45;
    if (c.tChanneling || c.t.status.stun > 0 || c.t.status.root > 0) s += 0.45;
    if (c.tSpeed < 25 || c.t.status.slow > 0) s += 0.2;
    return { score: s, target: c.t, lob: true };
  },
  thunderJudgment(c) {
    const r = TACTICS.strike220(c);
    if (!r) return null;
    const near = c.w.enemiesOf(c.m).filter((e) => Math.hypot(e.x - c.t.x, e.y - c.t.y) < 50).length;
    return { ...r, score: r.score + (near > 1 ? 0.25 : 0) };
  },
  // Descarga em volta: puxa e atordoa. Melhor com cargas e com o alvo a meia distância (o puxão aproxima).
  shock110(c) {
    const R = c.m.def.abilities.find((a) => a.id === 'shock110' || a.id === 'overloadCore')?.radius ?? 62;
    if (!c.vis || c.d > R + c.t.r - 4 || c.tGuarding) return null;
    const n = c.m.volt || 0;
    const near = c.w.enemiesOf(c.m).filter((e) => Math.hypot(e.x - c.m.x, e.y - c.m.y) < R).length;
    return { score: 0.55 + n * 0.12 + (near > 1 ? 0.25 : 0) + (c.tChanneling ? 0.2 : 0), target: c.t };
  },
  overloadCore(c) { return TACTICS.shock110(c); },
  boltDash(c) {
    if (c.inEnemyArea || c.hazardHere > 0.3) return { score: 0.62, aimPoint: c.safePoint || c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d < 40 && c.hpF < 0.35) return { score: 0.6, aimPoint: c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d > 55 && c.d < 140 && !c.tGuarding) return { score: 0.58 + (c.tBusy ? 0.25 : 0) + (c.tRetreating ? 0.2 : 0), target: c.t };
    return null;
  },
  lightningRupture(c) { return TACTICS.boltDash(c); },
  catLeap() { return null; },
  thunderInstinct() { return null; },
  // ───── Psíquico: Sapomental e Sapofilósofo ─────
  psyBubble(c) {
    if (c.tGuarding || !c.vis || c.d < 20 || c.d > 170) return null;
    return { score: 0.58 + (c.d > 70 ? 0.1 : 0) + ((c.t.trance || 0) >= 2 ? 0.12 : 0), target: c.t };
  },
  astralOrb(c) { return TACTICS.psyBubble(c); },
  tongueLash(c) {
    if (!c.vis || c.d > reach(c, 46) || c.tGuarding) return null;
    return { score: 0.8 + (c.d > 30 ? 0.15 : 0) + (c.tRetreating ? 0.2 : 0), target: c.t };
  },
  astralPalms(c) {
    if (!c.vis || c.d > reach(c, 30) || c.tGuarding) return null;
    return { score: 0.92 + (c.tBusy || c.t.status.charm > 0 ? 0.25 : 0), target: c.t };
  },
  hypnoSpiral(c) {
    if (c.d < 30 || c.d > 180 || c.sinceSeen > 1) return null;
    let s = 0.5;
    if (c.tChanneling || c.t.status.stun > 0 || c.t.status.root > 0 || c.t.status.charm > 0) s += 0.35;
    if (c.tSpeed < 25 || c.t.status.slow > 0) s += 0.2;
    return { score: s, target: c.t, lob: true };
  },
  awakeningMandala(c) {
    const r = TACTICS.hypnoSpiral(c);
    if (!r) return null;
    const near = c.w.enemiesOf(c.m).filter((e) => Math.hypot(e.x - c.t.x, e.y - c.t.y) < 60).length;
    return { ...r, score: r.score + (near > 1 ? 0.25 : 0) };
  },
  // Orbes: de perto, ou quando há tiros vindo.
  mindOrbs(c) {
    if (c.w.projectiles.some((p) => p.orbit && p.owner === c.m)) return null;
    const shots = c.w.projectiles.some((p) => !p.dead && !p.lob && p.team !== c.m.team && Math.hypot(p.x - c.m.x, p.y - c.m.y) < 120);
    if (shots) return { score: 0.75, target: c.t };
    if (c.vis && c.d < 110) return { score: 0.6, target: c.t };
    return null;
  },
  orbChorus(c) {
    if (c.w.projectiles.some((p) => p.orbit && p.owner === c.m)) return null;
    if (c.vis && c.d < 200) return { score: 0.66 + (c.d < 100 ? 0.1 : 0), target: c.t };
    return null;
  },
  // Troca Mental: puxa o inimigo para a espiral/sentinelas ou foge trocando de lugar quando apertado.
  mindSwap(c) {
    if (!c.vis || c.d < 40 || c.d > 165 || c.tGuarding) return null;
    const inMine = c.w.zones.some((z) => z.kind === 'psy' && z.team === c.m.team && Math.hypot(z.x - c.m.x, z.y - c.m.y) < z.r);
    if (inMine) return { score: 0.85, target: c.t, lob: true };
    if (c.hpF < 0.35 || c.inEnemyArea || c.hazardHere > 0.3) return { score: 0.65, target: c.t, lob: true };
    return { score: 0.3 + (c.t.status.charm > 0 ? 0.2 : 0), target: c.t, lob: true };
  },
  // Troca Astral: igual à Troca Mental (mais longe) e também resgata o aliado encurralado com pouca vida.
  astralSwap(c) {
    const m = c.m;
    if (c.hpF > 0.45) for (const al of c.w.alliesOf(m)) {
      const d = Math.hypot(al.x - m.x, al.y - m.y);
      const pressed = c.w.enemiesOf(al).some((e) => Math.hypot(e.x - al.x, e.y - al.y) < 70);
      if (d > 60 && d < 255 && al.hp < al.maxHp * 0.35 && pressed) return { score: 0.85, aimPoint: { x: al.x, y: al.y }, purpose: 'support' };
    }
    if (!c.vis || c.d < 40 || c.d > 250 || c.tGuarding) return null;
    const inMine = c.w.zones.some((z) => z.kind === 'psy' && z.team === m.team && Math.hypot(z.x - m.x, z.y - m.y) < z.r);
    if (inMine) return { score: 0.85, target: c.t, lob: true };
    if (c.hpF < 0.35 || c.inEnemyArea || c.hazardHere > 0.3) return { score: 0.65, target: c.t, lob: true };
    return { score: 0.32 + (c.t.status.charm > 0 ? 0.2 : 0), target: c.t, lob: true };
  },
  levitate() { return null; },
  astralLevitate() { return null; },
  // ───── Voador: tornado carregado (a carga é escolhida em air.aiHoldFor), penas, rajada e mergulhos ─────
  galeTornado(c) { return tornadoShot(c, 230); },
  cycloneTornado(c) { return tornadoShot(c, 280); },
  beakPeck(c) {
    if (!c.vis || c.d > reach(c, 26) || c.tGuarding) return null;
    return { score: 0.85 + (c.tBusy ? 0.2 : 0) + airborne(c), target: c.t };
  },
  talonRake(c) {
    if (!c.vis || c.d > reach(c, 34) || c.tGuarding) return null;
    return { score: 0.9 + (c.tBusy ? 0.2 : 0) + airborne(c), target: c.t };
  },
  featherVolley(c) { return featherFan(c, 170); },
  featherStorm(c) { return featherFan(c, 200); },
  galeBurst(c) {
    const shots = c.w.projectiles.some((p) => !p.dead && !p.lob && p.team !== c.m.team && Math.hypot(p.x - c.m.x, p.y - c.m.y) < 80);
    if (shots) return { score: 0.85, target: c.t };
    if (c.vis && c.d < 50) return { score: 0.62 + (c.hpF < 0.5 ? 0.2 : 0), target: c.t };
    return null;
  },
  eyeOfStorm(c) {
    if (c.d < 30 || c.d > 190 || c.sinceSeen > 1) return null;
    let s = 0.5;
    if (c.tChanneling || c.t.status.stun > 0 || c.t.status.root > 0) s += 0.3;
    if (c.tSpeed < 25 || c.t.status.slow > 0) s += 0.2;
    return { score: s, target: c.t, lob: true };
  },
  diveStrike(c) {
    if (c.vis && c.d < 45 && c.hpF < 0.45) return { score: 0.66, aimPoint: c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d > 80 && c.d < 175) return { score: 0.55 + (c.tBusy ? 0.25 : 0), target: c.t };
    return null;
  },
  stormDive(c) {
    if (c.vis && c.d < 50 && c.hpF < 0.4) return { score: 0.66, aimPoint: c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d > 100 && c.d < 255) return { score: 0.6 + (c.tBusy ? 0.25 : 0), target: c.t };
    return null;
  },
  flutter() { return null; },
  galeFlutter() { return null; },
  rockThrow(c) {
    if (!c.vis || c.d < 45 || c.d > 225 || c.tGuarding) return null;
    return { score: 0.7 + (c.tChanneling ? 0.3 : 0) + (c.tSpeed < 25 ? 0.1 : 0), target: c.t };
  },
  // ───────────── Fogo de longe (Brasalinha → Fornalhonte): atira, espalha brasas e detona ─────────────
  coalShot(c) { return coalShot(c, 170); },
  forgeShot(c) { return coalShot(c, 170); },
  smokeTail(c) { return tailPeel(c, 18); },
  forgeStomp(c) { return tailPeel(c, 24); },
  flameJet(c) {
    if (!c.vis || c.d < 24 || c.d > 170 || c.tGuarding) return null;
    return { score: 0.6 + coalsNear(c, c.t, 40) * 0.08 + (c.tBusy ? 0.25 : 0) + (c.tSpeed < 25 ? 0.1 : 0), target: c.t };
  },
  chimneyVolley(c) {
    if (c.d < 50 || c.d > 220 || c.sinceSeen > 1) return null;
    return { score: 0.58 + (c.tSpeed < 25 || c.tChanneling ? 0.25 : 0) + (c.t.status.stun > 0 ? 0.2 : 0), target: c.t, lob: true };
  },
  // Ignição: vale quando há brasas em volta de um inimigo (ou ele está colado em você).
  ignition(c) { return igniteWorth(c, 26, 30); },
  forgeEruption(c) { return igniteWorth(c, 30, 36); },
  // Recuo Arredio: mira NO inimigo e salta para trás, deixando brasas no caminho dele.
  shyLeap(c) {
    if (!c.vis || c.d > 60) return null;
    return { score: 0.62 + (c.hpF < 0.5 ? 0.2 : 0) + (c.tBusy ? -0.2 : 0), target: c.t, purpose: 'escape' };
  },
  colossusRam(c) {
    if (c.onWater && c.d < 120) return { score: 0.7, aimPoint: c.safeDryPoint || c.awayPoint, purpose: 'escape' };
    if (c.vis && c.d > 40 && c.d < 150 && !c.tGuarding) return { score: 0.5 + (c.tBusy ? 0.25 : 0) + coalsNear(c, c.m, 120) * 0.04, target: c.t };
    return null;
  },
  sparkHop() { return null; },
  emberRoll() { return null; },

  // ───────────── Sombra (Pantrinja → Kagepantera): entra por trás, emboscada com a sombra, foge por ela ─────────────
  shuriken(c) { return ninjaShot(c, 160); },
  kunai(c) { return ninjaShot(c, 165); },
  furtiveClaw(c) { return ninjaClaw(c, 20); },
  twinFangs(c) { return ninjaClaw(c, 24); },
  shadowFan(c) { return ninjaBoomerang(c, 150); },
  fuumaShadow(c) { return ninjaBoomerang(c, 170); },
  smokeBomb(c) {
    if (c.m.status.cloak > 0) return null;
    if (c.vis && c.d < 50 && c.hpF < 0.55) return { score: 0.75, target: c.t, purpose: 'escape' };
    if (c.vis && c.d > 60 && c.d < 140 && c.hpF > 0.4) return { score: 0.42, target: c.t }; // some antes de entrar
    return null;
  },
  eternalNight(c) {
    if (!c.vis || c.d > 120) return null;
    return { score: 0.55 + (c.d < 50 ? 0.2 : 0) + (c.tBusy ? 0.1 : 0), aimPoint: { x: c.t.x, y: c.t.y } };
  },
  livingShadow(c) { return shadowThrow(c, 150); },
  assassinShadow(c) { return shadowThrow(c, 160); },
  shadowStep() { return null; },
  nightStep() { return null; },

  // ───────────── Vento (Arutchin → Anemokahn): tece combos — marca com E, crítico com Q, jaula com F ─────────────
  airPalm(c) { return palmShot(c, 140); },
  stormPalm(c) { return palmShot(c, 165); },
  gustSlap(c) { return gustPeel(c, 18); },
  galeClap(c) { return gustPeel(c, 22); },
  vacuumBlade(c) { return vacuumShot(c, 155); },
  greaterVacuum(c) { return vacuumShot(c, 180); },
  turbulencePulse(c) { return turbMark(c, 130, 18); },
  turbulenceBurst(c) { return turbMark(c, 160, 30); },
  cyclonePressure(c) { return cageTry(c, 140); },
  cycloneCage(c) { return cageTry(c, 165); },
  windDrift() { return null; },
  stormDrift() { return null; },
};

// Gênio do vento: o alvo está com a Turbulência dele? Quantos outros marcados perto (ricochete)?
const turbOn = (c, t = c.t) => t.turb > 0 && t.turbBy === c.m.id;
const turbAround = (c) => c.w.enemiesOf(c.m).filter((e) => e !== c.t && turbOn(c, e) && Math.hypot(e.x - c.t.x, e.y - c.t.y) < 150).length;
function palmShot(c, range) {
  if (c.tGuarding || !c.vis || c.d < 20 || c.d > range) return null;
  return { score: 0.48 + (c.m.cd[c.m.def.controls.e] > 0.6 ? 0.1 : 0), target: c.t };
}
function gustPeel(c, px) {
  if (!c.vis || c.d > reach(c, px) || c.tGuarding) return null;
  return { score: 0.86 + (c.tBusy ? 0.1 : 0), target: c.t };
}
// Q: vale muito com a marca (crítico + ricochete) ou com a Brisa cheia (escudo + disparada); sem nada, é só um tiro.
function vacuumShot(c, range) {
  if (!c.vis || c.d > range || c.tGuarding) return null;
  const full = (c.m.brisa || 0) >= (c.m.def.sig.charges ?? 2);
  return { score: 0.42 + (turbOn(c) ? 0.45 + turbAround(c) * 0.1 : 0) + (full ? 0.25 + (c.hpF < 0.5 ? 0.15 : 0) : 0), target: c.t };
}
// E: marca quem não está marcado; com o alvo marcado e outros por perto, estoura o micro-vácuo.
function turbMark(c, range, r) {
  if (!c.vis || c.d > range + r) return null;
  if (!turbOn(c)) return { score: 0.62 + (c.m.cd[c.m.def.controls.q] > 0.5 ? 0.15 : 0), aimPoint: { x: c.t.x, y: c.t.y } };
  const near = c.w.enemiesOf(c.m).filter((e) => e !== c.t && Math.hypot(e.x - c.t.x, e.y - c.t.y) < 70).length;
  return near ? { score: 0.6 + near * 0.12, aimPoint: { x: c.t.x, y: c.t.y } } : null;
}
// F: Jaula de Vento em alvo marcado (melhor ainda se ele está vindo para cima); sem marca, só para frear quem encosta.
function cageTry(c, range) {
  if (!c.vis || c.d > range) return null;
  if (turbOn(c)) return { score: 0.66 + (c.d < 70 ? 0.2 : 0) + (c.tBusy ? 0.1 : 0), aimPoint: { x: c.t.x, y: c.t.y } };
  if (c.d < 45) return { score: 0.45, aimPoint: { x: c.t.x, y: c.t.y } };
  return null;
}

// Pantera: a sombra dela no chão (ir até ela é decidido em sim/shadow.js) e se está pelas costas do alvo.
const myShadow = (c) => c.w.shadows?.find((q) => q.owner === c.m) || null;
const behindT = (c) => { const a = Math.atan2(c.m.y - c.t.y, c.m.x - c.t.x) - (c.t.facing ?? 0); return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > 1.95; };
function ninjaShot(c, range) {
  if (c.tGuarding || !c.vis || c.d < 22 || c.d > range) return null;
  return { score: 0.5 + (c.d > 60 ? 0.1 : 0), target: c.t };
}
function ninjaClaw(c, px) {
  if (!c.vis || c.d > reach(c, px) || c.tGuarding) return null;
  return { score: 0.95 + (c.tBusy ? 0.2 : 0) + (behindT(c) ? 0.3 : 0) + (c.m.status.cloak > 0 ? 0.3 : 0), target: c.t };
}
function ninjaBoomerang(c, range) { // Shuriken bumerangue: melhor com o alvo longe (acerta na ida e na volta) ou com a sombra perto dele
  if (!c.vis || c.d > range || c.tGuarding) return null;
  const s = myShadow(c), near = s && !s.moving && Math.hypot(s.x - c.t.x, s.y - c.t.y) < 120;
  return { score: 0.56 + (near ? 0.35 : 0) + (c.d > 60 ? 0.1 : 0) + (c.tBusy ? 0.15 : 0), target: c.t };
}
// Sombra Viva: às costas do alvo (para emboscar) ou para longe quando está apanhando (para fugir).
function shadowThrow(c, range) {
  if (myShadow(c)) return null;
  if (c.vis && c.hpF < 0.35 && c.d < 60) return { score: 0.8, aimPoint: c.awayPoint, purpose: 'escape' };
  if (!c.vis || c.d < 40 || c.d > range + 60) return null;
  const back = c.t.facing ?? Math.atan2(c.t.y - c.m.y, c.t.x - c.m.x);
  return { score: 0.62 + (c.tBusy ? 0.2 : 0), aimPoint: { x: c.t.x - Math.cos(back) * 26, y: c.t.y - Math.sin(back) * 26 } };
}

// Brasas minhas perto de alguém (até R de distância).
function coalsNear(c, who, R) {
  let n = 0;
  for (const z of c.w.zones) if (z.kind === 'coal' && z.owner === c.m && z.life > 0 && Math.hypot(z.x - who.x, z.y - who.y) < R + who.r) n++;
  return n;
}
function coalShot(c, range) {
  if (c.tGuarding) return null;
  if (c.vis && c.d > 20 && c.d < range + 5) return { score: 0.55 + (c.m.spark > 0 ? 0.1 : 0) + (c.d > 70 ? 0.08 : 0), target: c.t };
  return null;
}
// Rabada/Pisão: afasta quem chegou perto demais.
function tailPeel(c, reachPx) {
  if (!c.vis || c.d > reach(c, reachPx) || c.tGuarding) return null;
  return { score: 0.85 + (c.tBusy ? 0.1 : 0), target: c.t };
}
function igniteWorth(c, R, selfR) {
  let best = 0;
  for (const e of c.w.enemiesOf(c.m)) {
    let n = coalsNear(c, e, R);
    if (Math.hypot(e.x - c.m.x, e.y - c.m.y) < selfR + e.r) n += 1.5;
    best = Math.max(best, n);
  }
  if (best < 1.5) return null;
  return { score: 0.4 + best * 0.18, target: c.t };
}
