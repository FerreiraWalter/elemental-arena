// Servidor do Elemental Arena: serve o jogo (HTTP) e as salas de multiplayer (WebSocket em /ws) na MESMA porta.
//   node server/server.js            → http://localhost:8140
// Variáveis de ambiente (todas opcionais):
//   PORT             porta (hospedagens como Render/Railway/Fly definem sozinhas)      [8140]
//   HOST             interface                                                         [0.0.0.0]
//   ALLOWED_ORIGINS  origens que podem abrir o WebSocket, separadas por vírgula        [qualquer uma]
//                    ex.: https://meujogo.onrender.com,https://meujogo.com
//   MAX_ROOMS        máximo de salas simultâneas                                       [200]
//   MAX_CONN_PER_IP  conexões simultâneas por IP                                       [12]
//   TRUST_PROXY      1 = confiar em X-Forwarded-For (atrás de proxy/CDN)               [1 se houver PORT]
// O servidor roda a simulação de cada partida (autoritativo); os navegadores só enviam entradas e desenham.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';
import { Room, newCode, MODES } from './room.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.css': 'text/css', '.ico': 'image/x-icon' };
const PUBLIC = ['index.html', 'src' + sep, 'assets' + sep + 'monsters' + sep];
const COMPRESSIBLE = new Set(['.html', '.js', '.json', '.css']);
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' };

// Limite de mensagens por conexão: rajada de 60, reposição de 80/s (o cliente envia ~30 entradas/s no máximo).
const BUCKET = { burst: 60, rate: 80 };
// Acima disto na fila de envio de um jogador (~0,5 s de snapshots), paramos de empilhar estado velho para ele.
// Antes o limite era 1 MB: um soluço de rede virava vários segundos de atraso (e de "ping") até a fila esvaziar.
export const LAG_BYTES = 24 * 1024;

export function createServer({
  port = 8140, host = '0.0.0.0', log = () => {}, timeScale = 1,
  allowedOrigins = [], maxRooms = 200, maxConnPerIp = 12, trustProxy = false,
} = {}) {
  const rooms = new Map();
  const perIp = new Map();
  const stats = { started: Date.now(), connections: 0, rejected: 0 };
  const cache = new Map(); // arquivos estáticos já lidos/comprimidos

  const ipOf = (req) => {
    if (trustProxy) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
    return req.socket.remoteAddress || '?';
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/health' || rel === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY });
        return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.connectedCount(), 0), uptime: Math.round((Date.now() - stats.started) / 1000) }));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      if (rel === '/') rel = '/index.html';
      const file = normalize(join(ROOT, rel));
      const relative = file.slice(ROOT.length + 1);
      if (!file.startsWith(ROOT + sep) || !PUBLIC.some((p) => relative === p || relative.startsWith(p))) { res.writeHead(404, SECURITY); return res.end('não encontrado'); }
      const ext = extname(file);
      // Cache em memória (com gzip), renovado quando o arquivo muda no disco.
      const mtime = (await stat(file)).mtimeMs;
      let entry = cache.get(file);
      if (!entry || entry.mtime !== mtime) {
        const raw = await readFile(file);
        entry = { raw, mtime, gz: COMPRESSIBLE.has(ext) && raw.length > 1024 ? gzipSync(raw) : null };
        cache.set(file, entry);
      }
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream', ...SECURITY,
        // Código: sempre revalidar (atualizações chegam na hora). Imagens: podem ficar em cache.
        'Cache-Control': ext === '.png' || ext === '.webp' ? 'public, max-age=3600' : 'no-cache',
      };
      const useGz = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      if (useGz) { headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding'; }
      const body = useGz ? entry.gz : entry.raw;
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404, SECURITY); res.end('não encontrado'); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;

  const originOk = (origin) => {
    if (!allowedOrigins.length) return true;
    if (!origin) return false;
    return allowedOrigins.some((o) => o === origin);
  };

  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 8 * 1024,
    perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 }, serverNoContextTakeover: true, clientNoContextTakeover: true },
    verifyClient: ({ origin, req }, done) => {
      const ip = ipOf(req);
      if (!originOk(origin)) { stats.rejected++; return done(false, 403, 'Origem não permitida'); }
      if ((perIp.get(ip) || 0) >= maxConnPerIp) { stats.rejected++; return done(false, 429, 'Conexões demais deste endereço'); }
      done(true);
    },
  });
  const alive = new WeakSet();
  const beat = setInterval(() => {
    for (const ws of wss.clients) { if (!alive.has(ws)) { ws.terminate(); continue; } alive.delete(ws); ws.ping(); }
  }, 20000);

  wss.on('connection', (ws, req) => {
    const ip = ipOf(req);
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    stats.connections++;
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    const send = (s) => { if (ws.readyState === 1 && ws.bufferedAmount < 1e6) ws.send(typeof s === 'string' ? s : JSON.stringify(s)); };
    // Fila de saída acumulada (rede do jogador engasgou): a sala pula snapshots velhos em vez de empilhá-los.
    send.lagging = () => ws.bufferedAmount > LAG_BYTES * timeScale; // timeScale > 1 só em testes (mais snapshots por segundo)
    let room = null, player = null;
    const burst = BUCKET.burst * timeScale, rate = BUCKET.rate * timeScale; // timeScale > 1 só em testes
    let tokens = burst, tAt = Date.now(), strikes = 0;
    const fail = (code, message) => send({ t: 'error', code, message });
    const attach = (r, p, rejoined = false) => { room = r; player = p; send({ t: 'joined', code: r.code, id: p.id, token: p.token, rejoined }); };

    ws.on('message', (raw) => {
      alive.add(ws);
      const now = Date.now();
      tokens = Math.min(burst, tokens + ((now - tAt) / 1000) * rate); tAt = now;
      if (--tokens < 0) { if (++strikes > 200) ws.close(1008, 'spam'); return; }
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return fail('bad_json', 'Mensagem inválida.'); }
      if (!msg || typeof msg.t !== 'string') return fail('bad_msg', 'Mensagem inválida.');
      if (msg.t === 'ping') return send({ t: 'pong', ts: msg.ts });

      if (msg.t === 'create' || msg.t === 'join' || msg.t === 'rejoin') {
        if (room) return fail('already', 'Você já está em uma sala.');
        if (msg.t === 'rejoin') {
          const r = rooms.get(String(msg.code || '').toUpperCase());
          const res = r && typeof msg.token === 'string' ? r.reclaim(msg.token, send) : { error: 'gone', message: 'A sala não existe mais.' };
          if (res.error) return fail(res.error, res.message);
          attach(r, res.player, true);
          return r.resume(res.player);
        }
        let target;
        if (msg.t === 'create') {
          if (rooms.size >= maxRooms) return fail('busy', 'Servidor lotado no momento. Tente de novo em instantes.');
          target = new Room(newCode((c) => rooms.has(c)), (code) => { rooms.delete(code); log('sala encerrada', code); }, { timeScale });
          if (MODES[msg.mode]) target.mode = msg.mode;
          rooms.set(target.code, target);
          log('sala criada', target.code);
        } else {
          const code = String(msg.code || '').toUpperCase().trim().slice(0, 8);
          target = rooms.get(code);
          if (!target) return fail('not_found', `Sala "${code}" não encontrada. Confira o código.`);
        }
        const r = target.join(msg.name, send);
        if (r.error) { if (target.players.size === 0) rooms.delete(target.code); return fail(r.error, r.message); }
        return attach(target, r.player);
      }
      if (!room || !player) return fail('no_room', 'Entre em uma sala primeiro.');
      if (msg.t === 'leave') { room.leave(player, true); room = null; player = null; return send({ t: 'left' }); }
      room.handle(player, msg);
    });
    ws.on('close', () => {
      const n = (perIp.get(ip) || 1) - 1;
      if (n <= 0) perIp.delete(ip); else perIp.set(ip, n);
      if (room && player) room.leave(player, false);
      room = null; player = null;
    });
    ws.on('error', () => {});
  });

  return new Promise((resolveStart, rejectStart) => {
    // Porta ocupada etc.: rejeita em vez de derrubar o processo com um erro sem tratamento.
    wss.on('error', () => {});
    server.once('error', rejectStart);
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolveStart({
        port: actual, rooms, stats,
        close: () => new Promise((r) => {
          clearInterval(beat);
          for (const room of rooms.values()) { room.broadcast({ t: 'error', code: 'shutdown', message: 'O servidor está reiniciando.' }); room.stop(); }
          for (const ws of wss.clients) ws.close(1001, 'shutdown');
          setTimeout(() => { for (const ws of wss.clients) ws.terminate(); }, 300).unref();
          wss.close(() => { server.closeAllConnections?.(); server.close(() => r()); });
        }),
      });
    });
  });
}

const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const hosted = !!process.env.PORT;
  const port = +(process.env.PORT || 8140);
  const list = (v) => String(v || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  createServer({
    port, host: process.env.HOST || '0.0.0.0',
    allowedOrigins: list(process.env.ALLOWED_ORIGINS),
    maxRooms: +(process.env.MAX_ROOMS || 200), maxConnPerIp: +(process.env.MAX_CONN_PER_IP || 12),
    trustProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY === '1' : hosted,
    log: (...a) => console.log(new Date().toISOString().slice(11, 19), ...a),
  }).then((s) => {
    console.log(`Elemental Arena rodando em http://localhost:${s.port}  (multiplayer: ws://localhost:${s.port}/ws · saúde: /health)`);
    if (!hosted) console.log('Para jogar com amigos na mesma rede, passe o IP desta máquina (ex.: http://192.168.0.10:' + s.port + '). Pela internet: veja DEPLOY.md.');
    const stop = (sig) => { console.log(`\n${sig}: encerrando...`); s.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('SIGINT', () => stop('SIGINT'));
  }).catch((e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`
A porta ${port} já está em uso: o jogo provavelmente já está rodando em outra janela.`);
      console.error(`Abra http://localhost:${port} no navegador, ou feche a outra janela e rode de novo.`);
      console.error(`Para usar outra porta: defina PORT (ex.: no PowerShell, $env:PORT=8141; npm start).
`);
    } else console.error('Não consegui iniciar o servidor:', e.message);
    process.exit(1);
  });
}
