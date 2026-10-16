// Constantes globais da simulação. O mundo é medido em "pixels de arte" (resolução interna 640x360).
export const TILE = 8;
export const COLS = 88;
export const ROWS = 50;
export const WORLD_W = COLS * TILE; // 704
export const WORLD_H = ROWS * TILE; // 400

// Passo fixo da simulação (60 Hz). Toda a lógica de combate avança apenas por este passo.
export const DT = 1 / 60;
// O terreno (fogo, umidade, rebrota) atualiza a 10 Hz para manter o custo baixo.
export const TERRAIN_DT = 0.1;

// Regras de troca no 1×1 (cada time tem 3 monstros, só 1 em campo).
export const SWITCH = {
  exitTime: 0.3, // animação de saída: não age, mas ainda pode levar dano
  enterTime: 0.4, // animação de entrada: não age, mas pode levar dano
  entryInvulnerable: false, // true = invulnerável durante a entrada
  cooldown: 3, // recarga de troca voluntária, por time
  replaceDelay: 0.9, // tempo entre a derrota e a entrada automática do substituto
  benchBurnDps: 2, // queimadura continua no banco (efeito persistente)
};

// Evolução: energia ganha em combate; ao encher, o monstro pode evoluir uma vez por partida.
export const EVOLUTION = {
  threshold: 150, // energia necessária
  hit: 7, // por ATAQUE que acerta (≈5% da barra; com o dano, um tiro comum vale ~7–8%)
  hitGap: 0.2, // rajadas (leque de lâminas, cone) contam como um ataque
  dealt: 0.6, // energia por ponto de dano causado
  taken: 0.5, // por ponto de dano recebido
  dodge: 8, // por ataque anulado com esquiva
  environment: 0.35, // por interação elemental com o terreno (incendiar, apagar, fazer crescer)
  envPerSecond: 4, // limite de energia ambiental por segundo
  transformTime: 1.2, // duração da transformação (o resto da batalha continua)
  swapAt: 0.55, // momento em que a forma muda
  damageTaken: 0.5, // multiplicador de dano durante a transformação (sem atordoar nem empurrar)
  shockRadius: 48, shockDamage: 8, shockKnockback: 240,
};

// Triângulo elemental: fogo > planta > água > fogo.
export const ELEMENT_MULT = {
  // Valores ajustados por simulação (tools/balance.mjs). O fogo ainda tem a vantagem ambiental (queimadura,
  // grama inflamável) contra a planta, por isso o bônus dele é um pouco menor que o dos outros.
  water: { fire: 1.12, plant: 0.9 },
  fire: { plant: 1.1, water: 0.9 },
  plant: { water: 1.12, fire: 0.9 },
};

// Fogo: queimadura (status) e chão em chamas. Valores revistos para que o fogo pressione sem prender o
// adversário: a queimadura não acumula, dura pouco e o chão criado por ataques arde menos que vegetação.
export const FIRE = {
  burnDps: 2, // dano por segundo da queimadura (status)
  burnMax: 2.5, // duração máxima aplicada por um golpe (s)
  burnTaken: { water: 0.5, plant: 1, fire: 0 }, // multiplicador da duração por elemento do alvo
  fuelDps: 3.5, // pisar em vegetação em chamas
  groundDps: 2.5, // pisar em chão em brasa criado por ataques (sem combustível)
  groundBurn: 0.6, // queimadura aplicada por estar sobre o fogo
  selfHeal: 0.8, // monstros de fogo se curam (vida/s) pisando no fogo
  selfSpeed: 1.1, // e ficam um pouco mais rápidos
  obstacleDps: 3, // encostar em objeto em chamas
};

// Morte súbita: depois deste tempo de partida, nenhuma cura funciona (terreno, sentinelas, Crescimento) e a IA
// para de recuar. Evita partidas eternas entre monstros que se curam (ex.: água × água perto de um riacho).
export const MATCH = { suddenDeath: 150 };

// Controle: atordoamento e enraizamento seguidos perdem força (evita sequências inevitáveis).
export const CONTROL = { guardTime: 1.2, chainMult: 0.4 };
