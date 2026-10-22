# Elemental Arena (título provisório)

Duelo de monstros elementais em tempo real, em pixel art. **10 monstros jogáveis**, cada um com forma evoluída, 6 arenas, partidas **contra a IA** ou **online (1v1 e 2v2)**. Em cada vaga o time tem 3 monstros, mas só um por jogador luta de cada vez.

## Como rodar
```bash
npm install        # uma vez (instala o `ws`, usado só pelo servidor)
npm start          # servidor + jogo em http://localhost:8140
```
Abra `http://localhost:8140`. O mesmo servidor entrega o jogo e as salas de multiplayer (WebSocket em `/ws`), na mesma porta (`PORT=9000 npm start` para mudar).

- **Jogar sozinho (contra a IA):** Menu → *Jogar contra a IA* → time → arena. Também funciona abrindo o jogo por qualquer servidor estático, mas o multiplayer precisa do `npm start`.
- **Com amigos:** mesma rede → `http://IP-DO-ANFITRIÃO:8140`; pela internet → veja **[DEPLOY.md](DEPLOY.md)** (Render, Docker/Fly, túnel). Na sala, **Copiar link** gera um convite com o código. Não há contas nem login.

## Modo Treinamento
Menu → **Treinamento** → escolha de 1 a 3 monstros e a arena. Você treina contra **bonecos de pano com alvo** (até 3), que têm **vida infinita**, reagem aos golpes (balançam, queimam, ficam presos, recebem marcas) e voltam ao lugar. Seus monstros não caem e se curam sozinhos.
- **G** evolui a qualquer momento (a energia fica sempre cheia no treino).
- **T** abre o painel: número de bonecos (1 a 3), **bonecos atiram** (para treinar esquiva, Casco Reflexo e reflexo), **recargas instantâneas**, **voltar à forma base** e sair.
- **B** troca rápido o número de bonecos; **1/2/3** trocam de monstro.
- No topo: **dano nos últimos 5 s, dano por segundo e o último golpe**.
- Para ver duas IAs lutando, abra o jogo com `?watch` (ex.: `?watch&arena=abismo`).

## Multiplayer online
1. Menu → **Multiplayer online** → escolha seus 3 monstros → **Criar sala 1v1** ou **2v2** (você recebe um código de 4 caracteres, ex.: `K7QM`) — ou digite um código e **Entrar na sala** (aceita minúsculas e Ctrl+V).
2. Na **sala**: veja jogadores, equipes (A/B), time de cada um e quem está pronto; clique numa vaga livre para sentar nela. O anfitrião (★) muda **modo** (1v1/2v2) e **arena**; mudar a configuração desmarca a prontidão de todos.
3. Todos clicam **Pronto**; o anfitrião clica **Iniciar partida** (1v1 precisa de 2 jogadores, 2v2 de 4).
   - **Robôs:** o anfitrião pode ocupar vagas com robôs (IA do servidor): **+ ROBÔ** numa vaga livre ou **COMPLETAR COM ROBÔS**; **ROBÔS: FÁCIL/NORMAL/DIFÍCIL** muda o nível; **NOVO TIME** sorteia outro time para o robô e **REMOVER** libera a vaga. Robôs já entram prontos. Se um amigo entrar com a sala cheia de robôs, ele **toma a vaga de um robô**. Funciona no 1v1 e no 2v2 (ex.: você + um amigo contra 2 robôs, ou você sozinho contra 3 robôs).
4. Na batalha, cada jogador controla o próprio monstro, com combate simultâneo em tempo real. Ao terminar, o anfitrião escolhe *Voltar à sala* (revanche).

Como funciona (servidor autoritativo):
- O **servidor** simula tudo (mesmo `World` do modo local, a 60 Hz): movimento, golpes, projéteis, dano, status, evoluções, trocas, terreno, perigos e resultado. O cliente só envia **entradas** (direção, mira, botões, `switch`, `evolve`); o servidor valida e limita tudo (números fora do faixa, teclas inválidas, trocas proibidas, evolução sem energia).
- A 20 Hz o servidor envia **snapshots** do estado; o navegador aplica num mundo espelho (nunca simula) e interpola. Todos veem o mesmo estado. Fogo, água, raízes, obstáculos destruídos e nuvens são sincronizados.
- **Contra o ping:** o seu monstro é desenhado onde o servidor vai colocá-lo (predição com as teclas ainda não confirmadas). Esquiva, investida e salto acontecem na tela no instante do aperto; nas outras habilidades o som e a recarga começam na hora; o monstro vira para o mouse sem esperar o servidor. Se o servidor recusar a tecla (atordoado, por exemplo), a previsão é desfeita.
- **Desconexões:** no lobby a vaga é liberada (o anfitrião passa para o próximo); em partida, **a IA assume o time** de quem saiu e, se a queda foi de rede, o navegador **reconecta sozinho (~40 s) e devolve o controle**; sem jogadores a sala é encerrada. **Sala cheia**, **código inválido** e **partida já iniciada** mostram mensagens claras.
- Para testar sozinho: `npm run bot -- CODIGO` entra na sala como um robô que joga de verdade pela rede (rode vários para completar um 2v2).

## Controles
| Tecla | Ação |
|---|---|
| WASD / setas | mover |
| Mouse | mirar |
| Botão esquerdo / direito | golpe básico próprio do monstro (segure para repetir) / golpe pesado |
| Q / E / F | poderes especiais. O **F dos defensivos é uma guarda** (Casco Reflexo, Casco Abissal, Contra-Golpe, Couraça, Casca Viva): enquanto ativa, **bloqueia QUALQUER ataque** (dano, atordoamento, raízes, empurrão, puxão e combo); alguns ainda contra-atacam ou curam |
| Espaço / Shift | esquiva com invulnerabilidade |
| 1 2 3 / Tab | trocar o monstro em campo (recarga de 3 s) |
| **G** | **evoluir** (energia cheia) |
| **H** | **ajuda**: mecânica do monstro em campo, cada botão e como ler a tela (abre sozinha na 1ª partida) |
| P / Esc | pausa (local) ou menu (online; a partida continua) |

## Combate focado em skills
- **Golpe básico (botão esquerdo):** cada monstro tem o seu, de alcance curto ou médio, sem tiro longo repetido: Chicote de Brasa (Brasalisco), Onda de Choque (Hidrocasco, onda curta que atravessa e empurra), Semente Explosiva (Brotossauro, arco que vira raízes), Leque de Espinhos (Ouriflama, espingarda), Bolha Saltitante (Gotapus, arco que estoura e molha) e Foice Dupla (Mantifolha, corpo a corpo com avanço). As evoluções têm versões mais fortes.
- **Ritmo:** cada golpe básico que acerta adianta 0,6 s das recargas de Q, E e F. Bater faz as skills voltarem mais rápido.
- **Skills mais frequentes:** recargas 30% menores; algumas têm **cargas** (Meteoro e Brotos Sentinela: 2).
- Ajustes em `src/config.js` (`COMBAT`). Nas simulações IA × IA, as skills passaram a causar mais dano que os golpes básicos (36% contra 31%; antes 25% contra 47%).

## Os 7 monstros e suas mecânicas próprias
Triângulo: **Fogo > Planta > Água > Fogo** (+10–12% de dano). Cada linha tem uma **mecânica própria** (`src/sim/signature.js`) que muda o jeito de jogar com ela e contra ela; a evolução aprofunda essa mecânica. Arte: sprites extraídos das folhas do usuário (`assets/source/`).

**Pugilar → Lutapacho (Terra, corpo a corpo):** elemento neutro no triângulo (sem vantagem nem fraqueza). Jab rápido e Direto pesado; **Combo**: 3 acertos e o próximo golpe de perto vira **NOCAUTE**. Pugilar: Salto Canguru, Rabada (giro em volta), Contra-Golpe (bloqueia e devolve). Lutapacho: **Arremesso de Pedra** (arranca uma pedra do chão; quem leva fica atordoado), Tremor (salta e soca o chão), Couraça. Sprites extraídos com `tools/extract_brawlers.py`.

**Dificuldade da IA** (`DIFFICULTY_MODS` em `src/sim/world.js`): além de reação, esquiva e mira, a IA pensa mais devagar e é menos agressiva nos níveis baixos. Medida contra a IA sem limitações, que vence 87% contra o Fácil, 68% contra o Normal e 58% contra o Difícil.

| Linha | Mecânica | Como joga | Ponto fraco |
|---|---|---|---|
| **Brasalinha** → Fornalhonte (fogo, de longe) | **Centelha Ativa / Forja Ardente**: cada Pedra em Brasa deixa uma **brasa** no chão (estoura em quem pisa); recolher uma brasa guarda uma **centelha** (próximo tiro incandescente, explode) e dá disparada (evoluído: couraça). **E** explode todas as brasas; **Q** jato de fogo contínuo que detona as brasas (base) ou salva das chaminés (evoluído); **F** recuo para trás (base) ou tranco que recolhe brasas (evoluído). Sem debuff próprio | espalhar brasas e escolher entre recolher ou detonar | frágil de perto; a água apaga as brasas |
| **Hidrocasco** → Abissal (água) | **Casco Reflexo** (F): 0,55 s de bloqueio que corta 85% do dano, **devolve projéteis** e **contra-ataca** quem bate de perto. **Redemoinho móvel** (E): anda girando, arrasta quem estiver perto em volta e cospe todos no fim. Evoluído: bloquear dá uma bolha de 25 | tempo de reação e posição | áreas, raízes e quem espera o casco abrir |
| **Brotossauro** → Ancestral (planta) | **Brotos Sentinela** (F): até 2 torres vivas (10 s) que atiram sozinhas e **curam** o dono por perto. **Raízes** (Q): círculo rúnico no chão e uma jaula de raízes que brota da borda. **Esquiva enterrada**: só uma flor vermelha anda na superfície (no Ancestral, uma arvorezinha, que ao brotar empurra quem estiver colado). Evoluído: guardiões maiores que atiram espinhos | controle de território | fogo (queima as torres) e mobilidade |
| **Ouriflama** → Vulcânico (fogo) | **Ímpeto**: correndo sem parar entra **EM DISPARADA** (+15% de velocidade) e o próximo golpe de perto ou investida causa **+60%**. **Espinhos** ferem quem o ataca de perto. Evoluído: sair do Mergulho Vulcânico (que levanta o alvo) enche o ímpeto | bater e correr | atordoar ou prender zera o ímpeto |
| **Gotapus** → Leviapus (água) | **Ilusões de Tinta**: a esquiva deixa uma **cópia falsa** correndo; a Ilusão (Q) cria duas cópias e **camufla** até atacar. As cópias **atiram bolhas fracas**, enganam a IA e as sentinelas e estouram em tinta. **Bolha Prisão** (E): bolha em arco que prende quem estiver no círculo. Evoluído (Leviapus): **Ilusão de Tinta com 3 cópias** (Q), **Tentáculos do Abismo** (E) que irrompem no ponto marcado e onde estiverem as cópias, e **Maré Esmagadora** (F): uma onda que cresce, carrega quem pega (até contra paredes) e arrebenta no fim | confusão e emboscada | ataques em área estouram todas as cópias |
| **Mantifolha** → Silvamante (planta) | **Marca do Louva-a-deus**: cada acerto marca a presa (máx. 3); com 3 marcas, a foice ou o pouso do salto **EXECUTA** (+12 de dano, prende e recarrega o Salto Longo). Evoluída: execução +16, marcas duram mais | marcar de longe, finalizar de perto | é frágil; esquivar o salto quebra o combo |

Na seleção de time cada cartão mostra a mecânica e a dificuldade (◆◆◇); passe o mouse para ver o ponto fraco. O bestiário (Menu → Monstros) detalha tudo.

### Equilíbrio do fogo
O fogo pesava por **somar** efeitos: queimadura renovada a cada tiro, poças de fogo deixadas por todo projétil (as da lava eram de 16 px por 4,5 s), cones de 20–26 de dano por segundo e uma penalidade escondida contra quem estava molhado. Agora:
- **Queimadura** 2/s (era 3), no máximo 2,5 s por golpe; na água a duração cai pela metade (na planta é cheia: fogo > planta).
- **Chão em brasa** criado por ataques arde 2,5/s (vegetação em chamas 3,5/s; antes 5/s em ambos) e dura menos; tiros de fogo acendem só um tile ao acertar; a lava deixa poças de 8–9 px por cerca de 2 s.
- **Cones** (Sopro Ígneo/Infernal, Tempestade de Espinhos): cerca de 12–18 de dano no total, preparação e **recuperação** maiores (janela de contra-ataque) e acendem menos vegetação.
- **Investidas** de fogo com recuperação maior; a explosão da Erupção dá **metade** em quem já levou a investida (sem dano dobrado).
- **Mergulho Vulcânico**: curva limitada (dá para despistar correndo de lado) e atordoamento de 0,55 s (era 0,9).
- O poder voltou como **dano direto e legível** (Brasa 10, Bola de Magma 13, Garra Vulcânica 19) e pela Fornalha, em vez de área persistente. A lava vence um jato d'água no ar (o jato vira vapor).
- **Controle em sequência** (atordoar/prender) perde 60% de força por 1,2 s depois de um controle: não dá para prender alguém em cadeia.

**Morte súbita:** a partir de 2 min 30 s de partida, nenhuma cura funciona (água, vegetação, fogo, sentinelas, Crescimento) e a IA para de recuar. O aviso aparece sob o relógio 20 s antes. Evita partidas eternas entre monstros que se curam.

## Leitura do combate
- **Setas e arcos no chão** mostram onde investidas, cones, raios e golpes de perto fortes vão acertar; círculos marcam meteoros, raízes e sementes de sentinela.
- **Barra sobre a cabeça durante a preparação**: **dourada = IMPARÁVEL**, branca = um acerto interrompe.
- **Gotas azuis** depois de um golpe forte = janela para contra-atacar.
- Barra laranja (calor) e amarela (ímpeto) sobre os monstros dessas linhas; folhas verdes = marcas de caça.
- O HUD mostra o medidor da mecânica do seu monstro e os status com nome, e pisca o botão quando você aperta algo em recarga ("RECARGA"/"EXAUSTO").
- **Som** sintetizado (sem arquivos) para tiros, golpes, bloqueios, explosões, evolução e menus; volume em Opções.

Evolução (`EVOLUTION` em `src/config.js`): **cada ataque que acerta enche ~7% da barra** (bônus fixo por acerto + parte do dano), e dano recebido, esquivas e interações com o terreno também contam; com a barra cheia (em mediana ~20 s de luta), aperte **G** (uma por monstro por partida; vida mantém a %; recargas preservadas; a batalha não pausa). A energia persiste no banco; derrotados não evoluem; a IA evolui sozinha.

## Arenas
Jardim Selvagem (raízes que irrompem, espinheiros, sebes, ruínas), Abismo das Marés (ilhas, água funda, plataforma alta, correntezas, gêiseres), Floresta Ancestral (árvores, troncos, mata baixa, riacho), Quadra Clássica, **Terra Rachada** (paredes de terra sobem do chão no meio da partida, com rachaduras de aviso) e **Atlântida** (fase que anda: a tsunami persegue da esquerda e alaga a arena até o coliseu, onde o **Kraken** neutro ataca todos; vida e ritmo do Kraken mudam com 1v1, 2v2 e 1v1v1v1). Definições data-driven em `src/arenas/`; eventos roteirizados por tempo em `src/sim/arenaevents.js`.

## Arte: final × provisório
- **Final (do usuário):** os 12 sprites dos monstros (`assets/monsters/*.png`, extraídos por `tools/extract_sprites.py` e `tools/extract_sheet2.py`).
- **Provisório:** só há um quadro por forma; a **animação é procedural** sobre a arte (respiração, passos, inclinação, chamas/folhas/água por cor). Faltam folhas de animação quadro a quadro (andar, atacar, dano, morte). Efeitos, arenas, obstáculos, sentinelas e interface são pixel art gerada em código. Os sons são sintetizados (WebAudio).

## Testes e build
```bash
npm test         # trocas, evolução, monstros/2v2, MECÂNICAS PRÓPRIAS e limites do fogo, aceitação, suavização e REDE
npm run build    # valida módulos (cliente e servidor), imports e assets; simula cada arena; gera dist/
node tools/balance.mjs 6 1                            # matriz de vitórias IA × IA (estágio 1 ou 2) com a origem do dano
node tools/navtest.mjs 60                            # trajetos aleatórios por arena e por tamanho de monstro (A* + direção da IA)
node tools/stuck.mjs 6 quadra,jardim,abismo,floresta 1 # partidas IA × IA: monstros presos, períodos sem combate e energia por minuto
node tools/duelinfo.mjs brasalisco gotapus quadra 3   # detalhe de um confronto
```
Arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
