// M14b：姿勢（関節・刃の座標）の計算を app.js から core.js に移した。挙動を変えていないことの検査。
// 基準は、移す前の app.js の pose で作った固定値（tests/fixtures/pose_golden.json。状態の組ごとの sha256）。
import fs from 'fs'; import path from 'path';
import { loadCore, playwright, URL_, ROOT, check, done } from './lib.mjs';
import { sweep } from './fixtures/pose_sweep.mjs';
const C = loadCore();
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/pose_golden.json'), 'utf8'));
check('core が pose を公開している', typeof C.pose === 'function');
const got = sweep(C, (f) => C.pose(f));
for (const k of Object.keys(golden)) check(`姿勢の全フレームが移す前と一致：${k}（${golden[k].split(':')[1]} 件）`, got[k] === golden[k], `${got[k]} / ${golden[k]}`);
check('固定値の組の数が掃引の組の数と同じ（組の取りこぼしがない）', Object.keys(golden).length === Object.keys(got).length, `${Object.keys(golden).length} / ${Object.keys(got).length}`);
// 同じ入力で 2 回呼んでも同じで、入力を書き換えない（純粋）
{ const f = { side: 0, facing: 1, x: 400, y: C.GROUND, vx: 0, vy: 0, sf: 10, hp: 100, meter: 0, move: 'heavy', state: 'attack' };
  const snap = JSON.stringify(f); const a = JSON.stringify(C.pose(f)), b = JSON.stringify(C.pose(f));
  check('pose は同じ入力で同じ結果を返し、入力を書き換えない', a === b && JSON.stringify(f) === snap); }
// 描画側（ブラウザ）の pose(f, true) が core の pose と一致する（補正なしの値）。ko 以外は、補正ありでも一致する
const { chromium } = playwright();
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1280, height: 764 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL_ + '?seed=9'); await page.waitForTimeout(400);
await page.keyboard.press('Enter'); await page.waitForTimeout(200); await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.state().match && window.__game.state().match.phase === 'fight', null, { timeout: 8000 });
const r = await page.evaluate(() => {
  const g = window.__game, m = g.S.match, res = [];
  const states = [['idle', null], ['walk', null], ['jump', null], ['guard', null], ['hitstun', null], ['win', null], ['attack', 'light'], ['attack', 'heavy'], ['attack', 'super'], ['ko', null]];
  for (const [state, move] of states) for (const sf of [0, 7, 19, 33]) for (const facing of [1, -1]) {
    const f = m.f[0]; Object.assign(f, { state, move, sf, facing, x: 640, y: 600, vx: 1, vy: 0 });
    const a = JSON.stringify(window.Core.pose(f)), raw = JSON.stringify(g.pose(f, true)), shown = JSON.stringify(g.pose(f));
    res.push({ state, move, sf, facing, rawSame: a === raw, shownSame: a === shown });
  }
  return res;
});
check('描画側の pose(f, true) が core の pose と一致する（全 80 件）', r.length === 80 && r.every((x) => x.rawSame), `一致しない: ${r.filter((x) => !x.rawSame).map((x) => x.state + x.sf).join(',') || 'なし'}`);
check('ko 以外は、描画側の補正ありの pose も core と一致する（画面の中央のとき）', r.filter((x) => x.state !== 'ko').every((x) => x.shownSame));
check('ページの例外 0 件', errors.length === 0, errors.join(' | '));
await browser.close();
done('pose_core');
