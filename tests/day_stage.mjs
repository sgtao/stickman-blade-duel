// 合格条件（昼の背景 A・B）：(a) 山の稜線がある、(b) 流れる雲は空の帯だけを動かし、帯と HUD は変えない、
// (c) 手前の山の帯の相対輝度の中央値が 0.065 以下、(d) 昼の平均輝度は参考（visual.mjs が 110 以上を見る）
import { playwright, URL_, check, done } from './lib.mjs';
const { chromium } = playwright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 764 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// (b) の比較で、描画時刻に依存する点滅（剣の光）を止める。rAF の時刻（now）は変えたままなので、雲は動く
await page.addInitScript(() => { Object.defineProperty(performance, 'now', { value: () => 0, configurable: true }); });
await page.goto(URL_ + '?seed=9'); await page.waitForTimeout(400);

// (a)(c) 背景そのものを調べる
const bg = await page.evaluate(() => {
  const g = window.__game, BG = g.BG;
  const px = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const rel = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  const median = (a) => { const s = a.slice().sort((p, q) => p - q), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  if (!BG.day) return { layers: false, none: true };
  const W = BG.day.width, H = BG.day.height;
  const comp = px(BG.day);
  const hasLayers = !!(BG.daySky && BG.dayMountain);
  const sky = hasLayers ? px(BG.daySky) : null;
  // 山の稜線：空の層との差が大きい最上の画素を、列ごとに 220〜399 の範囲で探す
  const ridge = [];
  for (let x = 0; x < W && hasLayers; x++) {
    let top = null;
    for (let y = 220; y < 400 && top === null; y++) {
      const i = (y * W + x) * 4;
      const dd = Math.abs(comp[i] - sky[i]) + Math.abs(comp[i + 1] - sky[i + 1]) + Math.abs(comp[i + 2] - sky[i + 2]);
      if (dd > 24) top = y;
    }
    ridge.push(top);
  }
  const found = ridge.filter(v => v !== null);
  let steps = 0;
  for (let x = 1; x < W; x++) if (ridge[x] !== null && ridge[x - 1] !== null && Math.abs(ridge[x] - ridge[x - 1]) >= 1) steps++; // 峰の斜面は約 1 px／列（3 px は斜面に届かない）
  // 手前の山の帯（y 400〜600）の相対輝度の中央値。全幅と、棒人間が立つ x（340〜500、780〜940）
  const cb = [], fb = [];
  for (let y = 400; y < 600; y++) for (let x = 0; x < W; x++) { const v = rel(comp, (y * W + x) * 4); cb.push(v); if ((x >= 340 && x < 500) || (x >= 780 && x < 940)) fb.push(v); }
  let Ysum = 0; for (let i = 0; i < comp.length; i += 4) Ysum += lum(comp, i);
  return { layers: hasLayers, found: found.length / W, range: found.length ? Math.max(...found) - Math.min(...found) : 0, steps,
    bandAll: median(cb), bandFighter: median(fb), meanY: Ysum / (comp.length / 4) };
});
if (!bg.layers) {
  check('(a) 山の層がある（BG.daySky と BG.dayMountain が無い）', false, '昼の背景が層に分かれていない');
}
if (bg.none) {
  check('(c) 昼の背景がある', false, 'BG.day が無い');
} else {
  if (!bg.layers) console.log('  (a) は層がないため見られない。(c) は合成した昼の背景で測る');
  if (bg.layers) {
  check('(a) 山の稜線がある：列の 50% 以上で稜線が見つかる', bg.found >= 0.5, `見つかった列 ${(bg.found * 100).toFixed(1)}%`);
  check('(a) 山の稜線の高さの幅が 60 px 以上（y 220〜400 の峰）', bg.range >= 60, `幅 ${bg.range} px`);
  check('(a) 隣り合う列で稜線の高さが動く列が 500 以上（平らでない稜線）', bg.steps >= 500, `${bg.steps} 列`);
  }
  check('(c) 手前の山の帯の相対輝度の中央値（全幅）が 0.065 以下', bg.bandAll <= 0.065, `全幅 ${bg.bandAll.toFixed(4)}`);
  check('(c) 手前の山の帯の相対輝度の中央値（棒人間の x）が 0.065 以下', bg.bandFighter <= 0.065, `棒人間の x ${bg.bandFighter.toFixed(4)}`);
  console.log(`  参考 (d) 昼の平均輝度 ${bg.meanY.toFixed(1)}（visual.mjs の下限 110、目標 120 前後）`);
}

// (b) 雲を流す：昼の試合を止めて、2 時点の canvas を比べる
await page.keyboard.press('Enter'); await page.waitForTimeout(250); await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.state().match && window.__game.state().match.phase === 'fight', null, { timeout: 8000 });
await page.evaluate(() => {
  const g = window.__game, m = g.S.match;
  g.S.auto = null; g.S.cpu.decide = () => window.Core.emptyInput();
  m.round = 3; m.wins = [0, 0];
  for (const f of m.f) { f.state = 'idle'; f.sf = 0; f.y = 600; f.vx = 0; f.vy = 0; }
  g.debug.speed = 0;
});
await page.waitForTimeout(2500);
await page.evaluate(() => { const cv = document.querySelector('#game'); window.__snap1 = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.slice(); });
await page.waitForTimeout(2000);
const diff = await page.evaluate(() => {
  const cv = document.querySelector('#game'), W = cv.width, H = cv.height, k = H / 720;
  const a = window.__snap1, b = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const cnt = (y0, y1) => { let n = 0; for (let y = Math.round(y0 * k); y < Math.round(y1 * k); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) n++; } return n; };
  return { sky: cnt(150, 330), band: cnt(400, 600), hud: cnt(0, 90) };
});
check('(b) 空の帯（y 150〜330）の画素が 2 秒の間に変わる（雲が流れている）', diff.sky >= 1000, `変わった画素 ${diff.sky}`);
check('(b) 棒人間の帯（y 400〜600）は変わらない', diff.band === 0, `変わった画素 ${diff.band}`);
check('(b) HUD の帯（y 0〜90）は変わらない', diff.hud === 0, `変わった画素 ${diff.hud}`);
check('コンソールのエラーと例外が 0 件', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
done('day_stage');
