// Constantes globais da simulação. O mundo é medido em "pixels de arte" (resolução interna 640x360).
export const TILE = 8;
// Tamanho do mundo (1024×576 px de arte, 16:9). Escolhido para 4 jogadores: um monstro mede ~16–26 px de diâmetro,
// anda 56–78 px/s e as habilidades alcançam 100–210 px; a arena anterior (704×400) dava ~140 000 px² por jogador
// no 1v1 e só ~70 000 no 2v2/ffa. Agora são ~147 000 px² por jogador com 4 (a mesma densidade do duelo de antes),
// o que deixa espaço para fugir/reposicionar sem passar muito tempo procurando o adversário (a distância entre
// dois nascimentos vizinhos é ~700 px ≈ 10 s andando).
export const COLS = 128;
export const ROWS = 72;
export const WORLD_W = COLS * TILE; // 1024
export const WORLD_H = ROWS * TILE; // 576

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
  // Elétrico (Raiolua): forte contra água, fraco contra planta; a terra aterra o choque.
  electric: { water: 1.06, plant: 0.92, earth: 0.92 },
  earth: { electric: 1.1 },
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

// Combate focado em skills: o ataque básico é um golpe curto/médio com cara de cada monstro (nada de tiro longo
// repetido) e cada golpe básico que ACERTA adianta as recargas das habilidades Q/E/F (Ritmo). As skills recarregam
// mais rápido que antes. Assim o ciclo é: entra, acerta o básico, solta a skill, sai.
export const COMBAT = {
  closeRange: 52, // golpes dados a menos que isto (centro a centro) contam como "de perto"
  closeMult: 0.82, // redução do dano de perto (equilíbrio: corpo a corpo estava forte demais)
  rhythm: 0.6, // segundos que cada golpe básico acertado tira das recargas de Q/E/F
  rhythmGap: 0.3, // no máximo um "ritmo" a cada 0,3 s (rajadas contam uma vez)
  skillCdMult: 0.7, // recarga das habilidades Q/E/F em relação ao balanceamento antigo
};

// Quebra de combo: atordoado/erguido, o jogador (ou a IA) gasta energia de evolução para se libertar,
// ganhar um instante de invulnerabilidade e afastar quem está por perto. Tem recarga longa.
export const COMBO_BREAK = { cost: 35, cooldown: 14, invuln: 0.5, radius: 36, push: 280, minStun: 0.15 };

// Controle: atordoamento e enraizamento seguidos perdem força (evita sequências inevitáveis).
export const CONTROL = { guardTime: 1.2, chainMult: 0.4 };

// Cores dos 4 jogadores no todos-contra-todos (1v1v1v1), por vaga: dourado, vermelho, azul, verde.
export const FFA_COLORS = ['#ffd23a', '#ff4a5a', '#46b4ff', '#7ad84a'];
