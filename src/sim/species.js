import { ABILITIES as A } from './abilities.js';
import { COMBAT } from '../config.js';

// Cada FORMA é uma entrada (base e evoluída). Uma linha evolutiva liga formas por `evolvesTo`;
// o monstro troca de forma sem ser recriado (ver World.evolve). Para adicionar espécies ou estágios,
// basta criar novas entradas aqui com `line`, `stage` e `evolvesTo`.
//
// Perfis de IA: range = distância preferida; aggression = pressão; retreatHp = vida para recuar;
// reaction = atraso (s) até perceber projéteis; dodgeSkill = chance de esquivar.
// sprite = arquivo em assets/monsters (folha do usuário: estágios 1 e 3 de cada linha).
// sig = mecânica própria da linha (ver src/sim/signature.js): nome, resumo curto e parâmetros.
export const SPECIES = {
  // ───────────── FOGO ─────────────
  brasalisco: {
    key: 'brasalisco', line: 'brasalisco', stage: 1, evolvesTo: 'brasaliscoAscendido',
    name: 'Brasalisco', title: 'Forma base', element: 'fire', sprite: 'fire_1',
    hp: 150, speed: 78, radius: 9, mass: 1,
    abilities: [A.claw, A.emberLash, A.flameWave, A.fireDash, A.meteor, A.hop],
    dodge: A.hop,
    controls: { primary: 'emberLash', melee: 'claw', q: 'flameWave', e: 'meteor', f: 'fireDash', dodge: 'hop' },
    sig: { kind: 'heat', name: 'Fornalha', desc: 'Cada ataque esquenta. Em 100% SUPERAQUECE (+20% de dano e velocidade) e depois fica EXAUSTO: lento, sem poderes, leva mais dano. Água esfria.' },
    traits: ['Fornalha: ataque em rajadas e saiba a hora de parar', 'Pressão de perto; cura-se pisando em fogo'],
    tips: 'Ponto fraco: depois de SUPERAQUECER ele fica EXAUSTO, a hora certa de atacar.',
    difficulty: 1,
    profile: {
      personality: 'Agressivo',
      range: [20, 70], aggression: 0.85, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.07, lead: 0.85,
      fireCost: -0.12, wetCost: 0.1, waterCost: 1.1,
    },
  },
  brasaliscoAscendido: {
    key: 'brasaliscoAscendido', line: 'brasalisco', stage: 2,
    name: 'Brasalisco Ascendido', title: 'Fogo Ascendido', element: 'fire', sprite: 'fire_3',
    hp: 224, speed: 72, radius: 13, mass: 1.6,
    abilities: [A.volcanicClaw, A.magmaLash, A.infernoBreath, A.eruptionDash, A.meteor, A.heavyHop],
    dodge: A.heavyHop,
    controls: { primary: 'magmaLash', melee: 'volcanicClaw', q: 'infernoBreath', e: 'meteor', f: 'eruptionDash', dodge: 'heavyHop' },
    sig: { kind: 'heat', name: 'Núcleo Vulcânico', desc: 'Fornalha evoluída: ao SUPERAQUECER solta uma onda de calor que afasta todos por perto; a exaustão dura menos.', nova: true, exhaust: 1.5 },
    traits: ['Núcleo Vulcânico: superaquecer explode ao redor', 'Muito dano e pressão; lava no chão', 'Pouca defesa: esquiva demora a recarregar'],
    tips: 'Ponto fraco: esquiva demora a voltar; a onda de calor só sai quando a barra enche.',
    difficulty: 1,
    profile: {
      personality: 'Implacável',
      range: [18, 72], aggression: 0.95, retreatHp: 0.2, reaction: 0.2, dodgeSkill: 0.45,
      accuracy: 0.07, lead: 0.85,
      fireCost: -0.2, wetCost: 0.1, waterCost: 1.1,
    },
  },

  // ───────────── ÁGUA ─────────────
  hidrocasco: {
    key: 'hidrocasco', line: 'hidrocasco', stage: 1, evolvesTo: 'hidrocascoAbissal',
    name: 'Hidrocasco', title: 'Forma base', element: 'water', sprite: 'water_1',
    hp: 160, speed: 66, radius: 10, mass: 1.25,
    abilities: [A.headbutt, A.shockWave, A.hydroBeam, A.whirlpool, A.shellGuard, A.shellRoll],
    dodge: A.shellRoll,
    controls: { primary: 'shockWave', melee: 'headbutt', q: 'hydroBeam', e: 'whirlpool', f: 'shellGuard', dodge: 'shellRoll' },
    sig: { kind: 'guard', name: 'Casco Reflexo', desc: 'Com F, entra no casco por meio segundo: bloqueia 85% do dano, DEVOLVE projéteis e contra-ataca quem bate de perto. Exige tempo certo.' },
    traits: ['Casco Reflexo: bloqueie no tempo certo e devolva', 'Redemoinho móvel que arrasta e arremessa', 'Cura-se em água rasa'],
    tips: 'Ponto fraco: o casco dura meio segundo; espere abrir. Áreas e raízes passam pelo bloqueio.',
    difficulty: 2,
    wetSpeed: 1.15, waterSpeed: 1.25,
    profile: {
      personality: 'Posicional',
      range: [40, 90], aggression: 0.45, retreatHp: 0.35, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.05, lead: 0.9,
      fireCost: 1.6, wetCost: -0.08, waterCost: -0.05,
    },
  },
  hidrocascoAbissal: {
    key: 'hidrocascoAbissal', line: 'hidrocasco', stage: 2,
    name: 'Hidrocasco Abissal', title: 'Água Abissal', element: 'water', sprite: 'water_3',
    hp: 205, speed: 74, radius: 12, mass: 1.5,
    abilities: [A.abyssPincer, A.abyssShock, A.tidalWave, A.whirlpool, A.abyssGuard, A.abyssCurrent],
    dodge: A.abyssCurrent,
    controls: { primary: 'abyssShock', melee: 'abyssPincer', q: 'tidalWave', e: 'whirlpool', f: 'abyssGuard', dodge: 'abyssCurrent' },
    sig: { kind: 'guard', name: 'Casco Abissal', desc: 'Bloqueio mais longo; o primeiro golpe bloqueado gera uma bolha que absorve 25 de dano.' },
    traits: ['Casco Abissal: bloquear dá uma bolha protetora', 'Muito móvel em chão molhado', 'Onda que arrasta'],
    tips: 'Ponto fraco: depois de bloquear, o casco demora a voltar; provoque e puna.',
    difficulty: 2,
    wetSpeed: 1.35, waterSpeed: 1.45,
    profile: {
      personality: 'Maré viva',
      range: [40, 95], aggression: 0.5, retreatHp: 0.3, reaction: 0.18, dodgeSkill: 0.75,
      accuracy: 0.05, lead: 0.9,
      fireCost: 1.6, wetCost: -0.15, waterCost: -0.1,
    },
  },

  // ───────────── PLANTA ─────────────
  brotossauro: {
    key: 'brotossauro', line: 'brotossauro', stage: 1, evolvesTo: 'brotossauroAncestral',
    name: 'Brotossauro', title: 'Forma base', element: 'plant', sprite: 'plant_1',
    hp: 158, speed: 68, radius: 10, mass: 1.15,
    abilities: [A.vineWhip, A.burstSeed, A.rootSnare, A.overgrowth, A.plantSentry, A.leafDash],
    dodge: A.leafDash,
    controls: { primary: 'burstSeed', melee: 'vineWhip', q: 'rootSnare', e: 'overgrowth', f: 'plantSentry', dodge: 'leafDash' },
    sig: { kind: 'sentry', name: 'Brotos Sentinela', desc: 'Com F, planta torres vivas (máx. 2) que atiram sementes sozinhas e curam o Brotossauro por perto. O fogo as derruba rápido.' },
    traits: ['Brotos Sentinela: domine uma área com torres vivas', 'Esquiva enterrado (só a flor aparece)', 'Prende e puxa; regenera-se sobre vegetação'],
    tips: 'Ponto fraco: longe das sentinelas é lento e vulnerável; o fogo derruba as torres.',
    difficulty: 2,
    profile: {
      personality: 'Controlador',
      range: [70, 140], aggression: 0.6, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },
  brotossauroAncestral: {
    key: 'brotossauroAncestral', line: 'brotossauro', stage: 2,
    name: 'Brotossauro Ancestral', title: 'Planta Ancestral', element: 'plant', sprite: 'plant_3',
    hp: 250, speed: 56, radius: 13, mass: 2,
    abilities: [A.ancientWhip, A.ancientSeed, A.ancientRoots, A.ancientGrove, A.ancientSentry, A.barkStep],
    dodge: A.barkStep,
    controls: { primary: 'ancientSeed', melee: 'ancientWhip', q: 'ancientRoots', e: 'ancientGrove', f: 'ancientSentry', dodge: 'barkStep' },
    sig: { kind: 'sentry', name: 'Guardiões Ancestrais', desc: 'Sentinelas maiores e mais resistentes que disparam espinhos (fazem brotar espinheiro) e curam mais.' },
    traits: ['Guardiões Ancestrais: fortaleza de espinhos', 'Casca grossa: queima pela metade do tempo', 'Lento; recargas longas'],
    tips: 'Ponto fraco: muito lento; quem tem mobilidade escolhe onde lutar.',
    difficulty: 2,
    burnResist: 0.5,
    profile: {
      personality: 'Guardião',
      range: [75, 150], aggression: 0.55, retreatHp: 0.25, reaction: 0.22, dodgeSkill: 0.5,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },
  // ───────────── NOVOS MONSTROS ─────────────
  ouriflama: {
    key: 'ouriflama', line: 'ouriflama', stage: 1, evolvesTo: 'ouriflamaVulcanico',
    name: 'Ouriflama', title: 'Forma base', element: 'fire', sprite: 'hedgehog_1',
    hp: 126, speed: 78, radius: 8, mass: 0.9,
    abilities: [A.prick, A.quillFan, A.quillBurst, A.blazeRush, A.curlRoll],
    dodge: A.curlRoll,
    controls: { primary: 'quillFan', melee: 'prick', q: 'quillBurst', f: 'blazeRush', dodge: 'curlRoll' },
    sig: { kind: 'momentum', name: 'Ímpeto', desc: 'Correndo sem parar enche o ÍMPETO; cheio, fica EM DISPARADA (+15% velocidade) e o próximo golpe de perto ou investida causa +60% de dano. Espinhos ferem quem o ataca corpo a corpo.', thorns: { dmg: 4 } },
    traits: ['Ímpeto: corra, encha e acerte o golpe fortalecido', 'Couraça de espinhos contra golpes de perto', 'Investida com largo rastro de fogo'],
    tips: 'Ponto fraco: atordoar ou prender zera o ímpeto; bater nele de perto fere quem bate.',
    difficulty: 3,
    profile: {
      personality: 'Esquivo',
      range: [18, 80], aggression: 0.8, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.65,
      accuracy: 0.07, lead: 0.85,
      fireCost: -0.12, wetCost: 0.1, waterCost: 1.1,
    },
  },
  ouriflamaVulcanico: {
    key: 'ouriflamaVulcanico', line: 'ouriflama', stage: 2,
    name: 'Ouriflama Vulcânico', title: 'Fogo Vulcânico', element: 'fire', sprite: 'hedgehog_3',
    hp: 198, speed: 66, radius: 13, mass: 1.7,
    abilities: [A.lavaBite, A.magmaFan, A.quillStorm, A.burrow, A.volcanoRush, A.curlRoll],
    dodge: A.curlRoll,
    controls: { primary: 'magmaFan', melee: 'lavaBite', q: 'quillStorm', e: 'burrow', f: 'volcanoRush', dodge: 'curlRoll' },
    sig: { kind: 'momentum', name: 'Ímpeto Vulcânico', desc: 'Ímpeto evoluído: sair do Mergulho Vulcânico enche o ímpeto na hora. Espinhos de magma queimam quem o ataca de perto.', thorns: { dmg: 5, burn: 0.8 } },
    traits: ['Entra na terra e levanta o inimigo', 'Sai do mergulho em disparada', 'Espinhos de magma'],
    tips: 'Ponto fraco: o montinho de terra denuncia o mergulho; corra de lado para despistar.',
    difficulty: 3,
    profile: {
      personality: 'Emboscador',
      range: [18, 88], aggression: 0.9, retreatHp: 0.2, reaction: 0.2, dodgeSkill: 0.5,
      accuracy: 0.07, lead: 0.85,
      fireCost: -0.2, wetCost: 0.1, waterCost: 1.1,
    },
  },
  gotapus: {
    key: 'gotapus', line: 'gotapus', stage: 1, evolvesTo: 'leviapus',
    name: 'Gotapus', title: 'Forma base', element: 'water', sprite: 'octo_1',
    hp: 155, speed: 72, radius: 9, mass: 1.1,
    abilities: [A.tentacleSlap, A.bounceBubble, A.inkCloud, A.bubbleTrap, A.jetDash],
    dodge: A.jetDash,
    controls: { primary: 'bounceBubble', melee: 'tentacleSlap', q: 'inkCloud', e: 'bubbleTrap', dodge: 'jetDash' },
    sig: { kind: 'decoy', name: 'Ilusões de Tinta', desc: 'A esquiva deixa uma CÓPIA falsa correndo; a Ilusão (Q) cria duas cópias e camufla o Gotapus até ele atacar. As cópias ATIRAM bolhas fracas para parecer de verdade e estouram em tinta ao serem atingidas.', cloneDmg: 2 },
    traits: ['Ilusões de Tinta: cópias que correm e atiram', 'Bolha Prisão: prende quem estiver no círculo', 'Camuflagem até atacar'],
    tips: 'Ponto fraco: as cópias atiram fraco; ataques em área estouram todas de uma vez.',
    difficulty: 3,
    wetSpeed: 1.2, waterSpeed: 1.3,
    profile: {
      personality: 'Furtivo',
      range: [70, 140], aggression: 0.5, retreatHp: 0.35, reaction: 0.2, dodgeSkill: 0.7,
      accuracy: 0.05, lead: 0.9,
      fireCost: 1.6, wetCost: -0.08, waterCost: -0.05,
    },
  },
  leviapus: {
    key: 'leviapus', line: 'gotapus', stage: 2,
    name: 'Leviapus', title: 'Kraken das Marés', element: 'water', sprite: 'octo_3',
    hp: 250, speed: 76, radius: 13, mass: 1.7,
    abilities: [A.tentacleSweep, A.krakenBubble, A.krakenIllusion, A.abyssTentacles, A.tidalWave, A.krakenJet],
    dodge: A.krakenJet,
    controls: { primary: 'krakenBubble', melee: 'tentacleSweep', q: 'krakenIllusion', e: 'abyssTentacles', f: 'tidalWave', dodge: 'krakenJet' },
    sig: { kind: 'decoy', name: 'Ilusões do Kraken', desc: 'A Ilusão de Tinta cria TRÊS cópias que atiram; o jato deixa mais uma. Os Tentáculos do Abismo irrompem no ponto marcado E onde estiverem as cópias: cada ilusão vira uma emboscada.', cloneDmg: 3 },
    traits: ['Três cópias + tentáculos nelas: emboscada', 'Maré Esmagadora que carrega o inimigo', '+35% de velocidade em chão molhado'],
    tips: 'Ponto fraco: os tentáculos marcam o chão antes de subir; saia dos círculos escuros.',
    difficulty: 3,
    wetSpeed: 1.35, waterSpeed: 1.45,
    profile: {
      personality: 'Caçador das profundezas',
      range: [75, 150], aggression: 0.6, retreatHp: 0.28, reaction: 0.18, dodgeSkill: 0.7,
      accuracy: 0.05, lead: 0.9,
      fireCost: 1.6, wetCost: -0.15, waterCost: -0.1,
    },
  },
  mantifolha: {
    key: 'mantifolha', line: 'mantifolha', stage: 1, evolvesTo: 'silvamante',
    name: 'Mantifolha', title: 'Forma base', element: 'plant', sprite: 'mantis_1',
    hp: 122, speed: 82, radius: 8, mass: 0.85,
    abilities: [A.scytheSlash, A.twinScythe, A.sporePuff, A.overgrowth, A.longLeap, A.wingDash],
    dodge: A.wingDash,
    controls: { primary: 'twinScythe', melee: 'scytheSlash', q: 'sporePuff', e: 'overgrowth', f: 'longLeap', dodge: 'wingDash' },
    sig: { kind: 'marks', name: 'Marca do Louva-a-deus', desc: 'Cada acerto deixa uma MARCA na presa (máx. 3). Com 3 marcas, a Foice ou o pouso do Salto EXECUTA: +12 de dano, prende e recarrega o Salto Longo na hora.', exec: 12, leapReset: 0 },
    traits: ['Marca do Louva-a-deus: marque de longe, execute de perto', 'Salto longo por cima de tudo', 'Esporos que enraízam'],
    tips: 'Ponto fraco: frágil; com 2 ou 3 marcas, guarde a esquiva para o salto dela.',
    difficulty: 3,
    profile: {
      personality: 'Saltador',
      range: [12, 42], aggression: 0.65, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.65,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },
  silvamante: {
    key: 'silvamante', line: 'mantifolha', stage: 2,
    name: 'Silvamante', title: 'Mantis Ancestral', element: 'plant', sprite: 'mantis_3',
    hp: 225, speed: 74, radius: 12, mass: 1.5,
    abilities: [A.mantisClaw, A.mantisFlurry, A.sporeStorm, A.ancientRoots, A.skyLeap, A.wingDash],
    dodge: A.wingDash,
    controls: { primary: 'mantisFlurry', melee: 'mantisClaw', q: 'sporeStorm', e: 'ancientRoots', f: 'skyLeap', dodge: 'wingDash' },
    sig: { kind: 'marks', name: 'Rainha Predadora', desc: 'Marcas duram mais; a execução causa +16 de dano e recarrega metade do Salto Celeste.', exec: 16, leapReset: 0.5, markLife: 6 },
    traits: ['Execuções mais fortes', 'Salto celeste de 250 px que enraíza', 'Leque de três lâminas'],
    tips: 'Ponto fraco: esquive o pouso do Salto Celeste e a execução não acontece.',
    difficulty: 3,
    profile: {
      personality: 'Predador alado',
      range: [12, 46], aggression: 0.7, retreatHp: 0.25, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },
};

// Espécies escolhíveis no time (formas base) e time padrão (partidas rápidas e testes).
// difficulty: 1 = fácil de aprender, 3 = exige mais leitura e tempo de reação.
// Combate focado em skills: as habilidades Q/E/F recarregam mais rápido (uma vez por habilidade, mesmo se dividida
// entre formas). O Ritmo (golpes básicos que acertam) acelera ainda mais.
{
  const seen = new Set();
  for (const sp of Object.values(SPECIES)) for (const slot of ['q', 'e', 'f']) {
    const ab = sp.abilities.find((x) => x.id === sp.controls[slot]);
    if (ab && !seen.has(ab)) { seen.add(ab); ab.cooldown = Math.round(ab.cooldown * COMBAT.skillCdMult * 10) / 10; }
  }
}

export const ROSTER = ['brasalisco', 'hidrocasco', 'brotossauro', 'ouriflama', 'gotapus', 'mantifolha'];
export const DEFAULT_TEAM = ['brasalisco', 'hidrocasco', 'brotossauro'];
export const formsOf = (line) => Object.values(SPECIES).filter((s) => s.line === line).sort((a, b) => a.stage - b.stage);
