// Constantes globais da simulação. O mundo é medido em "pixels de arte" (resolução interna 640x360).
export const TILE = 8;
export const COLS = 80;
export const ROWS = 45;
export const WORLD_W = COLS * TILE; // 640
export const WORLD_H = ROWS * TILE; // 360

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
  benchBurnDps: 3, // queimadura continua no banco (efeito persistente)
};

// Evolução: energia ganha em combate; ao encher, o monstro pode evoluir uma vez por partida.
export const EVOLUTION = {
  threshold: 150, // energia necessária
  dealt: 0.9, // energia por ponto de dano causado
  taken: 0.45, // por ponto de dano recebido
  dodge: 5, // por ataque anulado com esquiva
  environment: 0.35, // por interação elemental com o terreno (incendiar, apagar, fazer crescer)
  envPerSecond: 4, // limite de energia ambiental por segundo
  transformTime: 1.2, // duração da transformação (o resto da batalha continua)
  swapAt: 0.55, // momento em que a forma muda
  damageTaken: 0.5, // multiplicador de dano durante a transformação (sem atordoar nem empurrar)
  shockRadius: 48, shockDamage: 8, shockKnockback: 240,
};

// Triângulo elemental: fogo > planta > água > fogo.
export const ELEMENT_MULT = {
  // Valores ajustados por simulação (test/pairs.mjs): o fogo já tem vantagem ambiental (queimadura,
  // grama inflamável) contra a planta, por isso seu multiplicador é menor.
  water: { fire: 1.15, plant: 0.9 },
  fire: { plant: 1.05, water: 0.9 },
  plant: { water: 1.1, fire: 0.95 },
};
