import { World, DIFFICULTY_MODS } from '../src/sim/world.js';
import { DT, WORLD_W, WORLD_H } from '../src/config.js';
import { TeamCoach } from '../src/ai/coach.js';
import { PlayerController } from '../src/control/player.js';
import { serialize, makeSyncCtx, SNAP_HZ } from '../src/net/snapshot.js';

// Uma partida autoritativa: o mundo, o relógio da simulação e os snapshots para quem joga e para quem assiste.
// A sala comum tem uma partida por vez; o torneio roda várias ao mesmo tempo (as lutas de uma fase).
//   entries: [{ player, seat }] na ordem das vagas; sides: lado de cada vaga; rosters: time de cada vaga.
//   viewers(): quem recebe os snapshots além dos jogadores (espectadores do torneio).
//   hold: segundos parados antes de começar (tela de "VS" do torneio); o mundo é desenhado mas não anda.

const PRESSES = new Set(['primary', 'melee', 'q', 'e', 'f', 'dodge', 'evolve']);
const SNAP_EVERY = Math.round(60 / SNAP_HZ);
const num = (v, lo, hi, def = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);

export class Match {
  constructor({ id = 0, mode, entries, sides, rosters, arena, botLevel = 'normal', timeScale = 1, hold = 0, info = null, viewers = () => [], onEnd, onError }) {
    this.id = id;
    this.mode = mode ?? info?.mode;
    this.entries = entries;
    this.sides = sides;
    this.rosters = rosters;
    this.arena = arena;
    this.botLevel = botLevel;
    this.timeScale = timeScale;
    this.hold = hold;
    this.info = info; // dados do torneio que vão no 'start' (fase, nomes, rótulo)
    this.viewers = viewers;
    this.onEnd = onEnd;
    this.onError = onError;
    this.world = null;
    this.timer = null;
    this.state = 'idle'; // idle | playing | over
  }

  players() { return this.entries.map((e) => e.player); }
  seatOf(player) { return this.entries.find((e) => e.player === player)?.seat ?? -1; }
  has(player) { return this.seatOf(player) >= 0; }
  playerList() { return this.entries.map((e) => ({ id: e.player.id, name: e.player.name, seat: e.seat, bot: !!e.player.bot })); }
  // Jogadores (vagas humanas conectadas) e espectadores, sem repetir.
  audience() { const set = new Set(this.players().filter((p) => p.connected)); for (const v of this.viewers()) if (v.connected) set.add(v); return [...set]; }

  startMsg(player) {
    const you = this.seatOf(player);
    return { t: 'start', seed: this.seed, arena: this.arena, mode: this.mode, sides: this.sides, rosters: this.rosters, players: this.playerList(), you, spectate: you < 0, match: this.id, tour: this.info, hold: Math.max(0, this.holdLeft ?? 0) };
  }

  start() {
    this.seed = (Math.random() * 1e9) | 0;
    const humans = this.entries.filter((e) => !e.player.bot && e.player.connected).map((e) => e.seat);
    this.world = World.match(this.seed, this.rosters, null, this.arena, 'normal', { sides: this.sides, humans });
    const mods = DIFFICULTY_MODS[this.botLevel] || DIFFICULTY_MODS.normal;
    const ai = new Set(this.entries.filter((e) => e.player.bot).map((e) => e.seat));
    for (const m of this.world.roster) if (ai.has(m.slot)) { m.ai.mods = { ...mods }; m.ai.applyProfile(); }
    this.world.slotNames = this.entries.map((e) => e.player.name);
    this.sync = makeSyncCtx(this.world);
    this.state = 'playing';
    this.holdLeft = this.hold;
    this.startedAt = Date.now();
    for (const p of this.audience()) if (!p.bot) p.send(JSON.stringify(this.startMsg(p)));
    this.acc = 0;
    this.last = process.hrtime.bigint();
    this.tickN = 0;
    this.timer = setInterval(() => this.loop(), 4); // 4 ms: snapshots saem com no máximo ~4 ms de irregularidade
    this.pushSnapshot();
  }

  // Quem passa a assistir no meio da partida recebe o início e um snapshot completo.
  addViewer(player) {
    if (this.state !== 'playing' || player.bot) return;
    player.send(JSON.stringify(this.startMsg(player)));
    player.send(JSON.stringify(this.fullSnapshot()));
  }

  loop() {
    try {
      const now = process.hrtime.bigint();
      const dt = (Number(now - this.last) / 1e9) * this.timeScale;
      this.last = now;
      if (this.holdLeft > 0) { this.holdLeft -= dt; if (++this.tickN % 12 === 0) this.pushSnapshot(); return; }
      this.acc = Math.min(this.acc + dt, 0.25 * this.timeScale);
      while (this.acc >= DT && !this.world.over) {
        this.world.step(DT);
        this.acc -= DT;
        if (++this.tickN % SNAP_EVERY === 0) this.pushSnapshot();
      }
      if (this.world.over) this.finish();
    } catch (e) {
      console.error('erro na simulação da partida', e);
      this.stop();
      this.onError?.(e);
    }
  }

  // Snapshot para cada um. Se a fila de envio de alguém encheu (rede dele engasgou), não empilhamos estado velho:
  // pulamos os snapshots dele e, quando a fila esvazia, mandamos um snapshot COMPLETO e atual.
  // force: o snapshot final da partida vai para todos, mesmo com fila cheia (senão o jogador não vê o fim).
  pushSnapshot(force = false) {
    const snap = serialize(this.world, this.sync);
    snap.match = this.id; // o cliente descarta snapshot de outra luta (troca de luta no torneio)
    const s = JSON.stringify(snap);
    let full = null;
    for (const p of this.audience()) {
      if (p.bot) continue;
      if (!force && p.send.lagging?.()) { p.stale = true; continue; }
      if (p.stale) { full ||= JSON.stringify(this.fullSnapshot()); p.send(full); p.stale = false; continue; }
      p.send(s);
    }
  }

  // Estado inteiro, sem eventos nem mensagens (já foram para os snapshots normais deste quadro).
  fullSnapshot() {
    const ctx = { ...makeSyncCtx(this.world), nInit: this.sync.nInit, lastFeed: this.world.feedSeq || 0 };
    const snap = serialize(this.world, ctx);
    snap.events = [];
    snap.feed = [];
    snap.seq = this.sync.seq;
    snap.match = this.id;
    return snap;
  }

  input(player, msg) {
    const seat = this.seatOf(player);
    if (this.state !== 'playing' || seat < 0 || !this.world.humans.has(seat)) return;
    const inp = this.world.inputs[seat];
    inp.move.x = num(msg.mx, -1, 1); inp.move.y = num(msg.my, -1, 1);
    inp.aim.x = num(msg.ax, 0, WORLD_W, WORLD_W / 2); inp.aim.y = num(msg.ay, 0, WORLD_H, WORLD_H / 2);
    inp.held = { primary: !!msg.hp, melee: !!msg.hm };
    if (this.holdLeft > 0) return; // contagem do "VS": ninguém age ainda
    if (Array.isArray(msg.presses)) for (const p of msg.presses.slice(0, 6)) if (PRESSES.has(p)) inp.presses.push(p);
  }

  switchTo(player, idx) {
    const seat = this.seatOf(player);
    if (this.state !== 'playing' || seat < 0 || this.holdLeft > 0) return;
    const m = this.world.teamOf(seat)[idx | 0];
    if (m) this.world.requestSwitch(seat, m);
  }

  // Jogador caiu ou saiu: a IA assume os monstros dele.
  drop(player) {
    const seat = this.seatOf(player);
    if (this.state !== 'playing' || seat < 0) return;
    const w = this.world;
    w.humans.delete(seat);
    w.coaches[seat] = new TeamCoach(w, seat);
    const f = w.fieldOf(seat);
    if (f) { f.controller = null; f.ai.resume(); }
    w.say(`${player.name} saiu — a IA assumiu o time`, '#ff8a8a');
  }

  // Voltou com o token: retoma o controle e recebe o início de novo.
  reclaim(player) {
    const seat = this.seatOf(player);
    if (this.state !== 'playing') return;
    if (seat >= 0) {
      const w = this.world;
      w.humans.add(seat);
      w.coaches[seat] = null;
      const f = w.fieldOf(seat);
      if (f) f.controller = new PlayerController(f, w, w.inputs[seat]);
      w.say(`${player.name} voltou à partida`, '#9cf59c');
      this.sync.prevTerr = null; // próximo snapshot reenvia o terreno inteiro para todos
    }
    player.send(JSON.stringify({ ...this.startMsg(player), resumed: true }));
  }

  finish() {
    if (this.state !== 'playing') return;
    this.pushSnapshot(true);
    this.state = 'over';
    clearInterval(this.timer); this.timer = null;
    const w = this.world;
    const names = {};
    for (const e of this.entries) names[e.seat] = e.player.name;
    const result = {
      winnerSide: w.winner, duration: w.endTime ?? w.time,
      summary: w.roster.map((m) => ({ name: m.name, slot: m.slot, alive: m.alive, dmg: Math.round(m.stats.dmgDealt) })),
      // Classificação oficial (autoridade do servidor): uma linha por lado, com nomes dos jogadores das vagas.
      standings: w.standings().map((r) => ({ ...r, elimT: Number.isFinite(r.elimT) ? Math.round(r.elimT * 100) / 100 : null, players: r.slots.map((s) => names[s] || `Vaga ${s + 1}`) })),
    };
    this.onEnd?.(result, this);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; if (this.state === 'playing') this.state = 'over'; }
}
