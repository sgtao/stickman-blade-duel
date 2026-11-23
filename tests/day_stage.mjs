// 合格条件（昼の背景 A・B）：(a) 山の稜線がある、(b) 流れる雲は空の帯だけを動かし、帯と HUD は変えない、
// (c) 手前の山の帯の相対輝度の中央値が 0.065 以下、(d) 昼の平均輝度は参考（visual.mjs が 110 以上を見る）
import { playwright, URL_, ROOT, check, done } from './lib.mjs';
import path from 'path';
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
  m.round = 1; m.wins = [0, 0];
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
// (e) HUD の板（昼だけ）：板は、実際に描く文字の箱（measureText、余白 3 px）を覆う。板の有無（S.dayPlates）だけを変えて、
// 箱の左右上下 2 px の外側の画素が変わることを見る。強さは 3 種（弱い・普通・強い）。画像は shots/ に出す
for (const lv of ['weak', 'normal', 'strong']) {
  await page.evaluate((lv) => { window.__game.S.level = lv; }, lv);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(ROOT, 'shots', `day_hud_${lv}.png`) });
}
const plates = await page.evaluate(async () => {
  const g = window.__game, cv = document.querySelector('#game'), c2 = cv.getContext('2d');
  const k = Math.max(1, Math.min(2.1, 760 / cv.getBoundingClientRect().width));
  const frame = async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return c2.getImageData(0, 0, cv.width, cv.height).data.slice(); };
  const tc = document.createElement('canvas').getContext('2d'); tc.textBaseline = 'top';
  const boxOf = (font, text, align, px, py) => { tc.font = font; tc.textAlign = align; const m = tc.measureText(text);
    return [Math.floor(px - m.actualBoundingBoxLeft), Math.floor(py - m.actualBoundingBoxAscent), Math.ceil(px + m.actualBoundingBoxRight), Math.ceil(py + m.actualBoundingBoxDescent)]; };
  const labels = { weak: '弱い', normal: '普通', strong: '強い' };
  const out = {};
  for (const lv of ['weak', 'normal', 'strong']) {
    g.S.level = lv;
    const f20 = `800 ${Math.round(20 * k)}px system-ui, sans-serif`;
    const boxes = { YOU: boxOf(f20, 'YOU', 'left', 50, 70), CPU: boxOf(f20, 'CPU（' + labels[lv] + '）', 'right', 1230, 70),
      ROUND: boxOf(`700 ${Math.round(13 * k)}px system-ui, sans-serif`, 'ROUND 1', 'center', 640, 90) };
    g.S.dayPlates = true; const on = await frame(); g.S.dayPlates = false; const off = await frame(); g.S.dayPlates = true;
    // 文字の淡い画素（off の輝度 150 以上）は除く。残るのは空の画素だけ。除いた画素は NaN にして数えない
    const d = (x, y) => { const i = (Math.round(y) * cv.width + Math.round(x)) * 4;
      if (0.2126 * off[i] + 0.7152 * off[i + 1] + 0.0722 * off[i + 2] >= 150) return NaN;
      return Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]); };
    for (const [name, b] of Object.entries(boxes)) {
      const fr = { L: [], R: [], T: [], B: [] };
      // 箱は画素の境界（整数）。外側 2 px は、左上は b-1, b-2、右下は b+1, b+2 の画素（b は箱の外側の最初の画素）
      for (let t = b[1]; t < b[3]; t += 1) { fr.L.push(d(b[0] - 2, t)); fr.R.push(d(b[2] - 1 + 2, t)); }
      for (let x = b[0]; x < b[2]; x += 1) { fr.T.push(d(x, b[1] - 2)); fr.B.push(d(x, b[3] - 1 + 2)); }
      const frac = {}; for (const key of Object.keys(fr)) { const ok = fr[key].filter(v => !Number.isNaN(v)); frac[key] = ok.length ? ok.filter(v => v >= 8).length / ok.length : 0; }
      out[lv + ' ' + name] = { box: b.map(v => Math.round(v * 10) / 10), frac };
    }
  }
  return out;
});
for (const [key, v] of Object.entries(plates)) {
  const minF = Math.min(...Object.values(v.frac));
  check(`昼の HUD 板（${key}）：箱の左右上下 2 px の外側が板で変わる（画素の 90% 以上）`, minF >= 0.9,
    `箱 ${v.box} 最小の割合 ${(minF * 100).toFixed(0)}% (L ${(v.frac.L * 100).toFixed(0)} R ${(v.frac.R * 100).toFixed(0)} T ${(v.frac.T * 100).toFixed(0)} B ${(v.frac.B * 100).toFixed(0)})`);
}
// (f) 剣の下地（昼だけ）：空の上で跳んだ剣の線の近くの画素が、下地ありのほうが暗い。下地は S.bladeBase で切り替える
const blade = await page.evaluate(async () => {
  const g = window.__game, m = g.S.match, cv = document.querySelector('#game'), c2 = cv.getContext('2d');
  const f = m.f[0]; f.state = 'jump'; f.sf = 0; f.y = 400; f.vx = 0; f.vy = 0;
  const frame = async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return c2.getImageData(0, 0, cv.width, cv.height).data.slice(); };
  await new Promise(r => setTimeout(r, 100));
  const p = g.pose(f), dx = p.tip[0] - p.hand[0], dy = p.tip[1] - p.hand[1], L = Math.hypot(dx, dy);
  const pts = [];
  for (const t of [0.25, 0.4, 0.55, 0.7]) for (const s of [-3, 3]) pts.push([p.hand[0] + t * dx - dy / L * s, p.hand[1] + t * dy + dx / L * s]);
  const lum = (d, x, y) => { const i = (Math.round(y) * cv.width + Math.round(x)) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
  g.S.bladeBase = true; const on = await frame(); g.S.bladeBase = false; const off = await frame(); g.S.bladeBase = true;
  const mean = (d) => pts.reduce((a, [x, y]) => a + lum(d, x, y), 0) / pts.length;
  return { on: mean(on), off: mean(off), hand: p.hand.map(Math.round), tip: p.tip.map(Math.round) };
});
check('昼の剣：下地ありの線の近くの画素が、下地なしより 10 以上暗い（淡い空の上）', blade.off - blade.on >= 10,
  `下地なし ${blade.off.toFixed(1)} / 下地あり ${blade.on.toFixed(1)}（手元 ${blade.hand} 剣先 ${blade.tip}）`);
check('コンソールのエラーと例外が 0 件', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
done('day_stage');
