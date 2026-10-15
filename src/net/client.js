// Cliente de rede (navegador e Node 22+: ambos têm WebSocket global).
// Eventos sintéticos: { t:'closed', wasOpen } só quando uma conexão JÁ ABERTA cai (falha ao conectar vira rejeição da Promise).
export class NetClient {
  constructor() { this.ws = null; this.handlers = new Map(); this.open = false; this.url = null; this.ping = null; this.lastRx = 0; this.rtt = 0; }

  // Tenta cada URL em ordem; resolve com a primeira que abrir.
  async connect(urls, timeout = 5000) {
    let lastErr = null;
    for (const url of [].concat(urls)) {
      try { await this.connectOne(url, timeout); this.url = url; return url; } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('sem endereço de servidor');
  }

  connectOne(url, timeout) {
    return new Promise((resolve, reject) => {
      let ws, settled = false;
      try { ws = new WebSocket(url); } catch (e) { return reject(e); }
      const fail = (msg) => { if (settled) return; settled = true; clearTimeout(timer); try { ws.close(); } catch { /* já fechado */ } reject(new Error(msg)); };
      const timer = setTimeout(() => fail('tempo esgotado ao conectar'), timeout);
      ws.onopen = () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        this.ws = ws; this.open = true; this.lastRx = Date.now();
        this.startKeepalive();
        resolve();
      };
      ws.onerror = () => fail('não foi possível conectar ao servidor');
      ws.onclose = () => {
        if (!settled) return fail('conexão recusada');
        if (this.ws !== ws) return;
        const wasOpen = this.open;
        this.open = false; this.stopKeepalive();
        if (wasOpen) this.emit({ t: 'closed', wasOpen });
      };
      ws.onmessage = (ev) => {
        this.lastRx = Date.now();
        let msg;
        try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
        if (msg.t === 'pong') { if (msg.ts) { const r = Date.now() - msg.ts; this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r; } return; }
        this.emit(msg);
      };
    });
  }

  // Ping a cada 3 s: mede a latência (rtt, em ms), mantém proxies abertos e detecta queda silenciosa (45 s sem nada = caiu).
  startKeepalive() {
    this.stopKeepalive();
    this.ping = setInterval(() => {
      if (!this.open) return;
      if (Date.now() - this.lastRx > 45000) { try { this.ws.close(); } catch { /* ok */ } return; }
      this.send({ t: 'ping', ts: Date.now() });
    }, 3000);
    this.ping.unref?.();
  }
  stopKeepalive() { if (this.ping) clearInterval(this.ping); this.ping = null; }

  on(type, fn) { (this.handlers.get(type) || this.handlers.set(type, []).get(type)).push(fn); return this; }
  off(type) { this.handlers.delete(type); }
  emit(msg) { for (const fn of this.handlers.get(msg.t) || []) fn(msg); for (const fn of this.handlers.get('*') || []) fn(msg); }
  send(obj) { if (this.open && this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  close() { this.open = false; this.stopKeepalive(); try { this.ws?.close(); } catch { /* já fechado */ } }
}

// Endereços candidatos do servidor, em ordem:
//  1) ?server=ws://host:porta/ws (ou wss://) · 2) mesmo host que serviu a página · 3) se a página foi aberta por
//  um servidor estático qualquer (python, Live Server...), o servidor do jogo na porta 8140 do mesmo host.
export function serverUrls(loc = globalThis.location) {
  const q = new URLSearchParams(loc.search).get('server');
  if (q) return [q.replace(/^http/, 'ws')];
  const secure = loc.protocol === 'https:';
  const list = [`${secure ? 'wss' : 'ws'}://${loc.host}/ws`];
  if (!secure && loc.hostname && String(loc.port) !== '8140') list.push(`ws://${loc.hostname}:8140/ws`);
  return list;
}
export const serverUrl = (loc) => serverUrls(loc)[0];

// Código de sala vindo do link de convite (?sala=ABCD).
export function inviteCode(loc = globalThis.location) {
  const c = (new URLSearchParams(loc.search).get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return c.length === 4 ? c : '';
}
