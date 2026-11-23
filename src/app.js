// ===== App: screens, input, rendering, effects, audio. =====
(function () {
  'use strict';
  const C = window.Core;
  const W = C.W, H = C.H, GROUND = C.GROUND;
  const STEP = 1 / 60;
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);

  // ---------- Render RNG (separate from the core so visuals never change results) ----------
  const vr = C.mulberry32(20261122);
  const rand = (a, b) => a + (b - a) * vr();

  // ---------- Audio ----------
  const Sfx = {
    ctx: null, master: null, noise: null, muted: false, counts: { swing: 0, hit: 0, block: 0, lightning: 0, ko: 0 },
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      const nr = C.mulberry32(7);
      for (let i = 0; i < len; i++) d[i] = nr() * 2 - 1;
    },
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.55;
    },
    masterValue() { return this.master ? this.master.gain.value : (this.muted ? 0 : 0.55); },
    env(g, t, a, peak, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    noiseSrc(t, dur, rate) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate || 1;
      s.start(t, vr() * 0.5, dur + 0.05); return s;
    },
    play(type, opt) {
      if (type in this.counts) this.counts[type] += 1;
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + 0.005, out = this.master;
      opt = opt || {};
      if (type === 'swing') {
        const heavy = opt.move === 'heavy';
        const s = this.noiseSrc(t, 0.25);
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
        f.frequency.setValueAtTime(heavy ? 500 : 900, t); f.frequency.exponentialRampToValueAtTime(heavy ? 2200 : 3800, t + (heavy ? 0.2 : 0.12));
        const g = c.createGain(); this.env(g, t, 0.02, heavy ? 0.55 : 0.35, heavy ? 0.26 : 0.16);
        s.connect(f); f.connect(g); g.connect(out);
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(heavy ? 110 : 160, t); o.frequency.exponentialRampToValueAtTime(heavy ? 70 : 120, t + 0.2);
        const og = c.createGain(); this.env(og, t, 0.01, 0.08, 0.22);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        o.connect(lp); lp.connect(og); og.connect(out); o.start(t); o.stop(t + 0.25);
      } else if (type === 'hit') {
        const big = opt.move !== 'light';
        const s = this.noiseSrc(t, 0.2, 0.8);
        const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
        const g = c.createGain(); this.env(g, t, 0.003, 0.7, big ? 0.22 : 0.12);
        s.connect(f); f.connect(g); g.connect(out);
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(big ? 140 : 200, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
        const og = c.createGain(); this.env(og, t, 0.003, big ? 0.9 : 0.6, 0.22);
        o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.25);
      } else if (type === 'block') {
        [1870, 2630, 3410].forEach((fr, i) => {
          const o = c.createOscillator(); o.type = i ? 'triangle' : 'square'; o.frequency.value = fr;
          const g = c.createGain(); this.env(g, t, 0.002, 0.12 / (i + 1), 0.28);
          o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
        });
        const s = this.noiseSrc(t, 0.06); const g = c.createGain(); this.env(g, t, 0.001, 0.3, 0.06);
        s.connect(g); g.connect(out);
      } else if (type === 'lightning') {
        const s = this.noiseSrc(t, 0.9, 0.6);
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
        for (let i = 0; i < 9; i++) g.gain.setValueAtTime(0.2 + vr() * 0.8, t + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        s.connect(f); f.connect(g); g.connect(out);
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(60, t); o.frequency.linearRampToValueAtTime(38, t + 0.8);
        const og = c.createGain(); this.env(og, t, 0.01, 0.5, 0.85);
        o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.9);
      } else if (type === 'charge') {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.35);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        const g = c.createGain(); this.env(g, t, 0.05, 0.18, 0.4);
        o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45);
      } else if (type === 'ko') {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
        const g = c.createGain(); this.env(g, t, 0.005, 1.0, 1.5);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.55);
        const s = this.noiseSrc(t, 0.8, 0.4); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
        const g2 = c.createGain(); this.env(g2, t, 0.005, 0.8, 0.8);
        s.connect(f); f.connect(g2); g2.connect(out);
      } else if (type === 'ui') {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(990, t + 0.05);
        const g = c.createGain(); this.env(g, t, 0.003, 0.15, 0.12); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.14);
      }
    },
  };

  // ---------- State ----------
  const S = {
    screen: 'title', level: 'normal', match: null, cpu: null, auto: null,
    timeScale: 1, slowT: 0, shake: 0, hitstop: 0, flash: 0, flashColor: '255,255,255',
    announce: null, matchNo: 0, resultDelay: -1,
    parts: [], bolts: [], trails: [[], []], embers: [], dmgShown: [100, 100],
  };
  const debug = { speed: Number(params.get('speed')) || 1, autoPlayer: params.get('auto') || null };
  const perf = { samples: [], frames: 0, t0: 0, record: false };

  // ---------- Input ----------
  const keyMap = {
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyW: 'jump', ArrowUp: 'jump', Space: 'jump', KeyS: 'guard', ArrowDown: 'guard',
    KeyJ: 'light', KeyZ: 'light', KeyK: 'heavy', KeyX: 'heavy', KeyL: 'super', KeyC: 'super',
  };
  const held = { keys: C.emptyInput(), touch: C.emptyInput(), latch: C.emptyInput() };
  const pressLog = [];
  // A press shorter than one step is latched so it is never lost.
  function press(a) { pressLog.push(a); held.latch[a] = true; }
  function readInput(consume) {
    const o = C.emptyInput();
    for (const k of C.ACTIONS) o[k] = held.keys[k] || held.touch[k] || held.latch[k];
    if (consume) held.latch = C.emptyInput();
    return o;
  }

  function activeScreen() { return document.querySelector('.screen.on'); }
  function screenButtons() { const s = activeScreen(); return s ? Array.from(s.querySelectorAll('.btn')) : []; }
  function moveSel(d) {
    const bs = screenButtons(); if (!bs.length) return;
    let i = bs.findIndex(b => b.classList.contains('sel')); if (i < 0) i = 0;
    bs[i].classList.remove('sel'); i = (i + d + bs.length) % bs.length; bs[i].classList.add('sel');
    if (S.screen === 'select') S.level = bs[i].dataset.level;
  }

  window.addEventListener('keydown', (e) => {
    Sfx.ensure();
    if (e.code === 'KeyM') { toggleMute(); return; }
    if (S.screen === 'fight') {
      if (e.code === 'KeyP' || e.code === 'Escape') { pause(true); e.preventDefault(); return; }
      const a = keyMap[e.code];
      if (a) { if (!held.keys[a]) press(a); held.keys[a] = true; e.preventDefault(); }
      return;
    }
    // Menus
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA') { moveSel(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD') { moveSel(1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      const b = screenButtons().find(x => x.classList.contains('sel')); if (b) b.click(); e.preventDefault();
    } else if (S.screen === 'select' && /^Digit[123]$/.test(e.code)) {
      const lv = ['weak', 'normal', 'strong'][Number(e.code.slice(5)) - 1]; chooseLevel(lv);
    } else if (S.screen === 'handconfirm' && e.code === 'Escape') { show('pause'); e.preventDefault(); // 確認の枠の Esc は「いいえ」
    } else if (S.screen === 'pause' && (e.code === 'KeyP' || e.code === 'Escape')) pause(false);
  });
  window.addEventListener('keyup', (e) => { const a = keyMap[e.code]; if (a) held.keys[a] = false; });
  window.addEventListener('blur', () => { held.keys = C.emptyInput(); held.touch = C.emptyInput(); });

  // Touch pad: one pointer per button, so multi-touch works.
  document.querySelectorAll('.pbtn').forEach((b) => {
    const k = b.dataset.k;
    const down = (e) => { e.preventDefault(); Sfx.ensure(); if (!held.touch[k]) press(k); held.touch[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
    const up = (e) => { e.preventDefault(); held.touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ---------- Screens ----------
  function show(name) {
    S.screen = name;
    const map = { title: 'scrTitle', select: 'scrSelect', pause: 'scrPause', handconfirm: 'scrHandConfirm', result: 'scrResult' };
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === map[name]));
    $('#btnPause').style.visibility = name === 'fight' ? 'visible' : 'hidden';
    document.body.classList.toggle('fighting', name === 'fight');
  }
  document.querySelectorAll('.btn').forEach((b) => b.addEventListener('click', () => {
    Sfx.ensure(); Sfx.play('ui');
    if (b.dataset.level) return chooseLevel(b.dataset.level);
    const a = b.dataset.act;
    if (a === 'start') { show('select'); }
    else if (a === 'resume') pause(false);
    else if (a === 'title') { S.match = null; show('title'); }
    else if (a === 'again') startMatch(S.level);
    else if (a === 'select') show('select');
    else if (a === 'hand') setHand(hand === 'left' ? 'right' : 'left'); // タイトル：確認なしで切り替えて保存
    else if (a === 'hand-ask') openHandConfirm(); // 一時停止：確認を出す
    else if (a === 'hand-yes') { setHand(hand === 'left' ? 'right' : 'left'); show('pause'); }
    else if (a === 'hand-no') show('pause');
  }));
  function chooseLevel(lv) {
    S.level = lv;
    document.querySelectorAll('#scrSelect .btn').forEach(x => x.classList.toggle('sel', x.dataset.level === lv));
    startMatch(lv);
  }
  function startMatch(lv) {
    S.matchNo += 1;
    const seed = (Number(params.get('seed')) || (Date.now() & 0xffff)) + S.matchNo;
    S.match = new C.Match({ seed });
    S.cpu = new C.AI(lv, seed * 7 + 3);
    S.auto = debug.autoPlayer ? new C.AI(debug.autoPlayer, seed * 11 + 5) : null;
    S.parts.length = 0; S.bolts.length = 0; S.trails = [[], []]; S.dmgShown = [100, 100];
    S.timeScale = 1; S.slowT = 0; S.shake = 0; S.hitstop = 0; S.resultDelay = -1; S.flash = 0;
    held.keys = C.emptyInput(); held.touch = C.emptyInput(); held.latch = C.emptyInput();
    document.querySelectorAll('.pbtn.on').forEach(b => b.classList.remove('on'));
    show('fight');
    handleEvents(S.match.events);
  }
  function pause(on) {
    if (on && S.screen === 'fight') { S.match.paused = true; show('pause'); }
    else if (!on && S.screen === 'pause') { S.match.paused = false; held.keys = C.emptyInput(); show('fight'); }
  }
  function toggleMute() {
    Sfx.ensure(); Sfx.setMuted(!Sfx.muted);
    $('#btnMute').textContent = Sfx.muted ? '音 OFF' : '音 ON';
    $('#btnMute').setAttribute('aria-pressed', String(Sfx.muted));
  }
  $('#btnMute').addEventListener('click', (e) => { toggleMute(); e.currentTarget.blur(); });
  $('#btnPause').addEventListener('click', (e) => { Sfx.ensure(); pause(true); e.currentTarget.blur(); });
  function showResult() {
    const m = S.match;
    const t = $('#resultText');
    if (m.winner === 0) { t.textContent = 'YOU WIN'; t.className = 'win'; }
    else if (m.winner === 1) { t.textContent = 'YOU LOSE'; t.className = 'lose'; }
    else { t.textContent = 'DRAW'; t.className = 'draw'; }
    const lvName = { weak: '弱い', normal: '普通', strong: '強い' }[S.level];
    // 文字は明るい色を、不透明な濃い地の上に置く（雲の上でも読めるように）。表示の規則だけを足す（決着の規則は変えない）
    // 注記は流れの外（画面の下端）に置き、ボタンの位置を動かさない（勝者の姿と重なりを増やさないため）
    const sc = $('#resultScore');
    sc.style.color = '#e8ecff'; sc.style.background = '#0b0e1f'; sc.style.padding = '0 .6em'; sc.style.borderRadius = '6px';
    sc.textContent = `${m.wins[0]} - ${m.wins[1]}　（CPU：${lvName}）`;
    let note = document.getElementById('resultNote');
    if (!note) {
      note = document.createElement('p');
      note.id = 'resultNote';
      Object.assign(note.style, { position: 'absolute', left: '0', right: '0', bottom: '3%', margin: '0', textAlign: 'center',
        color: '#e8ecff', background: '#0b0e1f', padding: '.2em .6em', fontSize: 'clamp(11px, 1.6cqw, 16px)' });
      note.textContent = '2 本先取で決着（3 ラウンドで打ち切り時は本数の多いほうが勝ち）';
      $('#scrResult').appendChild(note);
    }
    const bs = Array.from(document.querySelectorAll('#scrResult .btn'));
    bs.forEach((b, i) => b.classList.toggle('sel', i === 0));
    show('result');
  }

  // ---------- Effects ----------
  const MAX_PARTS = 420;
  function spark(x, y, n, color, power) {
    for (let i = 0; i < n; i++) {
      if (S.parts.length >= MAX_PARTS) S.parts.shift();
      const a = rand(0, Math.PI * 2), sp = rand(2, 9) * (power || 1);
      S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: rand(0.25, 0.6), max: 0.6, color, w: rand(1.2, 2.6) });
    }
  }
  function boltPath(x1, y1, x2, y2, rough) {
    let pts = [[x1, y1], [x2, y2]];
    let off = rough;
    for (let it = 0; it < 6; it++) {
      const np = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
        const o = rand(-off, off);
        np.push([mx - dy / len * o, my + dx / len * o], pts[i + 1]);
      }
      pts = np; off *= 0.55;
    }
    return pts;
  }
  function addBolt(x1, y1, x2, y2, color, life) {
    S.bolts.push({ x1, y1, x2, y2, color, life, max: life, pts: boltPath(x1, y1, x2, y2, 60), t: 0 });
    if (S.bolts.length > 14) S.bolts.shift();
  }

  function handleEvents(evs) {
    const m = S.match;
    for (const e of evs) {
      if (e.type === 'roundStart') { S.announce = { text: 'ROUND ' + e.round, t: 0, dur: 1.3, sub: e.stage === 'space' ? 'NIGHT CITY' : e.stage === 'day' ? 'SUNLIT PLAIN' : 'MAGMA RIFT' }; S.dmgShown = [100, 100]; S.trails = [[], []]; }
      else if (e.type === 'fight') S.announce = { text: 'FIGHT!', t: 0, dur: 0.8 };
      else if (e.type === 'swing') Sfx.play('swing', e);
      else if (e.type === 'superStart') { Sfx.play('charge'); S.flash = 0.35; S.flashColor = e.side === 0 ? '120,220,255' : '255,120,130'; }
      else if (e.type === 'hit') {
        Sfx.play('hit', e);
        const col = e.side === 0 ? '150,235,255' : '255,140,120';
        spark(e.x, e.y, e.move === 'light' ? 18 : 40, col, e.move === 'light' ? 1 : 1.5);
        spark(e.x, e.y, 10, '255,240,200', 0.8);
        S.shake = Math.max(S.shake, e.move === 'light' ? 5 : e.move === 'heavy' ? 11 : 20);
        S.hitstop = e.move === 'light' ? 3 : e.move === 'heavy' ? 6 : 10;
      } else if (e.type === 'block') {
        Sfx.play('block', e);
        spark(e.x, e.y, 26, '255,230,150', 1.2);
        S.shake = Math.max(S.shake, 3); S.hitstop = 4;
      } else if (e.type === 'lightning') {
        Sfx.play('lightning');
        const a = m.f[e.side], b = m.f[1 - e.side];
        const col = e.side === 0 ? '140,220,255' : '255,110,140';
        for (let i = 0; i < 4; i++) addBolt(a.x + a.facing * 60, a.y - 120, b.x, b.y - 90 + rand(-30, 30), col, 0.55 + i * 0.08);
        spark(b.x, b.y - 90, 60, col, 2); S.flash = 0.6; S.flashColor = col; S.shake = Math.max(S.shake, 22);
      } else if (e.type === 'ko') {
        Sfx.play('ko');
        S.slowT = 1.6; S.timeScale = 0.25; S.shake = Math.max(S.shake, 24); S.flash = 0.5; S.flashColor = '255,255,255';
        S.announce = { text: e.winner === 'draw' ? 'DOUBLE K.O.' : 'K.O.', t: 0, dur: 2.2 };
      } else if (e.type === 'timeup') {
        S.announce = { text: 'TIME UP', t: 0, dur: 2.2, sub: e.winner === 'draw' ? 'DRAW' : (e.winner === 0 ? 'YOU WIN THE ROUND' : 'CPU WINS THE ROUND') };
      } else if (e.type === 'matchEnd') { S.resultDelay = 0.9; }
    }
  }

  // ---------- Fixed-step simulation ----------
  function tick() {
    const m = S.match;
    if (!m || m.paused) return;
    if (S.hitstop > 0) { S.hitstop -= 1; return; }
    // Always consume the latch, so a press made between rounds is not carried into the next fight (A1).
    const p1 = S.auto ? S.auto.decide(m, 0) : readInput(true);
    const p2 = S.cpu.decide(m, 1);
    const evs = m.step([p1, p2]);
    handleEvents(evs);
    // Blade trails
    for (let i = 0; i < 2; i++) {
      const p = pose(m.f[i], true); // 軌跡は補正前の座標を使う
      const tr = S.trails[i];
      tr.push({ bx: p.hand[0], by: p.hand[1], tx: p.tip[0], ty: p.tip[1] });
      if (tr.length > 9) tr.shift();
    }
    // Super charge: lightning crackles around the blade during startup
    for (const f of m.f) {
      if (f.state === 'attack' && f.move === 'super' && f.sf < C.MOVES.super.startup && f.sf % 4 === 0) {
        const p = pose(f);
        addBolt(p.tip[0], p.tip[1], p.tip[0] + rand(-70, 70), p.tip[1] + rand(-90, 20), f.side === 0 ? '140,220,255' : '255,110,140', 0.18);
      }
      if (f.state === 'attack' && f.move === 'super' && f.sf >= C.MOVES.super.startup && f.sf < C.MOVES.super.startup + C.MOVES.super.active && f.sf % 3 === 0) {
        const o = m.f[1 - f.side];
        const p = pose(f);
        const reach = Math.min(C.MOVES.super.reach, Math.abs(o.x - f.x) + 40);
        addBolt(p.tip[0], p.tip[1], f.x + f.facing * reach, GROUND - 90 + rand(-40, 30), f.side === 0 ? '140,220,255' : '255,110,140', 0.3);
      }
    }
  }

  function updateFx(dt) {
    for (const p of S.parts) { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += 0.35 * dt * 60; p.vx *= 0.985; p.life -= dt; }
    S.parts = S.parts.filter(p => p.life > 0 && p.y < H + 20);
    for (const b of S.bolts) { b.life -= dt; b.t += dt; if (b.t > 0.05) { b.t = 0; b.pts = boltPath(b.x1, b.y1, b.x2, b.y2, 60); } }
    S.bolts = S.bolts.filter(b => b.life > 0);
    S.shake *= Math.pow(0.0009, dt); if (S.shake < 0.2) S.shake = 0;
    S.flash = Math.max(0, S.flash - dt * 1.6);
    if (S.announce) { S.announce.t += dt; if (S.announce.t > S.announce.dur) S.announce = null; }
  }

  // ---------- Poses ----------
  // 関節と刃の座標は core の C.pose（当たり判定と同じ計算）。ここは、倒れた姿勢が画面の外へ出るときの描画の補正だけ。
  function pose(f, raw) {
    const out = C.pose(f);
    // 倒れた姿勢（ko）が画面の外へ出るときだけ、描画の x をずらして画面の内側に入れる（raw のときはずらさない）。
    // 外接は描く点で取る。余白は頭が半径 13、刃の先が光の幅 14、その他の線 5。
    // 刃を含める重み wt は sf で連続に変える（sf 20 以下で 1、sf 40 以上で 0）。刃を含む外接と含まない外接を wt で混ぜるので、
    // sf 1 あたりの跳びは 20 sf に広げた分だけ小さくなる（sf 40 以上の結果は刃を含まない外接と同じ）
    if (f.state === 'ko' && !raw) {
      const wt = Math.min(1, Math.max(0, (40 - f.sf) / 20));
      let loB = Infinity, hiB = -Infinity, loA = Infinity, hiA = -Infinity;
      for (const k of Object.keys(out)) {
        const m = k === 'head' ? 13 : k === 'tip' ? 14 : 5;
        const l = out[k][0] - m, h = out[k][0] + m;
        loA = Math.min(loA, l); hiA = Math.max(hiA, h);
        if (k !== 'tip') { loB = Math.min(loB, l); hiB = Math.max(hiB, h); }
      }
      const lo = loB + wt * (loA - loB), hi = hiB + wt * (hiA - hiB);
      const dx = lo < 0 ? -lo : (hi > W ? W - hi : 0);
      if (dx) for (const k in out) out[k] = [out[k][0] + dx, out[k][1]];
    }
    return out;
  }

  // ---------- Backgrounds ----------
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const BG = {};
  const MOON = { x: 1010, y: 240, r: 20 }; // 宇宙の街の月（論理座標）。HUD と重ならない位置にする
  function buildSpace() {
    const c = mk(W, H), x = c.getContext('2d'), r = C.mulberry32(11);
    let gr = x.createLinearGradient(0, 0, 0, GROUND);
    gr.addColorStop(0, '#050816'); gr.addColorStop(0.55, '#141a46'); gr.addColorStop(1, '#3a2266');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 320; i++) { const a = r(); x.fillStyle = `rgba(220,230,255,${0.2 + a * 0.8})`; const s = a > 0.93 ? 2.2 : 1.1; x.fillRect(r() * W, r() * GROUND * 0.9, s, s); }
    // nebula
    for (let i = 0; i < 5; i++) { const nx = r() * W, ny = r() * 300; const ng = x.createRadialGradient(nx, ny, 0, nx, ny, 260); ng.addColorStop(0, `rgba(${90 + r() * 60},${60 + r() * 60},200,0.16)`); ng.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = ng; x.fillRect(0, 0, W, H); }
    // ringed planet
    const px = 300, py = 210, pr = 120;
    x.save(); x.translate(px, py); x.rotate(-0.25);
    x.strokeStyle = 'rgba(170,160,220,0.35)'; x.lineWidth = 14; x.beginPath(); x.ellipse(0, 0, pr * 1.9, pr * 0.42, 0, Math.PI, Math.PI * 2); x.stroke();
    x.restore();
    const pg = x.createRadialGradient(px - 40, py - 50, 10, px, py, pr);
    pg.addColorStop(0, '#c9c3f0'); pg.addColorStop(0.5, '#6e64b8'); pg.addColorStop(1, '#231d55');
    x.fillStyle = pg; x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill();
    x.save(); x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.clip();
    for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(${i % 2 ? 40 : 200},${i % 2 ? 30 : 190},${i % 2 ? 90 : 255},0.10)`; x.fillRect(px - pr, py - pr + i * 28 + 6, pr * 2, 12); }
    x.restore();
    x.save(); x.translate(px, py); x.rotate(-0.25);
    x.strokeStyle = 'rgba(200,190,255,0.55)'; x.lineWidth = 10; x.beginPath(); x.ellipse(0, 0, pr * 1.9, pr * 0.42, 0, 0, Math.PI); x.stroke();
    x.strokeStyle = 'rgba(120,110,200,0.5)'; x.lineWidth = 4; x.beginPath(); x.ellipse(0, 0, pr * 2.15, pr * 0.5, 0, 0, Math.PI); x.stroke();
    x.restore();
    // moon
    const mg = x.createRadialGradient(MOON.x, MOON.y, 2, MOON.x, MOON.y, 22); mg.addColorStop(0, '#f4f2ff'); mg.addColorStop(1, '#8a86b0');
    x.fillStyle = mg; x.beginPath(); x.arc(MOON.x, MOON.y, MOON.r, 0, Math.PI * 2); x.fill();
    // city layers
    const layer = (base, hmin, hmax, col, win, wcol) => {
      let bx = -20;
      while (bx < W + 20) {
        const bw = 30 + r() * 70, bh = hmin + r() * (hmax - hmin);
        x.fillStyle = col; x.fillRect(bx, base - bh, bw, bh + 2);
        if (r() < 0.25) { x.fillRect(bx + bw / 2 - 2, base - bh - 30, 4, 30); }
        if (win) for (let wy = base - bh + 8; wy < base - 6; wy += 11) for (let wx = bx + 5; wx < bx + bw - 6; wx += 9) if (r() < win) { x.fillStyle = wcol[Math.floor(r() * wcol.length)]; x.fillRect(wx, wy, 4, 5); }
        bx += bw + 2 + r() * 6;
      }
    };
    layer(GROUND - 30, 60, 210, '#1d1a45', 0.12, ['rgba(255,120,200,0.5)', 'rgba(120,220,255,0.5)']);
    layer(GROUND - 10, 40, 150, '#120f2e', 0.2, ['rgba(255,140,210,0.85)', 'rgba(130,230,255,0.85)', 'rgba(255,230,160,0.8)']);
    // horizon glow
    const hg = x.createLinearGradient(0, GROUND - 60, 0, GROUND + 4); hg.addColorStop(0, 'rgba(255,90,190,0)'); hg.addColorStop(1, 'rgba(255,90,190,0.35)');
    x.fillStyle = hg; x.fillRect(0, GROUND - 60, W, 64);
    // pillars
    for (const pxx of [150, 1130]) {
      const pgr = x.createLinearGradient(pxx - 22, 0, pxx + 22, 0); pgr.addColorStop(0, '#0a0b1e'); pgr.addColorStop(0.5, '#262a55'); pgr.addColorStop(1, '#0a0b1e');
      x.fillStyle = pgr; x.fillRect(pxx - 22, 0, 44, GROUND);
      x.fillStyle = 'rgba(120,220,255,0.7)'; for (let y = 40; y < GROUND; y += 90) x.fillRect(pxx - 2, y, 4, 40);
    }
    // floor
    const fg = x.createLinearGradient(0, GROUND, 0, H); fg.addColorStop(0, '#1b1840'); fg.addColorStop(1, '#06060f');
    x.fillStyle = fg; x.fillRect(0, GROUND, W, H - GROUND);
    x.strokeStyle = 'rgba(110,220,255,0.18)'; x.lineWidth = 1;
    for (let i = -20; i <= 20; i++) { x.beginPath(); x.moveTo(W / 2 + i * 30, GROUND); x.lineTo(W / 2 + i * 150, H); x.stroke(); }
    for (let k = 0; k < 7; k++) { const yy = GROUND + Math.pow(k / 7, 1.8) * (H - GROUND); x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
    x.fillStyle = 'rgba(120,230,255,0.85)'; x.fillRect(0, GROUND - 1, W, 2);
    return c;
  }
  function buildVolcano() {
    const c = mk(W, H), x = c.getContext('2d'), r = C.mulberry32(23);
    let gr = x.createLinearGradient(0, 0, 0, GROUND);
    gr.addColorStop(0, '#120304'); gr.addColorStop(0.45, '#3d0c08'); gr.addColorStop(0.85, '#8a2a0c'); gr.addColorStop(1, '#c2531a');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    // smoke clouds
    for (let i = 0; i < 14; i++) { const cx = r() * W, cy = 60 + r() * 220, cr = 80 + r() * 160; const cg = x.createRadialGradient(cx, cy, 0, cx, cy, cr); cg.addColorStop(0, 'rgba(40,10,10,0.55)'); cg.addColorStop(1, 'rgba(40,10,10,0)'); x.fillStyle = cg; x.fillRect(cx - cr, cy - cr, cr * 2, cr * 2); }
    // volcanoes
    const volcano = (cx, base, w, h, top, bottom) => {
      const L = cx - w, R = cx + w, cl = cx - w * 0.14, cr = cx + w * 0.12, ct = base - h;
      const vg = x.createLinearGradient(0, ct, 0, base); vg.addColorStop(0, top); vg.addColorStop(1, bottom);
      x.fillStyle = vg; x.beginPath(); x.moveTo(L, base); x.lineTo(cl, ct); x.lineTo(cr, ct + 4); x.lineTo(R, base); x.closePath(); x.fill();
      // rim light on the left slope
      x.strokeStyle = 'rgba(255,120,50,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(L, base); x.lineTo(cl, ct); x.stroke();
      const lg = x.createRadialGradient(cx, ct, 0, cx, ct, 140); lg.addColorStop(0, 'rgba(255,190,80,0.95)'); lg.addColorStop(0.35, 'rgba(255,110,30,0.5)'); lg.addColorStop(1, 'rgba(255,80,20,0)');
      x.fillStyle = lg; x.fillRect(cx - 140, ct - 140, 280, 280);
      x.fillStyle = '#ffb347'; x.beginPath(); x.ellipse((cl + cr) / 2, ct + 2, (cr - cl) / 2, 5, 0, 0, Math.PI * 2); x.fill();
      // lava streams follow the slopes
      for (let k = 0; k < 4; k++) {
        const side = k % 2 ? 1 : -1;
        let lx = side < 0 ? cl + 6 + k * 3 : cr - 6 - k * 3, ly = ct + 4;
        const slope = side < 0 ? (cl - L) / h : (R - cr) / h;
        const stop = base - h * (0.15 + r() * 0.35);
        x.lineCap = 'round';
        for (const [lw, col] of [[7, 'rgba(255,90,20,0.35)'], [3, 'rgba(255,150,50,0.95)'], [1.2, 'rgba(255,230,160,0.9)']]) {
          x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.moveTo(lx, ly);
          let px = lx, py = ly; const rr = C.mulberry32(100 + k + Math.floor(cx));
          while (py < stop) { py += 10; px += side * slope * 10 * (0.55 + rr() * 0.3) + (rr() - 0.5) * 5; x.lineTo(px, py); }
          x.stroke();
        }
      }
    };
    volcano(980, GROUND - 30, 380, 250, '#3a120c', '#160505');
    volcano(260, GROUND - 40, 320, 310, '#4a160d', '#1a0606');
    // rock spires
    let bx = -10; while (bx < W) { const w = 20 + r() * 50, h = 30 + r() * 120; x.fillStyle = '#160505'; x.beginPath(); x.moveTo(bx, GROUND); x.lineTo(bx + w * 0.45, GROUND - h); x.lineTo(bx + w * 0.6, GROUND - h * 0.85); x.lineTo(bx + w, GROUND); x.fill(); bx += w + r() * 60; }
    // lava floor
    const fg = x.createLinearGradient(0, GROUND, 0, H); fg.addColorStop(0, '#ff7a1a'); fg.addColorStop(0.25, '#b8320c'); fg.addColorStop(1, '#3a0905');
    x.fillStyle = fg; x.fillRect(0, GROUND, W, H - GROUND);
    for (let i = 0; i < 60; i++) { const cx = r() * W, cy = GROUND + 10 + r() * (H - GROUND); x.fillStyle = 'rgba(40,8,4,0.75)'; x.beginPath(); x.ellipse(cx, cy, 30 + r() * 70, 5 + r() * 9, 0, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = 'rgba(255,190,90,0.9)'; x.fillRect(0, GROUND - 1, W, 2);
    return c;
  }

  // ---------- 昼の背景 ----------
  // 層：空（静止の雲・太陽・HUD の板）→ 流れる雲（render で描く）→ 山（上部は透明。棒人間の帯と地面を含む）
  // BG.daySky と BG.dayMountain は層そのもの。BG.day はその 2 枚を合成した 1 枚（既存の検査・画像出力が使う）
  const DAY = { sprites: [], flow: [] };
  // 雲の絵：放射グラデーションの円を重ね、下側に青い影を付ける。作るのは 1 回だけ
  function dayCloudSprite(r, cw, ch, puffs) {
    const c = mk(cw, ch), x = c.getContext('2d');
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1), px = cw * (0.12 + 0.76 * t) + (r() - 0.5) * cw * 0.05;
      const mid = 1 - Math.abs(2 * t - 1);
      const rad = ch * (0.2 + 0.32 * mid * (0.7 + 0.3 * r())), py = ch * 0.6 - rad * 0.25 * mid;
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.98)'); g.addColorStop(0.62, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    x.globalCompositeOperation = 'source-atop'; // 描いた部分の中だけ、下側を青く影にする
    const sh = x.createLinearGradient(0, ch * 0.45, 0, ch * 0.92);
    sh.addColorStop(0, 'rgba(150,185,225,0)'); sh.addColorStop(1, 'rgba(112,150,205,0.6)');
    x.fillStyle = sh; x.fillRect(0, 0, cw, ch);
    x.globalCompositeOperation = 'source-over';
    return c;
  }
  // 空の層：濃い青（上）→ 淡い水色（地平線 y 430）。太陽と光の筋。静止の雲 2 層。HUD の板（昼だけ）
  function buildDaySky(r) {
    const c = mk(W, H), x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 430);
    sky.addColorStop(0, '#1f55a2'); sky.addColorStop(0.15, '#2a64b8'); sky.addColorStop(0.55, '#84c4f4'); sky.addColorStop(1, '#dcf4ff');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    // 太陽：右の中ほど。柔らかい光の筋（薄い扇形を 9 本）と、輝く円
    const SX = 1060, SY = 250;
    x.save(); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + r() * 0.2, b = 0.035;
      x.fillStyle = 'rgba(255,246,210,0.045)';
      x.beginPath(); x.moveTo(SX, SY);
      x.lineTo(SX + Math.cos(a - b) * 900, SY + Math.sin(a - b) * 900); x.lineTo(SX + Math.cos(a + b) * 900, SY + Math.sin(a + b) * 900);
      x.closePath(); x.fill();
    }
    const sg = x.createRadialGradient(SX, SY, 4, SX, SY, 160);
    sg.addColorStop(0, 'rgba(255,250,225,0.95)'); sg.addColorStop(0.12, 'rgba(255,246,214,0.7)'); sg.addColorStop(1, 'rgba(255,246,214,0)');
    x.fillStyle = sg; x.fillRect(SX - 160, SY - 160, 320, 320);
    x.restore();
    x.fillStyle = '#fffbe8'; x.beginPath(); x.arc(SX, SY, 26, 0, Math.PI * 2); x.fill();
    // 静止の雲：遠い小さな雲（淡い）と、中くらいの雲。HUD の文字（y 0〜90）の下に出す
    for (let i = 0; i < 6; i++) { const cw = 90 + r() * 60, cx = r() * W, cy = 200 + r() * 80; x.globalAlpha = 0.5; x.drawImage(DAY.sprites[2], cx - cw / 2, cy - cw * 0.2, cw, cw * 0.4); }
    for (let i = 0; i < 4; i++) { const cw = 150 + r() * 60, cx = r() * W, cy = 170 + r() * 50; x.globalAlpha = 0.8; x.drawImage(DAY.sprites[1], cx - cw / 2, cy - cw * 0.2, cw, cw * 0.4); }
    x.globalAlpha = 1;
    return c;
  }
  // 山の層：遠い峰（淡い青紫・雪・明暗）→ 中の山（青緑・霞）→ 手前の山（暗い緑紺・木・尾根の縁）→ 地面。上部は透明
  function buildDayMountains(r) {
    const c = mk(W, H), x = c.getContext('2d');
    const BASE = 430;
    const ridgeFill = (fn, style, bottom) => {
      x.fillStyle = style; x.beginPath(); x.moveTo(0, fn(0));
      for (let xx = 8; xx <= W; xx += 8) x.lineTo(xx, fn(xx));
      x.lineTo(W, bottom); x.lineTo(0, bottom); x.closePath(); x.fill();
    };
    // 遠い峰：尖った三角。左の面は暗く、右は明るい。雪の帽子は、ぎざぎざの縁
    const peaks = [];
    for (let px = -80; px < W + 160; px += 120 + r() * 110) peaks.push({ x: px, y: 222 + r() * 80, bw: 170 + r() * 120 });
    peaks.sort((a, b) => b.y - a.y); // 低い峰から描き、高い峰を前に出す
    const snow = [[0, 0], [0.24, 0.24], [0.13, 0.19], [0.06, 0.26], [-0.03, 0.17], [-0.12, 0.21], [-0.26, 0.25]];
    for (const p of peaks) {
      const hgt = BASE - p.y;
      x.fillStyle = '#8fa4da'; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.bw, BASE); x.lineTo(p.x, BASE); x.closePath(); x.fill();
      x.fillStyle = '#bccdf2'; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x, BASE); x.lineTo(p.x + p.bw, BASE); x.closePath(); x.fill();
      x.fillStyle = '#f4f8ff'; x.beginPath();
      snow.forEach(([dx, fy], k) => { const X = p.x + dx * p.bw, Y = p.y + fy * hgt; if (k) x.lineTo(X, Y); else x.moveTo(X, Y); });
      x.closePath(); x.fill();
    }
    // 霞：遠い山の裾だけに（source-atop で、山の画素の上にだけ重ねる）
    x.save(); x.globalCompositeOperation = 'source-atop';
    const hz = x.createLinearGradient(0, 300, 0, BASE); hz.addColorStop(0, 'rgba(214,236,255,0)'); hz.addColorStop(1, 'rgba(214,236,255,0.45)');
    x.fillStyle = hz; x.fillRect(0, 300, W, BASE - 300);
    x.restore();
    // 中の山：青緑のなだらか。上は明るく、裾は霞で淡く
    const midY = (xx) => 318 + 26 * Math.sin(xx * 0.0045 + 0.7) + 14 * Math.sin(xx * 0.013 + 2.1) + 8 * Math.sin(xx * 0.031);
    const mg = x.createLinearGradient(0, 300, 0, BASE); mg.addColorStop(0, '#a6d6d2'); mg.addColorStop(1, '#5a9298');
    ridgeFill(midY, mg, BASE);
    // 手前の山：暗い緑がかった紺（棒人間の帯）。尾根の縁の明るい線、木のシルエット
    const nearY = (xx) => 392 + 12 * Math.sin(xx * 0.007 + 0.3) + 7 * Math.sin(xx * 0.021 + 1.2) + 4 * Math.sin(xx * 0.05);
    const ng = x.createLinearGradient(0, 380, 0, H); ng.addColorStop(0, '#2f5761'); ng.addColorStop(0.5, '#23434d'); ng.addColorStop(1, '#1a3139');
    ridgeFill(nearY, ng, H);
    x.strokeStyle = 'rgba(170,230,210,0.4)'; x.lineWidth = 2; x.beginPath();
    for (let xx = 0; xx <= W; xx += 8) { if (xx) x.lineTo(xx, nearY(xx)); else x.moveTo(xx, nearY(xx)); }
    x.stroke();
    for (let tx = 0; tx < W; tx += 14 + r() * 22) {
      const ty = nearY(tx), th = 16 + r() * 20, tw = 7 + r() * 6;
      x.fillStyle = '#16292f'; x.beginPath(); x.moveTo(tx, ty - th); x.lineTo(tx + tw, ty + 3); x.lineTo(tx - tw, ty + 3); x.closePath(); x.fill();
    }
    // 手前の林：もう一段下の尾根（暗く、小さな木）。帯の中で段になり、平らに見えないようにする
    const forY = (xx) => 448 + 8 * Math.sin(xx * 0.012 + 1.9) + 5 * Math.sin(xx * 0.029 + 0.4);
    const fo = x.createLinearGradient(0, 440, 0, H); fo.addColorStop(0, '#24474f'); fo.addColorStop(1, '#1a343c');
    ridgeFill(forY, fo, H);
    x.strokeStyle = 'rgba(150,220,200,0.25)'; x.lineWidth = 1.5; x.beginPath();
    for (let xx = 0; xx <= W; xx += 8) { if (xx) x.lineTo(xx, forY(xx)); else x.moveTo(xx, forY(xx)); }
    x.stroke();
    for (let tx = 0; tx < W; tx += 9 + r() * 14) {
      const ty = forY(tx), th = 9 + r() * 12, tw = 4 + r() * 4;
      x.fillStyle = '#173038'; x.beginPath(); x.moveTo(tx, ty - th); x.lineTo(tx + tw, ty + 2); x.lineTo(tx - tw, ty + 2); x.closePath(); x.fill();
    }
    // 地面：暗い緑。草の筋で質感を出す。地面の縁は明るい線（棒人間の足が乗る）
    const fg = x.createLinearGradient(0, GROUND, 0, H); fg.addColorStop(0, '#4c7d78'); fg.addColorStop(1, '#213f40');
    x.fillStyle = fg; x.fillRect(0, GROUND, W, H - GROUND);
    x.strokeStyle = 'rgba(140,200,150,0.18)'; x.lineWidth = 1.2; x.beginPath();
    for (let i = 0; i < 260; i++) { const gx = r() * W, gy = GROUND + 4 + r() * (H - GROUND - 8); x.moveTo(gx, gy); x.lineTo(gx + (r() - 0.5) * 6, gy - 4 - r() * 4); }
    x.stroke();
    x.fillStyle = 'rgba(200,245,225,0.4)'; x.fillRect(0, GROUND - 1, W, 2);
    return c;
  }
  function buildDay() {
    const r = C.mulberry32(37);
    // 雲の絵と、流れる雲の並び（作るのは 1 回だけ。並びは時刻 now だけで決まる）
    DAY.sprites = [dayCloudSprite(C.mulberry32(61), 340, 136, 9), dayCloudSprite(C.mulberry32(62), 340, 136, 7), dayCloudSprite(C.mulberry32(63), 340, 136, 6)];
    DAY.flow = [{ k: 0, y: 196, w: 330, v: 12, x0: 0.12 }, { k: 1, y: 262, w: 240, v: 8, x0: 0.52 }, { k: 2, y: 168, w: 170, v: 6, x0: 0.78 }, { k: 0, y: 292, w: 280, v: 10, x0: 0.33 }];
    BG.daySky = buildDaySky(r);
    BG.dayMountain = buildDayMountains(C.mulberry32(41));
    const c = mk(W, H);
    c.getContext('2d').drawImage(BG.daySky, 0, 0); c.getContext('2d').drawImage(BG.dayMountain, 0, 0);
    return c;
  }
  // 流れる雲：空の層の上、山の層の下。位置は now だけで決まり、左右の端で回り込む（毎フレームは drawImage だけ）
  function drawDayClouds(now) {
    const t = now / 1000;
    for (const cl of DAY.flow) {
      const span = W + 2 * cl.w, x = ((cl.x0 * span + cl.v * t) % span) - cl.w;
      ctx.drawImage(DAY.sprites[cl.k], x, cl.y - cl.w * 0.2, cl.w, cl.w * 0.4);
    }
  }

  // ---------- Rendering ----------
  function glowLine(pts, color, widths, alphas) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < widths.length; i++) {
      ctx.strokeStyle = `rgba(${color},${alphas[i]})`; ctx.lineWidth = widths[i];
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.stroke();
    }
  }
  const COLORS = [
    { body: '#f2f6ff', blade: '120,225,255', core: '235,252,255', glow: 'rgba(110,220,255,' },
    { body: '#ff5a64', blade: '255,70,90', core: '255,225,228', glow: 'rgba(255,80,100,' },
  ];
  function drawFighter(f, i) {
    const p = pose(f), col = COLORS[i];
    // floor reflection / shadow
    const sh = Math.max(0.2, 1 - (GROUND - f.y) / 250);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * sh})`; ctx.beginPath(); ctx.ellipse(f.x, GROUND + 4, 44 * sh, 8 * sh, 0, 0, Math.PI * 2); ctx.fill();
    // blade trail
    const tr = S.trails[i];
    if (tr.length > 1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 1; k < tr.length; k++) {
        const a = tr[k - 1], b = tr[k], al = (k / tr.length) * 0.32;
        ctx.fillStyle = `rgba(${col.blade},${al})`;
        ctx.beginPath(); ctx.moveTo(a.bx, a.by); ctx.lineTo(a.tx, a.ty); ctx.lineTo(b.tx, b.ty); ctx.lineTo(b.bx, b.by); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // body
    const ko = f.state === 'ko';
    // 昼だけ：白い体や赤い体が淡い空・雲に溶けるので、暗い縁取りを先に描く（縁取りは体と頭の外側 2 px）
    const day = !!S.match && S.match.stage() === 'day';
    const bodyCol = f.state === 'hitstun' && (f.sf % 4 < 2) ? '#ffffff' : col.body;
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(p.hip[0], p.hip[1]); ctx.lineTo(p.kneeA[0], p.kneeA[1]); ctx.lineTo(p.footA[0], p.footA[1]);
      ctx.moveTo(p.hip[0], p.hip[1]); ctx.lineTo(p.kneeB[0], p.kneeB[1]); ctx.lineTo(p.footB[0], p.footB[1]);
      ctx.moveTo(p.hip[0], p.hip[1]); ctx.lineTo(p.neck[0], p.neck[1]);
      ctx.moveTo(p.shoulder[0], p.shoulder[1]); ctx.lineTo(p.elbow2[0], p.elbow2[1]); ctx.lineTo(p.hand2[0], p.hand2[1]);
      ctx.moveTo(p.shoulder[0], p.shoulder[1]); ctx.lineTo(p.elbow[0], p.elbow[1]); ctx.lineTo(p.hand[0], p.hand[1]);
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (day) { ctx.strokeStyle = 'rgba(8,14,36,0.9)'; ctx.lineWidth = 11; bodyPath(); ctx.stroke(); }
    ctx.strokeStyle = bodyCol; ctx.lineWidth = 7; bodyPath(); ctx.stroke();
    if (day) { ctx.fillStyle = 'rgba(8,14,36,0.9)'; ctx.beginPath(); ctx.arc(p.head[0], p.head[1], 15.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = bodyCol; ctx.beginPath(); ctx.arc(p.head[0], p.head[1], 13, 0, Math.PI * 2); ctx.fill();
    // visor / eye glow
    ctx.fillStyle = `rgba(${col.blade},0.95)`; ctx.beginPath(); ctx.arc(p.head[0] + 5 * f.facing, p.head[1] - 1, 3, 0, Math.PI * 2); ctx.fill();
    if (i === 1) { // CPU scarf
      ctx.strokeStyle = 'rgba(150,20,40,0.95)'; ctx.lineWidth = 5; const wv = Math.sin(f.sf * 0.2) * 6;
      ctx.beginPath(); ctx.moveTo(p.neck[0], p.neck[1] + 2); ctx.quadraticCurveTo(p.neck[0] - f.facing * 22, p.neck[1] + 4 + wv, p.neck[0] - f.facing * 40, p.neck[1] + 14 - wv); ctx.stroke();
    }
    // hilt
    ctx.strokeStyle = '#9aa3b8'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(p.hilt[0], p.hilt[1]); ctx.lineTo(p.hand[0], p.hand[1]); ctx.stroke();
    // blade with glow
    if (!ko || f.sf < 40) {
      // 昼だけ：淡い空や雲に溶けないよう、剣の下に暗い線を引く（通常の合成。残像には足さない）
      if (day && S.bladeBase !== false) { ctx.save(); ctx.strokeStyle = 'rgba(8,14,36,0.55)'; ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.hand[0], p.hand[1]); ctx.lineTo(p.tip[0], p.tip[1]); ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const flick = 0.85 + Math.sin(performance.now() * 0.05 + i) * 0.1;
      glowLine([p.hand, p.tip], col.blade, [26, 14, 8], [0.10 * flick, 0.22 * flick, 0.55]);
      ctx.restore();
      glowLine([p.hand, p.tip], col.core, [3.5], [1]);
      // super charge aura
      if (f.state === 'attack' && f.move === 'super') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const rg = ctx.createRadialGradient(p.tip[0], p.tip[1], 0, p.tip[0], p.tip[1], 70);
        rg.addColorStop(0, `rgba(${col.core},0.9)`); rg.addColorStop(0.3, `rgba(${col.blade},0.5)`); rg.addColorStop(1, `rgba(${col.blade},0)`);
        ctx.fillStyle = rg; ctx.fillRect(p.tip[0] - 70, p.tip[1] - 70, 140, 140); ctx.restore();
      }
    }
  }

  function drawBolts() {
    if (!S.bolts.length) return;
    const day = !!S.match && S.match.stage() === 'day';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of S.bolts) {
      const a = Math.max(0, b.life / b.max);
      // 昼だけ：淡い空の上で稲妻が溶けないよう、暗い縁を先に通常の合成で引く
      if (day) { ctx.globalCompositeOperation = 'source-over'; glowLine(b.pts, '8,14,36', [9], [0.5 * a]); ctx.globalCompositeOperation = 'lighter'; }
      glowLine(b.pts, b.color, [22, 10, 4], [0.12 * a, 0.3 * a, 0.75 * a]);
      glowLine(b.pts, '255,255,255', [1.6], [0.95 * a]);
      // branch
      const k = Math.floor(b.pts.length / 2);
      if (b.pts[k]) glowLine([b.pts[k], [b.pts[k][0] + Math.sin(b.max * 37) * 60, b.pts[k][1] + 50]], b.color, [6, 2], [0.25 * a, 0.7 * a]);
    }
    ctx.restore();
  }
  function drawParts() {
    if (!S.parts.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const p of S.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.strokeStyle = `rgba(${p.color},${a})`; ctx.lineWidth = p.w;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawStageAnim(stage, now) {
    if (stage === 'space') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const k = (Math.sin(now * 0.0015) + 1) / 2;
      ctx.fillStyle = `rgba(120,220,255,${0.05 + k * 0.08})`; ctx.fillRect(0, GROUND - 3, W, 6);
      for (let i = 0; i < 6; i++) { const sx = (i * 241 + now * 0.01) % W, sy = 40 + (i * 97) % 300; ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(now * 0.003 + i))})`; ctx.fillRect(sx, sy, 2, 2); }
      ctx.restore();
    } else if (stage === 'volcano') {
      // lava pulse + embers
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const k = (Math.sin(now * 0.002) + 1) / 2;
      const lg = ctx.createLinearGradient(0, GROUND, 0, GROUND + 50); lg.addColorStop(0, `rgba(255,140,40,${0.15 + 0.15 * k})`); lg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, GROUND, W, 50);
      if (S.embers.length < 70) S.embers.push({ x: vr() * W, y: H, vy: -(0.6 + vr() * 1.6), vx: (vr() - 0.5) * 0.6, s: 1 + vr() * 2.2 });
      for (const e of S.embers) { e.x += e.vx + Math.sin(now * 0.002 + e.y * 0.02) * 0.3; e.y += e.vy; ctx.fillStyle = `rgba(255,${140 + (e.s * 30) | 0},60,${Math.min(1, e.y / H + 0.2)})`; ctx.fillRect(e.x, e.y, e.s, e.s); }
      S.embers = S.embers.filter(e => e.y > -10);
      ctx.restore();
    }
  }

  function bar(x, y, w, h, v, shown, col, right) {
    ctx.fillStyle = 'rgba(5,6,16,0.8)'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.strokeStyle = 'rgba(200,210,255,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    const sw = w * shown, vw = w * v;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    if (right) ctx.fillRect(x + w - sw, y, sw, h); else ctx.fillRect(x, y, sw, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    ctx.fillStyle = g;
    if (right) ctx.fillRect(x + w - vw, y, vw, h); else ctx.fillRect(x, y, vw, h);
  }
  let hudK = 1; // enlarges HUD text when the game is drawn small (phones)
  function drawHUD(now) {
    const m = S.match;
    const k = hudK;
    const a = m.f[0], b = m.f[1];
    for (let i = 0; i < 2; i++) { const target = m.f[i].hp; if (S.dmgShown[i] > target) S.dmgShown[i] = Math.max(target, S.dmgShown[i] - 0.6); else S.dmgShown[i] = target; }
    bar(50, 34, 500, 26, a.hp / 100, S.dmgShown[0] / 100, a.hp > 30 ? ['#9af0ff', '#2fa8d8'] : ['#ffd36b', '#e0702a'], false);
    bar(730, 34, 500, 26, b.hp / 100, S.dmgShown[1] / 100, b.hp > 30 ? ['#ff9aa2', '#d02f45'] : ['#ffd36b', '#e0702a'], true);
    // 昼だけ：文字の後ろの暗い板。背景には焼き込まず、描く文字の箱（余白 3 px）を毎回描く（背景の拡大・平行移動の影響を受けない）
    const dayPlate = m.stage() === 'day' && S.dayPlates !== false;
    const plate = (font, text, align, px, py) => {
      if (!dayPlate) return;
      ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'top'; const t = ctx.measureText(text);
      // 文字の実際の墨の範囲（measureText の actualBoundingBox）に 3 px の余白。送り幅で測ると、CJK の字の左右のはみ出しが板から出る
      ctx.fillStyle = 'rgba(10,18,44,0.55)';
      const x0 = Math.floor(px - t.actualBoundingBoxLeft), y0 = Math.floor(py - t.actualBoundingBoxAscent);
      const x1 = Math.ceil(px + t.actualBoundingBoxRight), y1 = Math.ceil(py + t.actualBoundingBoxDescent);
      ctx.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
    };
    const f20 = `800 ${Math.round(20 * k)}px system-ui, sans-serif`;
    const lv = { weak: '弱い', normal: '普通', strong: '強い' }[S.level];
    const cpuText = 'CPU（' + lv + '）';
    plate(f20, 'YOU', 'left', 50, 70); plate(f20, cpuText, 'right', 1230, 70);
    ctx.font = f20; ctx.textBaseline = 'top';
    ctx.fillStyle = '#e8f6ff'; ctx.textAlign = 'left'; ctx.fillText('YOU', 50, 70);
    ctx.fillStyle = '#ffd0d4'; ctx.textAlign = 'right'; ctx.fillText(cpuText, 1230, 70);
    // round pips
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < C.WINS_NEEDED; k++) {
        const px = i === 0 ? 520 - k * 26 : 760 + k * 26, py = 80 + (hudK - 1) * 10;
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = m.wins[i] > k ? (i === 0 ? '#5ee7ff' : '#ff4d5e') : 'rgba(255,255,255,0.15)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    // timer
    const sec = Math.ceil(Math.max(0, m.timer) / 60);
    ctx.fillStyle = 'rgba(5,6,16,0.8)'; ctx.fillRect(598, 20, 84, 64); ctx.strokeStyle = 'rgba(200,210,255,0.5)'; ctx.strokeRect(598, 20, 84, 64);
    ctx.fillStyle = sec <= 10 ? '#ffd45e' : '#ffffff'; ctx.textAlign = 'center'; ctx.font = '900 44px system-ui, sans-serif'; ctx.fillText(String(sec), 640, 28);
    const fRound = `700 ${Math.round(13 * k)}px system-ui, sans-serif`;
    plate(fRound, 'ROUND ' + m.round, 'center', 640, 90);
    ctx.font = fRound; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(220,225,255,0.8)'; ctx.fillText('ROUND ' + m.round, 640, 90);
    // super meters
    for (let i = 0; i < 2; i++) {
      const f = m.f[i], full = f.meter >= C.MAX_METER;
      // 高さは盤面の大きさに合わせて k 倍（スマホで盤面が縮んでも見えるように）。下端は論理 703 以内なので y は動かさない
      const x = i === 0 ? 50 : 930, y = 676, w = 300, gh = 12 * k;
      // 空の部分：背景より明るい塗りと、薄い枠線で輪郭を出す
      // 昼は地面が暗めの緑で、明るい塗りでは溶けるため、暗い塗りにして輪郭を出す
      ctx.fillStyle = dayPlate ? 'rgba(8,14,36,0.85)' : 'rgba(70,82,130,0.7)'; ctx.fillRect(x - 2, y - 2, w + 4, gh + 4);
      ctx.strokeStyle = 'rgba(200,210,255,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, gh + 3);
      const pulse = full ? 0.75 + 0.25 * Math.sin(now * 0.012) : 1;
      ctx.fillStyle = full ? `rgba(255,212,94,${pulse})` : (i === 0 ? '#3aa6d0' : '#c23a4e');
      if (i === 0) ctx.fillRect(x, y, w * f.meter / 100, gh); else ctx.fillRect(x + w - w * f.meter / 100, y, w * f.meter / 100, gh);
      const fSup = `800 ${Math.round(14 * k)}px system-ui, sans-serif`, tSup = full ? 'SUPER READY' : 'SUPER', xSup = i === 0 ? x : x + w, ySup = y - 6 - 14 * k;
      plate(fSup, tSup, i === 0 ? 'left' : 'right', xSup, ySup);
      ctx.font = fSup; ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.fillStyle = full ? '#ffd45e' : (dayPlate ? 'rgba(235,240,255,0.95)' : 'rgba(220,225,255,0.7)');
      ctx.fillText(tSup, xSup, ySup);
    }
  }
  function drawAnnounce() {
    const a = S.announce; if (!a) return;
    const k = a.t / a.dur;
    const scale = 1 + Math.max(0, 0.25 - a.t) * 2.5;
    const alpha = k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.save(); ctx.translate(W / 2, H / 2 - 60); ctx.scale(scale, scale); ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 96px system-ui, sans-serif';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(10,12,40,0.9)'; ctx.strokeText(a.text, 0, 0);
    ctx.fillStyle = a.text.indexOf('K.O') >= 0 ? '#ff5a64' : '#ffffff'; ctx.fillText(a.text, 0, 0);
    if (a.sub) { ctx.font = '800 30px system-ui, sans-serif'; ctx.lineWidth = 6; ctx.strokeText(a.sub, 0, 72); ctx.fillStyle = '#ffd45e'; ctx.fillText(a.sub, 0, 72); }
    ctx.restore();
  }

  let titleT = 0;
  function render(now) {
    const m = S.match;
    const stage = m ? m.stage() : (Math.floor(titleT / 6) % 2 ? 'volcano' : 'space'); // タイトルは白い文字なので、暗い背景（夜の都会・火山）だけを交代させる（昼は文字が読みにくい）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = S.shake ? rand(-S.shake, S.shake) : 0, sy = S.shake ? rand(-S.shake, S.shake) * 0.6 : 0;
    ctx.translate(sx, sy);
    if (stage === 'day') { // 昼：空 → 流れる雲 → 山（山の層は上部が透明）
      ctx.drawImage(BG.daySky, -12, -8, W + 24, H + 16);
      drawDayClouds(now);
      ctx.drawImage(BG.dayMountain, -12, -8, W + 24, H + 16);
    } else ctx.drawImage(BG[stage], -12, -8, W + 24, H + 16);
    drawStageAnim(stage, now);
    if (m) {
      // draw attacker on top
      const order = m.f[0].state === 'attack' ? [1, 0] : [0, 1];
      for (const i of order) drawFighter(m.f[i], i);
      drawBolts(); drawParts();
    } else {
      demo(now);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (S.flash > 0) { ctx.fillStyle = `rgba(${S.flashColor},${Math.min(0.55, S.flash)})`; ctx.fillRect(0, 0, W, H); }
    if (S.timeScale < 1) { // slow-motion vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,20,${0.55 * (1 - S.timeScale)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (m && (S.screen === 'fight' || S.screen === 'pause' || S.screen === 'handconfirm')) { drawHUD(now); drawAnnounce(); }
  }
  // Title screen backdrop: two fighters posing with blades.
  const demoF = [Object.assign({}, { side: 0, x: 430, y: GROUND, vx: 0, vy: 0, facing: 1, state: 'idle', sf: 0, move: null }), { side: 1, x: 850, y: GROUND, vx: 0, vy: 0, facing: -1, state: 'idle', sf: 0, move: null }];
  function demo(now) {
    for (const f of demoF) { f.sf += 1; }
    drawFighter(demoF[0], 0); drawFighter(demoF[1], 1);
    drawBolts(); drawParts();
  }

  // ---------- Layout ----------
  const touchMode = params.get('touch') === '1' || (params.get('touch') !== '0' && matchMedia('(hover: none) and (pointer: coarse)').matches);
  document.body.classList.toggle('touch', touchMode);
  function place(el, x, y, w, h) { Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); }
  function unfix(el) { Object.assign(el.style, { position: '', left: '', top: '', width: '', height: '' }); }
  // 持ち手：right（既定）か left。タイトルで選び、一時停止の確認で変える。localStorage（sbd.hand）に保存する。保存できない環境では今回だけ有効
  const HAND_KEY = 'sbd.hand';
  let hand = 'right';
  try { if (localStorage.getItem(HAND_KEY) === 'left') hand = 'left'; } catch (_) {}
  const BOARD_GAP = 8; // 横持ち：盤面の端と、いちばん近いボタンの間隔（CSS px、8 以上）
  // 安全領域の余白：template の #safe（CSS の env() を max() で包んだ値）の位置を読む。上は 0、左右下は 10 以上
  function safeM() { const r = $('#safe').getBoundingClientRect(); return { l: r.left, r: window.innerWidth - r.right, t: r.top, b: window.innerHeight - r.bottom }; }
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const top = $('#topbar'), ui = $('#ui');
    const pads = {}; document.querySelectorAll('.pbtn').forEach(b => { pads[b.dataset.k] = b; });
    const sa = safeM();
    const spots = {}; const put = (k, x, y, w, h) => { spots[k] = [x, y, w, h]; }; // 右利きの位置を集め、最後に持ち手で折り返す
    let cx, cy, cw, ch;
    let mL = sa.l, mR = sa.r; // 折り返すときの基準の左右の余白（縦持ちでは下の pl・pr を使う）
    let uiBox = null; // 縦持ちのとき、試合以外の画面の枠（topbar の下から画面の下端まで）
    $('#keys').style.display = touchMode || vw < 900 ? 'none' : '';
    if (!touchMode) {
      const tb = 44;
      cw = Math.min(vw, (vh - tb) * 16 / 9); ch = cw * 9 / 16; cx = (vw - cw) / 2; cy = tb + (vh - tb - ch) / 2;
      place(top, cx, Math.max(0, cy - tb), cw, tb);
    } else if (vh >= vw) {
      // Portrait: bar, game, then the pad below. 上の安全領域の下にバーを置く
      const tb = 48;
      cw = vw; ch = cw * 9 / 16; cx = 0; cy = sa.t + tb;
      place(top, 0, sa.t, vw, tb);
      uiBox = [0, cy, vw, vh - cy];
      const pl = Math.max(14, sa.l), pr = Math.max(14, sa.r); // 左右の余白：従来の 14 px を下限にし、安全領域がそれより広ければその値
      mL = pl; mR = pr;
      const areaY = cy + ch + 8, areaH = vh - areaY - Math.max(8, sa.b);
      // 幅の式は vw / 5.4（390 で 72 px）。▶ と 弱 の間を 24 px 以上にするため、従来の 5.2（75 px）から縮める
      let s = Math.max(52, Math.min(84, areaH / 3.3, vw / 5.4));
      // 安全領域が従来の 14 px より広いときだけ、▶ と 弱 の間（24 px）が保たれる大きさまで縮める（既定の大きさは変えない）
      if (pl + pr > 28) s = Math.max(30, Math.min(s, (vw - pl - pr - 64) / 4));
      // 3 行の枠の中央に、2 段（row2・row3）を置く。左：◀▶ を下段、必殺はその上（◀▶ の中央）
      const gap = Math.max(12, s * 0.12); // 横の間隔
      const vgap = Math.max(16, s * 0.12); // 縦の余白（16 px 以上）
      const by = areaY + Math.max(0, (areaH - (s * 3 + vgap * 2)) / 2);
      const row2 = by + s + vgap, row3 = by + s * 2 + vgap * 2;
      put('left', pl, row3, s, s);
      put('right', pl + s + gap * 2, row3, s, s);
      put('super', pl + s / 2 + gap, row2, s, s); // ◀▶ の範囲（pl〜pl+2s+2gap）の中央
      // 右側は 2×2（N1）：右端の列＝守（上）・強（下）、内側の列＝ジャンプ（上）・弱（下）。横の間隔は 16 px 以上
      const hgap = Math.max(16, s * 0.12);
      const rightX = vw - pr - s, innerX = rightX - s - hgap;
      put('guard', rightX, row2, s, s);
      put('heavy', rightX, row3, s, s);
      put('jump', innerX, row2, s, s);
      put('light', innerX, row3, s, s);
    } else {
      // Landscape: side panels hold the pad; the game sits in the middle.
      const s = Math.max(48, Math.min(64, vh / 6.6));
      const gap = Math.max(12, s * 0.12); // 横の間隔
      const vgap = Math.max(16, s * 0.12); // 縦の余白（16 px 以上）
      const hgap = Math.max(16, s * 0.12); // 右側の 2×2 の内側の間隔
      // 左右の板は同じ幅 P（2 段ぶんのボタン）にし、盤面の両側に BOARD_GAP 以上の隙間を取る。
      // 板を同じ幅にするので、左利きに折り返しても隙間は変わらない
      const P = s * 2 + hgap;
      cw = Math.min(vw - sa.l - sa.r - 2 * (P + BOARD_GAP), vh * 16 / 9); ch = cw * 9 / 16;
      cx = Math.max(sa.l + P + BOARD_GAP, Math.min((vw - cw) / 2, vw - sa.r - P - BOARD_GAP - cw));
      cy = (vh - ch) / 2;
      place(top, cx, 0, cw, Math.max(0, cy));
      top.style.display = cy >= 40 ? 'flex' : 'none';
      const bottom = vh - Math.max(12, sa.b);
      // 2 段（row2・row3）を下寄せ。左：◀▶ を下段、必殺はその上（◀▶ の中央）
      const row3 = bottom - s, row2 = row3 - s - vgap;
      put('left', sa.l, row3, s, s);
      put('right', sa.l + s + gap, row3, s, s);
      put('super', sa.l + s / 2 + gap / 2, row2, s, s); // ◀▶ の範囲（sa.l〜sa.l+2s+gap）の中央
      // 右側は 2×2（N1）：右端の列＝守（上）・強（下）、内側の列＝ジャンプ（上）・弱（下）
      const rightX = vw - sa.r - s, innerX = rightX - s - hgap;
      put('guard', rightX, row2, s, s);
      put('heavy', rightX, row3, s, s);
      put('jump', innerX, row2, s, s);
      put('light', innerX, row3, s, s);
      // ⇄ は置かない（ゲーム中に変えると誤操作しやすいため。利き手はタイトルと一時停止から変える）
      if (cy < 40) {
        top.style.display = 'flex'; place(top, sa.l, 6, Math.max(0, cx - BOARD_GAP - sa.l), 40); top.querySelector('.name').style.display = 'none';
      } else top.querySelector('.name').style.display = '';
    }
    // 左利き：◀▶（left・right・super）は左下のまま動かさない（左右の配置は変えない）。
    // 攻撃の 2×2 は右側のままにし、列だけを入れ替える（外側の列＝ジャンプ・弱、内側の列＝守・強）。段（y）と大きさは変えない
    const ATTACK_COLS = { jump: 'out', light: 'out', guard: 'in', heavy: 'in' };
    const outX = spots.guard ? spots.guard[0] : 0, inX = spots.jump ? spots.jump[0] : 0;
    for (const k of Object.keys(spots)) {
      const [x, y, w, h] = spots[k];
      let nx = x;
      if (hand === 'left' && ATTACK_COLS[k]) nx = ATTACK_COLS[k] === 'out' ? outX : inX;
      place(pads[k], nx, y, w, h);
    }
    if (!touchMode || vh >= vw) top.style.display = 'flex';
    if (!(touchMode && vh < vw)) top.querySelector('.name').style.display = '';
    place(canvas, cx, cy, cw, ch);
    hudK = Math.max(1, Math.min(2.1, 760 / cw));
    // 縦持ちでは、タイトル・強さ選択・一時停止・結果の内容を画面の縦の中央に寄せるため、枠を画面の下まで広げる
    if (uiBox) place(ui, ...uiBox); else place(ui, cx, cy, cw, ch);
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  // 利き手を切り替えて保存し、表示と配置を組み直す（タイトルのボタン・一時停止の確認から呼ぶ）
  function setHand(h) {
    hand = h;
    try { localStorage.setItem(HAND_KEY, h); } catch (_) {} // 保存できない環境では、今回だけ有効
    refreshHand();
    layout();
  }
  function refreshHand() {
    const b = $('#btnHandTitle');
    b.dataset.hand = hand;
    b.querySelectorAll('[data-h]').forEach(s => { s.className = s.dataset.h === hand ? 'cur' : 'off'; });
    $('#hcText').textContent = '配置を' + (hand === 'left' ? '右' : '左') + '利きに変えますか？';
  }
  // 一時停止の確認を開く。既定の選択は「いいえ」（誤って変えないため）
  function openHandConfirm() {
    refreshHand();
    document.querySelectorAll('#scrHandConfirm .btn').forEach(x => x.classList.toggle('sel', x.dataset.act === 'hand-no'));
    show('handconfirm');
  }
  refreshHand();

  // ---------- Main loop ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    const t0 = performance.now();
    let dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    titleT += dt;
    if (S.slowT > 0) { S.slowT -= dt; S.timeScale = S.slowT > 0.4 ? 0.25 : 0.25 + (0.4 - Math.max(0, S.slowT)) / 0.4 * 0.75; if (S.slowT <= 0) S.timeScale = 1; }
    if (S.screen === 'fight' && S.match) {
      acc += dt * S.timeScale * debug.speed;
      let n = 0; const maxN = 6 * debug.speed;
      while (acc >= STEP && n < maxN) { tick(); acc -= STEP; n += 1; }
      if (n >= maxN) acc = 0;
      if (S.resultDelay > 0) { S.resultDelay -= dt; if (S.resultDelay <= 0) { S.resultDelay = -1; showResult(); } }
    } else acc = 0;
    if (S.screen !== 'pause' && S.screen !== 'handconfirm') updateFx(dt * S.timeScale);
    const sup = document.querySelector('.pbtn.sup');
    if (sup) { // 必殺の表示：ゲージ 100 未満は off（灰色）、100 で ready（金色）。押せなくても、ポインタのイベントは受ける
      const ready = !!S.match && S.match.f[0].meter >= C.MAX_METER;
      sup.classList.toggle('ready', ready); sup.classList.toggle('off', !ready);
      sup.setAttribute('aria-disabled', ready ? 'false' : 'true');
    }
    render(now);
    const t1 = performance.now();
    if (perf.record) { perf.samples.push(t1 - t0); perf.frames += 1; }
    requestAnimationFrame(frame);
  }

  BG.space = buildSpace();
  BG.volcano = buildVolcano();
  BG.day = buildDay();
  layout();
  show('title');
  requestAnimationFrame(frame);

  // ---------- Test hooks ----------
  window.__game = {
    S, BG, MOON, debug, perf, Sfx, pressLog, pose,
    state() {
      const m = S.match;
      return { screen: S.screen, level: S.level, timeScale: S.timeScale, shake: S.shake, parts: S.parts.length, bolts: S.bolts.length,
        match: m ? m.snapshot() : null, stage: m ? m.stage() : null, muted: Sfx.muted, master: Sfx.masterValue(), sfx: Object.assign({}, Sfx.counts), touch: touchMode };
    },
    input: () => readInput(false),
    // Heaviest scene: both supers, many sparks, slow motion.
    stress() {
      const m = S.match; if (!m) return;
      m.phase = 'fight'; m.timer = C.ROUND_FRAMES;
      for (const f of m.f) { f.hp = 100; f.meter = 100; f.state = 'idle'; f.sf = 0; f.y = GROUND; }
      m.f[0].x = 500; m.f[1].x = 780;
      S.slowT = 99; S.timeScale = 0.25;
      for (let i = 0; i < 8; i++) addBolt(560, 480, 760, 500, '140,220,255', 5);
      spark(640, 450, MAX_PARTS, '150,235,255', 1.5);
      S.shake = 20;
    },
    stressKeep() { // keep particles and bolts saturated
      while (S.parts.length < MAX_PARTS) spark(rand(300, 980), rand(300, 560), 20, '255,200,120', 1.3);
      if (S.bolts.length < 8) addBolt(rand(300, 600), 470, rand(700, 980), 500, '255,110,140', 0.6);
      for (const f of S.match.f) if (f.state !== 'attack') { f.meter = 100; f.state = 'attack'; f.move = 'super'; f.sf = 0; f.hitDone = true; }
    },
  };
})();
