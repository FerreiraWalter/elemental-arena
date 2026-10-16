// Modo Treinamento: seus monstros contra até 3 bonecos de pano com alvo (vida infinita).
// Só existe no jogo local (não no online). Nada morre: os bonecos se recompõem e seus monstros não caem abaixo de 1.
// Opções: bonecos que atiram (para treinar esquiva e bloqueio), recargas instantâneas, evoluir e voltar à forma base.

import { Monster } from './monster.js';
import { Brain } from '../ai/brain.js';
import { SPECIES } from './species.js';
import { EVOLUTION, WORLD_W, WORLD_H } from '../config.js';

export const MAX_DUMMIES = 3;

// O boneco usa o sistema normal de monstros (status, marcas, raízes, bolha...), mas não anda nem pensa.
export const DUMMY = {
  key: 'dummy', line: 'dummy', stage: 1, name: 'Boneco de Treino', title: 'Treino', element: 'neutral', sprite: 'dummy',
  hp: 300, speed: 0, radius: 9, mass: 2.2,
  abilities: [], controls: {}, dodge: null, traits: ['Vida infinita'],
  profile: { personality: 'Parado', range: [0, 0], aggression: 0, retreatHp: 0, reaction: 1, dodgeSkill: 0, accuracy: 0, lead: 0, fireCost: 0, wetCost: 0, waterCost: 0 },
};

export function setup(w, opts = {}) {
  w.training = {
    opts: { dummies: 1, shoot: false, noCd: false, ...opts },
    log: [], // { t, d } dano causado nos bonecos (medidor)
    lastHit: 0,
    dummies: [],
  };
  setDummies(w, w.training.opts.dummies);
}

// Lugares dos bonecos: à frente de onde o jogador nasce, em leque.
function dummySpot(w, k) {
  const sp = w.spawns[0];
  const dir = sp.x < WORLD_W / 2 ? 1 : -1;
  const offs = [[115, 0], [95, -48], [95, 48]];
  const [dx, dy] = offs[k];
  return w.safeSpot(sp.x + dir * dx, sp.y + dy, 10, 0);
}

export function setDummies(w, n) {
  const T = w.training;
  n = Math.max(1, Math.min(MAX_DUMMIES, n));
  T.opts.dummies = n;
  if (w.dummySlot === undefined) {
    w.teams.push({ side: 1, field: null, pending: null, cooldown: 0, deadT: 0, lastOut: null, lastOutT: -99, switches: 0 });
    w.inputs.push({ move: { x: 0, y: 0 }, aim: { x: WORLD_W / 2, y: WORLD_H / 2 }, held: {}, presses: [] });
    w.coaches.push(null);
    w.dummySlot = w.teams.length - 1;
  }
  while (T.dummies.length > n) {
    const d = T.dummies.pop();
    w.monsters = w.monsters.filter((m) => m !== d);
    w.roster = w.roster.filter((m) => m !== d);
    w.emit({ type: 'wither', x: d.x, y: d.y });
  }
  while (T.dummies.length < n) {
    const p = dummySpot(w, T.dummies.length);
    const d = new Monster(DUMMY, 1, p.x, p.y);
    d.slot = w.dummySlot;
    d.dummy = true;
    d.anchor = { x: p.x, y: p.y };
    d.ai = new Brain(d, w);
    d.ai.update = () => { d.move.throttle = 0; };
    d.onField = true;
    d.level = w.terrain.heightAt(p.x, p.y);
    d.facing = Math.PI;
    d.shootT = 1 + T.dummies.length * 0.7;
    w.roster.push(d);
    w.monsters.push(d);
    T.dummies.push(d);
    w.teams[w.dummySlot].field ||= d;
    w.emit({ type: 'enter', m: d, reason: 'start', x: p.x, y: p.y });
  }
}

// Chamado pelo World.damage antes de decidir se alguém caiu.
export function onDamage(w, t, src, dmg) {
  const T = w.training;
  t._hurtT = w.time;
  if (t.dummy && dmg > 0 && src && src.team === 0) { T.log.push({ t: w.time, d: dmg }); T.lastHit = dmg; }
  if (t.hp < 1) t.hp = 1; // ninguém cai no treino
}

export function update(w, dt) {
  const T = w.training;
  const me = w.playerTeam !== null ? w.fieldOf(w.playerTeam) : null;
  for (const m of w.roster) {
    if (m.dummy) continue;
    if (m.hp < 1) m.hp = 1;
    // Energia sempre cheia: o G evolui na hora.
    if (m.def.evolvesTo && !m.evolved && m.evolveT <= 0) m.energy = EVOLUTION.threshold;
    // Vida volta sozinha depois de alguns segundos sem levar dano.
    if (w.time - (m._hurtT ?? -99) > 3) m.hp = m.maxHp;
  }
  if (T.opts.noCd && me) {
    for (const k in me.cd) if (!me.action || me.action.ab.id !== k) me.cd[k] = 0;
    w.teams[w.playerTeam].cooldown = 0;
  }
  for (const d of T.dummies) {
    // Vida infinita: depois de 1,2 s sem apanhar, volta inteira.
    if (w.time - (d._hurtT ?? -99) > 1.2) d.hp = d.maxHp;
    // Volta devagar para o lugar quando não está sendo empurrado.
    if (Math.hypot(d.kx, d.ky) < 25 && d.lift <= 0) {
      d.x += (d.anchor.x - d.x) * Math.min(1, dt * 2.5);
      d.y += (d.anchor.y - d.y) * Math.min(1, dt * 2.5);
    }
    if (me) d.facing = Math.atan2(me.y - d.y, me.x - d.x);
    // Bonecos que atiram: bolinha lenta e fraca, para treinar esquiva, bloqueio e reflexo.
    if (T.opts.shoot && me && me.alive && me.onField && !me.switchState) {
      d.shootT -= dt;
      if (d.shootT <= 0) {
        d.shootT = 2.2;
        const ang = Math.atan2(me.y - d.y, me.x - d.x);
        if (Math.hypot(me.x - d.x, me.y - d.y) < 280 && w.los(d.x, d.y, me.x, me.y)) {
          w.spawnProjectile({ kind: 'seed', tag: 'treino', owner: d, ang, speed: 150, r: 3, range: 290, dmg: 4, x: d.x + Math.cos(ang) * 12, y: d.y + Math.sin(ang) * 12 - 6, minorShot: true });
          w.emit({ type: 'dummyShot', m: d, x: d.x, y: d.y });
        }
      }
    }
  }
  while (T.log.length && w.time - T.log[0].t > 5) T.log.shift();
}

// Medidor: dano nos últimos 5 s e por segundo.
export function meter(w) {
  const T = w.training;
  const sum = T.log.reduce((a, e) => a + e.d, 0);
  const span = T.log.length ? Math.max(1, Math.min(5, w.time - T.log[0].t)) : 1;
  return { sum, dps: sum / span, last: T.lastHit };
}

// Volta o monstro em campo para a forma base (para testar a evolução de novo).
export function devolve(w, m) {
  const base = Object.values(SPECIES).find((s) => s.evolvesTo === m.def.key);
  if (!base || m.evolveT > 0) return false;
  w.applyForm(m, base);
  m.evolved = false;
  m.energy = EVOLUTION.threshold;
  w.emit({ type: 'devolve', m, x: m.x, y: m.y });
  return true;
}
