import { WORLD_W, WORLD_H, TILE, TERRAIN_DT, ELEMENT_MULT, SWITCH, EVOLUTION, FIRE, CONTROL, MATCH } from '../config.js';
import { mulberry32, segCircle, segAabb, clamp } from '../core/math.js';
import { Terrain, IGNITE, T, props } from './terrain.js';
import { ARENAS } from '../arenas/index.js';
import { builder } from '../arenas/helpers.js';
import { Monster } from './monster.js';
import { SPECIES } from './species.js';
import { Brain } from '../ai/brain.js';
import { PlayerController } from '../control/player.js';
import { TeamCoach } from '../ai/coach.js';
import { DEFAULT_TEAM } from './species.js';
import * as Sig from './signature.js';

const OBSTACLE_DEFS = {
  rock: { flammable: false, hp: Infinity, blocksLOS: true },
  crate: { flammable: true, hp: 45, blocksLOS: true, burnTime: 7, burnDps: 7 },
  bush: { flammable: true, hp: 55, blocksLOS: true, burnTime: 9, burnDps: 7 },
  pillar: { flammable: false, hp: Infinity, blocksLOS: true },
  statue: { flammable: false, hp: Infinity, blocksLOS: true },
  hedge: { flammable: true, hp: 60, blocksLOS: true, burnTime: 8, burnDps: 9 },
  giantFlower: { flammable: true, hp: 45, blocksLOS: true, burnTime: 6, burnDps: 9 },
  tree: { flammable: false, hp: Infinity, blocksLOS: true },
  log: { flammable: true, hp: 60, blocksLOS: true, burnTime: 10, burnDps: 7 },
  thicket: { flammable: true, hp: 40, blocksLOS: true, burnTime: 4, burnDps: 12 }, // barreira temporária da planta
  // Brotos Sentinela (Brotossauro): torres vivas; o fogo as derruba rápido.
  sentry: { flammable: true, hp: 28, blocksLOS: false, burnTime: 3, burnDps: 12, heal: 0.6, healR: 46, shot: { kind: 'seed', dmg: 3, every: 1.3, range: 100, speed: 240 } },
  ancientSentry: { flammable: true, hp: 46, blocksLOS: false, burnTime: 3, burnDps: 14, heal: 0.9, healR: 50, shot: { kind: 'thorn', dmg: 4.5, every: 1.5, range: 115, speed: 235 } },
};

const DIFFICULTY_MODS = {
  easy: { reaction: 1.8, dodgeSkill: 0.5, accuracy: 2.2, lead: 0.7 },
  normal: { reaction: 1.4, dodgeSkill: 0.75, accuracy: 1.6, lead: 0.85 },
  hard: { reaction: 1.1, dodgeSkill: 0.95, accuracy: 1.15, lead: 0.95 },
};

const makeSlot = (side) => ({ side, field: null, pending: null, cooldown: 0, deadT: 0, lastOut: null, lastOutT: -99, switches: 0 });
const newInput = () => ({ move: { x: 0, y: 0 }, aim: { x: 320, y: 180 }, held: {}, presses: [] });

let nextObsId = 1;
let nextProjId = 1;

export class World {
  constructor(seed = 1, arenaId = 'quadra') {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.time = 0;
    this.tick = 0;
    this.terrain = new Terrain(this.rng);
    this.obstacles = [];
    this.walls = [];
    this.roster = []; // todos os monstros da partida (instâncias persistentes)
    this.monsters = []; // somente os que estão em campo (1 por time, mais corpos de derrotados sumindo)
    this.projectiles = [];
    this.decoys = []; // ilusões de tinta (Gotapus)
    this.steam = [];
    this.events = [];
    this.feed = [];
    this.feedSeq = 0;
    this.over = false;
    this.winner = null;
    this.terrainAcc = 0;
    // Cada VAGA (jogador ou IA) tem seu próprio time de 3, um monstro em campo, troca pendente e recarga de troca.
    // No 1×1 há 2 vagas (uma por lado); no 2v2 há 4 (duas por lado). `team` do monstro é o LADO (0/1); `slot` é a vaga.
    this.teams = [0, 1].map((side) => makeSlot(side));
    this.coaches = [null, null];
    this.humans = new Set(); // vagas controladas por jogadores (as demais são IA)
    this.inputs = [newInput(), newInput()];
    this.playerTeam = null; // vaga do jogador local (HUD, câmera, teclado); null = espectador/servidor
    this._checkEnd = false;
    this.active = null; // monstro do jogador local
    this.input = this.inputs[0];
    // Arena data-driven: terreno, alturas, muros, obstáculos, perigos e decoração vêm da definição.
    const def = ARENAS[arenaId] || ARENAS.quadra;
    this.arenaId = def.id;
    this.arenaDef = def;
    this.arena = { waterHeal: def.waterHeal ?? 1, heights: !!def.heights };
    this.spawns = def.spawns;
    this.hazards = [];
    this.decor = [];
    def.build(this, builder(this));
    this.waterTiles = [];
    for (let i = 0; i < this.terrain.type.length; i++) if (props(this.terrain.type[i]).water && !props(this.terrain.type[i]).deep) this.waterTiles.push(i);
  }

  // Partida com uma vaga por time de 3 (só um monstro de cada vaga em campo). `rosters[i]` = chaves dos 3 monstros da vaga i.
  // playerSlot = vaga do jogador local (null = espectador/servidor). opts.sides = lado de cada vaga (padrão: uma vaga por lado;
  // 2v2 = [0, 0, 1, 1]); opts.humans = vagas controladas por jogadores; opts.mirror = só espelha estado de um servidor.
  static match(seed = 1, rosters = [DEFAULT_TEAM, DEFAULT_TEAM], playerSlot = 0, arenaId = 'quadra', difficulty = 'normal', opts = {}) {
    const w = new World(seed, arenaId);
    const sides = opts.sides || rosters.map((_, i) => i);
    w.teams = rosters.map((_, i) => makeSlot(sides[i]));
    w.inputs = rosters.map(() => newInput());
    w.coaches = rosters.map(() => null);
    w.humans = new Set(opts.humans ?? (playerSlot !== null ? [playerSlot] : []));
    w.playerTeam = playerSlot;
    w.input = w.inputs[playerSlot ?? 0];
    w.mirror = !!opts.mirror;
    rosters.forEach((list, slot) => list.forEach((key) => w.addMonster(SPECIES[key], slot)));
    if (playerSlot !== null && !opts.humans) {
      // Dificuldade: a IA adversária reage mais devagar e erra mais nos níveis fáceis.
      const mods = DIFFICULTY_MODS[difficulty] || DIFFICULTY_MODS.normal;
      for (const m of w.roster) if (m.team !== sides[playerSlot]) {
        m.ai.mods = { ...mods };
        m.ai.applyProfile();
      }
    }
    if (w.mirror) return w;
    rosters.forEach((_, slot) => {
      if (!w.humans.has(slot)) w.coaches[slot] = new TeamCoach(w, slot);
      const first = w.teamOf(slot)[0];
      if (first) w.deploy(slot, first, w.spawnFor(slot), 'start');
    });
    return w;
  }

  // Ponto de nascimento da vaga: o do lado, afastado quando há dois jogadores no mesmo lado (2v2).
  spawnFor(slot) {
    const side = this.teams[slot].side;
    const base = this.spawns[side];
    const mates = this.teams.map((t, i) => (t.side === side ? i : -1)).filter((i) => i >= 0);
    if (mates.length < 2) return { ...base };
    return { x: base.x, y: base.y + (mates.indexOf(slot) === 0 ? -36 : 36) };
  }

  static duel(seed = 1, a = 'brasalisco', b = 'hidrocasco', arenaId = 'quadra') { return World.match(seed, [[a], [b]], null, arenaId); }

  teamOf(slot) { return this.roster.filter((m) => m.slot === slot); }
  fieldOf(slot) { return this.teams[slot].field; }

  addMonster(def, slot) {
    const side = this.teams[slot].side;
    const sp = this.spawns[side];
    const m = new Monster(def, side, sp.x, sp.y);
    m.slot = slot;
    m.ai = new Brain(m, this);
    this.roster.push(m);
    return m;
  }

  // ───────────── Troca de monstros (1×1) ─────────────
  // Pede a troca do monstro em campo pelo `target` (do banco). Mesmas regras para jogador e IA.
  requestSwitch(slot, target) {
    const ts = this.teams[slot];
    const cur = ts.field;
    const deny = (reason) => { this.emit({ type: 'switchDenied', team: slot, reason, m: target }); return false; };
    if (this.over || !cur || !cur.alive) return false; // sem monstro vivo em campo: a substituição é automática
    if (!target || target.slot !== slot) return false;
    if (!target.alive) return deny('defeated');
    if (target === cur || target.onField) return deny('onField');
    if (cur.switchState) return deny('busy');
    if (ts.cooldown > 0) return deny('cooldown');
    cur.switchState = 'exiting';
    cur.switchT = SWITCH.exitTime;
    cur.action = null; // trocar no meio de um ataque cancela o ataque
    cur.move.throttle = 0;
    ts.pending = target;
    this.emit({ type: 'recall', m: cur, to: target, x: cur.x, y: cur.y });
    return true;
  }

  // Tira do campo sem alterar vida, status ou recargas.
  bench(m) {
    m.onField = false;
    m.switchState = null;
    m.action = null;
    m.vx = m.vy = m.kx = m.ky = 0;
    m.move.throttle = 0;
    this.monsters = this.monsters.filter((x) => x !== m);
    m.controller = null;
    if (this.active === m) this.active = null;
  }

  deploy(slot, m, pos, reason) {
    const ts = this.teams[slot];
    const p = this.safeSpot(pos.x, pos.y, m.r, slot);
    m.x = m.px = p.x;
    m.y = m.py = p.y;
    m.level = this.terrain.heightAt(p.x, p.y);
    m.vx = m.vy = m.kx = m.ky = 0;
    m.onField = true;
    m.switchState = 'entering';
    m.switchT = SWITCH.enterTime;
    m.enteredAt = this.time;
    if (SWITCH.entryInvulnerable) m.status.invuln = Math.max(m.status.invuln, SWITCH.enterTime);
    const foe = this.monsters.find((o) => o.alive && o.onField && o.team !== m.team);
    m.facing = m.lookAt = foe ? Math.atan2(foe.y - m.y, foe.x - m.x) : m.team === 0 ? 0 : Math.PI;
    if (!this.monsters.includes(m)) this.monsters.push(m);
    ts.field = m;
    ts.deadT = 0;
    m.ai.resume();
    if (this.humans.has(slot)) {
      m.controller = new PlayerController(m, this, this.inputs[slot]);
      if (slot === this.playerTeam) this.active = m;
    }
    this.emit({ type: 'enter', m, reason, x: m.x, y: m.y });
    if (reason !== 'start') this.say(`${m.name} entrou na arena`, m.team === this.sideOfLocal() ? '#ffe066' : '#ff8a8a');
  }

  // Ponto livre (sem obstáculo, fogo ou água) perto de (x, y) para um monstro entrar.
  // Lado do jogador local (para cores de mensagens); sem jogador local, lado 0.
  sideOfLocal() { return this.playerTeam === null ? 0 : this.teams[this.playerTeam].side; }

  safeSpot(x, y, r, slot) {
    const h = this.terrain.heightAt(x, y);
    const probe = { r, element: 'fire', level: h };
    const ok = (px, py) => {
      if (this.blocked(px, py, r)) return false;
      const i = this.terrain.at(px, py);
      if (i < 0 || this.terrain.fire[i] > 0 || props(this.terrain.type[i]).water) return false;
      probe.level = this.terrain.height[i];
      return this.standable(probe, px, py) && Math.abs(this.terrain.height[i] - h) < 0.6;
    };
    if (ok(x, y)) return { x, y };
    for (let d = 8; d <= 96; d += 8) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (ok(px, py)) return { x: px, y: py };
    }
    return this.spawnFor(slot);
  }

  // O monstro pode ficar em (x, y)? Considera tiles sólidos, água funda (só nadadores) e degraus de altura.
  standable(m, x, y) {
    const tr = this.terrain;
    const off = m.r * 0.55;
    const c = tr.at(x, y);
    // Altura: só o centro precisa estar no mesmo nível (ou meio nível, em rampas/escadas).
    if (c < 0 || Math.abs(tr.height[c] - m.level) > 0.55) return false;
    for (const [dx, dy] of [[0, 0], [off, 0], [-off, 0], [0, off], [0, -off]]) {
      const i = tr.at(x + dx, y + dy);
      if (i < 0) return false;
      const p = props(tr.type[i]);
      if (p.solid || (p.deep && m.element !== 'water')) return false;
    }
    return true;
  }

  // Depois de mover/empurrar: se a posição ficou inválida, desliza por eixo a partir da última válida.
  constrainToTerrain(m) {
    if (m.level === undefined) m.level = this.terrain.heightAt(m.x, m.y);
    if (!this.standable(m, m.x, m.y)) {
      if (this.standable(m, m.x, m.py)) m.y = m.py;
      else if (this.standable(m, m.px, m.y)) m.x = m.px;
      else { m.x = m.px; m.y = m.py; }
      if (!this.standable(m, m.x, m.y)) { m.kx *= -0.3; m.ky *= -0.3; }
      else { m.kx *= 0.5; m.ky *= 0.5; }
    }
    m.level = this.terrain.heightAt(m.x, m.y);
  }

  // Bloqueado para este monstro (obstáculos + terreno)? Usado pela IA ao escolher direções.
  blockedFor(m, x, y, r) {
    if (this.blocked(x, y, r)) return true;
    return !this.standable({ r: r / 0.8, element: m.element, level: this.terrain.heightAt(m.x, m.y) }, x, y);
  }

  chooseReplacement(slot) {
    if (this.coaches[slot]) return this.coaches[slot].pickReplacement();
    // Jogador: próximo monstro vivo na ordem do time.
    const list = this.teamOf(slot);
    const k = list.indexOf(this.teams[slot].field);
    for (let j = 1; j <= list.length; j++) {
      const m = list[(k + j) % list.length];
      if (m.alive && !m.onField) return m;
    }
    return null;
  }

  updateTeams(dt) {
    for (let team = 0; team < this.teams.length; team++) {
      const ts = this.teams[team];
      ts.cooldown = Math.max(0, ts.cooldown - dt);
      const cur = ts.field;
      if (!cur) continue;
      if (!cur.alive) {
        // Substituição automática após a animação de derrota.
        if (this.over) continue;
        ts.deadT += dt;
        if (ts.deadT >= SWITCH.replaceDelay) {
          const next = ts.pending?.alive && !ts.pending.onField ? ts.pending : this.chooseReplacement(team);
          ts.pending = null;
          if (next) this.deploy(team, next, this.spawnFor(team), 'replace');
          else ts.field = null;
        }
        continue;
      }
      if (cur.switchState === 'exiting') {
        cur.switchT -= dt;
        if (cur.switchT <= 0) {
          const next = ts.pending?.alive ? ts.pending : null;
          ts.pending = null;
          if (!next) { cur.switchState = null; this.emit({ type: 'switchCancel', m: cur }); continue; }
          const pos = { x: cur.x, y: cur.y };
          this.bench(cur);
          ts.lastOut = cur;
          ts.lastOutT = this.time;
          ts.switches++;
          ts.cooldown = SWITCH.cooldown;
          this.deploy(team, next, pos, 'switch');
        }
      } else if (cur.switchState === 'entering') {
        cur.switchT -= dt;
        if (cur.switchT <= 0) { cur.switchState = null; this.emit({ type: 'entered', m: cur, x: cur.x, y: cur.y }); }
      }
      this.coaches[team]?.update(dt);
    }
  }

  // Monstros no banco: recargas e status continuam contando; queimadura segue causando dano.
  updateBench(dt) {
    for (const m of this.roster) {
      if (m.onField || !m.alive) continue;
      for (const k in m.cd) if (m.cd[k] > 0) m.cd[k] = Math.max(0, m.cd[k] - dt);
      const st = m.status;
      Sig.bench(m, dt);
      st.overheat = 0; st.exhaust = 0; st.cloak = 0;
      if (st.burn > 0 && m.element !== 'fire') {
        const d = Math.min(m.hp, SWITCH.benchBurnDps * dt);
        m.hp -= d;
        m.stats.dmgTaken += d;
        if (m.hp <= 0.0001) { this.emit({ type: 'benchDefeat', m }); this.kill(m, null); }
      }
      for (const k in st) if (st[k] > 0) st[k] = Math.max(0, st[k] - dt);
    }
  }

  addObstacle(kind, x, y, r) {
    const d = OBSTACLE_DEFS[kind];
    const o = { id: nextObsId++, kind, x, y, r, solid: true, blocksLOS: d.blocksLOS, flammable: d.flammable, hp: d.hp, maxHp: d.hp, burning: 0, destroyed: false, hitFlash: 0, def: d };
    this.obstacles.push(o);
    this.obstacleVersion = (this.obstacleVersion || 0) + 1;
    return o;
  }

  emit(ev) { ev.t = this.time; this.events.push(ev); }
  say(text, color) { this.feed.push({ text, color, t: this.time, seq: ++this.feedSeq }); if (this.feed.length > 40) this.feed.shift(); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  enemiesOf(m) { return this.monsters.filter((o) => o.alive && o.onField && o.team !== m.team); }
  alliesOf(m) { return this.monsters.filter((o) => o.alive && o.onField && o.team === m.team && o !== m); }

  // ───────────── Consultas espaciais ─────────────
  los(x0, y0, x1, y1, opt = {}) {
    for (const o of this.obstacles) {
      if (o.destroyed || !o.blocksLOS || o === opt.ignore) continue;
      if (segCircle(x0, y0, x1, y1, o.x, o.y, o.r * 0.85) >= 0) return false;
    }
    for (const w of this.walls) if (segAabb(x0, y0, x1, y1, w.x, w.y, w.w, w.h) >= 0) return false;
    if (!opt.noSteam) {
      for (const s of this.steam) if (s.density > 0.55 && segCircle(x0, y0, x1, y1, s.x, s.y, s.r * 0.6) >= 0) return false;
    }
    // Penhascos: tiles mais de um nível acima de quem olha bloqueiam a visão (e os tiros).
    if (this.arena.heights) {
      const tr = this.terrain;
      const h0 = opt.level ?? tr.heightAt(x0, y0);
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L / 5);
      for (let k = 1; k < n; k++) if (tr.heightAt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) > h0 + 1.01) return false;
    }
    return true;
  }

  raycast(x0, y0, ang, maxLen) {
    const x1 = x0 + Math.cos(ang) * maxLen, y1 = y0 + Math.sin(ang) * maxLen;
    let best = 1, hit = null;
    for (const o of this.obstacles) {
      if (o.destroyed || !o.solid) continue;
      const t = segCircle(x0, y0, x1, y1, o.x, o.y, o.r);
      if (t >= 0 && t < best) { best = t; hit = o; }
    }
    for (const w of this.walls) {
      const t = segAabb(x0, y0, x1, y1, w.x, w.y, w.w, w.h);
      if (t >= 0 && t < best) { best = t; hit = null; }
    }
    let len = maxLen * best;
    const bx = x0 + Math.cos(ang) * len, by = y0 + Math.sin(ang) * len;
    if (bx < 0 || bx > WORLD_W || by < 0 || by > WORLD_H) {
      const tx = Math.cos(ang) > 0 ? (WORLD_W - x0) / Math.cos(ang) : Math.cos(ang) < 0 ? -x0 / Math.cos(ang) : Infinity;
      const ty = Math.sin(ang) > 0 ? (WORLD_H - y0) / Math.sin(ang) : Math.sin(ang) < 0 ? -y0 / Math.sin(ang) : Infinity;
      len = Math.min(len, tx, ty);
    }
    return { len, hit };
  }

  // Ponto bloqueado para um corpo de raio r? (obstáculos, arquibancadas, bordas)
  blocked(x, y, r = 0) {
    if (x < r + 4 || y < r + 4 || x > WORLD_W - r - 4 || y > WORLD_H - r - 4) return true;
    for (const o of this.obstacles) if (!o.destroyed && o.solid && Math.hypot(o.x - x, o.y - y) < o.r + r) return true;
    for (const w of this.walls) if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) return true;
    return false;
  }

  // ───────────── Elementos no terreno ─────────────
  igniteTile(i, groundTime, src) {
    const res = this.terrain.ignite(i, groundTime);
    if (res === IGNITE.FUEL && src) {
      src.stats.ignites++;
      this.gainEnergy(src, EVOLUTION.environment, true);
      if (!src._lastIgniteSay || this.time - src._lastIgniteSay > 4) {
        src._lastIgniteSay = this.time;
        this.say(`${src.name} incendiou a vegetação`, '#ff9a3c');
      }
      this.emit({ type: 'ignite', x: this.terrain.cx(i), y: this.terrain.cy(i), src });
    } else if (res === IGNITE.STEAM && this.rng() < 0.3) {
      this.puffSteam(this.terrain.cx(i), this.terrain.cy(i), 6, 0.3);
    }
    return res;
  }

  igniteArea(x, y, radius, groundTime, src) {
    const tr = this.terrain;
    let n = 0;
    for (let r = Math.floor((y - radius) / TILE); r <= Math.floor((y + radius) / TILE); r++)
      for (let c = Math.floor((x - radius) / TILE); c <= Math.floor((x + radius) / TILE); c++) {
        const i = tr.idx(c, r);
        if (i >= 0 && Math.hypot(c * TILE + 4 - x, r * TILE + 4 - y) <= radius + 4) if (this.igniteTile(i, groundTime, src) === IGNITE.FUEL) n++;
      }
    return n;
  }

  douseTile(i, wetTime, src) {
    if (i < 0) return false;
    const was = this.terrain.douse(i, wetTime);
    if (was) {
      if (src) {
        src.stats.douses++;
        this.gainEnergy(src, EVOLUTION.environment, true);
        if (!src._lastDouseSay || this.time - src._lastDouseSay > 4) {
          src._lastDouseSay = this.time;
          this.say(`${src.name} apagou as chamas`, '#6ec8ff');
        }
      }
      this.emit({ type: 'extinguish', x: this.terrain.cx(i), y: this.terrain.cy(i), src });
      this.puffSteam(this.terrain.cx(i), this.terrain.cy(i), 9, 0.5);
    }
    return was;
  }

  douseArea(x, y, radius, wetTime, src) {
    const tr = this.terrain;
    let n = 0;
    for (let r = Math.floor((y - radius) / TILE); r <= Math.floor((y + radius) / TILE); r++)
      for (let c = Math.floor((x - radius) / TILE); c <= Math.floor((x + radius) / TILE); c++) {
        const i = tr.idx(c, r);
        if (i >= 0 && Math.hypot(c * TILE + 4 - x, r * TILE + 4 - y) <= radius + 4 && this.douseTile(i, wetTime, src)) n++;
      }
    for (const o of this.obstacles) if (o.burning > 0 && Math.hypot(o.x - x, o.y - y) < radius + o.r) this.douseObstacle(o, src);
    return n;
  }

  // Tinta: nuvem escura que bloqueia a visão por vários segundos.
  puffInk(x, y, r) {
    this.steam.push({ x, y, r, density: 1, life: 6, ink: true, decay: 0.09, rmax: r + 6 });
    this.emit({ type: 'ink', x, y, r });
  }

  // Vapor: nuvens que bloqueiam visão quando densas.
  puffSteam(x, y, r, density) {
    for (const s of this.steam) {
      if (Math.hypot(s.x - x, s.y - y) < s.r * 0.8) {
        s.density = Math.min(1, s.density + density * 0.5);
        s.r = Math.min(26, s.r + r * 0.25);
        s.life = Math.max(s.life, 2.2);
        return;
      }
    }
    this.steam.push({ x, y, r, density, life: 2.2 });
    this.emit({ type: 'steam', x, y });
  }

  igniteObstacle(o, src) {
    if (!o.flammable || o.destroyed || o.burning > 0) return;
    o.burning = o.def.burnTime;
    this.emit({ type: 'obstacleIgnite', o, x: o.x, y: o.y, src });
    this.say(`${o.kind === 'crate' ? 'Um caixote' : 'Um arbusto'} pegou fogo`, '#ff9a3c');
  }

  douseObstacle(o, src) {
    if (o.burning <= 0) return;
    o.burning = 0;
    this.emit({ type: 'extinguish', x: o.x, y: o.y, src });
    this.puffSteam(o.x, o.y, 12, 0.7);
    if (src) src.stats.douses++;
  }

  hurtObstacle(o, amount) {
    if (o.destroyed || o.hp === Infinity) return;
    if (o.group && !o._spread) {
      // Segmentos de um tronco caído dividem o dano (o tronco inteiro enfraquece).
      for (const g of this.obstacles) if (g.group === o.group && g !== o && !g.destroyed) { g._spread = true; this.hurtObstacle(g, amount * 0.35); g._spread = false; }
    }
    o.hp -= amount;
    o.hitFlash = 0.1;
    if (o.hp <= 0) this.destroyObstacle(o);
  }

  destroyObstacle(o) {
    o.destroyed = true;
    o.solid = false;
    this.obstacleVersion++;
    const wasBurning = o.burning > 0;
    o.burning = 0;
    this.emit({ type: 'obstacleBreak', o, x: o.x, y: o.y, kind: o.kind, burning: wasBurning });
    this.say(`${o.kind === 'crate' ? 'Um caixote' : 'Um arbusto'} foi destruído`, '#d9b38c');
    if (wasBurning) this.igniteArea(o.x, o.y, o.r + 6, 3, null);
  }

  // ───────────── Combate ─────────────
  spawnProjectile(p) {
    const proj = {
      id: nextProjId++, team: p.owner.team, age: 0, traveled: 0, dead: false, closest: Infinity,
      px: p.x, py: p.y, level: this.terrain.heightAt(p.owner.x, p.owner.y), ...p,
    };
    if (proj.lob) {
      proj.sx = p.x; proj.sy = p.y; proj.t = 0; proj.h = 0;
    } else {
      proj.vx = Math.cos(p.ang) * p.speed;
      proj.vy = Math.sin(p.ang) * p.speed;
    }
    this.projectiles.push(proj);
    this.emit({ type: 'shoot', p: proj, x: p.x, y: p.y, kind: p.kind });
    return proj;
  }

  damage(t, amount, src, o = {}) {
    if (!t.alive) return 0;
    if (t.status.invuln > 0) {
      if (!o.dot) { t.stats.evaded++; this.gainEnergy(t, EVOLUTION.dodge); this.emit({ type: 'evaded', m: t, src, x: t.x, y: t.y }); }
      return 0;
    }
    let mult = ELEMENT_MULT[o.element || src?.element]?.[t.element] ?? 1;
    const out = Sig.outgoing(this, src, t, o);
    mult *= out.mult * Sig.incoming(t);
    o = out.o;
    // Casco Reflexo: bloqueio ativo reduz o dano e anula empurrões, atordoamento e queimadura.
    const guarding = Sig.isGuarding(t);
    if (guarding) {
      mult *= o.dot ? Sig.SIG.guard.blockDot : Sig.SIG.guard.block;
      o = { ...o, kb: 0, push: 0, stun: 0, burn: 0, root: 0, lift: 0 };
    }
    if (t.evolveT > 0) { mult *= EVOLUTION.damageTaken; o = { ...o, kb: 0, push: 0, stun: 0 }; }
    let dmg = amount * mult;
    // Bolha protetora absorve dano (e impede queimadura enquanto existir).
    if (t.status.shield > 0 && t.shieldHp > 0) {
      const absorbed = Math.min(t.shieldHp, dmg);
      t.shieldHp -= absorbed;
      dmg -= absorbed;
      if (!o.dot) this.emit({ type: 'shieldHit', m: t, x: t.x, y: t.y });
      if (t.shieldHp <= 0) { t.status.shield = 0; this.emit({ type: 'shieldBreak', m: t, x: t.x, y: t.y }); }
      o = { ...o, burn: 0 };
    }
    t.hp -= dmg;
    if (src && src !== t) {
      this.gainEnergy(src, dmg * EVOLUTION.dealt);
      // Cada ataque que acerta enche um pedaço fixo da barra (tiros de sentinelas e cópias não contam).
      if (!o.dot && !o.minor && dmg > 0 && this.time - (src._hitBonusT ?? -9) >= EVOLUTION.hitGap) { src._hitBonusT = this.time; this.gainEnergy(src, EVOLUTION.hit); }
    }
    this.gainEnergy(t, dmg * EVOLUTION.taken);
    if (src) {
      src.stats.dmgDealt += dmg;
      if (!o.dot) src.stats.hits++;
      const tag = o.tag || src.action?.ab.id || 'outro';
      src.stats.bySource = src.stats.bySource || {};
      src.stats.bySource[tag] = (src.stats.bySource[tag] || 0) + dmg;
    }
    t.stats.dmgTaken += dmg;
    t.lastHitBy = src;
    if (o.burn && t.element !== 'fire' && t.status.wet <= 0) {
      const dur = Math.min(FIRE.burnMax, o.burn) * (FIRE.burnTaken[t.element] ?? 1) * (t.def.burnResist ?? 1);
      if (dur > t.status.burn) t.status.burn = dur;
    }
    if (o.wet) { t.status.wet = Math.max(t.status.wet, o.wet); t.status.burn = 0; }
    if (o.root) this.applyRoot(t, o.root);
    if (o.lift) { t.lift = t.liftMax = o.lift; }
    if (o.kb) {
      const k = o.kb / t.def.mass;
      t.kx += Math.cos(o.ang) * k; t.ky += Math.sin(o.ang) * k;
    }
    if (o.push) { t.kx += Math.cos(o.ang) * o.push; t.ky += Math.sin(o.ang) * o.push; }
    if (o.dot) {
      t.dotAcc += dmg;
      if (t.dotAcc >= 3) {
        this.emit({ type: 'hit', m: t, src, amount: t.dotAcc, element: o.element || src?.element, x: t.x, y: t.y, dot: true });
        t.dotAcc = 0;
        t.hitFlash = 0.06;
      }
    } else {
      t.hitFlash = 0.14;
      if (o.stun) this.applyStun(t, o.stun);
      this.emit({ type: 'hit', m: t, src, amount: dmg, element: o.element || src?.element, x: o.x ?? t.x, y: o.y ?? t.y, big: o.big || dmg >= 14, tag: o.tag, blocked: guarding });
      if (!guarding) {
        if (t.action && t.action.phase === 'windup' && !t.action.ab.superArmor && dmg >= 6) t.interrupt(this);
        else if (t.action && t.action.phase !== 'active' && o.stun && !t.action.ab.superArmor) t.interrupt(this);
      }
    }
    if (guarding) Sig.blocked(this, t, src, o);
    Sig.afterDamage(this, t, src, dmg, o);
    if (t.hp <= 0) this.kill(t, src);
    return dmg;
  }

  // Cura (terreno, sentinelas, habilidades). Na morte súbita não cura mais.
  get suddenDeath() { return this.time >= MATCH.suddenDeath; }
  heal(m, amount) {
    if (!m.alive || this.suddenDeath) return;
    m.hp = Math.min(m.maxHp, m.hp + amount);
  }

  // Atordoar/enraizar seguidos perde força: depois de um controle, o próximo dura menos por um instante.
  applyStun(t, time) {
    const k = t.ccGuard > 0 ? CONTROL.chainMult : 1;
    const s = time * k;
    if (s > t.status.stun) t.status.stun = s;
    t.ccGuard = Math.max(t.ccGuard, s + CONTROL.guardTime);
  }
  applyRoot(t, time) {
    if (Sig.isGuarding(t) || t.status.invuln > 0) return false;
    const k = t.rootGuard > 0 ? CONTROL.chainMult : 1;
    const s = time * k;
    if (s > t.status.root) t.status.root = s;
    t.rootGuard = Math.max(t.rootGuard, s + CONTROL.guardTime);
    this.emit({ type: 'rooted', m: t, x: t.x, y: t.y });
    return true;
  }

  popDecoysIn(x, y, r, team) {
    for (const d of [...this.decoys]) if (d.team !== team && Math.hypot(d.x - x, d.y - y) < r + d.owner.r) Sig.popDecoy(this, d);
  }

  kill(t, src) {
    if (!t.alive) return;
    t.hp = 0;
    t.alive = false;
    t.action = null;
    t.deathT = 0;
    t.switchState = null;
    const ts = this.teams[t.slot];
    this.emit({ type: 'death', m: t, src, x: t.x, y: t.y, bench: !t.onField });
    const who = this.playerTeam === null ? '' : t.team === this.sideOfLocal() ? ' (seu time)' : ' (inimigo)';
    this.say(`${t.name}${who} foi derrotado${t.onField ? '' : ' no banco'}!`, '#ffffff');
    if (t.onField) {
      ts.deadT = 0;
      t.controller = null;
      if (t === this.active) this.active = null;
    }
    if (ts.pending === t) ts.pending = null;
    this._checkEnd = true; // decidido no fim do passo, para tratar derrotas simultâneas como empate
  }

  checkEnd() {
    this._checkEnd = false;
    if (this.over) return;
    const alive = [0, 1].map((team) => this.roster.some((m) => m.team === team && m.alive));
    if (alive[0] && alive[1]) return;
    this.over = true;
    this.winner = alive[0] ? 0 : alive[1] ? 1 : -1;
    this.endTime = this.time;
    this.emit({ type: 'matchEnd', winner: this.winner });
  }

  // ───────────── Evolução ─────────────
  gainEnergy(m, amount, environmental = false) {
    if (!m || !m.alive || !m.onField || !m.def.evolvesTo || m.evolved || m.evolveT > 0) return;
    if (environmental) {
      const budget = (m._envBudget ?? EVOLUTION.envPerSecond);
      amount = Math.min(amount, budget);
      m._envBudget = budget - amount;
    }
    m.energy = Math.min(EVOLUTION.threshold, m.energy + amount);
  }

  // Pede a evolução (jogador ou IA). Mesmas regras para todos.
  requestEvolve(m) {
    if (this.over || !m.canEvolve || !m.onField || m.locked || m.status.stun > 0) {
      if (m && m.team === this.playerTeam) this.emit({ type: 'evolveDenied', m });
      return false;
    }
    m.action = null;
    m.evolveT = EVOLUTION.transformTime;
    m._swapped = false;
    m.move.throttle = 0;
    this.emit({ type: 'evolveStart', m, x: m.x, y: m.y });
    this.say(`${m.name} está evoluindo!`, '#e8b8ff');
    return true;
  }

  // Troca a forma mantendo a mesma instância: vida proporcional, recargas preservadas.
  applyForm(m, def) {
    const frac = m.hp / m.maxHp;
    m.def = def;
    m.name = def.name;
    m.maxHp = def.hp;
    m.hp = frac * def.hp;
    m.r = def.radius;
    m.stage = def.stage;
    for (const ab of def.abilities) if (m.cd[ab.id] === undefined) m.cd[ab.id] = 0;
    m.ai.applyProfile();
    // A forma nova é maior: se não couber onde está (beira d'água, parede), vai para o ponto válido mais próximo.
    if (!this.mirror && (!this.standable(m, m.x, m.y) || this.blocked(m.x, m.y, m.r * 0.8))) {
      for (let d = 2; d <= 48; d += 2) {
        let found = false;
        for (let k = 0; k < 16 && !found; k++) {
          const a = (k / 16) * Math.PI * 2, x = m.x + Math.cos(a) * d, y = m.y + Math.sin(a) * d;
          if (this.standable(m, x, y) && !this.blocked(x, y, m.r * 0.8)) { m.x = m.px = x; m.y = m.py = y; found = true; }
        }
        if (found) break;
      }
    }
  }

  updateEvolution(m, dt) {
    if (m.evolveT <= 0) return;
    m.evolveT -= dt;
    const elapsed = EVOLUTION.transformTime - m.evolveT;
    if (!m._swapped && elapsed >= EVOLUTION.swapAt) {
      m._swapped = true;
      const from = m.name;
      this.applyForm(m, SPECIES[m.def.evolvesTo]);
      m.evolved = true;
      m.energy = 0;
      this.emit({ type: 'evolveSwap', m, x: m.x, y: m.y });
      this.say(`${from} evoluiu para ${m.name}!`, '#e8b8ff');
    }
    if (m.evolveT <= 0) {
      m.evolveT = 0;
      this.evolveShockwave(m);
    }
  }

  // Ao terminar a evolução: onda de choque elemental que empurra e transforma o terreno ao redor.
  evolveShockwave(m) {
    const R = EVOLUTION.shockRadius;
    this.emit({ type: 'evolveEnd', m, x: m.x, y: m.y, r: R });
    for (const t of this.enemiesOf(m)) {
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d > R + t.r) continue;
      this.damage(t, EVOLUTION.shockDamage, m, { tag: 'evolucao', kb: EVOLUTION.shockKnockback, ang: Math.atan2(t.y - m.y, t.x - m.x), stun: 0.3, element: m.element });
    }
    if (m.element === 'fire') this.igniteArea(m.x, m.y, 30, 3, m);
    else if (m.element === 'water') this.douseArea(m.x, m.y, 44, 10, m);
    else {
      const tr = this.terrain;
      for (let k = 0; k < 40; k++) {
        const a = this.rng() * Math.PI * 2, d = 8 + this.rng() * 36;
        const i = tr.at(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d);
        if (i >= 0 && tr.growGrass(i)) this.emit({ type: 'grow', x: tr.cx(i), y: tr.cy(i) });
      }
    }
  }

  clash(p, q) {
    p.dead = true;
    if (q) q.dead = true;
    this.puffSteam(p.x, p.y, 10, 0.6);
    this.emit({ type: 'clash', x: p.x, y: p.y });
  }

  // ───────────── Passo da simulação ─────────────
  step(dt) {
    const wasSudden = this.suddenDeath;
    this.time += dt;
    this.tick++;
    if (!wasSudden && this.suddenDeath && !this.over) { this.emit({ type: 'suddenDeath' }); this.say('MORTE SÚBITA: nenhuma cura funciona mais!', '#ff6a6a'); }
    for (const m of this.monsters) { m.px = m.x; m.py = m.y; }
    this.updateTeams(dt);
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m._envBudget = Math.min(EVOLUTION.envPerSecond, (m._envBudget ?? EVOLUTION.envPerSecond) + EVOLUTION.envPerSecond * dt);
      if (m.locked) { m.move.throttle = 0; m.controller?.update(dt); continue; }
      (m.controller || m.ai).update(dt);
    }
    for (const inp of this.inputs) inp.presses.length = 0;
    for (const m of this.monsters) this.updateMonster(m, dt);
    this.updateBench(dt);
    this.resolveCollisions();
    for (const m of this.monsters) if (m.alive) this.constrainToTerrain(m);
    for (const h of this.hazards) h.update(this, dt);
    this.updateProjectiles(dt);
    Sig.updateDecoys(this, dt);
    this.updateObstacles(dt);
    this.terrainAcc += dt;
    while (this.terrainAcc >= TERRAIN_DT) { this.terrainAcc -= TERRAIN_DT; this.terrain.update(TERRAIN_DT); }
    for (const s of this.steam) { s.life -= dt; s.density -= dt * (s.decay ?? 0.25); s.r = Math.min(s.rmax ?? 1e9, s.r + dt * 3); }
    this.steam = this.steam.filter((s) => s.life > 0 && s.density > 0);
    // Corpos de derrotados saem do campo depois da animação.
    this.monsters = this.monsters.filter((m) => m.alive || m.deathT < 2.6);
    if (this._checkEnd) this.checkEnd();
  }

  updateMonster(m, dt) {
    const st = m.status;
    m.hitFlash = Math.max(0, m.hitFlash - dt);
    if (m.lift > 0) m.lift = Math.max(0, m.lift - dt);
    if (!m.alive) { m.deathT += dt; m.kx *= Math.exp(-6 * dt); m.ky *= Math.exp(-6 * dt); m.x += m.kx * dt; m.y += m.ky * dt; return; }
    for (const k in m.cd) if (m.cd[k] > 0) m.cd[k] = Math.max(0, m.cd[k] - dt);
    for (const k in st) if (st[k] > 0) st[k] = Math.max(0, st[k] - dt);

    // Efeitos do terreno sob os pés.
    const tr = this.terrain;
    const i = tr.at(m.x, m.y);
    if (i >= 0) {
      const p = props(tr.type[i]);
      if (tr.fire[i] > 0) {
        m.stats.timeOnFire += dt;
        if (m.element === 'fire') this.heal(m, FIRE.selfHeal * dt);
        else {
          // Vegetação em chamas arde mais que o chão em brasa deixado por ataques.
          const dps = p.fuel ? FIRE.fuelDps : FIRE.groundDps;
          this.damage(m, dps * (m.def.burnResist ?? 1) * dt, null, { dot: true, element: 'fire', burn: FIRE.groundBurn, tag: 'chao' });
        }
      }
      if (m.element === 'plant' && p.vegetation && tr.fire[i] <= 0) this.heal(m, 1 * dt);
      if (p.thorns && m.element !== 'plant' && tr.fire[i] <= 0) this.damage(m, p.thorns * dt, null, { dot: true, element: 'plant', tag: 'espinhos' });
      if (p.water) {
        st.burn = 0;
        if (m.element === 'water' && !p.deep) this.heal(m, 2 * this.arena.waterHeal * dt);
        else if (m.element !== 'water') st.wet = Math.max(st.wet, 1);
      } else if (tr.wet[i] > 0) st.burn = 0;
      // Correntezas empurram quem está na água (nadadores resistem mais).
      if (tr.flowX[i] || tr.flowY[i]) {
        const k = m.element === 'water' ? 0.4 : 1;
        m.x += tr.flowX[i] * k * dt;
        m.y += tr.flowY[i] * k * dt;
      }
    }
    if (st.burn > 0 && m.element !== 'fire') this.damage(m, FIRE.burnDps * dt, null, { dot: true, element: 'fire', tag: 'queimadura' });
    if (!m.alive) return;
    Sig.update(this, m, dt);

    this.updateEvolution(m, dt);
    if (!m.alive) return;
    m.updateAction(this, dt);

    // Locomoção: a IA define a intenção, a física aplica aceleração e empurrões.
    const a = m.action;
    const spd = m.def.speed * m.speedMult(this);
    if (a && a.phase === 'active' && a.ab.dash) {
      m.vx = Math.cos(a.dir) * a.ab.dash.speed;
      m.vy = Math.sin(a.dir) * a.ab.dash.speed;
    } else {
      let dx = 0, dy = 0;
      if (st.stun <= 0 && st.root <= 0 && !m.locked) { dx = m.move.x * m.move.throttle * spd; dy = m.move.y * m.move.throttle * spd; }
      const acc = Math.min(1, 12 * dt);
      m.vx += (dx - m.vx) * acc;
      m.vy += (dy - m.vy) * acc;
      if (!a) m.facing = turnTo(m.facing, m.lookAt, 10 * dt);
    }
    const damp = Math.exp(-6 * dt);
    m.kx *= damp; m.ky *= damp;
    m.x += (m.vx + m.kx) * dt;
    m.y += (m.vy + m.ky) * dt;
    m.stats.dist += Math.hypot(m.x - m.px, m.y - m.py);
  }

  resolveCollisions() {
    const ms = this.monsters.filter((m) => m.alive);
    const air = (m) => m.action && m.action.phase === 'active' && m.action.ab.leap;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j];
        if (air(a) || air(b)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
      for (const m of ms) this.collideStatic(m);
    }
  }

  collideStatic(m) {
    const leaping = m.action && m.action.phase === 'active' && m.action.ab.leap; // saltos passam por cima de obstáculos
    for (const o of this.obstacles) {
      if (o.destroyed || !o.solid || leaping) continue;
      const dx = m.x - o.x, dy = m.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = m.r + o.r;
      if (d < min) {
        m.x = o.x + dx / d * min; m.y = o.y + dy / d * min;
        const vn = (m.kx * dx + m.ky * dy) / d;
        if (vn < 0) { m.kx -= vn * dx / d * 1.5; m.ky -= vn * dy / d * 1.5; }
        if (Math.hypot(m.kx, m.ky) > 140 && !m._wallSlam) { m._wallSlam = true; this.emit({ type: 'slam', m, x: m.x, y: m.y }); }
      }
    }
    for (const w of this.walls) {
      const cx = clamp(m.x, w.x, w.x + w.w), cy = clamp(m.y, w.y, w.y + w.h);
      const dx = m.x - cx, dy = m.y - cy, d = Math.hypot(dx, dy);
      if (d < m.r) {
        if (d > 0.01) { m.x = cx + dx / d * m.r; m.y = cy + dy / d * m.r; }
        else m.y = w.y + w.h + m.r;
      }
    }
    m.x = clamp(m.x, m.r + 4, WORLD_W - m.r - 4);
    m.y = clamp(m.y, m.r + 4, WORLD_H - m.r - 4);
    if (Math.hypot(m.kx, m.ky) < 60) m._wallSlam = false;
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.age += dt;
      p.px = p.x; p.py = p.y;
      if (p.lob) {
        p.t += dt;
        const k = Math.min(1, p.t / p.flight);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        p.h = Math.sin(Math.PI * k) * 70;
        if (p.flat) p.h = 0;
        if (k >= 1) {
          p.dead = true;
          if (p.kind === 'roots') this.eruptRoots(p);
          else if (p.kind === 'sentrySeed') Sig.plantSentry(this, p);
          else if (p.kind === 'bubble') this.bubbleBurst(p);
          else if (p.kind === 'tentacle') this.tentacleSlam(p);
          else this.explodeMeteor(p);
        }
        continue;
      }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      let best = 2, hitM = null, hitO = null, hitWall = false, hitGuard = null, hitDecoy = null;
      for (const m of this.monsters) {
        if (!m.alive || m.team === p.team) continue;
        const dd = Math.hypot(m.x - p.x, m.y - p.y);
        if (dd < p.closest) { p.closest = dd; p.closestM = m; }
        // Área atingível: o corpo do monstro, não só os pés (pés + parte de cima do sprite).
        const t = hurtT(p.x, p.y, nx, ny, m, p.r);
        if (t < 0) continue;
        if (m.status.invuln > 0) {
          if (!p.evadedBy) { p.evadedBy = m; m.stats.evaded++; this.gainEnergy(m, EVOLUTION.dodge); this.emit({ type: 'evaded', m, x: m.x, y: m.y }); }
          continue;
        }
        if (Sig.isGuarding(m) && !p.pierce) { if (t < best) { best = t; hitGuard = m; hitM = null; } continue; }
        if (p.pierce) {
          // Onda: atravessa, atinge cada monstro uma vez e continua.
          p.hitSet ||= new Set();
          if (!p.hitSet.has(m.id)) { p.hitSet.add(m.id); this.projectileHitMonster(p, m); }
          continue;
        }
        if (t < best) { best = t; hitM = m; hitGuard = null; }
      }
      for (const d of this.decoys) {
        if (d.team === p.team) continue;
        const t = segCircle(p.x, p.y, nx, ny, d.x, d.y, d.owner.r + p.r);
        if (t >= 0 && t < best) { best = t; hitDecoy = d; hitM = null; hitGuard = null; }
      }
      for (const o of this.obstacles) {
        if (o.destroyed || !o.solid) continue;
        if (o.team !== undefined && o.team === p.team) continue; // não acerta a própria sentinela
        const t = segCircle(p.x, p.y, nx, ny, o.x, o.y, o.r + p.r * 0.5);
        if (t >= 0 && t < best) { best = t; hitO = o; hitM = null; hitGuard = null; hitDecoy = null; }
      }
      for (const w of this.walls) {
        const t = segAabb(p.x, p.y, nx, ny, w.x, w.y, w.w, w.h);
        if (t >= 0 && t < best) { best = t; hitWall = true; hitM = null; hitO = null; hitGuard = null; hitDecoy = null; }
      }
      // Penhasco mais alto que o nível do disparo: o projétil bate na encosta.
      if (this.arena.heights && this.terrain.heightAt(nx, ny) > p.level + 1.01) {
        const segL = Math.hypot(nx - p.x, ny - p.y);
        for (let s = 0; s <= segL; s += 2) {
          const t = s / (segL || 1);
          if (this.terrain.heightAt(p.x + (nx - p.x) * t, p.y + (ny - p.y) * t) > p.level + 1.01) {
            if (t < best) { best = t; hitWall = true; hitM = null; hitO = null; hitGuard = null; hitDecoy = null; }
            break;
          }
        }
      }
      const k = best <= 1 ? best : 1;
      const ox = p.x, oy = p.y;
      p.x = ox + (nx - ox) * k;
      p.y = oy + (ny - oy) * k;
      const seg = Math.hypot(p.x - ox, p.y - oy);
      if (p.kind === 'wave') {
        for (let s = 0; s <= seg; s += 4) this.douseArea(ox + (p.x - ox) * (s / (seg || 1)), oy + (p.y - oy) * (s / (seg || 1)), 9, 6, p.owner);
      }
      if (p.kind === 'waterBolt') {
        for (let s = 0; s <= seg; s += 4) this.douseTile(this.terrain.at(ox + (p.x - ox) * (s / (seg || 1)), oy + (p.y - oy) * (s / (seg || 1))), 4, p.owner);
      }
      p.traveled += seg;
      const out = p.x < 0 || p.y < 0 || p.x > WORLD_W || p.y > WORLD_H;
      if (hitGuard) { Sig.reflect(this, p, hitGuard); continue; }
      if (hitDecoy) { p.dead = true; p.hitTarget = hitDecoy; Sig.popDecoy(this, hitDecoy); this.emit({ type: 'impact', kind: p.kind, x: p.x, y: p.y }); continue; }
      if (hitM) { p.dead = true; p.hitTarget = hitM; this.projectileHitMonster(p, hitM); }
      else if (hitO || hitWall || out) { p.dead = true; this.projectileHitSolid(p, hitO); }
      else if (p.traveled >= p.range) { p.dead = true; this.projectileExpire(p); }
      if (p.dead && !p.hitTarget && p.closestM && p.closest < p.closestM.r + 18) {
        this.emit({ type: 'nearMiss', m: p.closestM, p, x: p.x, y: p.y });
      }
    }
    // Choque entre projéteis de elementos opostos: viram vapor (a onda apaga projéteis de fogo e segue).
    const live = this.projectiles.filter((p) => !p.dead && !p.lob);
    const fireK = (p) => p.kind === 'ember' || p.kind === 'magma';
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.dead || b.dead || a.team === b.team) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 3) continue;
      if ((a.kind === 'wave' && fireK(b)) || (b.kind === 'wave' && fireK(a))) this.clash(a.kind === 'wave' ? b : a, null);
      else if ((a.kind === 'magma' && b.kind === 'waterBolt') || (a.kind === 'waterBolt' && b.kind === 'magma')) {
        // Lava é quente demais para um jato d'água: o jato vira vapor e a lava segue, mais fraca.
        const lava = a.kind === 'magma' ? a : b, jet = lava === a ? b : a;
        this.clash(jet, null);
        lava.dmg = Math.max(4, lava.dmg * 0.7);
      } else if ((fireK(a) && b.kind === 'waterBolt') || (a.kind === 'waterBolt' && fireK(b))) this.clash(a, b);
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  projectileHitMonster(p, m) {
    this.emit({ type: 'impact', kind: p.kind, x: p.x, y: p.y, target: m });
    const ang = Math.atan2(p.vy, p.vx);
    const base = { ang, x: p.x, y: p.y, proj: true, minor: !!(p.fromSentry || p.fromDecoy) };
    if (p.kind === 'ember') {
      this.damage(m, p.dmg, p.owner, { ...base, tag: p.tag || 'ember', burn: 1.5, kb: 70, stun: 0.1, element: 'fire' });
      this.igniteTile(this.terrain.at(p.x, p.y), 1, p.owner);
    } else if (p.kind === 'magma') {
      this.damage(m, p.dmg, p.owner, { ...base, tag: p.tag || 'magmaBall', burn: 1.8, kb: 90, stun: 0.12, element: 'fire' });
      this.igniteArea(p.x, p.y, 8, 2, p.owner);
    } else if (p.kind === 'wave') {
      this.damage(m, p.dmg, p.owner, { ...base, tag: 'tidalWave', wet: 4, kb: 330, stun: 0.35, element: 'water' });
    } else if (p.kind === 'thorn') {
      this.damage(m, p.dmg, p.owner, { ...base, tag: p.fromSentry ? 'sentinela' : 'thornShot', kb: 70, stun: p.fromSentry ? 0 : 0.12, element: 'plant' });
      this.sprout(p.x, p.y, T.THORNS, p.owner);
    } else if (p.kind === 'seed') {
      this.damage(m, p.dmg, p.owner, { ...base, tag: p.fromSentry ? 'sentinela' : p.tag || 'seedShot', kb: 60, stun: p.fromSentry ? 0 : 0.1, element: 'plant' });
    } else if (p.kind === 'waterBolt') {
      this.damage(m, p.dmg, p.owner, { ...base, tag: p.reflected ? 'reflexo' : p.tag || 'waterBolt', wet: p.fromDecoy ? 1 : 3, kb: p.fromDecoy ? 30 : 80, stun: p.fromDecoy ? 0 : 0.12, element: 'water' });
      this.douseArea(p.x, p.y, 12, 6, p.owner);
    }
  }

  projectileHitSolid(p, o) {
    this.emit({ type: 'impact', kind: p.kind, x: p.x, y: p.y, obstacle: o });
    if (p.kind === 'ember') {
      if (o) { this.hurtObstacle(o, p.dmg); if (o.flammable && !o.destroyed) this.igniteObstacle(o, p.owner); }
      this.igniteArea(p.x, p.y, 4, 1.3, p.owner);
    } else if (p.kind === 'magma') {
      if (o) { this.hurtObstacle(o, p.dmg); if (o.flammable && !o.destroyed) this.igniteObstacle(o, p.owner); }
      this.igniteArea(p.x, p.y, 9, 2.2, p.owner);
    } else if (p.kind === 'seed' || p.kind === 'thorn') {
      if (o) this.hurtObstacle(o, p.dmg * 0.5);
      this.sprout(p.x - Math.cos(Math.atan2(p.vy, p.vx)) * 6, p.y - Math.sin(Math.atan2(p.vy, p.vx)) * 6, p.kind === 'thorn' ? T.THORNS : T.GRASS, p.owner);
    } else if (p.kind === 'wave') {
      this.douseArea(p.x, p.y, 18, 8, p.owner);
    } else {
      if (o) { this.hurtObstacle(o, p.dmg * 0.5); if (o.burning > 0) this.douseObstacle(o, p.owner); }
      this.douseArea(p.x, p.y, 12, 6, p.owner);
    }
  }

  projectileExpire(p) {
    this.emit({ type: 'impact', kind: p.kind, x: p.x, y: p.y, ground: true });
    if (p.kind === 'ember') this.igniteArea(p.x, p.y, 4, 1.4, p.owner);
    else if (p.kind === 'magma') this.igniteArea(p.x, p.y, 9, 2.2, p.owner);
    else if (p.kind === 'seed') this.sprout(p.x, p.y, T.GRASS, p.owner);
    else if (p.kind === 'thorn') this.sprout(p.x, p.y, T.THORNS, p.owner);
    else this.douseArea(p.x, p.y, p.kind === 'wave' ? 18 : 12, 6, p.owner);
  }

  explodeMeteor(p) {
    this.emit({ type: 'explosion', x: p.tx, y: p.ty, r: p.radius, src: p.owner });
    for (const m of this.monsters) {
      if (!m.alive || m.team === p.team) continue;
      const d = Math.hypot(m.x - p.tx, m.y - p.ty);
      if (d > p.radius + m.r) continue;
      const f = 1 - 0.5 * Math.min(1, d / p.radius);
      this.damage(m, p.dmg * f, p.owner, { tag: 'meteor', kb: 230, ang: Math.atan2(m.y - p.ty, m.x - p.tx), stun: 0.3, burn: 1.8, element: 'fire', proj: true });
    }
    this.popDecoysIn(p.tx, p.ty, p.radius, p.team);
    for (const o of this.obstacles) {
      if (o.destroyed || Math.hypot(o.x - p.tx, o.y - p.ty) > p.radius + o.r) continue;
      this.hurtObstacle(o, 20);
      if (o.flammable && !o.destroyed) this.igniteObstacle(o, p.owner);
    }
    this.igniteArea(p.tx, p.ty, p.radius * 0.6, 2, p.owner);
  }

  // Bolha Prisão (Gotapus): estoura no chão e prende quem estiver dentro numa bolha.
  bubbleBurst(p) {
    this.emit({ type: 'bubbleBurst', x: p.tx, y: p.ty, r: p.radius, src: p.owner });
    for (const m of this.monsters) {
      if (!m.alive || m.team === p.team) continue;
      if (Math.hypot(m.x - p.tx, m.y - p.ty) > p.radius + m.r) continue;
      if (this.damage(m, p.dmg, p.owner, { tag: 'bubbleTrap', element: 'water', wet: 3, proj: true }) > 0 && this.applyRoot(m, p.trap)) {
        m.status.bubble = m.status.root;
        m.vx = m.vy = 0; m.kx *= 0.2; m.ky *= 0.2;
        this.emit({ type: 'bubbled', m, x: m.x, y: m.y });
      }
    }
    this.popDecoysIn(p.tx, p.ty, p.radius, p.team);
    this.douseArea(p.tx, p.ty, p.radius * 0.8, 6, p.owner);
  }

  // Tentáculos do Abismo (Leviapus): irrompem do chão onde a marca estava, erguendo e encharcando.
  tentacleSlam(p) {
    this.emit({ type: 'tentacleSlam', x: p.tx, y: p.ty, r: p.radius, big: !!p.big, src: p.owner });
    for (const m of this.monsters) {
      if (!m.alive || m.team === p.team) continue;
      const d = Math.hypot(m.x - p.tx, m.y - p.ty);
      if (d > p.radius + m.r) continue;
      this.damage(m, p.dmg, p.owner, { tag: 'tentaculos', element: 'water', wet: 3, stun: p.big ? 0.4 : 0.25, lift: p.big ? 0.6 : 0.4, kb: 60, ang: Math.atan2(m.y - p.ty, m.x - p.tx), proj: true, minor: !p.big });
    }
    this.popDecoysIn(p.tx, p.ty, p.radius, p.team);
    this.douseArea(p.tx, p.ty, p.radius * 0.7, 6, p.owner);
  }

  // Semente que cai no chão brota um tufo de grama (ou espinheiro, na forma ancestral).
  sprout(x, y, type = T.GRASS, src = null) {
    const tr = this.terrain;
    const c0 = Math.floor(x / TILE), r0 = Math.floor(y / TILE);
    const cells = type === T.THORNS ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
    for (const [dx, dy] of cells) {
      const i = tr.idx(c0 + dx, r0 + dy);
      if (i >= 0 && (dx === 0 && dy === 0 || this.rng() < 0.6) && tr.growGrass(i, type)) {
        this.emit({ type: 'grow', x: tr.cx(i), y: tr.cy(i) });
        if (src) this.gainEnergy(src, EVOLUTION.environment, true);
      }
    }
  }

  eruptRoots(p) {
    this.emit({ type: 'rootsErupt', x: p.tx, y: p.ty, r: p.radius, src: p.owner, dur: (p.rootTime || 1.6) + 0.2 });
    for (const m of this.monsters) {
      if (!m.alive || m.team === p.team) continue;
      if (Math.hypot(m.x - p.tx, m.y - p.ty) > p.radius + m.r) continue;
      if (this.damage(m, p.dmg, p.owner, { tag: p.owner?.def.controls.q || 'rootSnare', element: 'plant', stun: 0.15, proj: true }) > 0) {
        if (this.applyRoot(m, p.rootTime || 1.6)) { m.vx = m.vy = 0; }
      }
    }
    const tr = this.terrain;
    for (let r = Math.floor((p.ty - p.radius) / TILE); r <= Math.floor((p.ty + p.radius) / TILE); r++)
      for (let c = Math.floor((p.tx - p.radius) / TILE); c <= Math.floor((p.tx + p.radius) / TILE); c++) {
        const i = tr.idx(c, r);
        if (i >= 0 && Math.hypot(c * TILE + 4 - p.tx, r * TILE + 4 - p.ty) <= p.radius) tr.growRoots(i, p.rootTiles || 5);
      }
  }

  updateObstacles(dt) {
    for (const o of this.obstacles) {
      o.hitFlash = Math.max(0, o.hitFlash - dt);
      // Obstáculos temporários (barreira da planta) murcham sozinhos.
      if (o.life !== undefined && !o.destroyed) {
        o.life -= dt;
        if (o.life <= 0) { o.destroyed = true; o.solid = false; o.burning = 0; this.obstacleVersion++; this.emit({ type: 'wither', o, x: o.x, y: o.y }); continue; }
      }
      if (o.sentry && !o.destroyed) Sig.updateSentry(this, o, dt);
      if (o.destroyed || o.burning <= 0) continue;
      o.burning -= dt;
      this.hurtObstacle(o, o.def.burnDps * dt);
      if (o.destroyed) continue;
      // Objetos em chamas aquecem a vegetação ao redor.
      if (this.rng() < dt * 4) {
        const a = this.rng() * Math.PI * 2, d = o.r + this.rng() * 8;
        this.igniteTile(this.terrain.at(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d), 0, null);
      }
      for (const m of this.monsters) {
        if (m.alive && m.element !== 'fire' && Math.hypot(m.x - o.x, m.y - o.y) < m.r + o.r + 3) this.damage(m, FIRE.obstacleDps * dt, null, { dot: true, burn: FIRE.groundBurn, element: 'fire', tag: 'chao' });
      }
    }
  }
}

// Momento (0..1) em que o projétil (x0,y0)→(x1,y1) encosta no corpo do monstro, ou -1.
// O corpo é uma cápsula: dos pés até ~metade da altura do sprite (visão 3/4: o tiro que passa "atrás" da cabeça acerta).
function hurtT(x0, y0, x1, y1, m, pr) {
  const R = m.r + pr;
  let best = segCircle(x0, y0, x1, y1, m.x, m.y, R);
  const t2 = segCircle(x0, y0, x1, y1, m.x, m.y - m.r * 0.9, R * 0.85);
  if (t2 >= 0 && (best < 0 || t2 < best)) best = t2;
  return best;
}

function turnTo(cur, target, step) {
  let d = (target - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return cur + Math.max(-step, Math.min(step, d));
}
