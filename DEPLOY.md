# Publicar o Elemental Arena na internet

O jogo é **um único processo Node**: serve o site (HTTP) e o multiplayer (WebSocket em `/ws`) na **mesma porta**. Por isso basta hospedar um serviço Node — o navegador usa `wss://` automaticamente quando a página é `https://`.

## Opção 1 — Render (grátis, mais simples)
1. Suba a pasta `elemental-arena/` para um repositório no GitHub.
2. No Render: **New → Blueprint**, escolha o repositório (usa o `render.yaml`). Ou **New → Web Service** com *Build* `npm ci --omit=dev` e *Start* `node server/server.js`.
3. Pronto: o Render dá um endereço `https://seu-jogo.onrender.com`. Mande aos amigos.
   - No plano grátis o serviço "dorme" após ~15 min sem uso (a 1ª visita demora ~30 s) e **reinicia ao atualizar** — partidas em andamento são encerradas.

## Opção 2 — Docker (Fly.io, Railway, VPS, Cloud Run...)
```bash
docker build -t elemental-arena .
docker run -p 8140:8140 elemental-arena        # http://localhost:8140
```
- **Fly.io:** `fly launch` (detecta o Dockerfile), `fly deploy`. Use `internal_port = 8140` e mantenha **1 máquina** (as salas ficam na memória do processo).
- **Railway:** *New Project → Deploy from repo*; ele define `PORT` sozinho.

## Opção 3 — Sua máquina + túnel (testar com amigos agora)
```bash
npm install && npm start
npx cloudflared tunnel --url http://localhost:8140     # ou: ngrok http 8140
```
O túnel imprime um endereço `https://....` — é só enviar. (WebSocket passa direto.)

## Opção 4 — Site estático em um lugar e servidor em outro
Hospede `index.html` + `src/` + `assets/monsters/` em qualquer host estático (Netlify, GitHub Pages) e rode só o servidor em outro lugar. Abra o site com o endereço do servidor:
`https://seu-site.com/?server=wss://seu-servidor.onrender.com/ws`
O link "Copiar link" da sala preserva esse parâmetro. No servidor, restrinja quem pode conectar: `ALLOWED_ORIGINS=https://seu-site.com`.

## Variáveis de ambiente
| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | 8140 | porta (hospedagens definem sozinhas) |
| `HOST` | 0.0.0.0 | interface |
| `ALLOWED_ORIGINS` | qualquer | lista (vírgulas) de origens aceitas no WebSocket, ex.: `https://seu-site.com` |
| `MAX_ROOMS` | 200 | máximo de salas simultâneas |
| `MAX_CONN_PER_IP` | 12 | conexões simultâneas por IP |
| `TRUST_PROXY` | 1 se houver `PORT` | usar `X-Forwarded-For` para identificar o IP real atrás de proxy |

## Como o multiplayer se comporta na internet
- **Link de convite:** na sala, **Copiar link** → o amigo abre, escolhe o time e já cai com o código preenchido.
- **Queda de conexão em partida:** o navegador tenta voltar sozinho por ~40 s (token da sessão); enquanto isso a IA joga no lugar. Se voltar, retoma o próprio time. Fechar a aba ou clicar *Sair* é saída definitiva.
- **Falha ao conectar** (servidor fora do ar/endereço errado) mostra "Servidor do jogo não encontrado", não "conexão perdida". Se a página for aberta por um servidor estático (ex.: `python -m http.server`), o jogo também tenta `ws://mesmo-host:8140/ws`.
- **Proteções:** limite de mensagens por conexão, de conexões por IP e de salas, tamanho máximo de mensagem (8 KB), validação de toda entrada, ping/pong a cada 20 s, compressão gzip do site e `permessage-deflate` nos snapshots.
- **Saúde:** `GET /health` → `{"ok":true,"rooms":N,"players":N,"uptime":S}` (use como *health check*).
- **Encerramento:** `SIGTERM`/`SIGINT` avisam as salas e fecham as conexões antes de sair.

## Limites conhecidos
- Estado em memória: **uma única instância** (não escale horizontalmente) e reinício = salas encerradas.
- Sem predição no cliente: o atraso dos comandos é o ping até o servidor (+ ~50 ms). Hospede perto dos jogadores (ex.: região de São Paulo).
- Sem contas: o nome é apenas um apelido e a reconexão usa um token efêmero guardado só na memória da página (recarregar a aba o descarta).
- Use sempre **HTTPS** em produção (páginas `https://` só abrem `wss://`; o jogo já escolhe sozinho).

## Jogar com amigos pelo seu PC (Tailscale)
Menor ping possível quando os amigos moram perto de você: o servidor roda na sua máquina e a conexão é direta.
1. Todos instalam o **Tailscale** (tailscale.com/download) e entram na **mesma rede**: você convida cada amigo pelo painel do Tailscale (*Users* → *Invite*) ou compartilha o seu PC com eles (*Machines* → seu PC → *Share*).
2. No seu PC, dê dois cliques em `jogar-local.bat` (ou `npm start`). Ele mostra o endereço, do tipo `http://100.x.y.z:8140`.
3. Os amigos abrem esse endereço no navegador, escolhem o time e entram na sala (o link de convite da sala também funciona).
4. O PC precisa ficar ligado com a janela aberta. Na primeira vez, permita o Node no Firewall do Windows (rede privada).
O `ws://` sobre `http://` funciona normalmente dentro do Tailscale; não precisa de HTTPS nem de abrir portas no roteador.
