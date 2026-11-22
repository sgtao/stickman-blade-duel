// 画面の内容が盤面の枠（#ui）に収まるか：タイトル・強さ選択・一時停止・結果の 4 画面を、PC とタッチの各サイズで確かめる
// 検査の下限：盤面の枠の高さ 150 px 以上（PC なら窓 320×200 まで、タッチ縦なら 280×500 まで）。下限未満は検査しない。
// (a) .screen の scrollHeight ≤ clientHeight、(b) 表示中の子要素すべての外接矩形が #ui の矩形の内側、(c) ボタンは 44×44 px 以上
// (d) 操作説明の「キー＋説明」の組（.nb）は、どれも 1 行に収まる（途中で改行しない）
// (e) 表示中の .help・p・.btn の文字は 10 px 以上
import { playwright, URL_, check, done } from './lib.mjs';
const { chromium } = playwright();
const browser = await chromium.launch();
const SIZES = [
  ['PC 1280×720', 1280, 720, false],
  ['PC 800×450', 800, 450, false],
  ['PC 640×400', 640, 400, false],
  ['PC 480×330', 480, 330, false],
  ['PC 320×200（下限）', 320, 200, false],
  ['タッチ縦 390×844', 390, 844, true],
  ['タッチ縦 360×640', 360, 640, true],
  ['タッチ縦 280×500（下限）', 280, 500, true],
  ['タッチ縦 310×700（枠 174）', 310, 700, true],
  ['PC 310×250（枠 174）', 310, 250, false],
  ['タッチ横 844×390', 844, 390, true],
  ['タッチ横 667×375', 667, 375, true],
];
const SCREENS = ['scrTitle', 'scrSelect', 'scrPause', 'scrResult'];
const MIN_UI_H = 150;
for (const [label, w, h, touch] of SIZES) {
  console.log('[' + label + ']');
  const opts = { viewport: { width: w, height: h } };
  if (touch) Object.assign(opts, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_ + '?seed=4');
  await page.waitForTimeout(200);
  const uiH = await page.evaluate(() => Math.round(document.querySelector('#ui').getBoundingClientRect().height));
  check(`${label}: 枠の高さが検査の下限 ${MIN_UI_H} px 以上`, uiH >= MIN_UI_H, `枠の高さ ${uiH}`);
  for (const id of SCREENS) {
    const r = await page.evaluate((id) => {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
      const ui = document.querySelector('#ui').getBoundingClientRect();
      const sc = document.getElementById(id);
      const eps = 0.5, bad = [], small = [], wrapped = [], tiny = [];
      for (const el of sc.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (b.left < ui.left - eps || b.top < ui.top - eps || b.right > ui.right + eps || b.bottom > ui.bottom + eps) {
          bad.push(el.tagName.toLowerCase() + ' “' + (el.textContent || '').trim().slice(0, 10) + '” ' +
            [Math.round(b.top - ui.top), Math.round(b.bottom - ui.top), Math.round(ui.height)].join('/'));
        }
        if (el.tagName === 'BUTTON' && (b.width < 44 || b.height < 44)) small.push(Math.round(b.width) + 'x' + Math.round(b.height));
        // 折り返すと、組の矩形の上端が 2 行以上に分かれる（1 行でも矩形が複数返ることがあるため、矩形の数では数えない）
        if (el.classList.contains('nb')) {
          const tops = new Set([...el.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top / 4)));
          if (tops.size > 1) wrapped.push((el.textContent || '').trim().slice(0, 12));
        }
        if (el.matches('.help, p, .btn') && parseFloat(cs.fontSize) < 10) tiny.push(el.tagName.toLowerCase() + ' ' + cs.fontSize);
      }
      return { over: sc.scrollHeight - sc.clientHeight, uiW: Math.round(ui.width), uiH: Math.round(ui.height), bad: bad.slice(0, 4), small, wrapped, tiny };
    }, id);
    check(`${id}: 高さが枠に収まる`, r.over <= 0 && r.bad.length === 0,
      `枠 ${r.uiW}×${r.uiH}、はみ出し ${r.over}px ${r.bad.join(' | ')}`);
    check(`${id}: ボタンは 44×44 px 以上`, r.small.length === 0, r.small.join(','));
    check(`${id}: 操作説明の組は途中で改行しない`, r.wrapped.length === 0, r.wrapped.join(' / '));
    check(`${id}: 文字は 10 px 以上`, r.tiny.length === 0, r.tiny.join(' / '));
  }
  check(`${label}: ページの例外なし`, errors.length === 0, errors.join(' / '));
  await ctx.close();
}
await browser.close();
done('screens_fit');
