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
await browser.close();
done('mobile');
