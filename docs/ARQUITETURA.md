# Arquitetura

Jogo estático em ES modules (sem bundler). A simulação é separada da apresentação e roda também no Node (testes).

```
index.html
src/
  main.js               fluxo de telas (carregando → menu → batalha → pausa/fim) e entrada (teclado/mouse)
  config.js             constantes: grade, passo fixo, multiplicadores elementais, SWITCH, EVOLUTION
  sim/                  simulação determinística a 60 Hz (passo fixo, RNG com seed)
    world.js            mundo: roster × em campo, troca, evolução, física, colisão com terreno/alturas,
                        projéteis, obstáculos, perigos, fim de partida
    monster.js          estado persistente de cada monstro (vida, status, recargas, energia, forma)
    species.js          FORMAS (base e evoluída) ligadas por `evolvesTo`; perfis de IA, controles e `sig` (mecânica própria)
    training.js         modo Treinamento: bonecos de pano (vida infinita), opções e medidor de dano
    signature.js        mecânicas próprias: Fornalha, Casco Reflexo, Brotos Sentinela, Ímpeto/espinhos, Ilusões de Tinta, Marcas
    abilities.js        habilidades com fases reais (preparação → ativa → recuperação) e hitboxes
    tiles.js            registro de tipos de terreno e propriedades (combustível, água, espinhos, lentidão…)
    terrain.js          grade 80×45: fogo que se espalha, umidade, raízes, rebrota, alturas, correnteza
    hazards.js          perigos cíclicos telegrafados (respiros de raízes, gêiseres)
  arenas/               definições data-driven (uma por arena) + helpers de construção
  ai/
    brain.js            IA do monstro em campo: estados + steering por contexto + A* + reação a ameaças
    tactics.js          utilidade de cada habilidade
    coach.js            "técnico" do time: trocas voluntárias e substituto após derrota
    path.js             A* na grade com as mesmas regras de passagem do movimento
  control/player.js     controle direto do jogador (mesmo sistema de habilidades da IA, com buffer)
  render/               apresentação (não altera a simulação)
    renderer.js         compõe o quadro: chão, perigos, entidades por profundidade, efeitos, luz, HUD
    artsprites.js       arte dos monstros + animação procedural por pixel
    terrainpaint.js     pintura do chão por arena (alturas, penhascos, pontes, umidade, fuligem)
    scenery.js          obstáculos, decoração, perigos, correnteza, cachoeiras, ambientação
    hud.js              cartões dos times, barra de habilidades, energia de evolução, fim de partida
  ui/ui.js              menu, seleção de time e arena, multiplayer (criar/entrar/sala), bestiário, opções, ajuda (H), pausa/fim
  audio/sfx.js          efeitos sonoros sintetizados (WebAudio) a partir dos eventos do combate
  net/                  snapshot.js (serializa/aplica estado), client.js (WebSocket), mirror.js (mundo espelho),
                        smooth.js (buffer de interpolação + predição do próprio monstro)
server/                 server.js (HTTP estático + WebSocket), room.js (lobby e partida autoritativa)
assets/monsters/        sprites extraídos (tools/extract_sprites.py)
test/                   cenários e aceitação headless
tools/                  extração de sprites e build
```

## Regras centrais
- **1×1 com times de 3**: `world.roster` guarda as 6 instâncias (nunca recriadas); `world.monsters` só quem está em campo. Troca e substituição passam por `World.requestSwitch` / `updateTeams`.
- **Evolução**: `World.requestEvolve` → `updateEvolution` troca `m.def` pela forma `evolvesTo` no meio da transformação (vida proporcional, recargas preservadas) e termina com `evolveShockwave`.
- **Arenas**: `new World(seed, arenaId)` chama `def.build(world, builder)`. A colisão usa `World.standable` (sólidos, água funda só para nadadores, degraus de altura de no máximo meio nível); a visão e os tiros são bloqueados por terreno mais de um nível acima de quem atira.
- **IA**: decide a cada ~0,1–0,2 s; usa A* quando a linha reta não é caminhável; trata perigos da arena como zonas de ameaça.

## Multiplayer
- `World.match(seed, rosters, playerSlot, arena, difficulty, { sides, humans, mirror })`: cada **vaga** tem seu time de 3 e um monstro em campo; `monster.team` = lado (0/1), `monster.slot` = vaga. 1v1 = 2 vagas; 2v2 = 4 vagas (`sides: [0,0,1,1]`). A lógica de combate é a mesma; nada é duplicado.
- `server/room.js` roda `World` (humanos = vagas com `PlayerController`; as demais, IA) e transmite snapshots (`src/net/snapshot.js`). Quem desconecta tem a vaga assumida por um `TeamCoach` (IA).
- O cliente cria um `World` espelho (`mirror: true`: sem coaches, sem passos) e aplica snapshots; o renderizador desenha esse espelho.
- Produção: `server/server.js` expõe `/health`, comprime estáticos, limita mensagens/conexões/salas e aceita `ALLOWED_ORIGINS`. Cada jogador recebe um `token` ao entrar; `rejoin` (code+token) devolve a vaga e reenvia `start` com `resumed`. O cliente (`net/client.js`) tenta vários endereços, faz ping e não trata falha de conexão inicial como queda. Ver `DEPLOY.md`.
- Mecânicas próprias: o estado novo (calor, ímpeto, marcas, camuflagem, cópias em `world.decoys`, sentinelas como obstáculos com dono e lado) vai no snapshot; o cliente só desenha. Todo dano passa por `World.damage`, que aplica bloqueio (`Sig.isGuarding`), multiplicadores (`Sig.outgoing/incoming`), queimadura limitada (`FIRE`) e controle com resistência a sequência (`applyStun/applyRoot`, `CONTROL`).
