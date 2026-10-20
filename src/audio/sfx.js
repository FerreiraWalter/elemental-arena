// Efeitos sonoros sintetizados (WebAudio, sem arquivos). Cada evento do combate vira um som curto e
// característico do elemento; volume e "ligado/desligado" ficam nas opções. Sons repetidos em sequência
// são limitados para não virar ruído, e o panorama estéreo segue a posição na arena.

const MIN_GAP = { hit: 0.045, dot: 0.25, ignite: 0.18, shoot: 0.03, impact: 0.05, steam: 0.15, step: 0.1 };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.6;
    this.last = new Map();
    this.voices = 0;
  }

  // Navegadores só liberam áudio depois de um gesto do usuário (clique/tecla).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6;
    this.master.connect(comp).connect(c.destination);
    const n = c.sampleRate;
    this.noise = c.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setEnabled(on) { this.enabled = on; }

  ok(key, gap = 0.03) {
    if (!this.ctx || !this.enabled || this.volume <= 0 || this.voices > 28) return false;
    const now = this.ctx.currentTime, t = this.last.get(key) || 0;
    if (now - t < gap) return false;
    this.last.set(key, now);
    return true;
  }

  out(x) {
    const c = this.ctx;
    if (x === undefined || !c.createStereoPanner) return this.master;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-0.7, Math.min(0.7, (x / 704) * 1.4 - 0.7));
    p.connect(this.master);
    return p;
  }

  // Tom com envelope e varredura de frequência.
  tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.15, vol = 0.3, at = 0, x, attack = 0.005 }) {
    const c = this.ctx, t0 = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.out(x));
    this.voices++;
    o.onended = () => { this.voices--; };
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // Ruído filtrado (chiado, fogo, água, impacto).
  hiss({ type = 'bandpass', f0 = 1200, f1 = f0, q = 1, dur = 0.15, vol = 0.3, at = 0, x, attack = 0.004 }) {
    const c = this.ctx, t0 = c.currentTime + at;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.out(x));
    this.voices++;
    s.onended = () => { this.voices--; };
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }

  play(name, x) {
    if (!this.ctx) return;
    switch (name) {
      case 'click': if (this.ok(name, 0.04)) this.tone({ type: 'square', f0: 880, f1: 660, dur: 0.05, vol: 0.12 }); break;
      case 'hover': if (this.ok(name, 0.05)) this.tone({ type: 'square', f0: 520, f1: 520, dur: 0.025, vol: 0.05 }); break;
      case 'deny': if (this.ok(name, 0.15)) { this.tone({ type: 'square', f0: 140, f1: 110, dur: 0.12, vol: 0.12 }); } break;
      case 'start': if (this.ok(name, 0.5)) [523, 659, 784].forEach((f, k) => this.tone({ type: 'square', f0: f, dur: 0.12, vol: 0.1, at: k * 0.08 })); break;
      case 'victory': [523, 659, 784, 1046].forEach((f, k) => this.tone({ type: 'square', f0: f, dur: 0.22, vol: 0.12, at: k * 0.12 })); break;
      case 'defeat': [392, 330, 262].forEach((f, k) => this.tone({ type: 'triangle', f0: f, f1: f * 0.97, dur: 0.3, vol: 0.14, at: k * 0.18 })); break;
    }
    void x;
  }

  // Evento do combate → som.
  event(e, world) {
    if (!this.ctx || !this.enabled) return;
    const x = e.x;
    const el = (m) => m?.element;
    switch (e.type) {
      case 'shoot': {
        if (!this.ok('shoot:' + e.kind, MIN_GAP.shoot)) return;
        const k = e.kind;
        if (k === 'ember' || k === 'magma') { this.hiss({ f0: 1400, f1: 500, q: 1.2, dur: 0.14, vol: 0.18, x }); this.tone({ type: 'triangle', f0: k === 'magma' ? 180 : 320, f1: 140, dur: 0.12, vol: 0.12, x }); }
        else if (k === 'waterBolt') this.tone({ type: 'sine', f0: 900, f1: 420, dur: 0.11, vol: 0.18, x });
        else if (k === 'wave') { this.hiss({ type: 'lowpass', f0: 1800, f1: 400, dur: 0.45, vol: 0.25, x }); this.tone({ f0: 160, f1: 90, dur: 0.4, vol: 0.15, x }); }
        else if (k === 'seed' || k === 'thorn') this.tone({ type: 'square', f0: 1500, f1: 700, dur: 0.05, vol: 0.07, x });
        else if (k === 'meteor') this.tone({ type: 'sine', f0: 1600, f1: 500, dur: 0.9, vol: 0.06, x });
        else if (k === 'roots' || k === 'sentrySeed') this.tone({ type: 'triangle', f0: 300, f1: 500, dur: 0.12, vol: 0.1, x });
        return;
      }
      case 'cast':
        if (e.kind === 'melee' && this.ok('swing', 0.05)) this.hiss({ type: 'bandpass', f0: 600, f1: 2400, q: 0.8, dur: 0.09, vol: 0.12, x });
        else if (e.kind === 'dodge' && this.ok('dodge', 0.05)) this.hiss({ type: 'bandpass', f0: 400, f1: 2000, q: 1, dur: 0.16, vol: 0.14, x });
        else if (e.kind === 'cone' && this.ok('cone', 0.2)) { const f = el(e.m) === 'fire'; this.hiss({ type: f ? 'lowpass' : 'bandpass', f0: f ? 2400 : 1600, f1: f ? 900 : 1200, dur: 0.7, vol: 0.2, x, attack: 0.08 }); }
        else if (e.kind === 'beam' && this.ok('beam', 0.3)) this.hiss({ type: 'bandpass', f0: 2600, f1: 1800, q: 3, dur: 1.1, vol: 0.14, x, attack: 0.1 });
        else if (e.kind === 'guard' && this.ok('guard', 0.1)) { this.tone({ type: 'triangle', f0: 600, f1: 900, dur: 0.12, vol: 0.12, x }); }
        else if (e.kind === 'dash' && this.ok('dash', 0.1)) this.hiss({ type: 'lowpass', f0: 1200, f1: 300, dur: 0.3, vol: 0.18, x });
        else if (e.kind === 'aoe' && this.ok('aoe', 0.2)) this.hiss({ type: 'bandpass', f0: 500, f1: 1400, q: 2, dur: 0.6, vol: 0.14, x, attack: 0.1 });
        return;
      case 'hit': {
        if (e.dot) { if (this.ok('dot', MIN_GAP.dot)) this.hiss({ type: 'highpass', f0: 3000, dur: 0.06, vol: 0.05, x }); return; }
        if (!this.ok('hit', MIN_GAP.hit)) return;
        if (e.blocked) { this.tone({ type: 'triangle', f0: 1200, f1: 900, dur: 0.12, vol: 0.14, x }); this.tone({ type: 'triangle', f0: 1800, f1: 1500, dur: 0.1, vol: 0.08, x }); return; }
        const big = e.amount >= 14, mine = e.m === world.active;
        this.tone({ type: 'sine', f0: big ? 160 : 220, f1: 55, dur: big ? 0.18 : 0.1, vol: (big ? 0.35 : 0.22) * (mine ? 1.2 : 1), x });
        this.hiss({ type: 'bandpass', f0: e.element === 'fire' ? 1800 : e.element === 'water' ? 1200 : 2400, q: 0.9, dur: 0.06, vol: big ? 0.2 : 0.12, x });
        return;
      }
      case 'impact': if (e.ground && this.ok('impact', 0.08)) this.hiss({ type: 'lowpass', f0: 900, f1: 200, dur: 0.08, vol: 0.06, x }); return;
      case 'rockHit': if (this.ok('rock', 0.08)) { this.tone({ type: 'triangle', f0: 160, f1: 60, dur: 0.18, vol: 0.22, x }); this.hiss({ type: 'lowpass', f0: 900, f1: 200, dur: 0.15, vol: 0.14, x }); } return;
      case 'quake': this.tone({ type: 'sine', f0: 90, f1: 35, dur: 0.5, vol: 0.32, x }); this.hiss({ type: 'lowpass', f0: 600, f1: 120, dur: 0.45, vol: 0.2, x }); return;
      case 'explosion': case 'burrowEruption': case 'heatNova':
        if (!this.ok('boom', 0.08)) return;
        this.hiss({ type: 'lowpass', f0: 1200, f1: 120, dur: 0.6, vol: 0.4, x });
        this.tone({ type: 'sine', f0: 110, f1: 35, dur: 0.5, vol: 0.35, x });
        return;
      case 'clash': if (this.ok('steam', MIN_GAP.steam)) this.hiss({ type: 'highpass', f0: 2500, f1: 4000, dur: 0.3, vol: 0.12, x }); return;
      case 'ignite': if (this.ok('ignite', MIN_GAP.ignite)) this.hiss({ type: 'bandpass', f0: 900, f1: 1400, q: 2, dur: 0.18, vol: 0.05, x }); return;
      case 'extinguish': if (this.ok('extinguish', 0.2)) this.hiss({ type: 'highpass', f0: 3000, f1: 2000, dur: 0.25, vol: 0.06, x }); return;
      case 'evaded': if (this.ok('evaded', 0.1)) this.tone({ type: 'sine', f0: 1200, f1: 1800, dur: 0.1, vol: 0.1, x }); return;
      case 'interrupt': if (this.ok('interrupt', 0.1)) this.tone({ type: 'square', f0: 300, f1: 180, dur: 0.1, vol: 0.08, x }); return;
      case 'death':
        this.hiss({ type: 'lowpass', f0: 1600, f1: 100, dur: 0.9, vol: 0.3, x });
        this.tone({ type: 'triangle', f0: 400, f1: 60, dur: 0.8, vol: 0.25, x });
        return;
      case 'enter': if (e.reason !== 'start') { this.hiss({ type: 'bandpass', f0: 300, f1: 2500, dur: 0.3, vol: 0.12, x }); this.tone({ type: 'square', f0: 660, f1: 990, dur: 0.15, vol: 0.08, x, at: 0.1 }); } return;
      case 'recall': this.tone({ type: 'square', f0: 990, f1: 440, dur: 0.2, vol: 0.07, x }); return;
      case 'evolveStart': [262, 330, 392, 523, 659].forEach((f, k) => this.tone({ type: 'triangle', f0: f, dur: 0.2, vol: 0.12, at: k * 0.1, x })); return;
      case 'evolveSwap': [523, 659, 784, 1046].forEach((f) => this.tone({ type: 'square', f0: f, f1: f * 1.01, dur: 0.6, vol: 0.07, x })); this.hiss({ type: 'highpass', f0: 2000, dur: 0.5, vol: 0.15, x }); return;
      case 'shield': this.tone({ type: 'sine', f0: 500, f1: 1000, dur: 0.25, vol: 0.12, x }); return;
      case 'shieldBreak': this.tone({ type: 'sine', f0: 900, f1: 300, dur: 0.2, vol: 0.14, x }); return;
      case 'rootsErupt': this.hiss({ type: 'lowpass', f0: 600, f1: 150, dur: 0.35, vol: 0.2, x }); this.tone({ type: 'triangle', f0: 120, f1: 70, dur: 0.3, vol: 0.15, x }); return;
      case 'rooted': if (this.ok('rooted', 0.2)) this.tone({ type: 'triangle', f0: 200, f1: 150, dur: 0.15, vol: 0.1, x }); return;
      // ───── mecânicas próprias ─────
      case 'overheat': this.tone({ type: 'sawtooth', f0: 180, f1: 900, dur: 0.45, vol: 0.12, x }); this.hiss({ type: 'bandpass', f0: 800, f1: 2400, dur: 0.45, vol: 0.18, x }); return;
      case 'exhaust': this.tone({ type: 'sine', f0: 420, f1: 90, dur: 0.6, vol: 0.14, x }); this.hiss({ type: 'highpass', f0: 2500, f1: 1200, dur: 0.6, vol: 0.08, x }); return;
      case 'charged': [660, 880, 1320].forEach((f, k) => this.tone({ type: 'square', f0: f, dur: 0.07, vol: 0.07, at: k * 0.05, x })); return;
      case 'empowered': this.tone({ type: 'square', f0: 220, f1: 110, dur: 0.18, vol: 0.18, x }); this.hiss({ type: 'bandpass', f0: 2000, f1: 600, dur: 0.15, vol: 0.2, x }); return;
      case 'thorns': if (this.ok('thorns', 0.1)) this.tone({ type: 'square', f0: 1400, f1: 1000, dur: 0.05, vol: 0.06, x }); return;
      case 'counter': this.hiss({ type: 'lowpass', f0: 2400, f1: 400, dur: 0.35, vol: 0.3, x }); this.tone({ type: 'sine', f0: 300, f1: 80, dur: 0.25, vol: 0.25, x }); return;
      case 'reflect': if (this.ok('reflect', 0.06)) this.tone({ type: 'triangle', f0: 1500, f1: 2200, dur: 0.12, vol: 0.12, x }); return;
      case 'decoy': if (this.ok('decoy', 0.1)) this.tone({ type: 'sine', f0: 700, f1: 350, dur: 0.15, vol: 0.08, x }); return;
      case 'decoyPop': this.tone({ type: 'sine', f0: 500, f1: 1400, dur: 0.08, vol: 0.14, x }); this.hiss({ type: 'lowpass', f0: 1500, f1: 300, dur: 0.2, vol: 0.1, x }); return;
      case 'cloak': this.tone({ type: 'sine', f0: 900, f1: 200, dur: 0.35, vol: 0.08, x }); return;
      case 'marked': if (this.ok('marked', 0.08)) this.tone({ type: 'triangle', f0: 800 + (e.n || 1) * 200, dur: 0.06, vol: 0.07, x }); return;
      case 'execute': this.hiss({ type: 'bandpass', f0: 3000, f1: 800, q: 1.5, dur: 0.18, vol: 0.3, x }); [784, 988, 1318].forEach((f) => this.tone({ type: 'triangle', f0: f, dur: 0.35, vol: 0.08, at: 0.05, x })); return;
      case 'sentryGrow': this.tone({ type: 'triangle', f0: 400, f1: 600, dur: 0.1, vol: 0.1, x }); this.tone({ type: 'triangle', f0: 600, f1: 800, dur: 0.1, vol: 0.08, at: 0.08, x }); return;
      case 'sentryShot': if (this.ok('sentryShot', 0.08)) this.tone({ type: 'square', f0: 1200, f1: 600, dur: 0.04, vol: 0.04, x }); return;
      case 'bubbleBurst': this.tone({ type: 'sine', f0: 300, f1: 900, dur: 0.15, vol: 0.16, x }); this.hiss({ type: 'lowpass', f0: 1800, f1: 400, dur: 0.3, vol: 0.18, x }); return;
      case 'bubblePop': this.tone({ type: 'sine', f0: 700, f1: 1600, dur: 0.07, vol: 0.14, x }); return;
      case 'tentacleSlam': this.hiss({ type: 'lowpass', f0: 1400, f1: 120, dur: 0.6, vol: e.big ? 0.35 : 0.2, x }); this.tone({ type: 'sine', f0: e.big ? 90 : 140, f1: 40, dur: 0.5, vol: e.big ? 0.3 : 0.15, x }); return;
      case 'waveCrash': if (e.small) { if (this.ok('smallWave', 0.1)) this.hiss({ type: 'lowpass', f0: 1800, f1: 300, dur: 0.22, vol: 0.12, x }); return; } this.hiss({ type: 'lowpass', f0: 2600, f1: 200, dur: 0.7, vol: 0.38, x }); this.tone({ type: 'sine', f0: 120, f1: 45, dur: 0.5, vol: 0.25, x }); return;
      case 'splash':
        if (this.ok('splash', 0.08)) { if (e.water) { this.tone({ type: 'sine', f0: 700, f1: 260, dur: 0.14, vol: 0.12, x }); this.hiss({ type: 'highpass', f0: 2600, dur: 0.12, vol: 0.06, x }); } else this.hiss({ type: 'bandpass', f0: 500, f1: 220, q: 1.5, dur: 0.18, vol: 0.14, x }); }
        return;
      case 'whirlBurst': this.hiss({ type: 'bandpass', f0: 600, f1: 2200, dur: 0.35, vol: 0.2, x }); return;
      case 'burrowOut': this.hiss({ type: 'lowpass', f0: 700, f1: 150, dur: 0.25, vol: e.big ? 0.22 : 0.14, x }); this.tone({ type: 'triangle', f0: 180, f1: 90, dur: 0.18, vol: 0.12, x }); return;
      case 'castDenied': if (e.m === world.active) this.play('deny'); return;
      case 'switchDenied': if (e.team === world.playerTeam) this.play('deny'); return;
      case 'evolveDenied': this.play('deny'); return;
      case 'matchEnd': {
        if (world.playerTeam === null) return;
        const mySide = world.teams[world.playerTeam].side;
        this.play(e.winner === mySide ? 'victory' : 'defeat');
        return;
      }
    }
  }
}

export const sfx = new Sfx();
