// 合格条件 7：スマホの縦横で、画面上のボタン 7 個の配置・大きさ・重なり、タップ、マルチタッチ
import { playwright, URL_, check, done } from './lib.mjs';
const { chromium } = playwright();
const browser = await chromium.launch();
const KEYS = ['left', 'right', 'jump', 'guard', 'light', 'heavy', 'super'];
const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
for (const [label, w, h] of [['縦 390×844', 390, 844], ['横 844×390', 844, 390], ['小さい横 667×375', 667, 375]]) {
  console.log('[' + label + ']');
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_ + '?seed=4');
  const padOnTitle = await page.evaluate(() => getComputedStyle(document.querySelector('#pad')).display);
  check('タイトル画面では操作ボタンを出さない', padOnTitle === 'none', padOnTitle);
  const help = await page.evaluate(() => getComputedStyle(document.querySelector('#scrTitle .help.tch')).display);
  check('タッチ用の操作説明が出る', help !== 'none', help);
  await page.tap('[data-act=start]'); await page.waitForTimeout(100); await page.tap('[data-level=weak]');
  await page.waitForFunction(() => window.__game.state().match.phase === 'fight', null, { timeout: 5000 });
  await page.evaluate(() => { window.__game.S.cpu.decide = () => window.Core.emptyInput(); });
  // SUPER ゲージ：スマホで細く暗く、空のとき背景に溶けて見えない問題（合格条件 SUPER-GAUGE）
  // (a) 高さ：自分のゲージを 60% にして青い塗りの行数を数え、画面上の高さ（CSS px）が 6 以上
  // (b) 空のとき：ゲージの枠の内側の輝度と、その外側の背景の輝度の差が GAUGE_MIN_CONTRAST 以上
  // (c) 盤面の内側：ゲージの下端（枠を含む）が論理 716 以内、ラベルの上端が 0 以上
  // しきい値 40：修正前は差 5.1〜10.3、修正後の最小は 43.7（横 844×390）。修正前との差が十分あることを確かめる
  const GAUGE_MIN_CONTRAST = 40;
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__game.S.match.f[0].meter = 60; });
  await page.waitForTimeout(150);
  const gh = await page.evaluate(() => {
    const cv = document.querySelector('#game'), g = cv.getContext('2d');
    const LW = cv.width, LH = cv.height, sc = cv.getBoundingClientRect().width / LW;
    const d = g.getImageData(0, 0, LW, LH).data; let n = 0, top = -1, bot = -1;
    for (let y = 640; y < LH; y++) { const i = (y * LW + 60) * 4; if (Math.abs(d[i] - 58) < 25 && Math.abs(d[i + 1] - 166) < 25 && Math.abs(d[i + 2] - 208) < 25) { n++; if (top < 0) top = y; bot = y; } }
    return { rows: n, cssH: n * sc, top, bot, LH };
  });
  // 空に戻して輝度を測る
  await page.evaluate(() => { window.__game.S.match.f[0].meter = 0; });
  await page.waitForTimeout(200);
  const con = await page.evaluate(() => {
    const cv = document.querySelector('#game'), g = cv.getContext('2d');
    const LW = cv.width, LH = cv.height, cw = cv.getBoundingClientRect().width, k = Math.max(1, Math.min(2.1, 760 / cw));
    const d = g.getImageData(0, 0, LW, LH).data;
    const lum = (x0, x1, y0, y1) => { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * LW + x) * 4; s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; } return s / n; };
    const gh = 12 * k, top = 676 - 2, bot = 676 + gh + 2; // 枠（ゲージの外側 2 px）
    const inside = lum(180, 330, 676, Math.floor(676 + gh));
    const above = lum(180, 330, Math.floor(top - 8), top - 1), below = lum(180, 330, Math.ceil(bot + 1), Math.min(LH, Math.ceil(bot + 8)));
    const outside = (above + below) / 2;
    return { k, inside, outside, above, below, contrast: Math.abs(inside - outside), labelTop: 676 - 6 - 14 * k, gaugeBottom: bot };
  });
  check('SUPER ゲージの高さが 6 CSS px 以上', gh.cssH >= 6, `${gh.rows} 行 × ${gh.cssH.toFixed(2)} CSS px`);
  check('空のゲージが背景と区別できる（輝度差 ' + GAUGE_MIN_CONTRAST + ' 以上）', con.contrast >= GAUGE_MIN_CONTRAST, `差 ${con.contrast.toFixed(1)}（枠内 ${con.inside.toFixed(1)}、外側 ${con.outside.toFixed(1)}、k=${con.k.toFixed(2)}）`);
  check('SUPER ゲージとラベルが盤面の内側', con.gaugeBottom <= 716 && con.labelTop >= 0, `下端 ${con.gaugeBottom.toFixed(1)}、ラベル上端 ${con.labelTop.toFixed(1)}`);
  console.log('    gauge detail:', JSON.stringify({ gh, con }));
  const rects = await page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: b.x, y: b.y, w: b.width, h: b.height, vis: cs.display !== 'none' && cs.visibility !== 'hidden' }; };
    const o = { canvas: r(document.querySelector('#game')), pause: r(document.querySelector('#btnPause')), mute: r(document.querySelector('#btnMute')) };
    document.querySelectorAll('.pbtn').forEach(b => { o[b.dataset.k] = r(b); }); return o; });
  const inView = (b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= w + 0.5 && b.y + b.h <= h + 0.5;
  check('ボタン 7 個がすべて表示され画面内', KEYS.every(k => rects[k] && rects[k].vis && inView(rects[k])), KEYS.filter(k => !inView(rects[k])).join(','));
  const small = KEYS.filter(k => rects[k].w < 44 || rects[k].h < 44);
  check('ボタンはすべて 44×44 px 以上', small.length === 0, KEYS.map(k => k + ' ' + Math.round(rects[k].w)).join(', '));
  const pairs = []; for (let i = 0; i < KEYS.length; i++) for (let j = i + 1; j < KEYS.length; j++) if (overlap(rects[KEYS[i]], rects[KEYS[j]])) pairs.push(KEYS[i] + '/' + KEYS[j]);
  check('ボタン同士が重ならない', pairs.length === 0, pairs.join(' '));
  const onGame = KEYS.filter(k => overlap(rects[k], rects.canvas));
  check('ボタンが試合の画面（体力ゲージを含む）と重ならない', onGame.length === 0, onGame.join(','));
  // B2 の配置（PLAN 2 の決定 1・10）。①左：◀▶必殺 ②右：右端の列＝ジャンプ・守・強、強の左隣に弱 ③縦の余白 12 px 以上
  {
    const cxOf = (k) => rects[k].x + rects[k].w / 2, cyOf = (k) => rects[k].y + rects[k].h / 2;
    const rOf = (k) => rects[k].x + rects[k].w, bOf = (k) => rects[k].y + rects[k].h;
    const half = w / 2;
    const pos = KEYS.map(k => k + '(' + cxOf(k).toFixed(1) + ',' + cyOf(k).toFixed(1) + ')').join(' ');
    check('B2①左の 3 つ（◀ ▶ 必殺）の中心が、画面の中央より左', ['left', 'right', 'super'].every(k => cxOf(k) < half), pos);
    check('B2②右の 4 つ（ジャンプ・守・強・弱）の中心が、画面の中央より右', ['jump', 'guard', 'light', 'heavy'].every(k => cxOf(k) > half), pos);
    const spanL = Math.min(rects.left.x, rects.right.x), spanR = Math.max(rOf('left'), rOf('right'));
    const topLR = Math.min(rects.left.y, rects.right.y);
    check('B2①必殺は ◀▶ の範囲の中、下端が ◀▶ の上端より 8 px 以上上',
      rects.super.x >= spanL - 0.5 && rOf('super') <= spanR + 0.5 && topLR - bOf('super') >= 8 - 0.01,
      `必殺 x ${rects.super.x.toFixed(1)}〜${rOf('super').toFixed(1)}、◀▶ x ${spanL.toFixed(1)}〜${spanR.toFixed(1)}、必殺下端 ${bOf('super').toFixed(1)}、◀▶上端 ${topLR.toFixed(1)}`);
    check('B2②ジャンプ・守・強の中心の x が ±2 px で揃う',
      Math.abs(cxOf('jump') - cxOf('guard')) <= 2 && Math.abs(cxOf('guard') - cxOf('heavy')) <= 2,
      `jump ${cxOf('jump').toFixed(1)} guard ${cxOf('guard').toFixed(1)} heavy ${cxOf('heavy').toFixed(1)}`);
    check('B2②右端の列は、ジャンプ・守・強（上から）。弱はその左',
      rOf('jump') >= rOf('light') - 0.5 && rOf('guard') >= rOf('light') - 0.5 && rOf('heavy') >= rOf('light') - 0.5
      && cyOf('jump') < cyOf('guard') && cyOf('guard') < cyOf('heavy') && rOf('light') <= rects.heavy.x + 0.5,
      `y: jump ${cyOf('jump').toFixed(1)} guard ${cyOf('guard').toFixed(1)} heavy ${cyOf('heavy').toFixed(1)}, 弱右端 ${rOf('light').toFixed(1)} 強左端 ${rects.heavy.x.toFixed(1)}`);
    check('B2②弱の中心の y が強と ±2 px 以内',
      Math.abs(cyOf('light') - cyOf('heavy')) <= 2, `弱 ${cyOf('light').toFixed(1)} 強 ${cyOf('heavy').toFixed(1)}`);
    check('B2③ジャンプと守、守と強の縦の余白が 12 px 以上',
      rects.guard.y - bOf('jump') >= 12 - 0.01 && rects.heavy.y - bOf('guard') >= 12 - 0.01,
      `ジャンプ→守 ${(rects.guard.y - bOf('jump')).toFixed(1)}、守→強 ${(rects.heavy.y - bOf('guard')).toFixed(1)}`);
    // 審査の指摘（余白の余裕）：縦の余白は 16 px 以上、縦持ちの ▶ と 弱 の水平の間隔は 24 px 以上
    check('余裕③ ジャンプと守、守と強の縦の余白が 16 px 以上（3 画面）',
      rects.guard.y - bOf('jump') >= 16 - 0.01 && rects.heavy.y - bOf('guard') >= 16 - 0.01,
      `ジャンプ→守 ${(rects.guard.y - bOf('jump')).toFixed(1)}、守→強 ${(rects.heavy.y - bOf('guard')).toFixed(1)}`);
    if (h > w) check('余裕④ 縦持ち：▶ と 弱 の水平の間隔が 24 px 以上',
      rects.light.x - rOf('right') >= 24 - 0.01,
      `▶ 右端 ${rOf('right').toFixed(1)}、弱 左端 ${rects.light.x.toFixed(1)}、間隔 ${(rects.light.x - rOf('right')).toFixed(1)}`);
  }
  // B4b 必殺ボタンの表示：0 で off（灰色・aria-disabled=true）、100 で ready（金色・aria-disabled=false）。押せなくても受ける
  if (w === 844) {
    const supState = () => page.evaluate(() => { const b = document.querySelector('.pbtn.sup'); return { ad: b.getAttribute('aria-disabled'), off: b.classList.contains('off'), ready: b.classList.contains('ready'), dis: b.disabled }; });
    // 必殺ボタンの中心から、ボタン幅の 30% 以内の画素の平均輝度（0.2126R+0.7152G+0.0722B）
    const supLum = async () => {
      const r = await page.evaluate(() => { const b = document.querySelector('.pbtn.sup').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
      const buf = await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
      return page.evaluate(async ([b64, bw]) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
        const sc = img.width / bw, cx = img.width / 2, cy = img.height / 2, rad = 0.3 * bw * sc;
        let s = 0, n = 0;
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
          const i = (y * img.width + x) * 4; s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++;
        }
        return s / n;
      }, [buf.toString('base64'), r.w]);
    };
    await page.evaluate(() => { window.__game.S.match.f[0].meter = 0; }); await page.waitForTimeout(150);
    const s0 = await supState(); const lum0 = await supLum();
    check('B4b ゲージ 0：off（灰色）・aria-disabled=true・disabled 属性なし', s0.off && !s0.ready && s0.ad === 'true' && !s0.dis, JSON.stringify(s0));
    const n0 = await page.evaluate(() => window.__game.state().match.f[0]);
    // aria-disabled の間は Playwright が「押せない」と判定するため force で送る。最前面がこのボタンか、先に確かめる
    const front = await page.evaluate(() => { const b = document.querySelector('.pbtn.sup').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e && e.dataset.k; });
    check('B4b 押せない間も、必殺ボタンが最前面でポインタを受ける', front === 'super', String(front));
    await page.tap('.pbtn[data-k=super]', { force: true }); await page.waitForTimeout(250);
    const n1 = await page.evaluate(() => window.__game.state().match.f[0]);
    check('B4b 押せない間にタップしても必殺は出ない', !(n1.state === 'attack' && n1.move === 'super') && n1.meter === 0, `state ${n1.state} move ${n1.move} meter ${n1.meter} (前 ${n0.meter})`);
    await page.evaluate(() => { window.__game.S.match.f[0].meter = 100; }); await page.waitForTimeout(150);
    const s1 = await supState(); const lums = [];
    for (let i = 0; i < 3; i++) { lums.push(await supLum()); await page.waitForTimeout(120); }
    check('B4b ゲージ 100：ready（金色）・aria-disabled=false', s1.ready && !s1.off && s1.ad === 'false' && !s1.dis, JSON.stringify(s1));
    const diffs = lums.map(v => Math.abs(v - lum0)); const minDiff = Math.min(...diffs);
    check('B4b 0 と 100 の中心の輝度差が 25 以上（3 枚中の最小）', minDiff >= 25,
      `0: ${lum0.toFixed(1)}、100: ${lums.map(v => v.toFixed(1)).join(' / ')}、最小差 ${minDiff.toFixed(1)}`);
    await page.evaluate(() => { window.__game.S.match.f[0].meter = 0; }); await page.waitForTimeout(150);
  }
  const onTop = KEYS.filter(k => overlap(rects[k], rects.pause) || overlap(rects[k], rects.mute));
  check('一時停止・消音ボタンとも重ならない', onTop.length === 0 && inView(rects.pause) && inView(rects.mute), onTop.join(','));
  check('試合の画面が画面内に収まり、幅 360 px 以上', inView(rects.canvas) && rects.canvas.w >= 360, JSON.stringify(rects.canvas));
  // 宇宙の街（1 ラウンド目）の月が、HUD（CPU 名・体力ゲージ・タイマー・ラウンド表示）と右の柱に重ならない
  const moon = await page.evaluate(() => {
    const cw = document.querySelector('#game').getBoundingClientRect().width;
    const k = Math.max(1, Math.min(2.1, 760 / cw)); // app.js の hudK と同じ式（論理座標の文字の大きさ）
    const mc = document.createElement('canvas').getContext('2d');
    mc.font = `800 ${Math.round(20 * k)}px system-ui, sans-serif`; mc.textBaseline = 'top';
    let x0 = Infinity, y1 = 0;
    for (const lv of ['弱い', '普通', '強い']) { // 3 つの難易度の文字の最大範囲
      const mm = mc.measureText('CPU（' + lv + '）');
      x0 = Math.min(x0, 1230 - mm.width); y1 = Math.max(y1, 70 + mm.actualBoundingBoxDescent);
    }
    const boxes = {
      'CPU名': { x0, x1: 1230, y0: 70, y1 },
      '体力ゲージ(右)': { x0: 727, x1: 1233, y0: 31, y1: 63 },
      'タイマー': { x0: 598, x1: 682, y0: 20, y1: 84 },
      'ラウンド表示・丸印': { x0: 500, x1: 780, y0: 20, y1: 110 },
      '右の柱': { x0: 1108, x1: 1152, y0: 0, y1: 600 },
    };
    const st = window.__game.state(); const m = window.__game.MOON;
    const hits = Object.entries(boxes).filter(([, b]) => {
      const dx = Math.max(b.x0 - m.x, 0, m.x - b.x1), dy = Math.max(b.y0 - m.y, 0, m.y - b.y1);
      return dx * dx + dy * dy < (m.r + 2) * (m.r + 2); // 月の光る縁（半径 22）まで含めて判定
    }).map(([n]) => n);
    return { stage: st.stage, moon: m, k, hits };
  });
  check('宇宙の街（1 ラウンド目）で試合している', moon.stage === 'space', String(moon.stage));
  check('月が HUD と右の柱に重ならない', moon.hits.length === 0, `月 (${moon.moon.x},${moon.moon.y}) k=${moon.k.toFixed(2)} 重なり: ${moon.hits.join(',') || 'なし'}`);
  // タップで操作が入る
  const bad = [];
  for (const k of KEYS) {
    if (k === 'super') await page.evaluate(() => { window.__game.S.match.f[0].meter = 100; });
    const n0 = await page.evaluate(() => window.__game.pressLog.length);
    await page.tap(`.pbtn[data-k=${k}]`); await page.waitForTimeout(250);
    const log = await page.evaluate(() => window.__game.pressLog.slice(-1)[0]);
    const n1 = await page.evaluate(() => window.__game.pressLog.length);
    if (!(n1 === n0 + 1 && log === k)) bad.push(k);
    await page.waitForTimeout(500);
  }
  check('各ボタンのタップで対応する操作が入る', bad.length === 0, bad.join(','));
  const sup = await page.evaluate(() => window.__game.state().match.f[0].meter);
  check('必殺ボタンで必殺技が出た（ゲージ 0 に）', sup === 0, 'meter ' + sup);
  await page.waitForTimeout(1200);
  // マルチタッチ：左を押しながら弱攻撃
  const cdp = await ctx.newCDPSession(page);
  const c = (k) => ({ x: rects[k].x + rects[k].w / 2, y: rects[k].y + rects[k].h / 2 });
  const x0 = await page.evaluate(() => window.__game.state().match.f[0].x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...c('left'), id: 1 }] });
  await page.waitForTimeout(150);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...c('left'), id: 1 }, { ...c('light'), id: 2 }] });
  await page.waitForTimeout(60);
  const both = await page.evaluate(() => window.__game.input());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...c('left'), id: 1 }] });
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => window.__game.state());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.__game.input());
  check('マルチタッチ：左と弱攻撃が同時に入る', both.left && both.light, JSON.stringify({ left: both.left, light: both.light }));
  check('マルチタッチ：左に動いた', st.match.f[0].x < x0 - 5, `${x0} → ${st.match.f[0].x}`);
  check('指を離すと操作が切れる', !after.left && !after.light);
  check('例外 0 件', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
// A1（タッチ）：ラウンドの終わりに押した攻撃ボタン・押しっぱなしの攻撃ボタンを、次のラウンドの開始に持ち越さない
{
  console.log('[A1 タッチ 844×390]');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL_ + '?seed=4');
  await page.tap('[data-act=start]'); await page.waitForTimeout(100); await page.tap('[data-level=weak]');
  await page.waitForFunction(() => window.__game.state().match.phase === 'fight', null, { timeout: 5000 });
  await page.evaluate(() => { window.__game.S.cpu.decide = () => window.Core.emptyInput(); });
  const cdp = await ctx.newCDPSession(page);
  const st = () => page.evaluate(() => window.__game.state());
  const center = (k) => page.evaluate((k) => { const r = document.querySelector(`.pbtn[data-k=${k}]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, k);
  const wait = (ms) => page.waitForTimeout(ms);
  async function until(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(40); } return false; }
  async function touchCase(label, toRound, mode) {
    await page.evaluate(() => { const m = window.__game.S.match; if (m.round === 1) m.f[1].hp = 0; else { m.f[0].hp = 0; m.f[1].hp = 0; } });
    await until(async () => (await st()).match.phase === 'roundEnd', 5000);
    const L = await center('light');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...L, id: 1 }] });
    if (mode === 'tap') { await wait(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    await until(async () => { const s = await st(); return s.match.round === toRound && s.match.phase === 'fight'; }, 20000);
    if (mode === 'held') await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const R = await center('right');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...R, id: 2 }] });
    const t = Date.now(); let atk = 0, n = 0;
    while (Date.now() - t < 1000) { const s = await st(); n++; if (s.match.f[0].state === 'attack') atk++; await wait(15); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(`A1 タッチ：${label}の開始 1 秒、移動の入力だけで攻撃にならない`, atk === 0, `attack ${atk}/${n}`);
  }
  await touchCase('2 回戦（終わりに攻撃ボタンをタップ）', 2, 'tap');
  await touchCase('3 回戦（攻撃ボタンを押しっぱなし）', 3, 'held');
  await ctx.close();
}
await browser.close();
done('mobile');
