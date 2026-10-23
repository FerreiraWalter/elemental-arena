// Tutorial guiado pelo Professor Remendo (um boneco de treino de beca, óculos e varinha). Roda em cima do modo
// Treinamento (bonecos de vida infinita, ninguém cai) com um time fixo, um de cada ponta do triângulo dos elementos.
// Cada lição: o professor fala (o jogo fica parado até o jogador passar as falas), depois vem um objetivo com
// progresso na tela; cumprido, um elogio curto e a próxima lição. A última é a prova final contra o Boneco Mestre
// (vida limitada, revida). Só existe no jogo local. Os textos mudam entre teclado/mouse e toque (this.touch).

import { ELEMENT_MULT, EVOLUTION, WORLD_W, WORLD_H } from '../config.js';

export const TUTORIAL_TEAM = ['brasalisco', 'hidrocasco', 'brotossauro'];
export const TUTORIAL_KEY = 'ea-tutorial-feito'; // localStorage: tutorial concluído (o menu tira o destaque)
const BOSS_HP = 260;

// Nome dos controles em cada modo (usados nas falas e nos objetivos).
const KEYS = {
  pc: { move: 'W A S D (ou as setas)', primary: 'clique ESQUERDO', melee: 'clique DIREITO', dodge: 'ESPAÇO', evo: 'G', sw: '2', q: 'Q', e: 'E', f: 'F' },
  touch: { move: 'o ANALÓGICO', primary: 'ATQ', melee: 'GOLPE', dodge: 'ESQ', evo: 'EVO', sw: 'o botão 2', q: 'Q', e: 'E', f: 'F' },
};

// Falas: texto ou função (k = nomes dos controles, t = toque?).
const LESSONS = [
  {
    id: 'oi', title: 'BOAS-VINDAS',
    talk: [
      'Opa! Seja bem-vindo à Arena Elemental! Eu sou o Professor Remendo.',
      'Sou boneco de treino há 30 anos. Já levei mais pancada que tambor de escola de samba!',
      'Hoje eu vou te ensinar tudo o que um domador de monstros precisa saber. Bora?',
    ],
  },
  {
    id: 'andar', title: 'ANDAR', hint: ['move'],
    talk: [
      'Esta é a Brasalinha, sua primeira aluna. Ela é do elemento FOGO.',
      (k, t) => t ? 'Para andar, arraste o ANALÓGICO, no canto de baixo à esquerda da tela.' : 'Para andar, use W A S D (ou as setas do teclado).',
      'Passe pelos 3 círculos brilhantes no chão, um de cada vez!',
    ],
    goal: { kind: 'walk', need: 3, text: (k) => `Ande com ${k.move} até o círculo brilhante` },
    praise: 'Andou bonito! Parece até que nasceu na arena.',
  },
  {
    id: 'tiro', title: 'ATIRAR', hint: ['primary'],
    talk: [
      'Agora vamos atacar! Aquele ali é meu primo, o Boneco de Treino. Pode bater, ele não sente nada.',
      (k, t) => t ? 'Toque no botão ATQ (o maior, à direita). A mira vai sozinha no inimigo mais perto.' : 'Mire com o MOUSE e use o clique ESQUERDO para atirar de longe.',
      'Acerte o boneco 3 vezes!',
    ],
    goal: { kind: 'shoot', need: 3, text: (k) => `Acerte o boneco com tiros (${k.primary})` },
    praise: 'Na mosca! Pontaria de campeão.',
  },
  {
    id: 'golpe', title: 'GOLPE DE PERTO', hint: ['melee'],
    talk: [
      'O tiro é bom de longe. De perto, use o GOLPE: ele é rápido e EMPURRA o inimigo.',
      (k, t) => t ? 'Chegue bem pertinho do boneco e toque em GOLPE.' : 'Chegue bem pertinho do boneco e use o clique DIREITO.',
    ],
    goal: { kind: 'melee', need: 2, text: (k) => `Chegue perto e golpeie o boneco (${k.melee})` },
    praise: 'Uau, que rabada! Ainda bem que não foi em mim.',
  },
  {
    id: 'esquiva', title: 'ESQUIVA', hint: ['dodge'],
    talk: [
      'Agora o boneco vai REVIDAR jogando bolinhas. Calma, são fraquinhas!',
      (k) => `Quando a bolinha estiver CHEGANDO PERTO, aperte ${k.dodge}: a Brasalinha dá um pulinho e fica INVULNERÁVEL por um instante.`,
      'O pulinho vai para o lado em que você estiver andando. Desvie de 2 bolinhas!',
    ],
    goal: { kind: 'dodge', need: 2, text: (k) => `Esquive (${k.dodge}) quando a bolinha chegar perto` },
    praise: 'Escorregadia como sabão! Esquivar na hora certa ganha luta.',
  },
  {
    id: 'poderes', title: 'PODERES ESPECIAIS', hint: ['q', 'e', 'f'],
    talk: [
      'Cada monstro tem 3 PODERES ESPECIAIS: Q, E e F. Eles são fortes, mas demoram para recarregar.',
      'Na Brasalinha: Q solta um JATO DE FOGO, E faz uma IGNIÇÃO (explode as brasas do chão) e F é um SALTO para trás.',
      (k, t) => t ? 'Toque em Q, E e F. Dica: arraste a partir do botão para escolher a direção.' : 'Aperte Q, E e F. Os poderes saem na direção do mouse.',
      'Hoje as recargas estão instantâneas. Pode abusar!',
    ],
    goal: { kind: 'powers', text: () => 'Use os três poderes especiais' },
    praise: 'Que show pirotécnico! Fiquei até com a palha chamuscada.',
  },
  {
    id: 'evo', title: 'EVOLUÇÃO', hint: ['evolve'],
    talk: [
      (k, t) => `Viu a barra de ENERGIA do seu monstro${t ? ' (no botão EVO)' : ' (na barra de baixo)'}? Ela enche quando você acerta, apanha ou esquiva.`,
      'Com ela cheia, o monstro pode EVOLUIR: fica maior, mais forte e ganha golpes novos!',
      (k, t) => t ? 'Eu já enchi a sua barra. Toque em EVO!' : 'Eu já enchi a sua barra. Aperte G!',
    ],
    goal: { kind: 'evolve', need: 1, text: (k) => `Evolua o seu monstro (${k.evo})` },
    praise: 'Olha só que FORNALHONTE! Cresceu tão rápido... (snif)',
  },
  {
    id: 'troca', title: 'ELEMENTOS E TROCA', hint: ['sw'],
    talk: [
      'Agora a lição mais importante: os ELEMENTOS. ÁGUA vence FOGO, FOGO vence PLANTA e PLANTA vence ÁGUA.',
      'Quem vence causa MAIS dano. Quem perde causa MENOS. Escolher o monstro certo faz diferença!',
      'Olha: meu primo virou um boneco de FOGO! Fogo contra fogo não tem vantagem nenhuma.',
      (k, t) => `Você tem 3 monstros, mas só um fica em campo. ${t ? 'Toque no botão 2' : 'Aperte 2'} para chamar o Hidrocasco, que é de ÁGUA.`,
      'Trocar tem uma recarga curta, então escolha bem a hora!',
    ],
    goal: { kind: 'switch', need: 2, text: () => 'Use ÁGUA contra o boneco de FOGO' },
    praise: 'Splash! Água no fogo nunca falha.',
  },
  {
    id: 'prova', title: 'PROVA FINAL', hint: [],
    talk: [
      'Hora da PROVA FINAL! Este é o Boneco Mestre: ele revida mais rápido, mas a vida dele acaba.',
      'Use tudo o que aprendeu: ande, atire, golpeie, esquive e solte os poderes. Pode trocar de monstro também!',
      'Derrube o Boneco Mestre!',
    ],
    goal: { kind: 'boss', text: () => 'Derrube o Boneco Mestre' },
    praise: 'DERRUBOU! Esse foi pro livro de recordes!',
  },
];

const FINALE = [
  'PARABÉNS! Você se formou na Escola de Monstros do Professor Remendo!',
  (k, t) => `Dicas para levar: na partida, ${t ? 'o botão II abre o menu' : 'H mostra os golpes do monstro em campo'}, e no menu MONSTROS você conhece todos os golpes de cada um.`,
  'Agora vá lá e mostre do que é capaz. E se quiser treinar mais, meu primo estará esperando no TREINAMENTO!',
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Tutorial {
  constructor(w) {
    this.w = w;
    this.touch = false;
    this.i = 0;
    this.page = 0;
    this.phase = 'talk'; // 'talk' (jogo parado) | 'goal' | 'praise' | 'end' (falas finais) ; finished = acabou
    this.finished = false;
    this.tip = null; // { text, t } dica curta durante o objetivo (ex.: esquivou cedo demais)
    const sp = w.spawns[0];
    this.prof = { x: sp.x + 16, y: sp.y - 44, face: 1, hop: 0, moving: false };
    this.cheers = 0;
    w.training.opts.fullEnergy = false; // a barra só enche sozinha na lição de evolução
    // Escuta os eventos da simulação (lançou habilidade, evoluiu, esquivou) sem mexer em cada sistema.
    const emit = w.emit.bind(w);
    w.emit = (e) => { emit(e); this.onEvent(e); };
    w.tutorial = this;
    this.begin(0);
  }

  get lesson() { return LESSONS[this.i]; }
  get count() { return LESSONS.length - 1; } // lições numeradas (a primeira é só a apresentação)
  get talking() { return this.phase === 'talk' || this.phase === 'end'; }
  get keys() { return this.touch ? KEYS.touch : KEYS.pc; }
  say(p) { return typeof p === 'function' ? p(this.keys, this.touch) : p; }
  pages() { return this.phase === 'end' ? FINALE : this.lesson.talk; }
  get line() { return this.say(this.pages()[this.page]); }
  get pageKey() { return `${this.phase === 'end' ? 'fim' : this.i}:${this.page}`; }
  get praise() { return this.phase === 'praise' ? this.praiseText || this.say(this.lesson.praise) : null; }
  // Controles destacados na tela (botões de toque e barra de habilidades) durante o objetivo.
  get hint() {
    if (this.phase !== 'goal') return [];
    const L = this.lesson;
    if (L.goal.kind === 'powers') return ['q', 'e', 'f'].filter((s) => !this.checks[s]);
    if (L.goal.kind === 'switch') return this.checks.swap ? [] : ['sw'];
    return L.hint || [];
  }
  get dummy() { return this.w.training.dummies[0] || null; }

  // Avança a fala; depois da última, começa o objetivo (ou a próxima lição, se não houver objetivo).
  next() {
    if (!this.talking) return;
    if (++this.page < this.pages().length) return;
    if (this.phase === 'end') { this.finished = true; return; }
    if (this.lesson.goal) this.startGoal();
    else this.begin(this.i + 1);
  }

  // Pular lição (menu de pausa): conta como feita.
  skip() {
    if (this.phase === 'end') { this.finished = true; return; }
    if (this.i + 1 >= LESSONS.length) { this.finish(); return; }
    this.begin(this.i + 1);
  }

  begin(i) {
    const w = this.w, T = w.training;
    this.i = i;
    this.page = 0;
    this.phase = 'talk';
    this.n = 0;
    this.checks = {};
    this.marks = [];
    this.tip = null;
    const id = this.lesson.id, d = this.dummy;
    T.opts.shoot = false;
    T.opts.noCd = id === 'poderes';
    if (d) {
      d.element = id === 'troca' ? 'fire' : 'neutral';
      d.fireDummy = id === 'troca';
      d.boss = id === 'prova';
      if (id !== 'prova') d.maxHp = d.def.hp;
    }
    if (id === 'prova') this.boss = { hp: BOSS_HP, max: BOSS_HP };
    this.callProf();
  }

  startGoal() {
    const w = this.w, T = w.training, L = this.lesson, m = w.active;
    this.phase = 'goal';
    if (L.goal.kind === 'walk') {
      const sp = w.spawns[0], dir = sp.x < WORLD_W / 2 ? 1 : -1;
      this.marks = [[60, -92], [60, 92], [200, 0]].map(([dx, dy]) => ({ ...w.safeSpot(sp.x + dir * dx, sp.y + dy, 10, 0), done: false }));
    }
    if (L.goal.kind === 'dodge') { T.opts.shoot = true; T.opts.every = 2.2; for (const d of T.dummies) d.shootT = 0.8; }
    if (L.goal.kind === 'boss') { T.opts.shoot = true; T.opts.every = 1.5; for (const d of T.dummies) d.shootT = 1.2; }
    if (L.goal.kind === 'evolve') {
      T.opts.fullEnergy = true;
      for (const q of w.teamOf(w.playerTeam)) if (q.def.evolvesTo && !q.evolved) q.energy = EVOLUTION.threshold; // G na hora já funciona
      // Já evoluiu antes (energia natural)? Então a lição já está feita.
      if (m && m.evolved) { this.praiseText = 'Você já tinha evoluído, hein? Aluno adiantado!'; this.complete(); }
    }
  }

  complete() {
    const w = this.w, m = w.active;
    this.phase = 'praise';
    this.praiseT = 2.4;
    this.tip = null;
    this.w.training.opts.shoot = false;
    w.emit({ type: 'tutorialCheer', x: m ? m.x : this.prof.x, y: m ? m.y : this.prof.y, big: this.lesson.id === 'prova' });
  }

  finish() {
    this.phase = 'end';
    this.page = 0;
    this.w.training.opts.shoot = false;
    this.callProf();
  }

  // O professor some numa nuvem e aparece perto do aluno quando está longe (no começo de cada fala).
  callProf() {
    const m = this.w.active, P = this.prof;
    if (!m || dist(P, m) < 110) return;
    this.w.emit({ type: 'tutorialPoof', x: P.x, y: P.y });
    const side = m.x < WORLD_W / 2 ? 1 : -1;
    const p = this.w.safeSpot(m.x - side * 30, m.y - 40, 8, 0);
    P.x = p.x; P.y = p.y;
    this.w.emit({ type: 'tutorialPoof', x: P.x, y: P.y });
  }

  update(dt) {
    const w = this.w, m = w.active, P = this.prof;
    if (this.tip && (this.tip.t -= dt) <= 0) this.tip = null;
    // Professor acompanha o aluno de longe, aos pulinhos, sempre olhando para ele.
    if (m) {
      const d = dist(P, m);
      P.moving = d > 80;
      if (P.moving) {
        const k = Math.min(1, (88 * dt) / d);
        P.x += (m.x - P.x) * k; P.y += (m.y - P.y) * k;
        P.x = Math.max(24, Math.min(WORLD_W - 24, P.x)); P.y = Math.max(50, Math.min(WORLD_H - 46, P.y));
      }
      P.face = m.x >= P.x ? 1 : -1;
    }
    P.hop += dt * (P.moving ? 9 : 2.5);
    if (this.phase === 'praise') {
      if ((this.praiseT -= dt) <= 0) {
        this.praiseText = null;
        if (this.i + 1 >= LESSONS.length) this.finish();
        else this.begin(this.i + 1);
      }
      return;
    }
    if (this.phase !== 'goal' || !m) return;
    const g = this.lesson.goal;
    if (g.kind === 'walk') {
      const mk = this.marks.find((q) => !q.done);
      if (mk && dist(mk, m) < 18) {
        mk.done = true; this.n++;
        w.emit({ type: 'tutorialMark', x: mk.x, y: mk.y });
        if (this.n >= g.need) this.complete();
      }
    } else if (g.kind === 'switch') {
      if (m.element === 'water' && !this.checks.swap) this.checks.swap = true;
      if (this.checks.swap && this.n >= g.need) this.complete();
    } else if (g.kind === 'boss') {
      const d = this.dummy;
      if (d) { d.maxHp = this.boss.max; d.hp = Math.max(1, this.boss.hp); }
    }
  }

  onEvent(e) {
    if (this.phase !== 'goal') return;
    const w = this.w, m = w.active, g = this.lesson.goal;
    if (!m || e.m !== m) {
      // Levou uma bolinha na lição de esquiva: dica de quando apertar.
      if (g.kind === 'dodge' && e.type === 'hit' && e.m === m && e.src?.dummy) this.tip = { text: `Ai! Aperte ${this.keys.dodge} quando a bolinha estiver BEM perto.`, t: 2.5 };
      return;
    }
    if (e.type === 'cast' && g.kind === 'powers') {
      const slot = Object.keys(m.def.controls).find((k) => m.def.controls[k] === e.ab);
      if (['q', 'e', 'f'].includes(slot) && !this.checks[slot]) {
        this.checks[slot] = true;
        if (this.checks.q && this.checks.e && this.checks.f) this.complete();
      }
    } else if (e.type === 'cast' && e.kind === 'dodge' && g.kind === 'dodge') {
      // Esquiva valendo: uma bolinha do boneco estava chegando perto (cada bolinha conta uma vez).
      const p = w.projectiles.find((q) => !q.dead && !q.tutDodged && q.owner?.dummy && dist(q, m) < 75);
      if (p) {
        p.tutDodged = true; this.n++; this.lastDodge = w.time;
        w.emit({ type: 'tutorialText', text: 'ESQUIVOU!', x: m.x, y: m.y - 24, color: '#8fe8ff' });
        if (this.n >= g.need) this.complete();
      } else this.tip = { text: 'Cedo demais! Espere a bolinha chegar perto.', t: 2.2 };
    } else if (e.type === 'evaded' && g.kind === 'dodge' && w.time - (this.lastDodge ?? -9) > 0.8) {
      this.n++; this.lastDodge = w.time;
      if (this.n >= g.need) this.complete();
    } else if (e.type === 'evolveEnd' && g.kind === 'evolve') this.complete();
  }

  // Chamado pelo World.damage (via Training.onDamage) a cada dano.
  onDamage(t, src, dmg, o) {
    if (this.phase !== 'goal' || !t.dummy || !src || src.team !== 0 || dmg <= 0) return;
    const w = this.w, g = this.lesson.goal;
    if (g.kind === 'shoot' && o.proj) this.n++;
    else if (g.kind === 'melee' && !o.proj && !o.dot && src.action?.ab.id === src.def.controls.melee && w.time - (this.lastMelee ?? -9) > 0.3) { this.lastMelee = w.time; this.n++; }
    else if (g.kind === 'switch' && !o.dot) {
      const el = o.element || src.element, k = ELEMENT_MULT[el]?.[t.element] ?? 1;
      if (w.time - (this.lastTag ?? -9) > 0.4) {
        this.lastTag = w.time;
        w.emit({ type: 'tutorialText', text: k > 1 ? 'VANTAGEM! +dano' : k < 1 ? 'DESVANTAGEM...' : 'SEM VANTAGEM', x: t.x, y: t.y - 30, color: k > 1 ? '#7ae07a' : k < 1 ? '#ff8a8a' : '#d8ccb0' });
      }
      if (el === 'water' && this.checks.swap) this.n++;
    } else if (g.kind === 'boss') {
      this.boss.hp -= dmg;
      if (this.boss.hp <= 0) {
        this.boss.hp = 0;
        w.emit({ type: 'wither', x: t.x, y: t.y });
        // O Boneco Mestre cai de vez: sai do campo (a lição acabou).
        w.monsters = w.monsters.filter((q) => q !== t);
        w.roster = w.roster.filter((q) => q !== t);
        w.training.dummies = w.training.dummies.filter((q) => q !== t);
        this.complete();
      }
      return;
    }
    if ((g.kind === 'shoot' || g.kind === 'melee') && this.n >= g.need) this.complete();
  }

  // Objetivo atual para a interface: título, texto e progresso (contagem, lista de itens ou barra de vida).
  goalInfo() {
    const L = this.lesson, g = L.goal, m = this.w.active;
    if (!g) return null;
    const info = { title: `LIÇÃO ${this.i}/${this.count} · ${L.title}`, text: this.say(g.text) };
    if (g.kind === 'powers') {
      info.items = ['q', 'e', 'f'].map((s) => {
        const ab = m?.ability(m.def.controls[s]);
        return { label: `${this.keys[s]} · ${ab ? ab.name : '?'}`, done: !!this.checks[s] };
      });
    } else if (g.kind === 'switch') {
      info.items = [
        { label: `Trocar para o Hidrocasco (${this.keys.sw})`, done: !!this.checks.swap },
        { label: `Acertar com água ${Math.min(this.n, g.need)}/${g.need}`, done: this.n >= g.need },
      ];
    } else if (g.kind === 'boss') info.bar = { k: this.boss.hp / this.boss.max, label: `BONECO MESTRE ${Math.ceil(this.boss.hp)}/${this.boss.max}` };
    else info.need = g.need, info.n = Math.min(this.n, g.need);
    return info;
  }
}
