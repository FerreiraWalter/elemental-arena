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
  // Brasalinha (chave interna 'brasalisco', mantida por compatibilidade com times salvos e testes):
  // atiradora arredia que espalha brasas; o Fornalhonte é a artilharia da forja.
  brasalisco: {
    key: 'brasalisco', line: 'brasalisco', stage: 1, evolvesTo: 'brasaliscoAscendido',
    name: 'Brasalinha', title: 'Arredia', element: 'fire', sprite: 'forge_1',
    hp: 118, speed: 76, radius: 9, mass: 0.95, evoRate: 0.95,
    abilities: [A.smokeTail, A.coalShot, A.flameJet, A.ignition, A.shyLeap, A.sparkHop],
    dodge: A.sparkHop,
    controls: { primary: 'coalShot', melee: 'smokeTail', q: 'flameJet', e: 'ignition', f: 'shyLeap', dodge: 'sparkHop' },
    sig: { kind: 'forge', name: 'Centelha Ativa', desc: 'Cada Pedra em Brasa deixa uma BRASA no chão (até 5): inimigo que pisa faz ela ESTOURAR. Passe por cima de uma brasa sua para RECOLHER: ganha DISPARADA e uma CENTELHA (o próximo tiro sai INCANDESCENTE e explode). Com E, todas as brasas explodem de uma vez.', coalMax: 5, sparkMax: 2, coalR: 7, pop: 3, chainDmg: 5, hasteT: 1.4 },
    traits: ['Centelha Ativa: espalhe brasas, recolha ou detone', 'Ataca de longe; Rabada empurra quem chega perto', 'Recuo Arredio: salta para trás deixando brasas'],
    tips: 'Ponto fraco: frágil e fraca de perto; água apaga as brasas e quem voa passa por cima delas.',
    difficulty: 2,
    profile: {
      personality: 'Arredia',
      range: [75, 155], aggression: 0.6, retreatHp: 0.35, reaction: 0.18, dodgeSkill: 0.7,
      accuracy: 0.06, lead: 0.9,
      fireCost: -0.12, wetCost: 0.15, waterCost: 1.1,
    },
  },
  brasaliscoAscendido: {
    key: 'brasaliscoAscendido', line: 'brasalisco', stage: 2,
    name: 'Fornalhonte', title: 'Colosso', element: 'fire', sprite: 'forge_3',
    hp: 222, speed: 64, radius: 14, mass: 2,
    abilities: [A.forgeStomp, A.forgeShot, A.chimneyVolley, A.forgeEruption, A.colossusRam, A.emberRoll],
    dodge: A.emberRoll,
    controls: { primary: 'forgeShot', melee: 'forgeStomp', q: 'chimneyVolley', e: 'forgeEruption', f: 'colossusRam', dodge: 'emberRoll' },
    sig: { kind: 'forge', name: 'Forja Ardente', desc: 'Brasas de forja maiores (até 6) que estouram mais forte. Recolher uma brasa dá uma CENTELHA (até 3) e +5 de COURAÇA em brasa (escudo, até 15). O Tranco do Colosso recolhe todas por onde passa.', coalMax: 6, sparkMax: 3, coalR: 9, pop: 5, chainDmg: 8, armor: 5, armorMax: 15 },
    traits: ['Forja Ardente: brasas viram couraça', 'Artilharia: Salva das Chaminés em área', 'Tranco imparável que recolhe as brasas'],
    tips: 'Ponto fraco: grande e lento; as bombas marcam o chão antes de cair. Apague as brasas com água.',
    difficulty: 2,
    profile: {
      personality: 'Colosso',
      range: [70, 160], aggression: 0.65, retreatHp: 0.25, reaction: 0.2, dodgeSkill: 0.5,
      accuracy: 0.06, lead: 0.9,
      fireCost: -0.2, wetCost: 0.15, waterCost: 1.1,
    },
  },

  // ───────────── ÁGUA ─────────────
  hidrocasco: {
    key: 'hidrocasco', line: 'hidrocasco', stage: 1, evolvesTo: 'hidrocascoAbissal',
    name: 'Hidrocasco', title: 'Forma base', element: 'water', sprite: 'water_1',
    hp: 160, speed: 66, radius: 10, mass: 1.25, evoRate: 1.55,
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
    hp: 224, speed: 74, radius: 12, mass: 1.5,
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
    name: 'Brotossauro', title: 'Broto da Montanha', element: 'plant', sprite: 'plant_1',
    hp: 158, speed: 68, radius: 10, mass: 1.15, evoRate: 1.15,
    abilities: [A.vineWhip, A.burstSeed, A.rootSnare, A.plantSentry, A.barkGuard, A.leafDash],
    dodge: A.leafDash,
    controls: { primary: 'burstSeed', melee: 'vineWhip', q: 'rootSnare', e: 'plantSentry', f: 'barkGuard', dodge: 'leafDash' },
    sig: { kind: 'sentry', name: 'Jardim Vivo', desc: 'Suporte e controle: os ataques cobrem o alvo de SEIVA (fica LENTO). Com E planta FLORES CARNÍVORAS (máx. 2) que atiram de longe, mordem quem encosta e curam o time. Com F veste você e o parceiro com CASCA VIVA: redução de dano e cura contínua.' },
    traits: ['Seiva: semente e chicote deixam o alvo LENTO', 'Flores carnívoras (E): alcance 175, mordem e curam', 'Casca Viva (F): -35% de dano e cura no parceiro'],
    tips: 'Ponto fraco: lento e sem fuga boa; o fogo queima as flores e corta a seiva.',
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
    hp: 218, speed: 56, radius: 13, mass: 2,
    abilities: [A.ancientWhip, A.ancientSeed, A.ancientRoots, A.ancientSentry, A.ancientBark, A.barkStep],
    dodge: A.barkStep,
    controls: { primary: 'ancientSeed', melee: 'ancientWhip', q: 'ancientRoots', e: 'ancientSentry', f: 'ancientBark', dodge: 'barkStep' },
    sig: { kind: 'sentry', name: 'Montanha Ancestral', desc: 'A montanha que virou floresta: seiva mais grossa (mais lentidão), guardiões carnívoros de alcance 200 que mordem forte e a CASCA DA MONTANHA (F): -40% de dano e cura contínua no parceiro.' },
    traits: ['Guardiões carnívoros de longo alcance', 'Casca da Montanha (F): muralha viva no parceiro', 'Casca grossa: queima pela metade do tempo'],
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
    hp: 126, speed: 78, radius: 8, mass: 0.9, evoRate: 0.95,
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
    hp: 155, speed: 72, radius: 9, mass: 1.1, evoRate: 1.38,
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
    hp: 122, speed: 82, radius: 8, mass: 0.85, evoRate: 0.8,
    abilities: [A.scytheSlash, A.twinScythe, A.sporePuff, A.overgrowth, A.longLeap, A.wingDash],
    dodge: A.wingDash,
    controls: { primary: 'twinScythe', melee: 'scytheSlash', q: 'sporePuff', e: 'overgrowth', f: 'longLeap', dodge: 'wingDash' },
    sig: { kind: 'marks', name: 'Marca do Louva-a-deus', desc: 'Cada acerto deixa uma MARCA na presa (máx. 3). Com 3 marcas, a Foice ou o pouso do Salto EXECUTA: +10 de dano, prende e corta pela metade a recarga do Salto Longo.', exec: 10, leapReset: 0.5 },
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
    hp: 252, speed: 74, radius: 12, mass: 1.5,
    abilities: [A.mantisClaw, A.mantisFlurry, A.sporeStorm, A.ancientRoots, A.skyLeap, A.wingDash],
    dodge: A.wingDash,
    controls: { primary: 'mantisFlurry', melee: 'mantisClaw', q: 'sporeStorm', e: 'ancientRoots', f: 'skyLeap', dodge: 'wingDash' },
    sig: { kind: 'marks', name: 'Rainha Predadora', desc: 'Marcas duram mais; a execução causa +13 de dano e corta 30% da recarga do Salto Celeste.', exec: 13, leapReset: 0.7, markLife: 6 },
    traits: ['Execuções mais fortes', 'Salto celeste de 250 px que enraíza', 'Rajada de foices com avanço'],
    tips: 'Ponto fraco: esquive o pouso do Salto Celeste e a execução não acontece.',
    difficulty: 3,
    profile: {
      personality: 'Predador alado',
      range: [12, 46], aggression: 0.7, retreatHp: 0.25, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.06, lead: 0.85,
      fireCost: 1.3, wetCost: -0.05, waterCost: 0.2,
    },
  },

  // ───────────── TERRA (corpo a corpo) ─────────────
  pugilar: {
    key: 'pugilar', line: 'pugilar', stage: 1, evolvesTo: 'lutapacho',
    name: 'Pugilar', title: 'Forma base', element: 'earth', sprite: 'brawler_1',
    hp: 142, speed: 88, radius: 9, mass: 1.05, evoRate: 0.78,
    abilities: [A.jab, A.cross, A.kangarooHop, A.tailSweep, A.counterGuard, A.bobWeave],
    dodge: A.bobWeave,
    controls: { primary: 'jab', melee: 'cross', q: 'kangarooHop', e: 'tailSweep', f: 'counterGuard', dodge: 'bobWeave' },
    sig: { kind: 'marks', name: 'Combo', desc: 'Cada golpe que acerta soma COMBO (máx. 3). Com 3, o próximo golpe de perto vira NOCAUTE: +12 de dano, prende e recarrega o Salto Canguru.', exec: 12, resetId: 'kangarooHop', leapReset: 0, markLife: 3 },
    traits: ['Combo: 3 acertos e o próximo golpe é NOCAUTE', 'Jab rapidíssimo e Direto que arremessa', 'Contra-Golpe pune quem bate de perto'],
    tips: 'Ponto fraco: só luta de perto; mantenha distância e quebre o combo esquivando.',
    difficulty: 2,
    profile: {
      personality: 'Boxeador',
      range: [10, 34], aggression: 0.85, retreatHp: 0.25, reaction: 0.2, dodgeSkill: 0.65,
      accuracy: 0.07, lead: 0.85,
      fireCost: 1.0, wetCost: 0, waterCost: 0.6,
    },
  },
  lutapacho: {
    key: 'lutapacho', line: 'pugilar', stage: 2,
    name: 'Lutapacho', title: 'Lutador Blindado', element: 'earth', sprite: 'brawler_3',
    hp: 260, speed: 80, radius: 13, mass: 1.9,
    abilities: [A.armoredJab, A.clawRip, A.rockThrow, A.quakeSlam, A.armorGuard, A.armorRoll],
    dodge: A.armorRoll,
    controls: { primary: 'armoredJab', melee: 'clawRip', q: 'rockThrow', e: 'quakeSlam', f: 'armorGuard', dodge: 'armorRoll' },
    sig: { kind: 'marks', name: 'Lutador Blindado', desc: 'Combo evoluído: o NOCAUTE causa +16 de dano e recarrega metade do Arremesso de Pedra.', exec: 16, resetId: 'rockThrow', leapReset: 0.5, markLife: 3.5 },
    traits: ['Arremessa pedras arrancadas do chão: quem leva fica ATORDOADO', 'Tremor atordoa todos em volta', 'Couraça bloqueia e contra-ataca'],
    tips: 'Ponto fraco: lento; a pedra demora para sair (ele se abaixa para arrancá-la): esquive nessa hora.',
    difficulty: 2,
    profile: {
      personality: 'Brigão',
      range: [10, 40], aggression: 0.9, retreatHp: 0.2, reaction: 0.2, dodgeSkill: 0.5,
      accuracy: 0.07, lead: 0.85,
      fireCost: 1.0, wetCost: 0, waterCost: 0.6,
    },
  },

  // ───────────── ELÉTRICO ─────────────
  raiolua: {
    key: 'raiolua', line: 'raiolua', stage: 1, evolvesTo: 'trovogato',
    name: 'Raiolua', title: 'Forma base', element: 'electric', sprite: 'cat_1',
    hp: 126, speed: 80, radius: 8, mass: 0.9, evoRate: 0.86,
    abilities: [A.scratch, A.sparkBall, A.strike220, A.shock110, A.boltDash, A.catLeap],
    dodge: A.catLeap,
    controls: { primary: 'sparkBall', melee: 'scratch', q: 'strike220', e: 'shock110', f: 'boltDash', dodge: 'catLeap' },
    sig: { kind: 'volt', name: 'Eletricidade Estática', voltMax: 3, desc: 'Cada golpe elétrico que acerta soma 1 CARGA (máx. 3). Com 3 fica ELETRIZADO (+10% de velocidade). A Descarga 110V (E) gasta as cargas para bater mais forte. Alvo MOLHADO leva +12% de dano elétrico.' },
    traits: ['Cargas: acerte, carregue e descarregue no E', 'Puxa e atordoa de perto; raio do céu de longe', 'Pulo do Gato com 2 cargas'],
    tips: 'Ponto fraco: frágil; depois do E e da investida fica sem fuga. Terra resiste ao choque.',
    difficulty: 2,
    profile: {
      personality: 'Ágil',
      range: [40, 120], aggression: 0.75, retreatHp: 0.3, reaction: 0.18, dodgeSkill: 0.7,
      accuracy: 0.06, lead: 0.9,
      fireCost: 1.2, wetCost: 0.05, waterCost: 0.8,
    },
  },
  trovogato: {
    key: 'trovogato', line: 'raiolua', stage: 2,
    name: 'Trovogato', title: 'Senhor do Trovão', element: 'electric', sprite: 'cat_3',
    hp: 184, speed: 72, radius: 12, mass: 1.45,
    abilities: [A.conductClaws, A.voltSphere, A.thunderJudgment, A.overloadCore, A.lightningRupture, A.thunderInstinct],
    dodge: A.thunderInstinct,
    controls: { primary: 'voltSphere', melee: 'conductClaws', q: 'thunderJudgment', e: 'overloadCore', f: 'lightningRupture', dodge: 'thunderInstinct' },
    sig: { kind: 'volt', name: 'Tempestade Viva', voltMax: 5, desc: 'Cargas evoluídas (máx. 5): a Esfera Voltaica ricocheteia e carrega rápido; o Núcleo de Sobrecarga gasta TODAS para uma explosão maior. Cheio fica ELETRIZADO.' },
    traits: ['Esfera que ricocheteia entre inimigos', 'Julgamento do Trovão deixa o solo eletrificado', 'Ruptura Relâmpago atravessa todo mundo'],
    tips: 'Ponto fraco: o Núcleo precisa de cargas para assustar; sem acertar, as cargas somem.',
    difficulty: 2,
    profile: {
      personality: 'Tempestade',
      range: [40, 130], aggression: 0.8, retreatHp: 0.25, reaction: 0.18, dodgeSkill: 0.65,
      accuracy: 0.06, lead: 0.9,
      fireCost: 1.2, wetCost: 0.05, waterCost: 0.8,
    },
  },

  // ───────────── PSÍQUICO ─────────────
  sapomental: {
    key: 'sapomental', line: 'sapomental', stage: 1, evolvesTo: 'sapofilosofo',
    name: 'Sapomental', title: 'Forma base', element: 'psychic', sprite: 'frog_1',
    hp: 128, speed: 70, radius: 10, mass: 1.1, evoRate: 0.84,
    abilities: [A.tongueLash, A.psyBubble, A.hypnoSpiral, A.mindOrbs, A.mindSwap, A.levitate],
    dodge: A.levitate,
    controls: { primary: 'psyBubble', melee: 'tongueLash', q: 'hypnoSpiral', e: 'mindOrbs', f: 'mindSwap', dodge: 'levitate' },
    sig: { kind: 'trance', name: 'Hipnose Coletiva', desc: 'Cada acerto psíquico soma 1 TRANSE no alvo (máx. 3). Com 3, o alvo fica HIPNOTIZADO por 1 s: anda até você e não usa habilidades (depois fica imune por um tempo).' },
    traits: ['Hipnose: 3 de transe e o alvo vem até você', 'Orbes que bloqueiam tiros', 'Troca de lugar com o inimigo'],
    tips: 'Ponto fraco: lento e sem dano alto; quem resiste à hipnose (imune por 3 s) pode partir para cima.',
    difficulty: 3,
    profile: {
      personality: 'Controlador',
      range: [60, 150], aggression: 0.6, retreatHp: 0.35, reaction: 0.2, dodgeSkill: 0.65,
      accuracy: 0.07, lead: 0.85,
      fireCost: 1.2, wetCost: 0, waterCost: 0.7,
    },
  },
  sapofilosofo: {
    key: 'sapofilosofo', line: 'sapomental', stage: 2,
    name: 'Sapofilósofo', title: 'Transcendental', element: 'psychic', sprite: 'frog_3',
    hp: 186, speed: 64, radius: 13, mass: 1.6,
    abilities: [A.astralPalms, A.astralOrb, A.awakeningMandala, A.orbChorus, A.astralSwap, A.astralLevitate],
    dodge: A.astralLevitate,
    controls: { primary: 'astralOrb', melee: 'astralPalms', q: 'awakeningMandala', e: 'orbChorus', f: 'astralSwap', dodge: 'astralLevitate' },
    sig: { kind: 'trance', name: 'Transcendência Mental', desc: 'Transe evoluído: a hipnose dura 1,25 s. A Mandala pulsa transe e estoura; o Coro de Orbes dispara teleguiado; a Troca Astral troca de lugar com inimigo ou aliado a até 260 px.' },
    traits: ['Mandala que pulsa e estoura', 'Coro de Orbes teleguiados', 'Troca Astral: troca com inimigo ou aliado de longe'],
    tips: 'Ponto fraco: grande e lento; fogo e ataques rápidos de perto antes da hipnose.',
    difficulty: 3,
    profile: {
      personality: 'Transcendental',
      range: [60, 160], aggression: 0.65, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.07, lead: 0.85,
      fireCost: 1.2, wetCost: 0, waterCost: 0.7,
    },
  },

  // ───────────── VOADOR ─────────────
  araralvo: {
    key: 'araralvo', line: 'araralvo', stage: 1, evolvesTo: 'araravento',
    name: 'Araralvo', title: 'Forma base', element: 'air', sprite: 'bird_1', hover: true,
    hp: 132, speed: 84, radius: 9, mass: 0.9, evoRate: 0.95,
    abilities: [A.beakPeck, A.galeTornado, A.featherVolley, A.galeBurst, A.diveStrike, A.flutter],
    dodge: A.flutter,
    controls: { primary: 'galeTornado', melee: 'beakPeck', q: 'featherVolley', e: 'galeBurst', f: 'diveStrike', dodge: 'flutter' },
    sig: { kind: 'gale', name: 'Presa no Ar', desc: 'Voa baixo: água, mato, raízes e espinhos não atrasam nem ferem. Golpes em quem está LEVANTADO no ar causam +25% de dano.', airBonus: 1.25 },
    traits: ['Tornado: segure para carregar, solte para levantar', 'Pairando: ignora o terreno que atrasa', 'Rajada que devolve projéteis'],
    tips: 'Ponto fraco: frágil e o tornado é lento; ande de lado e o elétrico o derruba.',
    difficulty: 2,
    profile: {
      personality: 'Ventania',
      range: [90, 190], aggression: 0.55, retreatHp: 0.35, reaction: 0.2, dodgeSkill: 0.65,
      accuracy: 0.07, lead: 0.85,
      fireCost: 1, wetCost: 0, waterCost: 0,
    },
  },
  araravento: {
    key: 'araravento', line: 'araralvo', stage: 2,
    name: 'Araravento', title: 'Senhora da Tempestade', element: 'air', sprite: 'bird_3', hover: true,
    hp: 206, speed: 80, radius: 12, mass: 1.3,
    abilities: [A.talonRake, A.cycloneTornado, A.featherStorm, A.eyeOfStorm, A.stormDive, A.galeFlutter],
    dodge: A.galeFlutter,
    controls: { primary: 'cycloneTornado', melee: 'talonRake', q: 'featherStorm', e: 'eyeOfStorm', f: 'stormDive', dodge: 'galeFlutter' },
    sig: { kind: 'gale', name: 'Rainha dos Ventos', desc: 'Voa baixo sobre qualquer terreno. Golpes em quem está LEVANTADO causam +35% de dano; o Ciclone cheio deixa um vórtice.', airBonus: 1.35 },
    traits: ['Ciclone que deixa vórtice', 'Olho da Tempestade: puxa e levanta', 'Mergulho em área'],
    tips: 'Ponto fraco: grande; esquive o ciclone carregado e saia do vórtice antes de estourar.',
    difficulty: 2,
    profile: {
      personality: 'Tempestade',
      range: [90, 210], aggression: 0.62, retreatHp: 0.3, reaction: 0.2, dodgeSkill: 0.6,
      accuracy: 0.07, lead: 0.85,
      fireCost: 1, wetCost: 0, waterCost: 0,
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

export const ROSTER = ['brasalisco', 'hidrocasco', 'brotossauro', 'ouriflama', 'gotapus', 'mantifolha', 'pugilar', 'raiolua', 'sapomental', 'araralvo'];
export const DEFAULT_TEAM = ['brasalisco', 'hidrocasco', 'brotossauro'];
export const formsOf = (line) => Object.values(SPECIES).filter((s) => s.line === line).sort((a, b) => a.stage - b.stage);
