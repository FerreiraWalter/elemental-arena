import { ELEMENT_MULT } from '../config.js';

// "Técnico" de um time controlado pela IA: decide trocas voluntárias e o substituto após uma derrota.
// Usa as mesmas regras do jogador (World.requestSwitch: recarga, animação vulnerável, sem trocar para derrotados).
// Avalia vantagem elemental, vida, status e recargas, com histerese para não ficar trocando em loop.

export function matchup(a, b) {
  return (ELEMENT_MULT[a.element]?.[b.element] ?? 1) - (ELEMENT_MULT[b.element]?.[a.element] ?? 1);
}

export class TeamCoach {
  constructor(w, team, opts = {}) {
    this.w = w;
    this.team = team;
    this.thinkT = 1;
    this.minField = opts.minField ?? 8; // segundos mínimos em campo antes de uma troca voluntária
    this.margin = opts.margin ?? 0.55; // quanto o reserva precisa ser melhor que o atual
    this.log = [];
  }

  value(m, foe) {
    let v = m.hp / m.maxHp;
    if (foe) v += matchup(m, foe) * 1.6;
    if (m.status.burn > 0) v -= 0.15;
    if (m.status.root > 0 || m.status.stun > 0) v -= 0.1;
    if (m.canEvolve) v += 0.25; // reserva pronta para evoluir vale mais
    if (m.evolved) v += 0.15;
    const abs = m.def.abilities;
    v += (abs.filter((ab) => m.cd[ab.id] <= 0).length / abs.length) * 0.25;
    return v;
  }

  update(dt) {
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = 0.5;
    const w = this.w, ts = w.teams[this.team], cur = ts.field;
    if (w.over || !cur || !cur.alive || cur.locked || ts.cooldown > 0) return;
    if (w.time - cur.enteredAt < this.minField) return;
    if (cur.action && cur.action.phase !== 'recovery') return; // não abandona um ataque no meio
    const foe = this.nearestFoe(cur);
    if (!foe || !foe.alive || foe.locked) return;
    if (w.time - foe.enteredAt < 2.5) return; // não troca em reação imediata a cada entrada (evita ciclo de contra-trocas)
    if (w.time - ts.lastOutT < 10) return; // no máximo uma troca voluntária a cada 10 s
    const bench = w.teamOf(this.team).filter((m) => m.alive && m !== cur);
    if (!bench.length) return;

    const hpF = cur.hp / cur.maxHp, foeF = foe.hp / foe.maxHp;
    let stay = this.value(cur, foe) + 0.35;
    if (foeF < 0.25 && hpF > 0.2) stay += 0.6; // quase vencendo: fica e termina a luta
    const danger = hpF < 0.3 && (Math.hypot(foe.x - cur.x, foe.y - cur.y) < 70 || cur.status.burn > 0);
    if (danger) stay -= 0.35; // salvar o monstro ferido para depois

    let best = null, bestV = -Infinity;
    for (const m of bench) {
      let v = this.value(m, foe);
      if (m === ts.lastOut && w.time - ts.lastOutT < 25) v -= 0.6; // evita ir e voltar
      if (v > bestV) { bestV = v; best = m; }
    }
    if (best && bestV > stay + this.margin && w.requestSwitch(this.team, best)) {
      this.log.push({ t: w.time, from: cur.name, to: best.name, reason: danger ? 'perigo' : 'vantagem' });
    }
  }

  // Inimigo em campo mais próximo (no 2v2 há dois).
  nearestFoe(from) {
    const foes = this.w.enemiesOf(from);
    if (!foes.length) return null;
    return foes.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
  }

  pickReplacement() {
    const w = this.w;
    const ref = w.teams[this.team].field || w.teamOf(this.team)[0];
    const foe = ref ? this.nearestFoe(ref) : null;
    let best = null, bestV = -Infinity;
    for (const m of w.teamOf(this.team)) {
      if (!m.alive || m.onField) continue;
      const v = this.value(m, foe && foe.alive ? foe : null);
      if (v > bestV) { bestV = v; best = m; }
    }
    return best;
  }
}
