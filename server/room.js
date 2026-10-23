import { ROSTER } from '../src/sim/species.js';
import { ARENA_ORDER } from '../src/arenas/index.js';
import { randomBytes } from 'node:crypto';
import { Match } from './match.js';
import { Tournament } from './tournament.js';

// Sala de multiplayer: lobby (jogadores, vagas/equipes, modo, arena, prontidão) e partida autoritativa.
// A sala não conhece rede: recebe mensagens já decodificadas e envia por `player.send(obj)`.
// ROBÔS: o anfitrião pode ocupar vagas com robôs (IA que roda aqui no servidor, igual aos monstros da IA no jogo
// local). Robôs estão sempre prontos; se um amigo entrar com a sala cheia, ele toma a vaga de um robô.

// ffa = 1v1v1v1: quatro jogadores, cada um num lado próprio (sem aliados); vence o último com monstros vivos.
// tour1/tour2 = torneio 1v1 ou 2v2 (sala de até 8; ver tournament.js): as vagas não têm lado, a chave decide.
export const MODES = { '1v1': { seats: 2, sides: [0, 1] }, '2v2': { seats: 4, sides: [0, 0, 1, 1] }, ffa: { seats: 4, sides: [0, 1, 2, 3] }, tour1: { seats: 8, tour: '1v1' }, tour2: { seats: 8, tour: '2v2' } };
export const ARENA_CHOICES = [...ARENA_ORDER, 'sorteio']; // sorteio = uma arena diferente a cada partida
export const BOT_LEVELS = ['easy', 'normal', 'hard'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I para evitar confusão ao ditar o código
const noop = () => {};

function randomTeam() {
  const pool = [...ROSTER];
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 3);
}

export class Room {
  constructor(code, onEmpty, opts = {}) {
    this.timeScale = opts.timeScale || 1; // só para testes (simula mais rápido que o tempo real)
    this.code = code;
    this.onEmpty = onEmpty;
    this.mode = '1v1';
    this.arena = ARENA_ORDER[0];
    this.botLevel = 'normal';
    this.state = 'lobby'; // lobby | playing | over | tour
    this.players = new Map(); // id -> { id, name, seat, team, ready, connected, send, bot? }
    this.hostId = null;
    this.nextId = 1;
    this.match = null; // partida comum em andamento (ou a última)
    this.tour = null; // torneio em andamento
  }

  get world() { return this.match?.world ?? null; }

  get seats() { return MODES[this.mode].seats; }
  sideOfSeat(seat) { return MODES[this.mode].sides?.[seat] ?? null; }
  list() { return [...this.players.values()]; }
  humans() { return this.list().filter((p) => !p.bot); }
  bots() { return this.list().filter((p) => p.bot); }
  connectedCount() { return this.humans().filter((p) => p.connected).length; }
  freeSeat() {
    const taken = new Set(this.list().map((p) => p.seat));
    for (let i = 0; i < this.seats; i++) if (!taken.has(i)) return i;
    return -1;
  }
  nextHost() { return this.humans().find((p) => p.connected)?.id ?? null; }

  // Entra na sala; retorna { player } ou { error }. Sala cheia de robôs: o amigo toma a vaga do último robô.
  join(name, send) {
    if (this.state !== 'lobby') return { error: 'started', message: 'A partida desta sala já começou.' };
    let seat = this.freeSeat();
    if (seat < 0) {
      const bot = this.bots().pop();
      if (!bot) return { error: 'full', message: 'A sala está cheia.' };
      this.players.delete(bot.id);
      seat = bot.seat;
    }
    const player = { id: this.nextId++, token: randomBytes(12).toString('hex'), name: String(name || 'Jogador').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14) || 'Jogador', seat, team: null, ready: false, connected: true, send };
    this.players.set(player.id, player);
    if (this.hostId === null) this.hostId = player.id;
    this.broadcastRoom();
    return { player };
  }

  // Robô numa vaga livre (ou na indicada). Retorna o robô ou null.
  addBot(seat = -1) {
    if (seat < 0 || seat >= this.seats || this.list().some((p) => p.seat === seat)) seat = this.freeSeat();
    if (seat < 0) return null;
    const used = new Set(this.bots().map((b) => b.name));
    let n = 1;
    while (used.has(`Robô ${n}`)) n++;
    const bot = { id: this.nextId++, bot: true, token: null, name: `Robô ${n}`, seat, team: randomTeam(), ready: true, connected: true, send: noop };
    this.players.set(bot.id, bot);
    return bot;
  }

  // Volta a uma partida em andamento (ou ao lobby) com o token recebido ao entrar. Retorna { player } ou { error }.
  reclaim(token, send) {
    const player = this.list().find((p) => p.token === token && !p.connected);
    if (!player || !player.token) return { error: 'gone', message: 'Não foi possível voltar: a vaga foi liberada.' };
    player.connected = true; player.send = send; player.lostAt = null;
    if (this.hostId === null) this.hostId = player.id;
    this.broadcastRoom();
    return { player };
  }

  playerList(ps) { return ps.map((p) => ({ id: p.id, name: p.name, seat: p.seat, bot: !!p.bot })); }

  // Quem voltou retoma o controle e recebe o início de novo (o cliente recria o mundo espelho e segue pelos
  // snapshots); no torneio, recebe a chave e volta à luta dele (ou a assistir).
  resume(player) {
    if (this.state === 'playing') this.match.reclaim(player);
    else if (this.state === 'tour') this.tour.reclaim(player);
  }

  roomState() {
    return {
      t: 'room', code: this.code, mode: this.mode, arena: this.arena, state: this.state, host: this.hostId, seats: this.seats, botLevel: this.botLevel,
      players: this.list().map((p) => ({ id: p.id, name: p.name, seat: p.seat, side: this.sideOfSeat(p.seat), team: p.team, ready: p.ready, connected: p.connected, bot: !!p.bot })),
    };
  }

  broadcast(obj) { const s = JSON.stringify(obj); for (const p of this.list()) if (p.connected) p.send(s); }
  broadcastRoom() { this.broadcast(this.roomState()); }
  err(player, code, message) { player.send(JSON.stringify({ t: 'error', code, message })); }
  hostOnly(player) {
    if (player.id === this.hostId && this.state === 'lobby') return true;
    this.err(player, 'not_host', this.state === 'lobby' ? 'Só o anfitrião muda as configurações e os robôs.' : 'A partida já começou.');
    return false;
  }

  handle(player, msg) {
    switch (msg.t) {
      case 'team': {
        const ok = Array.isArray(msg.team) && msg.team.length === 3 && new Set(msg.team).size === 3 && msg.team.every((k) => ROSTER.includes(k));
        if (!ok || this.state !== 'lobby') return this.err(player, 'bad_team', 'Time inválido: escolha 3 monstros diferentes.');
        player.team = msg.team; player.ready = false;
        return this.broadcastRoom();
      }
      case 'ready':
        if (this.state !== 'lobby') return;
        if (!player.team) return this.err(player, 'no_team', 'Escolha seu time antes de ficar pronto.');
        player.ready = !!msg.ready;
        return this.broadcastRoom();
      case 'seat': {
        if (this.state !== 'lobby') return;
        const seat = msg.seat | 0;
        if (seat < 0 || seat >= this.seats) return this.err(player, 'seat_taken', 'Essa vaga não existe.');
        const other = this.list().find((p) => p.seat === seat && p !== player);
        if (other && !other.bot) return this.err(player, 'seat_taken', 'Essa vaga está ocupada.');
        if (other) other.seat = player.seat; // vaga de robô: troca de lugar com ele
        player.seat = seat; player.ready = false;
        return this.broadcastRoom();
      }
      case 'config': {
        if (!this.hostOnly(player)) return;
        if (msg.mode && MODES[msg.mode] && msg.mode !== this.mode) {
          const cap = MODES[msg.mode].seats;
          if (this.humans().length > cap) return this.err(player, 'too_many', `Há jogadores demais para ${msg.mode}.`);
          // Robôs saem primeiro para caber no modo menor.
          while (this.players.size > cap) { const b = this.bots().pop(); this.players.delete(b.id); }
          const prev = this.mode;
          this.mode = msg.mode;
          // 1v1 → 2v2: o oponente vai para o outro lado (vaga 2); nos demais casos (2v2 → 1v1, qualquer → ffa,
          // ffa → qualquer) as vagas são compactadas a partir da 0 (sem buracos nem vagas repetidas).
          const sorted = this.list().sort((x, y) => x.seat - y.seat);
          if (prev === '1v1' && this.mode === '2v2') { for (const p of sorted) if (p.seat === 1) p.seat = 2; }
          else sorted.forEach((p, i) => { p.seat = i; });
          for (const p of this.humans()) p.ready = false;
        }
        if (msg.arena && ARENA_CHOICES.includes(msg.arena)) { this.arena = msg.arena; for (const p of this.humans()) p.ready = false; }
        if (msg.botLevel && BOT_LEVELS.includes(msg.botLevel)) this.botLevel = msg.botLevel;
        return this.broadcastRoom();
      }
      case 'addBot': {
        if (!this.hostOnly(player)) return;
        if (!this.addBot(Number.isInteger(msg.seat) ? msg.seat : -1)) return this.err(player, 'full', 'Não há vaga livre para um robô.');
        return this.broadcastRoom();
      }
      case 'fillBots': {
        if (!this.hostOnly(player)) return;
        while (this.addBot()) { /* completa todas as vagas livres */ }
        return this.broadcastRoom();
      }
      case 'removeBot': {
        if (!this.hostOnly(player)) return;
        const bot = this.bots().find((b) => b.seat === (msg.seat | 0));
        if (bot) this.players.delete(bot.id);
        return this.broadcastRoom();
      }
      case 'botTeam': {
        if (!this.hostOnly(player)) return;
        const bot = this.bots().find((b) => b.seat === (msg.seat | 0));
        if (bot) bot.team = randomTeam();
        return this.broadcastRoom();
      }
      case 'start': {
        if (player.id !== this.hostId) return this.err(player, 'not_host', 'Só o anfitrião inicia a partida.');
        if (this.state !== 'lobby') return;
        const ps = this.list();
        if (!MODES[this.mode].tour && ps.length !== this.seats) return this.err(player, 'need_players', `Faltam jogadores: ${this.mode} precisa de ${this.seats} (ou complete com robôs).`);
        const host = this.players.get(this.hostId);
        if (host && host.team) host.ready = true;
        if (ps.some((p) => !p.team || !p.ready)) return this.err(player, 'not_ready', 'Todos precisam escolher o time e ficar prontos.');
        if (MODES[this.mode].tour) { const r = this.startTour(); return r.error ? this.err(player, r.error, r.message) : undefined; }
        return this.startMatch();
      }
      case 'input':
        if (this.state === 'playing') this.match.input(player, msg); else if (this.state === 'tour') this.tour.input(player, msg);
        return;
      case 'switch':
        if (this.state === 'playing') this.match.switchTo(player, msg.idx); else if (this.state === 'tour') this.tour.switchTo(player, msg.idx);
        return;
      case 'watch':
        if (this.state === 'tour') this.tour.watch(player, msg.match ?? null);
        return;
      case 'rematch': {
        const champ = this.state === 'tour' && this.tour.phase === 'champion';
        if (player.id === this.hostId && (this.state === 'over' || champ)) this.backToLobby();
        return;
      }
      default: return this.err(player, 'unknown', 'Mensagem desconhecida.');
    }
  }

  startMatch() {
    const ps = this.list().sort((a, b) => a.seat - b.seat);
    const sides = MODES[this.mode].sides;
    const arena = this.arena === 'sorteio' ? ARENA_ORDER[(Math.random() * ARENA_ORDER.length) | 0] : this.arena;
    // Vagas de robô ficam com a IA (TeamCoach + Brain), no nível escolhido pelo anfitrião.
    this.match = new Match({
      mode: this.mode, entries: ps.map((p) => ({ player: p, seat: p.seat })), sides, rosters: ps.map((p) => p.team), arena,
      botLevel: this.botLevel, timeScale: this.timeScale,
      onEnd: (res) => { this.state = 'over'; this.broadcast({ t: 'end', ...res }); this.broadcastRoom(); },
      onError: () => { this.broadcast({ t: 'error', code: 'server', message: 'Erro interno na partida.' }); this.state = 'over'; },
    });
    this.state = 'playing';
    this.match.start();
    this.broadcastRoom();
  }

  // Torneio: 4 a 8 participantes (humanos e robôs); no 2v2, número par (as duplas são sorteadas).
  startTour() {
    const fmt = MODES[this.mode].tour, n = this.list().length;
    if (n < 4) return { error: 'need_players', message: 'O torneio precisa de pelo menos 4 jogadores (ou complete com robôs).' };
    if (fmt === '2v2' && n % 2) return { error: 'need_even', message: 'Torneio 2v2: o número de jogadores precisa ser par (as duplas são sorteadas). Adicione um robô.' };
    this.state = 'tour';
    this.tour = new Tournament(this, fmt);
    this.tour.start();
    this.broadcastRoom();
    return {};
  }

  backToLobby() {
    this.tour?.stop();
    this.tour = null;
    this.state = 'lobby';
    for (const p of this.list()) { if (!p.bot) p.ready = false; if (!p.connected) this.players.delete(p.id); }
    this.broadcastRoom();
  }

  stop() { this.match?.stop(); this.tour?.stop(); this.state = 'over'; }

  // Desconexão: no lobby libera a vaga; em partida, a IA assume os monstros do jogador que saiu.
  // `final`: saída voluntária (não dá para voltar); senão foi queda de rede e o jogador pode retomar com o token.
  leave(player, final = true) {
    if (!this.players.has(player.id)) return;
    player.connected = false;
    if (final) player.token = null;
    if (this.state === 'lobby' || this.state === 'over') {
      this.players.delete(player.id);
      if (this.hostId === player.id) this.hostId = this.nextHost();
    } else if (this.state === 'playing' || this.state === 'tour') {
      player.lostAt = Date.now();
      if (this.state === 'playing') this.match.drop(player); else this.tour.drop(player);
      if (this.hostId === player.id) this.hostId = this.nextHost();
    }
    // Sem nenhum humano conectado (só robôs), a sala é encerrada.
    if (this.connectedCount() === 0) { this.stop(); this.onEmpty(this.code); return; }
    this.broadcastRoom();
  }
}

export function newCode(exists) {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    if (!exists(c)) return c;
  }
  throw new Error('sem códigos livres');
}
