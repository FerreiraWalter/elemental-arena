# CONTINUATION — Elemental Arena

> Estado REAL do código em `/tmp/ea` (clone de `FerreiraWalter/elemental-arena`, HEAD `88b640b`). NADA foi commitado, empurrado ou deployado ainda. Patch antigo (só a parte Brotossauro/HUD/toque, antes do FFA): `/mnt/user-data/outputs/elemental-arena-wip.patch`.
> Última atualização: sessão de 2026-10-20, fim da Fase 5 (UI) da missão 1v1v1v1.

## 0. Infra (feito e funcionando)
- VPS Hostinger KVM1 (Ubuntu 24.04), IP `200.141.16.192`, host `srv2078158.hstgr.cloud`. Acesso só pelo Web console do hPanel. Node 22 + Caddy + ufw. Código em `/opt/elemental-arena` (usuário `arena`), serviço systemd `elemental-arena` (PORT=8140, HOST=127.0.0.1, TRUST_PROXY=1). Caddyfile: `srv2078158.hstgr.cloud` (HTTPS pendente: Let's Encrypt falhou por DNS do hstgr.cloud) e `http://200.141.16.192` (funciona).
- Deploy manual: `cd /opt/elemental-arena && git pull && npm ci --omit=dev && chown -R arena:arena . && systemctl restart elemental-arena`. A VPS está no `88b640b`; nada deste trabalho foi para lá.

## 1. Objetivos
1. (Pedido 1) Brotossauro suporte híbrido, equilíbrio de dano, quebra de combo, HUD, toque.
2. (Missão atual) Modo 1v1v1v1 (4 jogadores, todos contra todos) integrado às salas online; reforma das 4 arenas (maiores, 4 jogadores); auditoria de colisões; debug; câmera; testes de multiplayer/arenas/performance.

## 2. Estado por fase da missão
- Fase 1 (diagnóstico): feita.
- Fase 2 (base multiplayer FFA): FEITA e testada (`test/ffa.mjs`, 13 testes).
- Fase 3 (colisões): PARCIAL. Feito: `collideStatic` com 2 passadas (corpo empurrado de um tronco não cai no vizinho), `test/collision.mjs` (spawns, bolsões por flood-fill, nocaute em alta velocidade nos 8 ângulos × 4 vagas, projéteis barrados por sólidos), ajustes de geometria que removeram quinas/vãos estreitos. FALTA: overlay de debug de colisão (hitboxes/spawns/áreas de ataque/regiões bloqueadas) — hoje só existe o `renderer.debug` antigo (tecla I, visão da IA).
- Fase 4 (arenas): FEITA em geometria (4 arenas em 1024×576, 4 spawns FFA + 2 spawns de duelo cada, simetria de 4 cantos). Visual verificado por screenshot (Jardim, Abismo, Floresta, Quadra). FALTA polimento: Abismo tem pontes de madeira muito dominantes (pode afinar), faltam tipos de decoração novos (coral, algas, samambaias) que eu havia planejado; Quadra continua simples.
- Fase 5 (UI/feedback): FEITA em grande parte: lobby (3 botões de criar sala, seletor de modo 1v1→2v2→1v1v1v1, 4 vagas coloridas), modo local "1v1v1v1 (você + 3 IAs)" no seletor de arena (e `?ffa`), 4 cores por vaga (`FFA_COLORS` em `config.js`, `setPerspective(side, ffa)`), HUD com painéis dos 3 adversários (nome na cor, 3 monstros, status, KO, ELIMINADO/CAMPEÃO), contador "N JOGADORES EM PÉ", efeito/texto de eliminação (`Renderer.elimFx`, detecta por `world.elim`, vale no espelho online), tela final com classificação (`ffaEnd`). FALTA: câmera com zoom/seguimento (hoje o mundo inteiro cabe na janela, escala menor: ~1.25× em 1280×720), teste visual da tela final FFA e do lobby por screenshot (o screenshot do fim travou por lentidão do Chromium sem GPU), efeito sonoro de eliminação, UI de toque no FFA não testada.
- Fase 6 (validação): PARCIAL (ver §5).

## 3. Arquivos
Criados: `src/control/touch.js`, `test/support.mjs`, `test/ffa.mjs`, `test/collision.mjs`, `tools/quick.mjs`, `tools/perf-ffa.mjs`, `CONTINUATION.md`.
Modificados (pedido 1): `index.html`, `src/ai/brain.js`, `src/audio/sfx.js`, `src/control/player.js`, `src/main.js`, `src/net/snapshot.js`, `src/render/hud.js`, `src/render/renderer.js`, `src/sim/abilities.js`, `monster.js`, `signature.js`, `species.js`, `world.js`, `src/ui/ui.js`.
Modificados (missão FFA/arenas): `src/config.js` (COLS 128/ROWS 72 → mundo 1024×576; `FFA_COLORS`), `src/sim/world.js` (FFA: `elim`, `ffa`, spawns FFA, `checkEnd`, `standings`, `sideName`, KOs, `collideStatic` 2 passadas), `server/room.js` (MODES.ffa 4 vagas, standings no fim), `server/server.js` (create aceita 'ffa'), `src/net/snapshot.js` (`el`), `src/arenas/helpers.js` (`mirX/mirY/quad/sym4`, ruído 4-simétrico), `src/arenas/{jardim,abismo,floresta,quadra}.js` (reescritas), `src/render/terrainpaint.js` (linhas da quadra, cerca, círculos de spawn), `src/audio/sfx.js` (pan 1024), `src/dev/renderbench.js` (opção `ffa`), `test/maps.mjs` (dimensões 1024×576 e área), `package.json` (test inclui collision, ffa, support).

## 4. Decisões de arquitetura
- Vaga (slot) ≠ lado (side). FFA = `sides [0,1,2,3]`; `w.ffa` é derivado (≥3 lados, todos distintos), então o espelho online também sabe. `m.team` = lado; `TEAM_COLOR` agora tem 4 entradas.
- Fim de partida genérico (`checkEnd`): termina quando resta ≤1 lado; empate (-1) se os dois últimos caem no mesmo instante. Classificação: vencedor 1º, demais por tempo de eliminação (empates compartilham posição 1,2,2,4).
- Servidor: modo `ffa` 4 vagas; trocar para 1v1 compacta vagas; 5º jogador recusado; reconexão por token.
- Mundo único 1024×576 para TODAS as arenas e modos (não por arena) — simples e consistente, mas duelos 1v1 ficam em arena maior (câmera ainda mostra tudo).
- Arenas: construídas por quadrante com `sym4`/espelhos; polilinhas espelhadas manualmente (`[(p)=>p,B.mirX,B.mirY,B.rot]`). Abismo: margem rasa de 2 tiles (altura 0.5) em volta de ilhas/pontes para nadadores entrarem/saírem da água funda (degrau de altura >0.55 bloqueia).
- Cores FFA fixas por vaga (dourado, vermelho, azul, verde), iguais para todos os jogadores; "você" é marcado pelo indicador já existente.

## 5. Testes executados e resultados REAIS (nesta árvore, após o redimensionamento)
- `node test/maps.mjs`: todos passaram (depois de ajustar geometria e `collideStatic`; antes havia 10 falhas reais: trajetos presos e tronco).
- `node test/collision.mjs`: todos passaram (4 arenas × 4 testes).
- `node test/ffa.mjs`: 13/13 passaram (última rodada completa: antes da reescrita da Floresta/Abismo final; rodada de novo na suíte em andamento — ver §7).
- `node test/evolution.mjs`: passou (rodado após as arenas novas).
- `tools/navtest.mjs 25 <arena>`: Jardim 1 falha em ~175 trajetos (destino colado à borda), Abismo 1 falha (descida do templo), Floresta 0.
- Performance (reais, mas NÃO equivalem a hardware com GPU): `node --expose-gc tools/perf-ffa.mjs 60` — sim 4 jogadores: média 0,5–1,3 ms/quadro, p95 ≤3,2 ms, picos até 30 ms (Floresta/Jardim, provavelmente montagem da grade A*/JIT; não investigado), heap +0,1–2,4 MB em 60 s (sem vazamento evidente). Render em Chromium headless sem GPU (`renderBench`, 240 quadros): média 6–11 ms, p95 19–26 ms, máx 24–38 ms — acima do orçamento de 16,7 ms no p95 NESTE ambiente de software; não foi medido em máquina real, então desempenho NÃO está validado. Script manual: abrir `/?watch` e rodar no console `(await import('/src/dev/renderbench.js')).renderBench({arena:'jardim', ffa:true})`.
- NÃO rodados ainda: `test/acceptance.mjs` (critério 9 falha também no baseline), balanceamento 1v1 pós-redimensionamento, `npm test` completo.

## 6. Problemas conhecidos
- Equilíbrio: Brotossauro estava 86–99% no 1v1 antes do redimensionamento (suspeitos: `closeMult`, pulso, sentinelas); o isolamento nunca foi lido. Pode ter mudado com as arenas maiores. Rodar `node tools/balance.mjs 3 1`.
- Partidas mais longas (112–166 s no acceptance).
- Câmera não implementada (arena inteira visível, monstros ~30% menores que antes).
- Sem teste automatizado de UI do FFA (apenas screenshot do HUD em jogo no Jardim; tela final e lobby não vistos).
- `tools/stuck.mjs` e `test/pairs.mjs` etc. podem assumir 704×400 — não verificados.
- Screenshots em Chromium sem GPU são lentos: usar poucos ticks (≤5 s) e timeout.

## 6b. Pedido Brotossauro + gato (2026-10-20) — IMPLEMENTADO (falta polir balanceamento)
**Brotossauro (rework):** novo sprite base desenhado à mão (`tools/pixelart/brotossauro.txt` → `assets/monsters/plant_1.png`: dino verde com placas de rocha e uma cerejeira nas costas; pétalas caem). Kit: seiva (Semente e Chicote deixam LENTO), flores carnívoras no E (alcance 150/175, tiros deixam lento, MORDEM quem encosta, curam o time), F virou CASCA VIVA / CASCA DA MONTANHA (kind 'buff'): redução de dano + regeneração por 4–5 s em você (20%/30%) e no parceiro até 150/190 px (35%/40%, + cura instantânea). IA usa a casca quando alguém do time está apanhando. Evolução (plant_3) mantida.
**Raiolua → Trovogato (novo, elemento `electric`):** sprites desenhados à mão (`tools/pixelart/raiolua.txt`, `trovogato.txt` → `cat_1.png`, `cat_3.png`; montados por `python3 tools/pixelart/build.py`; `tools/extract_cat.py` é a tentativa de recorte automático da arte de referência, descartada por ficar ilegível em 32 px). Mecânicas em `src/sim/electric.js` (cargas `volt`, lentidão `slow`, casca `dr`/`regen`, solo eletrificado `world.zones`, raio do céu, ricochete). Habilidades no fim de `src/sim/abilities.js` (sparkBall, scratch, strike220, shock110, boltDash, catLeap; voltSphere, conductClaws, thunderJudgment, overloadCore, lightningRupture, thunderInstinct). IA em `src/ai/tactics.js`; efeitos em `src/render/electricfx.js` + eventos no renderer; sons em `sfx.js`; HUD com CARGAS e ícones de lento/casca; snapshot sincroniza `slow/dr/regen`, `slowK/drK`, `volt` e `zones`. ELEMENT_MULT: elétrico 1.06 vs água, 0.92 vs planta/terra; terra 1.1 vs elétrico; alvo molhado +15%.
**Testes:** `test/trovogato.mjs` (13 cenários) passou; `support.mjs` e `signatures.mjs` atualizados e passando.
**Balanceamento medido (quick.mjs, 3 seeds, sem evolução):** Raiolua 49% (gotapus 100, hidro 83, broto 17, manti 13 → precisa achatar os extremos); Brotossauro 65% (era 82–86%; ainda forte vs água). Trovogato (estágio 2) NÃO medido.
**Pendências:** balancear extremos; screenshot das animações novas (raio do céu, puxão, rastro) não revisadas visualmente em detalhe; bestiário/seleção mostram o novo monstro automaticamente (ROSTER), mas não conferi o layout com 8 monstros.

## 6c. Continuação (2026-10-20, máquina local) — FEITO
- **Abismo (maps 4/149):** o fosso raso de 1–2 tiles entre chão alto dos dois lados prendia a IA. `arenas/abismo.js` converte esse fosso em tábua de ponte; `ai/brain.js` reduz o peso do custo de terreno (×0,3) enquanto segue um waypoint do A*. navtest 0/280 falhas.
- **Acceptance critério 9:** contra a IA `normal` (deixada fácil de propósito) o bot vence 20×0. O teste agora usa a IA `hard` por padrão (`DIFF=normal` para comparar): 11×9 e, na suíte final, 13×7; todos os critérios OK. A dificuldade do jogo não mudou.
- **Bug de render (antigo):** raios (`this.bolts`), cipós da Casca Viva e cortes (`drawSlashes`) eram desenhados no `fxT` DEPOIS do commit e o buffer era limpo no quadro seguinte → nunca apareciam. Movidos para antes do commit.
- **Animações elétricas:** raio do céu com tronco grosso + clarão no chão; 110V com cabos de raio presos em quem é puxado + anel fechando; rastro do dash contínuo (`EF.drawTrails`); pulo do gato com faíscas/poeira; núcleo de sobrecarga com esfera crescendo no peito; **cauda de raio em espiral** animada (`EF.drawTail`) no jogo e nos retratos do menu.
- **Sprites:** Raiolua/Trovogato recortados da arte de referência (`tools/extract_cats_ref.py <imagem>`: GrabCut + pintura por regiões + rampas fixas). Brotossauro: voltou ao sprite ORIGINAL (golem de pedra e musgo, de b136553) a pedido do usuário. Não rode `tools/pixelart/build.py` sem nome: ele sobrescreve os gatos com os .txt antigos.
- **HUD nova** (inspirada no esboço do usuário, sem ícones nas habilidades): painéis azul-noite chanfrados, retratos animados nos cartões, painel do cronômetro, retrato grande + barra de habilidades só com texto e etiqueta da tecla real, cantos com sala/ping (online, `hud.net`) e modo/arena.
- **Bestiário/seleção:** OK com 8 monstros (grade 4×2, 8 abas). Corrigido "Forte contra undefined" (elétrico ficou sem vantagem >1) e retrato cortado dos gatos.
- **Balanceamento (só números):** ver diff de `config.js`, `species.js`, `abilities.js`, `world.js`, `electric.js`. Medido com `tools/balance.mjs 3 1/2` (3 seeds × 4 arenas × 2 lados):
  - Estágio 1: Brasalisco 49 · Hidrocasco 49 · Brotossauro 47 · Ouriflama 52 · Gotapus 46 · Mantifolha 48 · Pugilar 59→54 (quick.mjs após hp 150→142) · Raiolua 50.
  - Estágio 2: Brasalisco 51 · Hidrocasco Abissal 48 · Brotossauro Ancestral 52 · Ouriflama 48 · Leviapus 50 · Silvamante 46 · Lutapacho 52 · Trovogato 54.
  - Ficaram confrontos extremos (>75% / <25%) ligados ao triângulo de elementos e ao kit (ex.: Raiolua×Gotapus 96, Brotossauro×Hidrocasco 100, Brasalisco×Mantifolha 100). Só números não resolvem; precisaria mexer em mecânica.

## 6d. Gameplay e "peso" das ações (2026-10-20, 2ª rodada) — FEITO
- **Voo/salto:** `World.isAirborne(m)` (saltos `leap`, pulos `hop` e voos `air`, na fase ativa) ignora degraus de altura, água funda, pedras e muretas; `World.landAirborne` acerta o pouso (ponto válido mais perto, depois volta pelo caminho). Antes o Salto Longo do Mantifolha travava na margem do canal (37 de 130 px). Voo Curto (`wingDash`) agora é `air: true`. Saltos ganham arco de altura no render (sombra fica no chão).
- **Abismo:** as pontes eram pintadas por cima das ilhas e o fosso estreito (corrigido na 1ª rodada) virava tábua → deque de madeira gigante. Agora pontes antes das ilhas, ponte N/S afastada (y=104) e ilha central mais baixa (ry 114): canais de verdade. Tábuas novas em `terrainpaint.js`: atravessadas ao sentido da ponte, frestas, pregos, corrimão com postes; madeira de mar no Abismo. navtest abismo: 0 falhas.
- **Peso das ações (só render, vale online):** `Renderer.juice` — carga com faíscas convergindo + aura e tremidinha; estalo ao soltar (estica/volta) + jato na direção da mira; arco de corte nos golpes (`drawSwing`); quem apanha encolhe/treme, faíscas na direção do golpe e estrela de impacto; esquiva com linhas de velocidade, poeira na saída/chegada e rastro tingido na cor do elemento.
- **Lutadores:** clique esquerdo = mão esquerda, direito = mão direita (Pugilar jab/direto, Lutapacho soco blindado/garra). `ARMS` em `artsprites.js` define o retângulo de cada braço na arte; `pose.punch` estica o braço para a frente.
- **Gatos:** cauda refeita como cauda fina de siamês em "?" com arcos elétricos e ponta azul (`EF.drawTail`). Pernas do Trovogato retas (`tools/fix_trovogato_legs.py`, roda depois de `extract_cats_ref.py`).
- **Cache dos sprites:** `ART_VERSION` em `artsprites.js` vai na URL dos PNGs; suba o número ao trocar qualquer PNG.

## 6e. Desempenho e ajustes (2026-10-20, 3ª rodada)
- **Ping 40→80:** a simulação ficou ~2,5× mais cara com os mapas 1024×576 (mais obstáculos): `blocked`/`blockedFor` varriam todos os obstáculos a cada sonda da IA (~60% do tempo). Agora há grade espacial (`World.obstacleGrid`, células de 32 px, refeita por `obstacleVersion`), usada em `blocked` e `collideStatic`. Medido (90 s IA×IA, `netbench`): 1v1 0,75→0,21 ms/passo, FFA 1,2→0,33 ms/passo (a `main` antiga fazia 0,3 ms no 1v1). Snapshots idênticos byte a byte (mesma simulação). Snapshot comprimido ~1–1,9 KB a 20 Hz (não mudou).
- **Medida do ping no cliente:** usa `ev.timeStamp` (chegada da mensagem) em vez da hora em que o JS processou o pong; quadro pesado na aba não vira mais "ping".
- **Gatos menores:** `SIZE` em `artsprites.js` (Raiolua 0,82, Trovogato 0,8); cauda acompanha.
- **Sentinelas do Brotossauro:** alcance do tiro 150→175 (Ancestral 175→200).

## 7. Próximos passos (ordem)
1. Confirmar no navegador real (com GPU) a HUD nova em 1280×720 e em janelas menores; o painel de testes desta sessão não renderizava em segundo plano.
2. Extremos de confronto (ver 6c) — decidir se mexe em mecânica.
3. Overlay de debug de colisão (off por padrão).
4. Câmera/zoom só se a legibilidade em 1280×720 for ruim.
5. Polimento visual do Abismo (pontes); screenshots do lobby FFA e tela final; teste online com 4 abas.

## 8. Comandos úteis
`npm test` · `node test/ffa.mjs` · `node test/collision.mjs` · `node test/maps.mjs` · `node tools/navtest.mjs 25 abismo --where` · `node --expose-gc tools/perf-ffa.mjs 60` · `PORT=8141 node server/server.js` e abrir `/?autostart&ffa&arena=abismo` (FFA local) · `node tools/balance.mjs 3 1`.
