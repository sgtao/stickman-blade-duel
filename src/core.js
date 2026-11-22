// ===== Core: rules, fighters, CPU. No DOM. Runs in the browser and in Node (vm). =====
(function (root) {
  'use strict';
  const W = 1280, H = 720, GROUND = 600, FPS = 60;
  const ROUND_FRAMES = 60 * FPS;      // 60 s
  const MAX_HP = 100, MAX_METER = 100;
  const WINS_NEEDED = 2, MAX_ROUNDS = 3;
  const INTRO_FRAMES = 90, ROUND_END_FRAMES = 150;
  const STAGE_LEFT = 80, STAGE_RIGHT = W - 80, MIN_GAP = 70;
  const GRAVITY = 0.9, JUMP_V = -17, WALK_F = 5, WALK_B = 4, JUMP_STEER_FRAMES = 6;
  const HIT_DY = 140;      // normal moves connect while |attacker y - target y| <= HIT_DY
  const SUPER_CLEAR = 100; // the lightning misses a target higher than this off the ground

  // Move table. Frames: startup, active, recovery.
  const MOVES = {
    light: { startup: 5, active: 4, recovery: 15, dmg: 6, reach: 125, hitstun: 15, blockstun: 9, chip: 0, push: 6, meterHit: 9, meterBlock: 4, airOk: true },
    heavy: { startup: 17, active: 5, recovery: 30, dmg: 14, reach: 155, hitstun: 34, blockstun: 15, chip: 2, push: 12, meterHit: 14, meterBlock: 6, airOk: false },
    super: { startup: 22, active: 12, recovery: 32, dmg: 28, reach: 760, hitstun: 50, blockstun: 22, chip: 8, push: 18, meterHit: 0, meterBlock: 0, airOk: false },
  };
  const ACTIONS = ['left', 'right', 'jump', 'guard', 'light', 'heavy', 'super'];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function emptyInput() { return { left: false, right: false, jump: false, guard: false, light: false, heavy: false, super: false }; }

  function makeFighter(side) {
    return {
      side, x: side === 0 ? 420 : 860, y: GROUND, vx: 0, vy: 0,
      facing: side === 0 ? 1 : -1,
      hp: MAX_HP, meter: 0,
      state: 'idle', sf: 0,          // state and frames in state
      move: null, hitDone: false, stun: 0,
      prev: emptyInput(), lastMoves: [], buffer: null,
      stats: { hits: 0, blocks: 0, supers: 0 },
    };
  }

  function airborne(f) { return f.y < GROUND - 0.5; }
  function busy(f) { return f.state === 'attack' || f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'ko'; }

  class Match {
    constructor(opts) {
      opts = opts || {};
      this.seed = (opts.seed == null ? 1 : opts.seed) >>> 0;
      this.rng = mulberry32(this.seed);
      this.round = 0;
      this.wins = [0, 0];
      this.roundResults = [];
      this.frame = 0;
      this.phase = 'intro';
      this.events = [];
      this.winner = null;   // 0, 1, or 'draw' at match end
      this.paused = false;
      this.startRound();
    }

    stage() { return this.round % 2 === 1 ? 'space' : 'volcano'; }

    startRound() {
      this.round += 1;
      this.f = [makeFighter(0), makeFighter(1)];
      this.timer = ROUND_FRAMES;
      this.phase = 'intro';
      this.pf = 0; // frames in phase
      this.roundWinner = null;
      this.events.push({ type: 'roundStart', round: this.round, stage: this.stage() });
    }

    // Advance one fixed step. inputs: [p1, p2] objects with ACTIONS booleans.
    step(inputs) {
      this.events = [];
      if (this.paused || this.phase === 'matchEnd') return this.events;
      this.frame += 1;
      this.pf += 1;
      const in0 = (inputs && inputs[0]) || emptyInput();
      const in1 = (inputs && inputs[1]) || emptyInput();

      if (this.phase === 'intro') {
        if (this.pf === 1) this.events.push({ type: 'announce', text: 'ROUND ' + this.round });
        this.syncPrev(in0, in1);
        if (this.pf >= INTRO_FRAMES) { this.phase = 'fight'; this.pf = 0; this.events.push({ type: 'fight' }); }
        this.idleUpdate();
        return this.events;
      }
      if (this.phase === 'fight') {
        this.updateFighter(this.f[0], this.f[1], in0);
        this.updateFighter(this.f[1], this.f[0], in1);
        this.physics();
        this.resolveHits();
        this.timer -= 1;
        this.checkRoundEnd();
        return this.events;
      }
      if (this.phase === 'roundEnd') {
        this.syncPrev(in0, in1);
        for (const f of this.f) { // let poses play out: the loser falls, a finished swing returns to stance
          f.sf += 1;
          if (f.state === 'attack' && f.sf >= MOVES[f.move].startup + MOVES[f.move].active + MOVES[f.move].recovery) { f.state = 'idle'; f.sf = 0; f.move = null; }
          if ((f.state === 'hitstun' || f.state === 'blockstun') && --f.stun <= 0) { f.state = 'idle'; f.sf = 0; }
          if (f.state !== 'ko' && f.state !== 'attack' && !airborne(f)) f.vx = 0;
        }
        this.physics();
        if (this.pf >= ROUND_END_FRAMES) this.afterRound();
        return this.events;
      }
      return this.events;
    }

    idleUpdate() {
      for (const f of this.f) { f.sf += 1; }
    }

    // Outside the fight, keys are only recorded, never acted on. A key held through the
    // transition must not count as a new press when the fight starts (A1).
    syncPrev(in0, in1) {
      this.f[0].prev = Object.assign({}, in0);
      this.f[1].prev = Object.assign({}, in1);
    }

    pressed(f, input, key) { return input[key] && !f.prev[key]; }

    updateFighter(f, o, input) {
      f.sf += 1;
      // Face the opponent unless mid-attack.
      if (f.state !== 'attack' && f.state !== 'ko') f.facing = o.x >= f.x ? 1 : -1;
      let pLight = this.pressed(f, input, 'light');
      let pHeavy = this.pressed(f, input, 'heavy');
      let pSuper = this.pressed(f, input, 'super');
      const pJump = this.pressed(f, input, 'jump');
      f.prev = Object.assign({}, input);
      // Input buffer: an attack pressed while busy is kept for 8 frames.
      const newest = pSuper && f.meter >= MAX_METER ? 'super' : pHeavy ? 'heavy' : pLight ? 'light' : null;
      if (newest) f.buffer = { move: newest, left: 8 };
      else if (f.buffer && --f.buffer.left <= 0) f.buffer = null;
      const free = !(f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'ko' || f.state === 'attack');
      if (free && f.buffer) { if (f.buffer.move === 'super') pSuper = true; else if (f.buffer.move === 'heavy') pHeavy = true; else pLight = true; f.buffer = null; }

      if (f.state === 'hitstun' || f.state === 'blockstun') {
        f.stun -= 1;
        if (f.stun <= 0) this.setState(f, 'idle');
        return;
      }
      if (f.state === 'ko') return;
      if (f.state === 'attack') {
        const m = MOVES[f.move];
        if (f.sf >= m.startup + m.active + m.recovery) { this.setState(f, airborne(f) ? 'jump' : 'idle'); f.move = null; }
        return;
      }
      const inAir = airborne(f);
      // Start attacks (priority: super > heavy > light).
      if (pSuper && f.meter >= MAX_METER && !inAir) return this.startAttack(f, 'super');
      if (pHeavy && !inAir) return this.startAttack(f, 'heavy');
      if (pLight) return this.startAttack(f, 'light');
      if (inAir) {
        // A direction pressed within a few frames after takeoff still steers the jump (keys are never pressed on the same frame).
        if (f.state === 'jump' && f.sf <= JUMP_STEER_FRAMES && f.vx === 0) f.vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 4.5;
        this.setState(f, 'jump', true); return;
      }
      if (input.guard) { f.vx = 0; this.setState(f, 'guard', true); return; }
      if (pJump) {
        f.vy = JUMP_V;
        f.vx = (input.right ? 1 : 0) * 4.5 - (input.left ? 1 : 0) * 4.5;
        this.setState(f, 'jump');
        this.events.push({ type: 'jump', side: f.side });
        return;
      }
      let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) {
        f.vx = dir * (dir === f.facing ? WALK_F : WALK_B);
        this.setState(f, 'walk', true);
      } else {
        f.vx = 0;
        this.setState(f, 'idle', true);
      }
    }

    setState(f, s, keep) {
      if (keep && f.state === s) return;
      f.state = s; f.sf = 0;
    }

    startAttack(f, move) {
      f.state = 'attack'; f.sf = 0; f.move = move; f.hitDone = false;
      if (!airborne(f)) f.vx = 0;
      if (move === 'super') { f.meter = 0; f.stats.supers += 1; }
      f.lastMoves.push(move); if (f.lastMoves.length > 6) f.lastMoves.shift();
      this.events.push({ type: move === 'super' ? 'superStart' : 'swing', side: f.side, move });
    }

    physics() {
      for (const f of this.f) {
        f.x += f.vx;
        if (airborne(f) || f.vy < 0) { f.vy += GRAVITY; f.y += f.vy; if (f.state === 'hitstun' || f.state === 'ko') f.vx *= 0.9; }
        if (f.y >= GROUND) {
          if (f.vy > 0 && f.state === 'jump') { this.setState(f, 'idle'); this.events.push({ type: 'land', side: f.side }); }
          f.y = GROUND; f.vy = 0;
          if (f.state === 'hitstun' || f.state === 'blockstun' || f.state === 'ko') f.vx *= 0.82;
          else if (f.state === 'attack') f.vx *= 0.7;
        }
        if (f.x < STAGE_LEFT) f.x = STAGE_LEFT;
        if (f.x > STAGE_RIGHT) f.x = STAGE_RIGHT;
      }
      // Push boxes: keep a minimum gap when both are near the ground.
      const a = this.f[0], b = this.f[1];
      const gap = Math.abs(a.x - b.x);
      if (gap < MIN_GAP && Math.abs(a.y - b.y) < 90) {
        const push = (MIN_GAP - gap) / 2;
        const dir = a.x <= b.x ? -1 : 1;
        a.x += dir * push; b.x -= dir * push;
        for (const f of this.f) { if (f.x < STAGE_LEFT) f.x = STAGE_LEFT; if (f.x > STAGE_RIGHT) f.x = STAGE_RIGHT; }
        if (Math.abs(a.x - b.x) < MIN_GAP) { // pinned at a wall
          if (a.x <= STAGE_LEFT + 1 || b.x <= STAGE_LEFT + 1) { const l = a.x < b.x ? a : b, r = l === a ? b : a; r.x = l.x + MIN_GAP; }
          else { const r = a.x > b.x ? a : b, l = r === a ? b : a; l.x = r.x - MIN_GAP; }
        }
      }
    }

    resolveHits() {
      const order = [0, 1];
      const hits = [];
      for (const i of order) {
        const f = this.f[i], o = this.f[1 - i];
        if (f.state !== 'attack' || f.hitDone) continue;
        const m = MOVES[f.move];
        if (f.sf < m.startup || f.sf >= m.startup + m.active) continue;
        const dx = (o.x - f.x) * f.facing;
        if (dx < -20 || dx > m.reach) continue;
        const dy = Math.abs(o.y - f.y);
        if (f.move === 'super' && o.y < GROUND - SUPER_CLEAR) continue; // jumped over the lightning
        if (f.move !== 'super' && dy > HIT_DY) continue;
        hits.push({ i, move: f.move });
      }
      // Trade: both connect on the same frame.
      for (const h of hits) this.applyHit(this.f[h.i], this.f[1 - h.i], h.move);
    }

    applyHit(f, o, move) {
      const m = MOVES[move];
      f.hitDone = true;
      const blocked = o.state === 'guard' && !airborne(o);
      if (blocked) {
        o.hp = Math.max(0, o.hp - m.chip);
        o.state = 'blockstun'; o.sf = 0; o.stun = m.blockstun;
        o.vx = f.facing * m.push * 0.35;
        f.meter = Math.min(MAX_METER, f.meter + m.meterBlock);
        o.meter = Math.min(MAX_METER, o.meter + 3);
        o.stats.blocks += 1;
        this.events.push({ type: 'block', side: f.side, move, x: (f.x + o.x) / 2, y: o.y - 110 });
      } else {
        o.hp = Math.max(0, o.hp - m.dmg);
        o.state = 'hitstun'; o.sf = 0; o.stun = m.hitstun; o.move = null;
        o.vx = f.facing * m.push;
        if (airborne(o) || move !== 'light') o.vy = Math.min(o.vy, -5);
        f.meter = Math.min(MAX_METER, f.meter + m.meterHit);
        o.meter = Math.min(MAX_METER, o.meter + 5);
        f.stats.hits += 1;
        this.events.push({ type: 'hit', side: f.side, move, dmg: m.dmg, x: o.x - f.facing * 10, y: o.y - 105 });
      }
      if (move === 'super') this.events.push({ type: 'lightning', side: f.side, blocked });
    }

    checkRoundEnd() {
      const [a, b] = this.f;
      let w = null, reason = null;
      if (a.hp <= 0 || b.hp <= 0) {
        reason = 'ko';
        w = a.hp <= 0 && b.hp <= 0 ? 'draw' : (a.hp <= 0 ? 1 : 0);
      } else if (this.timer <= 0) {
        reason = 'time';
        w = a.hp === b.hp ? 'draw' : (a.hp > b.hp ? 0 : 1);
      }
      if (reason === null) return;
      this.roundWinner = w;
      if (w !== 'draw') this.wins[w] += 1;
      this.roundResults.push({ round: this.round, winner: w, reason, hp: [a.hp, b.hp] });
      for (const f of this.f) {
        if (f.hp <= 0) { f.state = 'ko'; f.sf = 0; f.vy = -8; f.vx = -f.facing * 7; }
        else if (f.state !== 'attack') { f.state = 'idle'; f.sf = 0; }
      }
      this.phase = 'roundEnd'; this.pf = 0;
      this.events.push({ type: reason === 'ko' ? 'ko' : 'timeup', winner: w, round: this.round });
    }

    afterRound() {
      const done = this.wins[0] >= WINS_NEEDED || this.wins[1] >= WINS_NEEDED || this.round >= MAX_ROUNDS;
      if (done) {
        this.phase = 'matchEnd'; this.pf = 0;
        this.winner = this.wins[0] === this.wins[1] ? 'draw' : (this.wins[0] > this.wins[1] ? 0 : 1);
        this.events.push({ type: 'matchEnd', winner: this.winner });
      } else {
        this.startRound();
      }
    }

    snapshot() {
      return {
        frame: this.frame, round: this.round, phase: this.phase, timer: this.timer,
        wins: this.wins.slice(), winner: this.winner,
        f: this.f.map(f => ({ x: +f.x.toFixed(3), y: +f.y.toFixed(3), hp: f.hp, meter: f.meter, state: f.state })),
      };
    }
  }

  // ===== CPU =====
  // Three knobs per level: reaction delay (frames), mistake rate, and decision quality.
  const AI_LEVELS = {
    weak:   { delay: 26, think: 18, mistake: 0.45, guardP: 0.10, punishP: 0.10, antiAirP: 0.05, superP: 0.25, spacing: 0.2 },
    normal: { delay: 14, think: 10, mistake: 0.18, guardP: 0.50, punishP: 0.50, antiAirP: 0.40, superP: 0.75, spacing: 0.6 },
    strong: { delay: 12, think: 7,  mistake: 0.08, guardP: 0.66, punishP: 0.88, antiAirP: 0.60, superP: 0.90, spacing: 0.8 },
  };

  class AI {
    constructor(level, seed) {
      this.level = level;
      this.p = AI_LEVELS[level];
      this.rng = mulberry32((seed >>> 0) ^ 0x9E3779B9);
      this.history = [];
      this.plan = null; this.planLeft = 0;
      this.out = emptyInput();
      this.tap = null; // one-frame button
      this.sameCount = 0; this.lastAttack = null;
      this.myPrev = 'idle';
    }

    // Observe opponent with a reaction delay.
    observe(o) {
      this.history.push({ x: o.x, y: o.y, state: o.state, move: o.move, sf: o.sf, vy: o.vy });
      if (this.history.length > 40) this.history.shift();
      const i = Math.max(0, this.history.length - 1 - this.p.delay);
      return this.history[i];
    }

    decide(match, side) {
      const me = match.f[side], foe = match.f[1 - side];
      const seen = this.observe(foe);
      const r = this.rng;
      const input = emptyInput();
      if (match.phase !== 'fight') return input;

      const dist = Math.abs(seen.x - me.x);
      const toward = seen.x >= me.x ? 1 : -1;
      const walk = (d) => { if (d > 0) input.right = true; else if (d < 0) input.left = true; };
      const prevMine = this.myPrev; this.myPrev = me.state;
      // Just recovered from blocking: the attacker is still recovering, so punish with the fast slash.
      // Just recovered from a hit: guard first (what a player does when pressured).
      if ((prevMine === 'blockstun' || prevMine === 'hitstun') && me.state !== 'blockstun' && me.state !== 'hitstun' && !airborne(me)) {
        const realDist = Math.abs(foe.x - me.x);
        const foeBusy = foe.state === 'attack' && foe.move && foe.sf >= MOVES[foe.move].startup;
        if (foeBusy && realDist <= MOVES.light.reach && r() < this.p.punishP) { this.lastAttack = 'light'; input.light = true; return input; }
        if (realDist < 200 && r() < this.p.guardP) { this.plan = 'guard'; this.planLeft = 8 + Math.floor(r() * 10); input.guard = true; return input; }
      }

      // Hold guard while a plan says so.
      if (this.planLeft > 0) {
        this.planLeft -= 1;
        if (this.plan === 'guard') { input.guard = true; return input; }
        if (this.plan === 'back') { walk(-toward); return input; }
        if (this.plan === 'in') { walk(toward); return input; }
        if (this.plan === 'wait') { return input; }
      }
      if (busy(me) && me.state !== 'attack') return input;
      if (me.state === 'attack') return input;

      const foeAttacking = seen.state === 'attack';
      const foeRecovering = foeAttacking && seen.move && seen.sf >= MOVES[seen.move].startup + MOVES[seen.move].active;
      const foeThreat = foeAttacking && !foeRecovering;
      const foeAir = seen.y < GROUND - 40;
      const mistake = r() < this.p.mistake;
      // Read a button-masher: if the foe has been swinging most of the recent time, keep just outside its reach and counter.
      let swings = 0, lights = 0; for (const h of this.history) if (h.state === 'attack') { swings += 1; if (h.move === 'light') lights += 1; }
      const lightMasher = swings > 0 && lights / swings > 0.7;
      const masher = this.history.length >= 30 && swings / this.history.length > 0.55;

      const pick = (move) => {
        if (move === this.lastAttack) this.sameCount += 1; else this.sameCount = 0;
        if (this.sameCount >= 3) { move = move === 'light' ? 'heavy' : 'light'; this.sameCount = 0; }
        this.lastAttack = move;
        input[move] = true;
        return input;
      };

      // Lightning is coming: jump over it, or guard to take only chip damage.
      if (foeThreat && seen.move === 'super' && !mistake) {
        if (r() < this.p.antiAirP + 0.2) { input.jump = true; return input; }
        if (r() < this.p.guardP) { this.plan = 'guard'; this.planLeft = 24; input.guard = true; return input; }
      }
      if (masher && !mistake && r() < this.p.spacing) {
        if (lightMasher) { // fast slashes cannot be whiff-punished on reaction: close in behind the guard, punish after a block
          if (dist > MOVES.light.reach - 15 && !foeThreat) { walk(toward); this.out = { left: input.left, right: input.right }; return input; }
          this.plan = 'guard'; this.planLeft = 10; input.guard = true; return input;
        }
        if (foeRecovering && dist < 230) { if (dist <= MOVES.light.reach) return pick('light'); walk(toward); this.out = { left: input.left, right: input.right }; return input; }
        if (foeThreat && dist <= MOVES.heavy.reach + 10) { this.plan = 'guard'; this.planLeft = 6; input.guard = true; return input; }
        const keep = MOVES.heavy.reach + 12;
        if (dist < keep - 10) walk(-toward); else if (dist > keep + 25) walk(toward);
        this.out = { left: input.left, right: input.right };
        return input;
      }
      // Super when it can connect.
      if (me.meter >= MAX_METER && !foeAir && dist < MOVES.super.reach - 40 && r() < this.p.superP * 0.25 && !mistake) return pick('super');
      // Defend against a visible attack.
      if (foeThreat && dist < 200) {
        if (r() < this.p.guardP && !mistake) { this.plan = 'guard'; this.planLeft = 10 + Math.floor(r() * 8); input.guard = true; return input; }
      }
      // Punish a whiffed / recovering attack.
      if (foeRecovering && dist < MOVES.heavy.reach && r() < this.p.punishP && !mistake) return pick(dist < MOVES.light.reach ? (r() < 0.5 ? 'heavy' : 'light') : 'heavy');
      // Whiff punish: the opponent swung at air and is still recovering — step in, then strike.
      if (foeRecovering && dist >= MOVES.heavy.reach && dist < 210 && r() < this.p.punishP && !mistake) { this.plan = 'in'; this.planLeft = 4; walk(toward); this.out = { left: input.left, right: input.right }; return input; }
      // Spacing: do not walk into a swing that is already coming out.
      if (foeAttacking && !foeRecovering && dist >= MOVES.heavy.reach - 10 && dist < MOVES.heavy.reach + 80 && r() < this.p.spacing && !mistake) { this.plan = 'back'; this.planLeft = 6; walk(-toward); return input; }
      // Anti-air.
      if (foeAir && dist < 170 && r() < this.p.antiAirP * 0.5 && !mistake) return pick('light');

      // Think only every few frames; otherwise keep the last movement.
      if (match.frame % this.p.think !== 0) {
        return Object.assign(input, { left: this.out.left, right: this.out.right });
      }
      const ideal = 130;
      let choice = r();
      if (mistake) {
        // Random action
        const opts = ['light', 'heavy', 'jump', 'in', 'back', 'wait'];
        const a = opts[Math.floor(r() * opts.length)];
        if (a === 'light' || a === 'heavy') return pick(a);
        if (a === 'jump') { input.jump = true; walk(toward); this.out = { left: input.left, right: input.right }; return input; }
        this.plan = a; this.planLeft = 8 + Math.floor(r() * 12);
        return input;
      }
      if (dist > ideal + 30) {
        if (choice < 0.08) { input.jump = true; walk(toward); }
        else walk(toward);
      } else if (dist < MOVES.light.reach - 5) {
        if (choice < 0.35 + 0.2 * this.p.spacing) return pick('light');
        if (choice < 0.55) return pick('heavy');
        if (choice < 0.55 + 0.35 * this.p.spacing) { this.plan = 'back'; this.planLeft = 6 + Math.floor(r() * 8); walk(-toward); }
        else { this.plan = 'guard'; this.planLeft = 8; input.guard = true; }
      } else {
        // At heavy range: poke or wait for a whiff.
        if (choice < 0.25 + 0.2 * this.p.spacing) return pick('heavy');
        if (choice < 0.25 + 0.6 * this.p.spacing) { this.plan = 'wait'; this.planLeft = 6 + Math.floor(r() * 10); }
        else walk(toward);
      }
      this.out = { left: input.left, right: input.right };
      return input;
    }
  }

  // Run a whole CPU-vs-CPU match headlessly.
  function simulate(opts) {
    const m = new Match({ seed: opts.seed });
    const ais = [new AI(opts.levels[0], opts.seed * 2 + 1), new AI(opts.levels[1], opts.seed * 2 + 2)];
    const limit = (INTRO_FRAMES + ROUND_FRAMES + ROUND_END_FRAMES + 10) * MAX_ROUNDS;
    let n = 0;
    while (m.phase !== 'matchEnd' && n < limit) {
      const inputs = [ais[0].decide(m, 0), ais[1].decide(m, 1)];
      m.step(inputs);
      n += 1;
    }
    return { winner: m.winner, snapshot: m.snapshot(), rounds: m.roundResults, frames: n };
  }

  root.Core = { W, H, GROUND, FPS, ROUND_FRAMES, MAX_HP, MAX_METER, WINS_NEEDED, MAX_ROUNDS, INTRO_FRAMES, ROUND_END_FRAMES,
    HIT_DY, SUPER_CLEAR,
    MOVES, ACTIONS, AI_LEVELS, mulberry32, emptyInput, Match, AI, simulate, airborne };
})(typeof globalThis !== 'undefined' ? globalThis : this);
