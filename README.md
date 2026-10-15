# Elemental Arena (título provisório)

Duelo de monstros elementais em tempo real, em pixel art. **6 monstros jogáveis**, cada um com forma evoluída, 4 arenas, partidas **contra a IA** ou **online (1v1 e 2v2)**. Em cada vaga o time tem 3 monstros, mas só um por jogador luta de cada vez.

## Como rodar
```bash
npm install        # uma vez (instala o `ws`, usado só pelo servidor)
npm start          # servidor + jogo em http://localhost:8140
```
Abra `http://localhost:8140`. O mesmo servidor entrega o jogo e as salas de multiplayer (WebSocket em `/ws`), na mesma porta (`PORT=9000 npm start` para mudar).

- **Jogar sozinho (contra a IA):** Menu → *Jogar contra a IA* → time → arena. Também funciona abrindo o jogo por qualquer servidor estático, mas o multiplayer precisa do `npm start`.
- **Com amigos:** mesma rede → `http://IP-DO-ANFITRIÃO:8140`; pela internet → veja **[DEPLOY.md](DEPLOY.md)** (Render, Docker/Fly, túnel). Na sala, **Copiar link** gera um convite com o código. Não há contas nem login.

## Multiplayer online
1. Menu → **Multiplayer online** → escolha seus 3 monstros → **Criar sala 1v1** ou **2v2** (você recebe um código de 4 caracteres, ex.: `K7QM`) — ou digite um código e **Entrar na sala** (aceita minúsculas e Ctrl+V).
2. Na **sala**: veja jogadores, equipes (A/B), time de cada um e quem está pronto; clique numa vaga livre para sentar nela. O anfitrião (★) muda **modo** (1v1/2v2) e **arena**; mudar a configuração desmarca a prontidão de todos.
3. Todos clicam **Pronto**; o anfitrião clica **Iniciar partida** (1v1 precisa de 2 jogadores, 2v2 de 4).
4. Na batalha, cada jogador controla o próprio monstro, com combate simultâneo em tempo real. Ao terminar, o anfitrião escolhe *Voltar à sala* (revanche).

Como funciona (servidor autoritativo):
- O **servidor** simula tudo (mesmo `World` do modo local, a 60 Hz): movimento, golpes, projéteis, dano, status, evoluções, trocas, terreno, perigos e resultado. O cliente só envia **entradas** (direção, mira, botões, `switch`, `evolve`); o servidor valida e limita tudo (números fora do faixa, teclas inválidas, trocas proibidas, evolução sem energia).
- A 30 Hz o servidor envia **snapshots** do estado; o navegador aplica num mundo espelho (nunca simula) e interpola. Todos veem o mesmo estado. Fogo, água, raízes, obstáculos destruídos e nuvens são sincronizados.
- **Desconexões:** no lobby a vaga é liberada (o anfitrião passa para o próximo); em partida, **a IA assume o time** de quem saiu e, se a queda foi de rede, o navegador **reconecta sozinho (~40 s) e devolve o controle**; sem jogadores a sala é encerrada. **Sala cheia**, **código inválido** e **partida já iniciada** mostram mensagens claras.
- Para testar sozinho: `npm run bot -- CODIGO` entra na sala como um robô que joga de verdade pela rede (rode vários para completar um 2v2).

## Controles
| Tecla | Ação |
|---|---|
| WASD / setas | mover |
| Mouse | mirar |
| Botão esquerdo / direito | ataque à distância (segure para repetir) / corpo a corpo |
| Q / E / F | poderes especiais |
| Espaço / Shift | esquiva com invulnerabilidade |
| 1 2 3 / Tab | trocar o monstro em campo (recarga de 3 s) |
| **G** | **evoluir** (energia cheia) |
| P / Esc | pausa (local) ou menu (online; a partida continua) |

## Os 6 monstros
Triângulo: **Fogo > Planta > Água > Fogo**. Arte: sprites extraídos das folhas do usuário (`assets/source/`); estágio 1 = forma base, estágio 3 = evoluída.

| Linha | Base → Evoluída | Identidade |
|---|---|---|
| Fogo | Brasalisco → Ascendido | pressão ofensiva, lava, investida que explode |
| Água | Hidrocasco → Abissal | mobilidade em chão molhado, onda que arrasta, bolha |
| Planta | Brotossauro → Ancestral | controle: raízes grandes, barreira de mata, espinheiros |
| **Fogo** | **Ouriflama → Ouriflama Vulcânico** | ágil; **Investida Incandescente deixa largo rastro de fogo**; o Vulcânico **mergulha na terra (invulnerável), persegue o alvo e irrompe embaixo dele, levantando-o no ar** |
| **Água** | **Gotapus → Leviapus** | **Nuvem de Tinta** que bloqueia a visão e esquiva a jato; o Leviapus **agarra e prende** o inimigo e cobre a arena de tinta |
| **Planta** | **Mantifolha → Silvamante** | **Salto Longo por cima de obstáculos e inimigos** (invulnerável no ar), esporos que enraízam; o Silvamante tem **Salto Celeste de ~250 px** que aterrissa enraizando, e leque de 3 lâminas |

Evolução (`EVOLUTION` em `src/config.js`): energia por dano causado/recebido, esquivas e interações com o terreno; com 150, aperte **G** (uma por monstro por partida; vida mantém a %; recargas preservadas; a batalha não pausa). A energia persiste no banco; derrotados não evoluem; a IA evolui sozinha.

## Arenas
Jardim Selvagem (raízes que irrompem, espinheiros, sebes, ruínas), Abismo das Marés (ilhas, água funda, plataforma alta, correntezas, gêiseres), Floresta Ancestral (árvores, troncos, mata baixa, riacho) e Quadra Clássica. Definições data-driven em `src/arenas/`.

## Arte: final × provisório
- **Final (do usuário):** os 12 sprites dos monstros (`assets/monsters/*.png`, extraídos por `tools/extract_sprites.py` e `tools/extract_sheet2.py`).
- **Provisório:** só há um quadro por forma; a **animação é procedural** sobre a arte (respiração, passos, inclinação, chamas/folhas/água por cor). Faltam folhas de animação quadro a quadro (andar, atacar, dano, morte). Efeitos, arenas, obstáculos e interface são pixel art gerada em código. Sem áudio.

## Testes e build
```bash
npm test         # trocas, evolução, novos monstros/2v2, aceitação em partidas completas e REDE (servidor real + clientes WebSocket)
npm run build    # valida módulos (cliente e servidor), imports e assets; simula cada arena; gera dist/
npm run pairs    # equilíbrio entre formas       npm run arenas    # IA × IA em cada arena
```
Arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
