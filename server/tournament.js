import { Match } from './match.js';
import { ARENA_ORDER } from '../src/arenas/index.js';

// Torneio online (sala de até 8): 4 a 8 participantes em 1v1, ou duplas sorteadas em 2v2.
//   1v1: até 4 → semifinal e final; 5 a 8 → quartas, semifinal e final (quem sobra na chave de 8 passa direto).
//   2v2: as duplas são sorteadas na hora; 8 pessoas (4 duplas) → semifinal e final; 4 pessoas → só a final.
// As lutas de uma fase rodam AO MESMO TEMPO (uma partida autoritativa cada). Quem não está lutando (passou direto,
// já caiu ou espera) assiste ao vivo qualquer luta da fase; o servidor já põe cada um numa luta para não ficar parado.
// Fases: draw (sorteio e chave na tela) → round (lutas) → break (a chave mostra quem avançou) → ... → champion.
// Tempos em segundos de jogo (divididos pelo timeScale nos testes).

export const PHASE_T = { draw: 9, break: 8, hold: 4, rewatch: 7 };
export const ROUND_NAMES = { 8: ['QUARTAS DE FINAL', 'SEMIFINAL', 'FINAL'], 4: ['SEMIFINAL', 'FINAL'], 2: ['FINAL'] };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Tournament {
  constructor(room, format) {
    this.room = room;
    this.format = format; // '1v1' | '2v2'
    this.phase = 'draw';
    this.phaseEnd = 0;
    this.round = 0;
    this.matches = new Map(); // id da luta → Match em andamento
    this.nextMatch = 1;
    this.champion = null;
    this.timer = null;
  }

  ts() { return this.room.timeScale || 1; }
  wait(sec) { return Date.now() + (sec * 1000) / this.ts(); }

  // ───────────── Montagem ─────────────
  start() {
    const ps = shuffle(this.room.list().filter((p) => p.team));
    // Participantes: cada jogador (1v1) ou duplas sorteadas (2v2), com o nome da dupla.
    const groups = this.format === '2v2' ? Array.from({ length: ps.length / 2 }, (_, k) => [ps[2 * k], ps[2 * k + 1]]) : ps.map((p) => [p]);
    this.entrants = groups.map((players, i) => ({ id: i, players, name: players.map((p) => p.name).join(' & '), out: false }));
    const n = this.entrants.length, size = n <= 2 ? 2 : n <= 4 ? 4 : 8;
    this.size = size;
    this.names = ROUND_NAMES[size];
    // Chave: um participante em cada luta primeiro e só depois os segundos — assim os "passa direto" ficam espalhados
    // e nunca há luta de vazio contra vazio.
    const slots = new Array(size).fill(null), order = shuffle(this.entrants.map((e) => e.id));
    for (let k = 0; k < size / 2 && order.length; k++) slots[2 * k] = order.shift();
    for (let k = 0; k < size / 2 && order.length; k++) slots[2 * k + 1] = order.shift();
    this.rounds = this.names.map((name, r) => ({ name, matches: Array.from({ length: size >> (r + 1) }, (_, k) => ({ id: 0, a: r === 0 ? slots[2 * k] : null, b: r === 0 ? slots[2 * k + 1] : null, winner: null, state: 'wait', score: null })) }));
    this.phase = 'draw';
    this.phaseEnd = this.wait(PHASE_T.draw);
    this.timer = setInterval(() => this.tick(), 50);
    this.broadcast();
  }

  entrantOf(player) { return this.entrants.find((e) => e.players.includes(player)) || null; }
  matchOf(player) { for (const m of this.matches.values()) if (m.state === 'playing' && m.has(player)) return m; return null; }

  tick() {
    const now = Date.now();
    if (this.phase === 'draw' && now >= this.phaseEnd) this.startRound(0);
    else if (this.phase === 'break' && now >= this.phaseEnd) this.startRound(this.round + 1);
    // Quem acabou de lutar (ou ficou sem luta) volta a assistir outra luta da fase depois de ver o resultado.
    if (this.phase === 'round') for (const p of this.room.humans()) {
      if (p.rewatchAt && now >= p.rewatchAt) { p.rewatchAt = 0; if (!this.matchOf(p) && !this.watching(p)) this.autoWatch(p); }
    }
  }

  // ───────────── Fases ─────────────
  startRound(r) {
    this.round = r;
    this.phase = 'round';
    const R = this.rounds[r];
    R.matches.forEach((mt, k) => {
      const A = this.entrants[mt.a], B = this.entrants[mt.b];
      if (!A || !B) { mt.state = 'bye'; mt.winner = A ? 'a' : B ? 'b' : null; return; }
      mt.id = this.nextMatch++;
      mt.state = 'live';
      const entries = [...A.players, ...B.players].map((player, seat) => ({ player, seat }));
      const sides = this.format === '2v2' ? [0, 0, 1, 1] : [0, 1];
      const room = this.room;
      const arena = room.arena === 'sorteio' ? ARENA_ORDER[(Math.random() * ARENA_ORDER.length) | 0] : room.arena;
      const info = { mode: this.format, round: R.name, final: r === this.rounds.length - 1, game: k + 1, games: R.matches.length, a: A.name, b: B.name };
      const m = new Match({
        id: mt.id, entries, sides, rosters: entries.map((e) => e.player.team), arena, botLevel: room.botLevel, timeScale: room.timeScale,
        hold: PHASE_T.hold, info, viewers: () => room.humans().filter((p) => p.watch === mt.id),
        onEnd: (res) => this.matchEnded(mt, m, res),
        onError: () => { room.broadcast({ t: 'error', code: 'server', message: 'Erro interno numa luta do torneio.' }); this.matchEnded(mt, m, { winnerSide: 0, standings: [], summary: [] }); },
      });
      for (const p of entries) p.player.watch = null;
      this.matches.set(mt.id, m);
      m.start();
    });
    // Sem luta nesta fase (passou direto ou já caiu): assiste a uma das lutas.
    for (const p of this.room.humans()) if (!this.matchOf(p)) this.autoWatch(p);
    this.broadcast();
    if (R.matches.every((mt) => mt.state !== 'live')) this.roundDone();
  }

  matchEnded(mt, m, res) {
    // Vencedor: o lado que sobrou; empate (os dois últimos caíram juntos) vai para quem tinha mais vida no fim.
    let side = res.winnerSide;
    if (side !== 0 && side !== 1) {
      const hp = [0, 1].map((s) => m.world.roster.filter((q) => q.team === s).reduce((t, q) => t + Math.max(0, q.hp) + (q.alive ? 1000 : 0), 0));
      side = hp[1] > hp[0] ? 1 : 0;
    }
    mt.winner = side === 0 ? 'a' : 'b';
    mt.state = 'done';
    const alive = [0, 1].map((s) => m.world.roster.filter((q) => q.team === s && q.alive).length);
    mt.score = `${alive[0]} × ${alive[1]}`;
    const W = this.entrants[mt[mt.winner]], L = this.entrants[mt[mt.winner === 'a' ? 'b' : 'a']];
    L.out = true;
    const last = this.round === this.rounds.length - 1;
    const R = this.rounds[this.round];
    // Resultado para quem estava nesta luta (jogadores e espectadores), com o que vem depois.
    const tour = { match: mt.id, round: R.name, winner: W.name, loser: L.name, final: last, next: last ? null : this.rounds[this.round + 1].name, score: mt.score };
    for (const p of m.audience()) {
      if (p.bot) continue;
      const you = W.players.includes(p) ? 'win' : L.players.includes(p) ? 'lose' : null;
      p.send(JSON.stringify({ t: 'end', ...res, tour: { ...tour, you } }));
      p.watch = null;
      p.rewatchAt = this.wait(PHASE_T.rewatch);
    }
    this.matches.delete(mt.id);
    this.broadcast();
    if (R.matches.every((x) => x.state !== 'live')) this.roundDone();
  }

  roundDone() {
    const R = this.rounds[this.round];
    if (this.round === this.rounds.length - 1) {
      const f = R.matches[0];
      this.champion = f.winner ? f[f.winner] : null;
      this.phase = 'champion';
      this.broadcast();
      return;
    }
    // Vencedores seguem na chave: as lutas 2k e 2k+1 alimentam a luta k da fase seguinte.
    const N = this.rounds[this.round + 1];
    R.matches.forEach((mt, k) => { const w = mt.winner ? mt[mt.winner] : null; if (k % 2 === 0) N.matches[k >> 1].a = w; else N.matches[k >> 1].b = w; });
    this.phase = 'break';
    this.phaseEnd = this.wait(PHASE_T.break);
    this.broadcast();
  }

  // ───────────── Espectadores ─────────────
  watching(p) { return p.watch && this.matches.has(p.watch); }
  live() { return [...this.matches.values()].filter((m) => m.state === 'playing'); }
  autoWatch(p) {
    if (p.bot || !p.connected) return;
    // Prefere a luta de quem ainda está no torneio com você (ou a primeira).
    const lv = this.live();
    if (!lv.length) { p.watch = null; return; }
    this.setWatch(p, lv[0].id);
  }
  setWatch(p, id) {
    const m = this.matches.get(id);
    if (!m || m.state !== 'playing' || this.matchOf(p)) return false;
    p.watch = id;
    m.addViewer(p);
    return true;
  }
  // Pedido do jogador: assistir a uma luta (id) ou voltar para a chave (null).
  watch(p, id) {
    if (id == null) { p.watch = null; p.rewatchAt = 0; p.send(JSON.stringify(this.state(p))); return; }
    if (!this.setWatch(p, id | 0)) p.send(JSON.stringify({ t: 'error', code: 'no_match', message: 'Essa luta já acabou.' }));
  }

  // ───────────── Rede: queda e volta ─────────────
  drop(p) { this.matchOf(p)?.drop(p); if (p.watch) p.watch = null; }
  reclaim(p) {
    const m = this.matchOf(p);
    p.send(JSON.stringify(this.state(p)));
    if (m) m.reclaim(p); else if (this.phase === 'round') this.autoWatch(p);
  }

  // ───────────── Estado para os clientes ─────────────
  state(p) {
    const ent = (i) => {
      const e = this.entrants[i];
      return e ? { id: e.id, name: e.name, out: e.out, players: e.players.map((q) => ({ id: q.id, name: q.name, bot: !!q.bot, team: q.team, connected: q.connected })) } : null;
    };
    const me = p ? this.entrantOf(p) : null;
    return {
      t: 'tour', format: this.format, size: this.size, phase: this.phase, round: this.round,
      left: this.phase === 'draw' || this.phase === 'break' ? Math.max(0, (this.phaseEnd - Date.now()) * this.ts() / 1000) : 0,
      entrants: this.entrants.map((_, i) => ent(i)),
      rounds: this.rounds.map((R) => ({ name: R.name, matches: R.matches.map((mt) => ({ id: mt.id, a: mt.a, b: mt.b, winner: mt.winner, state: mt.state, score: mt.score })) })),
      champion: this.champion, me: me ? me.id : null, watch: p?.watch || null,
    };
  }
  broadcast() { for (const p of this.room.humans()) if (p.connected) p.send(JSON.stringify(this.state(p))); }

  input(p, msg) { this.matchOf(p)?.input(p, msg); }
  switchTo(p, idx) { this.matchOf(p)?.switchTo(p, idx); }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const m of this.matches.values()) m.stop();
    this.matches.clear();
    for (const p of this.room.list()) { p.watch = null; p.rewatchAt = 0; }
  }
}
