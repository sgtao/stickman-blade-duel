// 合格条件 8：演出の発生、背景 2 種の色、8 枚の画像を shots/ に出す
import { playwright, URL_, ROOT, check, done } from './lib.mjs';
import path from 'path';
const { chromium } = playwright();
const shots = path.join(ROOT, 'shots');
const browser = await chromium.launch();
const errors = [];
async function open(opts, q = '') {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_ + '?seed=9' + q); await page.waitForTimeout(400); return page;
}
const st = (p) => p.evaluate(() => window.__game.state());
async function until(p, fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await p.waitForTimeout(40); } return false; }
const snap = (p, name) => p.screenshot({ path: path.join(shots, name) });

const page = await open({ viewport: { width: 1280, height: 764 } });
// 背景の平均色
const means = await page.evaluate(() => {
  const r = {}; for (const k of ['space', 'volcano']) { const c = window.__game.BG[k]; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let R = 0, B = 0; for (let i = 0; i < d.length; i += 4) { R += d[i]; B += d[i + 2]; } r[k] = { R: R / (d.length / 4), B: B / (d.length / 4) }; } return r; });
check('宇宙の街：平均色は青 > 赤', means.space.B > means.space.R, JSON.stringify(means.space));
check('火山：平均色は赤 > 青', means.volcano.R > means.volcano.B, JSON.stringify(means.volcano));
await page.waitForTimeout(300); await snap(page, '01_title.png');
await page.keyboard.press('Enter'); await page.waitForTimeout(250); await snap(page, '02_select.png');
await page.keyboard.press('Enter');
await until(page, async () => (await st(page)).match.phase === 'fight');
await page.evaluate(() => { const g = window.__game; g.S.auto = new window.Core.AI('normal', 3); });
await page.waitForTimeout(1600); await snap(page, '03_fight_space.png');
check('1 ラウンド目の背景は宇宙の街', (await st(page)).stage === 'space');
// 火山（2 ラウンド目）
await page.evaluate(() => { const g = window.__game; g.S.match.startRound(); });
await until(page, async () => (await st(page)).match.phase === 'fight');
await page.waitForTimeout(1500); await snap(page, '04_fight_volcano.png');
check('2 ラウンド目の背景は火山', (await st(page)).stage === 'volcano');
// 必殺技の稲妻
await page.evaluate(() => { const g = window.__game, m = g.S.match; g.S.auto = null; g.S.cpu.decide = () => window.Core.emptyInput();
  m.f[0].x = 360; m.f[1].x = 900; m.f[0].meter = 100; for (const f of m.f) { f.state = 'idle'; f.sf = 0; f.y = 600; f.vx = 0; f.vy = 0; } });
await page.waitForTimeout(100);
await page.keyboard.press('KeyL');
const l0 = (await st(page)).sfx.lightning;
await until(page, async () => (await st(page)).sfx.lightning > l0, 3000);
const sv = await st(page);
await snap(page, '05_super_lightning.png');
check('必殺技が当たった瞬間に稲妻が 4 本以上', sv.bolts >= 4, 'bolts ' + sv.bolts);
await page.waitForTimeout(1200);
// 決着の一撃：スローと揺れと火花
await page.evaluate(() => { const g = window.__game, m = g.S.match; m.f[0].x = 560; m.f[1].x = 670; m.f[1].hp = 4; for (const f of m.f) { f.state = 'idle'; f.sf = 0; f.y = 600; } });
await page.waitForTimeout(60);
await page.keyboard.press('KeyK');
await until(page, async () => (await st(page)).timeScale < 1, 3000);
const kv = await st(page);
check('決着の一撃：スロー（倍率 0.5 以下）', kv.timeScale <= 0.5, 'timeScale ' + kv.timeScale);
check('決着の一撃：画面の揺れ', kv.shake > 2, 'shake ' + kv.shake.toFixed(1));
check('命中で火花', kv.parts >= 20, 'parts ' + kv.parts);
await page.waitForTimeout(250); await snap(page, '06_ko_slowmo.png');
await page.waitForTimeout(1800);
const ko = await page.evaluate(() => { const m = window.__game.S.match; const f = m.f.find(x => x.state === 'ko'); return f ? { sf: f.sf, phase: m.phase } : null; });
check('KO された側は倒れる姿勢まで進む（ko の経過 30 フレーム以上）', ko && ko.sf >= 30, JSON.stringify(ko));
await snap(page, '06b_ko_down.png');
// 決着の画面
await page.evaluate(() => { const g = window.__game; g.debug.speed = 8; g.S.auto = new window.Core.AI('strong', 1); });
await until(page, async () => (await st(page)).match.phase === 'matchEnd', 60000);
await page.evaluate(() => { window.__game.debug.speed = 1; });
await until(page, async () => (await st(page)).screen === 'result', 10000);
await page.waitForTimeout(400); await snap(page, '07_result.png');
check('決着の画面', (await st(page)).screen === 'result');
// スマホ縦・横（対戦中）
for (const [name, w, h] of [['08_mobile_portrait.png', 390, 844], ['09_mobile_landscape.png', 844, 390], ['10_mobile_small_landscape.png', 667, 375]]) {
  const p = await open({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  if (w === 390) await snap(p, '08a_mobile_title.png');
  await p.tap('[data-act=start]'); await p.waitForTimeout(150); await p.tap('[data-level=normal]');
  await until(p, async () => (await st(p)).match.phase === 'fight');
  await p.waitForTimeout(900); await snap(p, name);
}
check('コンソールのエラーと例外が 0 件', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
done('visual');
