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
// 満タンの SUPER ゲージ：点滅（金の不透明度 0.75〜1.0、sin(now*0.012)、周期約 524 ms）の明るい時と暗い時を 1 枚ずつ
// 撮影の直前にゲージの色を読み、明るい時と暗い時で金が変わっていることを確かめる（点滅が止まった場合に落ちる）
async function fullGaugeShot(name, sign) {
  await page.evaluate(() => { const g = window.__game; g.S.auto = null; g.S.cpu.decide = () => window.Core.emptyInput(); g.S.match.f[0].meter = 100; });
  await page.waitForFunction((s) => Math.sin(performance.now() * 0.012) * s > 0.9, sign, { polling: 16, timeout: 3000 });
  const px = await page.evaluate(() => { const c = window.__game.S; const cv = document.querySelector('#game'); const d = cv.getContext('2d').getImageData(200, 679, 1, 1).data; return { r: d[0], g: d[1], b: d[2], full: c.match.f[0].meter >= 100 }; });
  await snap(page, name);
  return px;
}
const gBright = await fullGaugeShot('13_super_full_bright.png', 1);
const gDark = await fullGaugeShot('13b_super_full_dark.png', -1);
check('満タンの SUPER ゲージは明るい時と暗い時で金の色が変わる（点滅が働く）', gBright.full && gDark.full && Math.abs(gBright.g - gDark.g) >= 40,
  `明るい時 RGB(${gBright.r},${gBright.g},${gBright.b}) 暗い時 RGB(${gDark.r},${gDark.g},${gDark.b})`);
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
// 結果画面：倒れた棒人間（ko、sf 40 以上で刃を描かない）の描く点の外接矩形が canvas の内側に収まり、勝者と重ならない
// 実際の場面: 右端は x=1200・倒れた側の向き -1、左端は x=80・向き +1（倒れた側は勝者の方を向いていた）。勝者は倒れた側から 90px 離れて立つ
// 外接矩形は描く点だけで取る（刃の先は sf 40 以上では描かないので除く）。余白は頭 13px（半径）、刃の先 14px（光の幅）、その他の線 5px
{
  const Wc = await page.evaluate(() => window.Core.W), Hc = await page.evaluate(() => window.Core.H);
  const rect = (pts, sf) => {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const k of Object.keys(pts).filter(k => k !== 'tip' || sf < 40)) {
      const [x, y] = pts[k], m = k === 'head' ? 13 : k === 'tip' ? 14 : 5;
      b[0] = Math.min(b[0], x - m); b[1] = Math.min(b[1], y - m); b[2] = Math.max(b[2], x + m); b[3] = Math.max(b[3], y + m);
    }
    return b.map(Math.round);
  };
  // 勝者との食い込み：倒れた側と勝者の、描く点どうしの間隔が、両方の余白の和より小さいと食い込み。
  // 外接矩形どうしで比べると、勝者の刃（上へ伸びる）が矩形を広げ、足元どうしの離れた場面まで重なりに見えるため、点で比べる
  const drawn = (pts, sf) => Object.keys(pts).filter(k => k !== 'tip' || sf < 40).map(k => ({ x: pts[k][0], y: pts[k][1], m: k === 'head' ? 13 : k === 'tip' ? 14 : 5 }));
  const gap = (A, B) => Math.min(...A.flatMap(a => B.map(b => Math.hypot(a.x - b.x, a.y - b.y) - a.m - b.m)));
  const outOfBox = [], overlaps = [], boxes = [];
  // sf 20 は刃を描く間（右端で刃の先が画面外へ出ていた場面）、sf 45 は刃を描かない結果画面
  for (const [outcome, side] of [['勝ち', 1], ['負け', 0]]) for (const round of [1, 2]) for (const [edge, x] of [['右端', 1200], ['左端', 80]]) for (const sf of [20, 45]) {
    const facing = edge === '右端' ? -1 : 1;
    const r = await page.evaluate(({ side, round, x, facing, sf }) => {
      const g = window.__game, m = g.S.match;
      m.round = round; m.phase = 'matchEnd'; m.winner = 1 - side;
      for (const f of m.f) { f.state = 'idle'; f.sf = 0; f.y = 600; f.vx = 0; f.vy = 0; }
      const w = m.f[1 - side], f = m.f[side];
      w.x = x + facing * 90; w.facing = -facing;
      f.state = 'ko'; f.sf = sf; f.x = x; f.facing = facing;
      return { stage: m.stage(), screen: g.S.screen, lose: g.pose(f), win: g.pose(w), sf: f.sf };
    }, { side, round, x, facing, sf });
    const lr = rect(r.lose, r.sf);
    const label = `${outcome}/${r.stage}/${edge}/sf${sf}`;
    const g = gap(drawn(r.lose, r.sf), drawn(r.win, 0));
    boxes.push(label + ' [' + lr.join(',') + '] 食い込み余裕 ' + g.toFixed(1) + 'px');
    if (lr[0] < 0 || lr[1] < 0 || lr[2] > Wc || lr[3] > Hc || r.screen !== 'result') outOfBox.push(label + ' [' + lr.join(',') + '] screen=' + r.screen);
    if (g < 0) overlaps.push(label + ' 食い込み ' + g.toFixed(1) + 'px');
  }
  check('結果画面：倒れた棒人間の外接矩形が canvas の内側に収まる（勝ち・負け × 背景 2 種 × 左右の端 × sf 20・45）', outOfBox.length === 0,
    outOfBox.length ? 'NG: ' + outOfBox.join(' ; ') : boxes.length + ' 通りすべて収まる');
  check('結果画面：倒れた棒人間が勝者に食い込まない（描く点どうしの間隔 ≥ 余白の和）', overlaps.length === 0,
    overlaps.length ? 'NG: ' + overlaps.join(' ; ') : boxes.join(' ; '));
  // 補正量の連続性：倒れた姿勢で sf を 30〜45 と 1 ずつ動かしたとき、補正後の体の x（hip）の変化は毎回 6px 以内（右端・左端）
  for (const [edge, x, facing] of [['右端', 1200, -1], ['左端', 80, 1]]) {
    const xs = await page.evaluate(({ x, facing }) => {
      const g = window.__game, f = g.S.match.f[0], r = [];
      for (let sf = 30; sf <= 45; sf++) { f.state = 'ko'; f.sf = sf; f.x = x; f.facing = facing; r.push(g.pose(f).hip[0]); }
      return r;
    }, { x, facing });
    const steps = xs.slice(1).map((v, i) => Math.abs(v - xs[i]));
    const mx = Math.max(...steps);
    check(`結果画面：倒れた姿勢（${edge}）で sf を 1 ずつ動かしたとき、体の x の変化は毎回 6px 以内`, mx <= 6,
      `最大 ${mx.toFixed(1)}px（sf 30〜45）`);
  }
  // 画面内に収まる位置では補正は 0（描画の点が補正なしの点と同じ）
  const same = await page.evaluate(() => { const g = window.__game, m = g.S.match; const f = m.f[0]; f.state = 'ko'; f.sf = 45; f.x = 640; f.facing = 1; return JSON.stringify(g.pose(f)) === JSON.stringify(g.pose(f, true)); });
  check('結果画面：画面内に収まる倒れ姿勢は補正 0', same);
}
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
