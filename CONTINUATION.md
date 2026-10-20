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

## 7. Próximos passos (ordem)
-1. PUSH bloqueado: o proxy do sandbox não tem credencial para FerreiraWalter/elemental-arena (403). Commit local na branch `feat/ffa-arenas-trovogato`; bundle em /mnt/user-data/outputs. O usuário precisa adicionar o repositório às fontes da sessão (ou aplicar o bundle) para subir.
0. Suíte de 2026-10-20: switching/evolution/monsters/signatures/support OK; `maps` FALHOU 1: "abismo: 4/149 trajetos falharam" (≥98% exigido; navtest com seed padrão deu só 1 falha — investigar com `node tools/navtest.mjs 25 abismo --where`, provável descida do templo/escadas ou margem rasa). collision/ffa/smooth/net não chegaram a terminar nesta rodada.
1. Conferir `/tmp/suite.out` (suíte por arquivo) e corrigir falhas.
2. Rodar `node test/acceptance.mjs 3` e `node tools/balance.mjs 3 1`; corrigir o equilíbrio do Brotossauro (alvo ≈45–55%, ninguém >60%).
3. Overlay de debug de colisão (off por padrão; tecla K/flag nas opções): bordas, hitboxes de obstáculos/muros, spawns, áreas bloqueadas.
4. Câmera: zoom mínimo/seguimento do jogador (renderer `view` + HUD `aw`, `toWorld`, retículo, floaters) — só se a legibilidade em 1280×720 for ruim.
5. Polimento visual do Abismo (pontes) e decorações novas; som de eliminação.
6. Screenshots do lobby FFA e da tela final; teste manual online com 4 abas.
7. Commit em branch (`feat/ffa-arenas`), com as atribuições exigidas; push/deploy na VPS somente com autorização do usuário.

## 8. Comandos úteis
`npm test` · `node test/ffa.mjs` · `node test/collision.mjs` · `node test/maps.mjs` · `node tools/navtest.mjs 25 abismo --where` · `node --expose-gc tools/perf-ffa.mjs 60` · `PORT=8141 node server/server.js` e abrir `/?autostart&ffa&arena=abismo` (FFA local) · `node tools/balance.mjs 3 1`.
