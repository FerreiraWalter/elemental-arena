import { turnToward, angleTo } from '../core/math.js';
import { props } from './tiles.js';
import { EVOLUTION, FIRE } from '../config.js';
import { onCast, SIG } from './signature.js';
import * as Air from './air.js';

let nextId = 1;

export class Monster {
  constructor(def, team, x, y) {
    this.id = nextId++;
    this.def = def;
    this.name = def.name;
    this.element = def.element;
    this.team = team;
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = this.vy = 0; // velocidade de locomoção
    this.kx = this.ky = 0; // velocidade de empurrão (knockback), decai sozinha
    this.r = def.radius;
    this.hp = this.maxHp = def.hp;
    this.facing = team === 0 ? 0 : Math.PI;
    this.lookAt = this.facing;
    this.action = null;
    this.cd = {};
    // Cargas: habilidades com `charges` guardam até N usos; cada carga volta em `cooldown` s (rc = tempo restante
    // da carga que está recarregando). Entre dois usos seguidos há só um intervalo curto (`chargeGap`).
    this.ch = {};
    this.rc = {};
    for (const ab of def.abilities) this.initAbility(ab);
    // haste: disparada ao recolher uma brasa (Brasalinha); cloak: camuflagem de tinta (Gotapus).
    // bubble: preso na Bolha Prisão do Gotapus (desenho; o efeito real é o enraizamento).
    // slow: lento (slowK = fração perdida); dr: casca (drK = redução de dano); regen: cura contínua (regenK por s).
    this.status = { burn: 0, wet: 0, stun: 0, invuln: 0, root: 0, shield: 0, haste: 0, cloak: 0, bubble: 0, slow: 0, dr: 0, regen: 0, charm: 0, charmImm: 0 };
    this.slowK = 0; this.drK = 0; this.regenK = 0;
    this.volt = 0; this.voltT = 0; // cargas elétricas (Raiolua/Trovogato)
    this.trance = 0; this.tranceT = 0; this.charmBy = null; // transe e hipnose (Sapomental)
    this.spark = 0; // centelhas guardadas (Brasalinha/Fornalhonte): próximo tiro incandescente
    this.momentum = 0; // Ímpeto do Ouriflama (0..100)
    this.charged = false; // em disparada: próximo golpe fortalecido
    this.marks = { n: 0, by: 0, t: 0, last: -9 }; // marcas de caça recebidas de uma Mantifolha
    this.breakCd = 0; // recarga da Quebra de Combo
    this.ccGuard = 0; // atordoamentos seguidos perdem força enquanto > 0
    this.rootGuard = 0;
    this.shieldHp = 0;
    this.line = def.line;
    this.energy = 0; // energia de evolução (persiste no banco)
    this.lift = 0; // >0 enquanto está no ar (erguido pelo Mergulho Vulcânico)
    this.liftMax = 1;
    this.evolveT = 0; // >0 durante a transformação
    this.evolved = false;
    this.alive = true;
    this.deathT = 0;
    this.hitFlash = 0;
    this.move = { x: 0, y: 0, throttle: 0 }; // intenção de movimento definida pela IA
    this.ai = null;
    this.controller = null; // PlayerController quando o jogador controla este monstro
    // Estado persistente durante toda a partida (nunca recriado ao trocar).
    this.onField = false;
    this.switchState = null; // null | 'exiting' | 'entering'
    this.switchT = 0;
    this.enteredAt = 0;
    this.stage = def.stage || 1;
    this.dotAcc = 0;
    this.dotTimer = 0;
    this.stats = { dist: 0, casts: 0, hits: 0, dmgDealt: 0, dmgTaken: 0, dodges: 0, evaded: 0, ignites: 0, douses: 0, timeOnFire: 0, states: {} };
  }

  ability(id) { return this.def.abilities.find((a) => a.id === id); }
  initAbility(ab) {
    if (this.cd[ab.id] === undefined) this.cd[ab.id] = 0;
    if (ab.charges && this.ch[ab.id] === undefined) { this.ch[ab.id] = ab.charges; this.rc[ab.id] = 0; }
  }
  // Avança recargas e cargas (em campo e no banco).
  tickCooldowns(dt) {
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);
    for (const k in this.ch) {
      const ab = this.ability(k);
      if (!ab || this.ch[k] >= ab.charges) { this.rc[k] = 0; continue; }
      this.rc[k] -= dt;
      if (this.rc[k] <= 0) { this.ch[k]++; this.rc[k] = this.ch[k] < ab.charges ? ab.cooldown : 0; }
    }
  }
  // Tempo até poder usar de novo (para HUD e IA): com cargas, só espera a recarga se não sobrou nenhuma.
  waitFor(id) {
    const ab = this.ability(id);
    if (ab?.charges) return Math.max(this.cd[id] || 0, this.ch[id] > 0 ? 0 : this.rc[id] || 0);
    return this.cd[id] || 0;
  }
  get locked() { return !!this.switchState || this.evolveT > 0; } // trocando ou evoluindo: não age
  get canEvolve() { return !!this.def.evolvesTo && !this.evolved && this.alive && this.energy >= EVOLUTION.threshold; }
  ready(id) {
    if (!this.alive || !this.onField || this.locked || this.action || this.status.stun > 0 || this.status.charm > 0 || !(this.cd[id] <= 0)) return false;
    if (this.ch[id] !== undefined && this.ch[id] <= 0) return false; // sem cargas
    if (this.status.root > 0 && this.ability(id)?.dash) return false; // enraizado não consegue investir/esquivar
    return true;
  }
  isSpecial(id) { const c = this.def.controls; return id === c.q || id === c.e || id === c.f;
  }
  get busy() { return !!this.action || this.status.stun > 0 || this.status.charm > 0; }

  // Inicia uma habilidade. params: { aim, aimPoint, target, point, dir, purpose }
  cast(w, ab, params = {}) {
    if (!this.ready(ab.id)) return false;
    const aim = params.aim ?? this.facing;
    this.action = {
      ab, phase: 'windup', t: 0, aim, hit: new Set(), data: {},
      aimPoint: params.aimPoint || null, target: params.target || null, point: params.point || null,
      dir: params.dir ?? aim, purpose: params.purpose || 'attack', aimLand: !!params.aimLand,
    };
    if (ab.charges) {
      if (this.ch[ab.id] >= ab.charges) this.rc[ab.id] = ab.cooldown; // começa a recarregar a carga gasta
      this.ch[ab.id]--;
      this.cd[ab.id] = ab.chargeGap ?? 0.6;
    } else this.cd[ab.id] = ab.cooldown;
    this.stats.casts++;
    if (ab.kind === 'dodge') { this.stats.dodges++; this.action.aim = this.action.dir; }
    if (ab.kind === 'dash') this.action.aim = this.action.dir;
    w.emit({ type: 'cast', m: this, ab: ab.id, kind: ab.kind, purpose: this.action.purpose, x: this.x, y: this.y });
    onCast(w, this, ab);
    if (ab.windup <= 0) this.enterActive(w);
    return true;
  }

  enterActive(w) {
    const a = this.action;
    a.phase = 'active';
    a.t = 0;
    if (a.ab.kind === 'dash' || a.ab.kind === 'dodge') a.dir = a.aim;
    if (a.ab.leap) this.aimLeap(a, true);
    if (a.ab.hop || a.ab.air) a.from = { x: this.x, y: this.y };
    if (a.ab.dash?.invuln) this.status.invuln = Math.max(this.status.invuln, a.ab.active);
    a.ab.onActiveStart?.(w, this, a);
  }

  // Saltos (Salto Longo, Salto Celeste): caem no ponto mirado quando a tecla foi apertada; o alcance da
  // habilidade é só o máximo. O tempo de voo não muda (mesma invulnerabilidade), muda a velocidade.
  // Só o jogador escolhe o ponto (aimLand); a IA e o salto sem ponto mirado usam o alcance todo.
  aimLeap(a, final) {
    const ab = a.ab;
    if (!a.aimPoint || !a.aimLand || a.purpose === 'escape') { a.leapDist = ab.range; if (final) a.leapFrom = { x: this.x, y: this.y }; return; }
    const dx = a.aimPoint.x - this.x, dy = a.aimPoint.y - this.y, d = Math.hypot(dx, dy);
    a.leapDist = Math.max(ab.minRange ?? 30, Math.min(ab.range, d));
    if (final && d > 2) a.dir = a.aim = this.facing = Math.atan2(dy, dx);
    if (final) a.leapFrom = { x: this.x, y: this.y };
  }

  interrupt(w) {
    if (!this.action) return;
    w.emit({ type: 'interrupt', m: this, ab: this.action.ab.id, x: this.x, y: this.y });
    this.action = null;
  }

  updateAction(w, dt) {
    const a = this.action;
    if (!a) return;
    const ab = a.ab;
    a.t += dt;
    if (a.phase === 'windup' || a.phase === 'active') {
      const rate = ab.turn[a.phase === 'windup' ? 0 : 1];
      if (rate > 0 && a.aimPoint) a.aim = turnToward(a.aim, angleTo(this, a.aimPoint), rate * dt);
      this.facing = a.aim;
    }
    if (a.phase === 'windup') {
      if (ab.leap) this.aimLeap(a, false);
      // Habilidades de segurar (tornado da arara): continua carregando enquanto o botão está apertado (jogador)
      // ou até o tempo que a IA escolheu; solta sozinho na carga máxima.
      if (ab.hold && a.t >= ab.windup) {
        if (a.holding === undefined && a.holdFor === undefined) a.holdFor = Air.aiHoldFor(w, this, a);
        const holding = a.holding !== undefined ? a.holding : a.t < a.holdFor;
        if (holding && a.t < ab.windup + ab.hold) return;
        a.charge = Air.holdK(a);
      }
      if (a.t >= ab.windup) this.enterActive(w);
    } else if (a.phase === 'active') {
      ab.onActiveTick?.(w, this, a, dt);
      if (this.action !== a) return;
      if (a.t >= ab.active) {
        a.phase = 'recovery'; a.t = 0;
        if (ab.leap) { this.vx = 0; this.vy = 0; } // salto finca no chão onde caiu (sem escorregar)
        if (ab.leap || ab.hop || ab.air) w.landAirborne?.(this, a); // pousa num lugar válido (sobre a água/pedra não fica)
        ab.onEnd?.(w, this, a);
      }
    } else if (a.t >= ab.recovery) {
      this.action = null;
    }
  }

  speedMult(w) {
    const tr = w.terrain;
    const i = tr.at(this.x, this.y);
    let k = 1;
    // Voadores pairam: água, chão molhado, raízes, mato e espinhos não os atrasam.
    if (i >= 0 && !this.def.hover) {
      const p = props(tr.type[i]);
      if (p.water) k *= this.element === 'water' ? (this.def.waterSpeed || 1.25) : 0.65;
      else if (tr.wet[i] > 0) k *= this.element === 'water' ? (this.def.wetSpeed || 1.15) : 0.88;
      if (tr.fire[i] > 0 && this.element === 'fire') k *= FIRE.selfSpeed;
      if (tr.roots[i] > 0 && this.element !== 'plant') k *= 0.55;
      if (p.slow && this.element !== 'plant') k *= p.slow;
      if (p.vegetation && this.element === 'plant') k *= 1.1;
    }
    if (this.status.wet > 0 && this.element === 'fire') k *= 0.9; // molhado, o fogo fica um pouco mais lento
    if (this.status.haste > 0) k *= 1.25;
    if (this.charged) k *= SIG.momentum.chargedSpeed;
    if (this.status.slow > 0) k *= 1 - Math.min(0.6, this.slowK || 0);
    if (this.def.sig?.kind === 'volt' && this.volt >= (this.def.sig.voltMax ?? 3)) k *= 1.1; // eletrizado
    if (this.action) {
      const ph = this.action.phase === 'windup' ? 0 : this.action.phase === 'active' ? 1 : 2;
      k *= this.action.ab.move[ph];
    }
    return k;
  }
}
