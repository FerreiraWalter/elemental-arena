import { ABILITIES as A } from './abilities.js';

// Cada FORMA é uma entrada (base e evoluída). Uma linha evolutiva liga formas por `evolvesTo`;
// o monstro troca de forma sem ser recriado (ver World.evolve). Para adicionar espécies ou estágios,
// basta criar novas entradas aqui com `line`, `stage` e `evolvesTo`.
//
// Perfis de IA: range = distância preferida; aggression = pressão; retreatHp = vida para recuar;
// reaction = atraso (s) até perceber projéteis; dodgeSkill = chance de esquivar.
// sprite = arquivo em assets/monsters (folha do usuário: estágios 1 e 3 de cada linha).
export const SPECIES = {
  // ───────────── FOGO ─────────────
  brasalisco: {
    key: 'brasalisco', line: 'brasalisco', stage: 1, evolvesTo: 'brasaliscoAscendido',
    name: 'Brasalisco', title: 'Forma base', element: 'fire', sprite: 'fire_1',
    hp: 150, speed: 74, radius: 9, mass: 1,
    abilities: [A.claw, A.ember, A.flameWave, A.fireDash, A.meteor, A.hop],
    dodge: A.hop,
    controls: { primary: 'ember', melee: 'claw', q: 'flameWave', e: 'meteor', f: 'fireDash', dodge: 'hop' },
    traits: ['Ágil e agressivo', 'Cura-se pisando em fogo'],
    profile: {
      personality: 'Agressivo',
      range: [20, 95], aggression: 0.85, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.07, lead: 0.85,
      fireCost: -0.12, wetCost: 0.35, waterCost: 1.1,
    },
  },
  brasaliscoAscendido: {
    key: 'brasaliscoAscendido', line: 'brasalisco', stage: 2,
    name: 'Brasalisco Ascendido', title: 'Fogo Ascendido', element: 'fire', sprite: 'fire_3',
    hp: 200, speed: 70, radius: 13, mass: 1.6,
    abilities: [A.volcanicClaw, A.magmaBall, A.infernoBreath, A.eruptionDash, A.meteor, A.heavyHop],
    dodge: A.heavyHop,
    controls: { primary: 'magmaBall', melee: 'volcanicClaw', q: 'infernoBreath', e: 'meteor', f: 'eruptionDash', dodge: 'heavyHop' },
    traits: ['Armadura vulcânica: muito dano e pressão', 'Ataques deixam lava no chão', 'Pouca defesa: esquiva demora a recarregar'],
    profile: {
      personality: 'Implacável',
      range: [18, 85], aggression: 0.95, retreatHp: 0.2, reaction: 0.2, dodgeSkill: 0.45,
      accuracy: 0.07, lead: 0.85,
      fireCost: -0.2, wetCost: 0.35, waterCost: 1.1,
    },
  },

  // ───────────── ÁGUA ─────────────
  hidrocasco: {
    key: 'hidrocasco', line: 'hidrocasco', stage: 1, evolvesTo: 'hidrocascoAbissal',
    name: 'Hidrocasco', title: 'Forma base', element: 'water', sprite: 'water_1',
    hp: 150, speed: 66, radius: 10, mass: 1.25,
    abilities: [A.headbutt, A.waterBolt, A.hydroBeam, A.whirlpool, A.shellRoll],
    dodge: A.shellRoll,
    controls: { primary: 'waterBolt', melee: 'headbutt', q: 'hydroBeam', e: 'whirlpool', dodge: 'shellRoll' },
    traits: ['Controla a distância', 'Cura-se em água rasa'],
    wetSpeed: 1.15, waterSpeed: 1.25,
    profile: {
      personality: 'Posicional',
      range: [75, 140], aggression: 0.45, retreatHp: 0.35, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.05, lead: 0.9,
      fireCost: 1.6, wetCost: -0.08, waterCost: -0.05,
    },
  },
  hidrocascoAbissal: {
    key: 'hidrocascoAbissal', line: 'hidrocasco', stage: 2,
    name: 'Hidrocasco Abissal', title: 'Água Abissal', element: 'water', sprite: 'water_3',
    hp: 205, speed: 74, radius: 12, mass: 1.5,
    abilities: [A.abyssPincer, A.abyssBolt, A.tidalWave, A.whirlpool, A.bubbleShield, A.abyssCurrent],
    dodge: A.abyssCurrent,
    controls: { primary: 'abyssBolt', melee: 'abyssPincer', q: 'tidalWave', e: 'whirlpool', f: 'bubbleShield', dodge: 'abyssCurrent' },
    traits: ['Muito móvel: +35% de velocidade em chão molhado', 'Onda que empurra e bolha protetora', 'Dano moderado'],
    wetSpeed: 1.35, waterSpeed: 1.45,
    profile: {
      personality: 'Maré viva',
      range: [70, 140], aggression: 0.5, retreatHp: 0.3, reaction: 0.18, dodgeSkill: 0.75,
      accuracy: 0.05, lead: 0.9,
      fireCost: 1.6, wetCost: -0.15, waterCost: -0.1,
    },
  },

  // ───────────── PLANTA ─────────────
  brotossauro: {
    key: 'brotossauro', line: 'brotossauro', stage: 1, evolvesTo: 'brotossauroAncestral',
    name: 'Brotossauro', title: 'Forma base', element: 'plant', sprite: 'plant_1',
    hp: 165, speed: 68, radius: 10, mass: 1.15,
    abilities: [A.vineWhip, A.seedShot, A.rootSnare, A.overgrowth, A.leafDash],
    dodge: A.leafDash,
    controls: { primary: 'seedShot', melee: 'vineWhip', q: 'rootSnare', e: 'overgrowth', dodge: 'leafDash' },
    traits: ['Prende e puxa', 'Regenera-se sobre vegetação'],
    profile: {
      personality: 'Controlador',
      range: [45, 120], aggression: 0.6, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },
  brotossauroAncestral: {
    key: 'brotossauroAncestral', line: 'brotossauro', stage: 2,
    name: 'Brotossauro Ancestral', title: 'Planta Ancestral', element: 'plant', sprite: 'plant_3',
    hp: 250, speed: 56, radius: 13, mass: 2,
    abilities: [A.ancientWhip, A.thornShot, A.ancientRoots, A.ancientGrove, A.barkStep],
    dodge: A.barkStep,
    controls: { primary: 'thornShot', melee: 'ancientWhip', q: 'ancientRoots', e: 'ancientGrove', dodge: 'barkStep' },
    traits: ['Casca grossa: queima pela metade do tempo', 'Raízes maiores e barreiras de mata', 'Lento; recargas longas'],
    burnResist: 0.5,
    profile: {
      personality: 'Guardião',
      range: [50, 125], aggression: 0.55, retreatHp: 0.25, reaction: 0.22, dodgeSkill: 0.5,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },
  // ───────────── NOVOS MONSTROS ─────────────
  ouriflama: {
    key: 'ouriflama', line: 'ouriflama', stage: 1, evolvesTo: 'ouriflamaVulcanico',
    name: 'Ouriflama', title: 'Forma base', element: 'fire', sprite: 'hedgehog_1',
    hp: 126, speed: 78, radius: 8, mass: 0.9,
    abilities: [A.prick, A.quillShot, A.quillBurst, A.blazeRush, A.curlRoll],
    dodge: A.curlRoll,
    controls: { primary: 'quillShot', melee: 'prick', q: 'quillBurst', f: 'blazeRush', dodge: 'curlRoll' },
    traits: ['Muito ágil', 'Investida que deixa um rastro de fogo', 'Cura-se pisando em fogo'],
    profile: {
      personality: 'Esquivo',
      range: [20, 90], aggression: 0.8, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.65,
      accuracy: 0.07, lead: 0.85,
      fireCost: -0.12, wetCost: 0.35, waterCost: 1.1,
    },
  },
  ouriflamaVulcanico: {
    key: 'ouriflamaVulcanico', line: 'ouriflama', stage: 2,
    name: 'Ouriflama Vulcânico', title: 'Fogo Vulcânico', element: 'fire', sprite: 'hedgehog_3',
    hp: 205, speed: 66, radius: 13, mass: 1.7,
    abilities: [A.lavaBite, A.magmaQuill, A.quillStorm, A.burrow, A.volcanoRush, A.curlRoll],
    dodge: A.curlRoll,
    controls: { primary: 'magmaQuill', melee: 'lavaBite', q: 'quillStorm', e: 'burrow', f: 'volcanoRush', dodge: 'curlRoll' },
    traits: ['Entra na terra e levanta o inimigo', 'Rastro de fogo com explosão final', 'Pesado: menos veloz'],
    profile: {
      personality: 'Emboscador',
      range: [20, 90], aggression: 0.9, retreatHp: 0.2, reaction: 0.2, dodgeSkill: 0.5,
      accuracy: 0.07, lead: 0.85,
      fireCost: -0.2, wetCost: 0.35, waterCost: 1.1,
    },
  },
  gotapus: {
    key: 'gotapus', line: 'gotapus', stage: 1, evolvesTo: 'leviapus',
    name: 'Gotapus', title: 'Forma base', element: 'water', sprite: 'octo_1',
    hp: 170, speed: 72, radius: 9, mass: 1.1,
    abilities: [A.tentacleSlap, A.bubbleShot, A.inkCloud, A.whirlpool, A.jetDash],
    dodge: A.jetDash,
    controls: { primary: 'bubbleShot', melee: 'tentacleSlap', q: 'inkCloud', e: 'whirlpool', dodge: 'jetDash' },
    traits: ['Nuvem de tinta que bloqueia a visão', 'Esquiva a jato', 'Cura-se em água rasa'],
    wetSpeed: 1.2, waterSpeed: 1.3,
    profile: {
      personality: 'Furtivo',
      range: [60, 130], aggression: 0.5, retreatHp: 0.35, reaction: 0.2, dodgeSkill: 0.7,
      accuracy: 0.05, lead: 0.9,
      fireCost: 1.6, wetCost: -0.08, waterCost: -0.05,
    },
  },
  leviapus: {
    key: 'leviapus', line: 'gotapus', stage: 2,
    name: 'Leviapus', title: 'Kraken das Marés', element: 'water', sprite: 'octo_3',
    hp: 235, speed: 74, radius: 13, mass: 1.7,
    abilities: [A.tentacleSweep, A.abyssBolt, A.tidalWave, A.inkStorm, A.krakenGrip, A.abyssCurrent],
    dodge: A.abyssCurrent,
    controls: { primary: 'abyssBolt', melee: 'tentacleSweep', q: 'tidalWave', e: 'inkStorm', f: 'krakenGrip', dodge: 'abyssCurrent' },
    traits: ['Agarra e prende o inimigo', 'Cobre a arena de tinta', '+35% de velocidade em chão molhado'],
    wetSpeed: 1.35, waterSpeed: 1.45,
    profile: {
      personality: 'Caçador das profundezas',
      range: [50, 125], aggression: 0.6, retreatHp: 0.28, reaction: 0.18, dodgeSkill: 0.7,
      accuracy: 0.05, lead: 0.9,
      fireCost: 1.6, wetCost: -0.15, waterCost: -0.1,
    },
  },
  mantifolha: {
    key: 'mantifolha', line: 'mantifolha', stage: 1, evolvesTo: 'silvamante',
    name: 'Mantifolha', title: 'Forma base', element: 'plant', sprite: 'mantis_1',
    hp: 122, speed: 82, radius: 8, mass: 0.85,
    abilities: [A.scytheSlash, A.leafBlade, A.sporePuff, A.overgrowth, A.longLeap, A.wingDash],
    dodge: A.wingDash,
    controls: { primary: 'leafBlade', melee: 'scytheSlash', q: 'sporePuff', e: 'overgrowth', f: 'longLeap', dodge: 'wingDash' },
    traits: ['Salto longo por cima de tudo', 'Esporos que enraízam', 'Regenera-se sobre vegetação'],
    profile: {
      personality: 'Saltador',
      range: [40, 110], aggression: 0.65, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.65,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },
  silvamante: {
    key: 'silvamante', line: 'mantifolha', stage: 2,
    name: 'Silvamante', title: 'Mantis Ancestral', element: 'plant', sprite: 'mantis_3',
    hp: 225, speed: 74, radius: 12, mass: 1.5,
    abilities: [A.mantisClaw, A.bladeStorm, A.sporeStorm, A.ancientRoots, A.skyLeap, A.wingDash],
    dodge: A.wingDash,
    controls: { primary: 'bladeStorm', melee: 'mantisClaw', q: 'sporeStorm', e: 'ancientRoots', f: 'skyLeap', dodge: 'wingDash' },
    traits: ['Salto celeste de 250 px que enraíza', 'Leque de três lâminas', 'Controle de área com esporos e raízes'],
    profile: {
      personality: 'Predador alado',
      range: [45, 115], aggression: 0.7, retreatHp: 0.25, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },
};

// Espécies escolhíveis no time (formas base) e time padrão (partidas rápidas e testes).
export const ROSTER = ['brasalisco', 'hidrocasco', 'brotossauro', 'ouriflama', 'gotapus', 'mantifolha'];
export const DEFAULT_TEAM = ['brasalisco', 'hidrocasco', 'brotossauro'];
export const formsOf = (line) => Object.values(SPECIES).filter((s) => s.line === line).sort((a, b) => a.stage - b.stage);
