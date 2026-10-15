// Controle direto do jogador sobre o monstro ativo. Lê world.input (preenchido pelo main a cada quadro)
// e usa exatamente o mesmo sistema de habilidades da IA: preparação, hitbox, recarga e colisões reais.
// Entradas ficam num buffer curto para que um clique durante outra ação não se perca.

const BUFFER = 0.3;

export class PlayerController {
  constructor(m, w, input) {
    this.m = m;
    this.w = w;
    this.input = input || w.input;
    this.buffer = [];
    this.state = 'player';
  }

  update(dt) {
    const m = this.m, w = this.w, inp = this.input;
    if (w.over) { m.move.throttle = 0; this.buffer.length = 0; return; }
    if (inp.presses.includes('evolve')) w.requestEvolve(m);
    if (m.locked) { m.move.throttle = 0; this.buffer.length = 0; return; } // trocando/evoluindo: sem ações
    const l = Math.hypot(inp.move.x, inp.move.y);
    m.move.x = l ? inp.move.x / l : 0;
    m.move.y = l ? inp.move.y / l : 0;
    m.move.throttle = l ? 1 : 0;
    m.lookAt = Math.atan2(inp.aim.y - m.y, inp.aim.x - m.x);

    for (const slot of inp.presses) this.buffer.push({ slot, t: BUFFER });
    // Segurar o botão do mouse repete o ataque assim que ele recarrega.
    for (const slot of ['primary', 'melee']) {
      if (inp.held[slot] && !this.buffer.some((b) => b.slot === slot)) this.buffer.push({ slot, t: 0.05 });
    }
    this.buffer = this.buffer.filter((b) => (b.t -= dt) > 0);
    if (this.buffer.length && !m.busy) {
      for (let k = 0; k < this.buffer.length; k++) {
        if (this.tryCast(this.buffer[k].slot)) { this.buffer.splice(k, 1); break; }
      }
    }

    // A mira segue o cursor durante preparação e canalização (o raio d'água acompanha o mouse, limitado pela velocidade de giro).
    const a = m.action;
    if (a && a.phase !== 'recovery' && a.ab.kind !== 'dash' && a.ab.kind !== 'dodge') {
      a.aimPoint = { x: inp.aim.x, y: inp.aim.y };
      if (a.ab.kind === 'lob' && a.phase === 'windup') a.point = { x: inp.aim.x, y: inp.aim.y };
    }
  }

  tryCast(slot) {
    const m = this.m, w = this.w, inp = this.input;
    const id = m.def.controls[slot];
    if (!id || !m.ready(id)) return false;
    const ab = m.ability(id);
    const aim = Math.atan2(inp.aim.y - m.y, inp.aim.x - m.x);
    const l = Math.hypot(inp.move.x, inp.move.y);
    const dir = ab.kind === 'dodge' && l > 0 ? Math.atan2(inp.move.y, inp.move.x) : aim;
    const ok = m.cast(w, ab, {
      aim: ab.kind === 'dodge' ? dir : aim, dir,
      aimPoint: { x: inp.aim.x, y: inp.aim.y }, point: { x: inp.aim.x, y: inp.aim.y },
      purpose: ab.kind === 'dodge' ? 'dodge' : 'attack',
    });
    if (ok && ab.kind === 'dodge') w.emit({ type: 'dodge', m, threat: 'player', x: m.x, y: m.y });
    return ok;
  }
}
