// 合格条件 6：最も重い場面で、1 フレームの処理の 95 パーセンタイル 8 ms 以下、毎秒 58 回以上の描画
import { playwright, URL_, check, done } from './lib.mjs';
const { chromium } = playwright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 764 } });
await page.goto(URL_ + '?seed=3');
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.state().match.phase === 'fight', null, { timeout: 5000 });
const r = await page.evaluate(async () => {
  const g = window.__game; g.S.cpu.decide = () => window.Core.emptyInput();
  g.stress();
  const keep = setInterval(() => g.stressKeep(), 30);
  await new Promise(res => setTimeout(res, 500));
  g.perf.samples.length = 0; g.perf.frames = 0; g.perf.record = true;
  const t0 = performance.now();
  await new Promise(res => setTimeout(res, 5000));
  g.perf.record = false; clearInterval(keep);
  const secs = (performance.now() - t0) / 1000;
  const s = g.perf.samples.slice().sort((a, b) => a - b);
  const st = g.state();
  return { fps: g.perf.frames / secs, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length, parts: st.parts, bolts: st.bolts, timeScale: st.timeScale };
});
check('負荷の場面になっている（火花 300 以上・稲妻 4 以上・スロー）', r.parts >= 300 && r.bolts >= 4 && r.timeScale <= 0.5, `parts ${r.parts}, bolts ${r.bolts}, scale ${r.timeScale}`);
check('1 フレームの処理の 95 パーセンタイルが 8 ms 以下', r.p95 <= 8, `p95 ${r.p95.toFixed(2)} ms, 平均 ${r.mean.toFixed(2)} ms, 最大 ${r.max.toFixed(2)} ms`);
check('描画が毎秒 58 回以上', r.fps >= 58, `${r.fps.toFixed(1)} fps`);
await browser.close();
done('perf');
