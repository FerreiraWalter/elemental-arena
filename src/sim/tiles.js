// Registro de tipos de terreno e suas propriedades. A simulação consulta só estas propriedades
// (combustível, água, espinhos, lentidão...), nunca tipos específicos de uma arena.

export const T = {
  SAND: 0, GRASS: 1, WEEDS: 2, WATER: 3, SCORCHED: 4, BLOCK: 5,
  STONE: 6, FLOWERS: 7, THORNS: 8, DEEP: 9, BRIDGE: 10, MOSS: 11, LEAVES: 12, UNDERGROWTH: 13, DIRT: 14,
};

// fuel/burn/flam: combustível, consumo por segundo e facilidade de ignição.
// water: água rasa (todos andam, molha); deep: água funda (só nadadores); solid: intransponível.
// grow: aceita grama nova; vegetation: conta como vegetação (planta se regenera, fogo se espalha).
// thorns: dano por segundo a quem não é planta; slow: multiplicador de velocidade (exceto planta).
export const TILE_PROPS = {
  [T.SAND]: { name: 'Areia', grow: true },
  [T.GRASS]: { name: 'Grama', fuel: 1, burn: 0.12, flam: 1, vegetation: true },
  [T.WEEDS]: { name: 'Mato seco', fuel: 0.8, burn: 0.22, flam: 2.4, vegetation: true },
  [T.WATER]: { name: 'Água rasa', water: true },
  [T.SCORCHED]: { name: 'Queimado', grow: true },
  [T.BLOCK]: { name: 'Bloqueio', solid: true },
  [T.STONE]: { name: 'Pedra' },
  [T.FLOWERS]: { name: 'Canteiro', fuel: 0.9, burn: 0.15, flam: 1.2, vegetation: true },
  [T.THORNS]: { name: 'Espinheiro', fuel: 0.7, burn: 0.2, flam: 1.6, vegetation: true, thorns: 4, slow: 0.8 },
  [T.DEEP]: { name: 'Água funda', water: true, deep: true },
  [T.BRIDGE]: { name: 'Ponte' },
  [T.MOSS]: { name: 'Musgo', fuel: 0.7, burn: 0.1, flam: 0.7, vegetation: true, grow: false },
  [T.LEAVES]: { name: 'Folhas secas', fuel: 0.6, burn: 0.25, flam: 2.2, vegetation: true },
  [T.UNDERGROWTH]: { name: 'Mata baixa', fuel: 1, burn: 0.15, flam: 1.4, vegetation: true, slow: 0.82 },
  [T.DIRT]: { name: 'Terra', grow: true },
};

export const props = (ty) => TILE_PROPS[ty] || TILE_PROPS[T.SAND];
