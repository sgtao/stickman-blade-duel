// 合格条件 8：演出の発生、背景 2 種の色、8 枚の画像を shots/ に出す
import { playwright, URL_, ROOT, check, done } from './lib.mjs';
import path from 'path';
import fs from 'fs';
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
  const r = {}; for (const k of ['space', 'volcano', 'day']) { const c = window.__game.BG[k]; if (!c) { r[k] = null; continue; } const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let R = 0, B = 0, Y = 0; for (let i = 0; i < d.length; i += 4) { R += d[i]; B += d[i + 2]; Y += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; } const n = d.length / 4; r[k] = { R: R / n, B: B / n, Y: Y / n }; } return r; });
check('宇宙の街：平均色は青 > 赤', means.space.B > means.space.R, JSON.stringify(means.space));
check('火山：平均色は赤 > 青', means.volcano.R > means.volcano.B, JSON.stringify(means.volcano));
// C2：昼の背景（平均輝度 0.2126R+0.7152G+0.0722B の画素平均）
check('昼：背景がある', !!means.day, JSON.stringify(means.day));
check('昼：平均色は青 > 赤', !!means.day && means.day.B > means.day.R, JSON.stringify(means.day));
check('昼：平均輝度が 110 以上', !!means.day && means.day.Y >= 110, means.day ? 'Y ' + means.day.Y.toFixed(1) : '');
check('昼：宇宙・火山のどちらより 50 以上明るい', !!means.day && means.day.Y >= Math.max(means.space.Y, means.volcano.Y) + 50,
  means.day ? `昼 ${means.day.Y.toFixed(1)} / 宇宙 ${means.space.Y.toFixed(1)} / 火山 ${means.volcano.Y.toFixed(1)}` : '');
await page.waitForTimeout(300); await snap(page, '01_title.png');
await page.keyboard.press('Enter'); await page.waitForTimeout(250); await snap(page, '02_select.png');
await page.keyboard.press('Enter');
await until(page, async () => (await st(page)).match.phase === 'fight');
await page.evaluate(() => { const g = window.__game; g.S.auto = new window.Core.AI('normal', 3); });
await page.waitForTimeout(1600); await snap(page, '03_fight_day.png');
check('1 ラウンド目の背景は昼の山', (await st(page)).stage === 'day');
// 夜の都会（宇宙の街の絵。2 ラウンド目）
await page.evaluate(() => { const g = window.__game; g.S.match.startRound(); });
await until(page, async () => (await st(page)).match.phase === 'fight');
await page.waitForTimeout(1500); await snap(page, '04_fight_space.png');
check('2 ラウンド目の背景は夜の都会（space）', (await st(page)).stage === 'space');
// 火山地帯（3 ラウンド目）
await page.evaluate(() => { const g = window.__game; g.S.match.startRound(); });
await until(page, async () => (await st(page)).match.phase === 'fight');
await page.waitForTimeout(1500); await snap(page, '04b_fight_volcano.png');
check('3 ラウンド目の背景は火山地帯', (await st(page)).stage === 'volcano');
// C2 見やすさ：背景だけの canvas（棒人間・HUD なし）。棒人間が立つ帯（x は 420±80 と 860±80、y は 400〜600）の画素の中央値の相対輝度（WCAG）と、
// 体の色（P1 は #f2f6ff、P2 は src/app.js の COLORS[1].body の #ff5a64）、体力ゲージの文字（YOU・CPU）とタイマーの文字（白）との比
// 文字の箱は drawHUD（src/app.js）と同じ座標・フォントから measureText で求める（決め打ちしない）
const contrast = await page.evaluate(() => {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const relL = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const hexRGB = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hexL = (h) => relL(...hexRGB(h));
  const median = (a) => { const s = a.slice().sort((p, q) => p - q), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const ratio = (A, B) => (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
  const cvs = window.__game.BG.day; const d = cvs.getContext('2d').getImageData(0, 0, cvs.width, cvs.height).data;
  const at = (x, y) => { const i = (y * cvs.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const pix = (x0, x1, y0, y1) => { const a = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a.push(at(x, y)); return a; };
  const medRGB = (a) => [0, 1, 2].map(c => median(a.map(p => p[c])));
  const medL = (a) => median(a.map(p => relL(...p)));
  const mix = (fg, al, bg) => fg.map((v, j) => al * v + (1 - al) * bg[j]);
  // 文字の箱。drawHUD と同じ：textBaseline は 'top'、x は textAlign、フォントは hudK（k）倍。k は drawHUD の式（canvas の幅から）
  const k = Math.max(1, Math.min(2.1, 760 / document.querySelector('#game').getBoundingClientRect().width));
  const cx = document.createElement('canvas').getContext('2d'); cx.textBaseline = 'top';
  const ink = (font, text, align, x, y) => { cx.font = font; cx.textAlign = align; const m = cx.measureText(text);
    const l = align === 'right' ? x - m.width : align === 'center' ? x - m.width / 2 : x;
    return [l, y - m.actualBoundingBoxAscent, l + m.width, y + m.actualBoundingBoxDescent]; };
  const union = (bs) => [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))];
  const area = (b) => pix(Math.max(0, Math.floor(b[0])), Math.min(cvs.width, Math.ceil(b[2])), Math.max(0, Math.floor(b[1])), Math.min(cvs.height, Math.ceil(b[3])));
  const f20 = `800 ${Math.round(20 * k)}px system-ui, sans-serif`;
  const B = {
    you: ink(f20, 'YOU', 'left', 50, 70),
    cpu: union(['弱い', '普通', '強い'].map(lv => ink(f20, 'CPU（' + lv + '）', 'right', 1230, 70))),
    timer: ink('900 44px system-ui, sans-serif', '88', 'center', 640, 28),
    round: ink(`700 ${Math.round(13 * k)}px system-ui, sans-serif`, 'ROUND 1', 'center', 640, 90),
    gauge: [47, 31, 553, 63], // 体力ゲージの地（drawHUD の bar(50,34,500,26) と bar(730,34,500,26) の外枠 3 px の外側）
  };
  const bgL = (b) => medL(area(b)), bgRGB = (b) => medRGB(area(b));
  const band = medL([...pix(340, 501, 400, 601), ...pix(780, 941, 400, 601)]);
  // ROUND は rgba(220,225,255,0.8) で描く。地の色と alpha で重ねた色で比べる
  // 昼の HUD の板（rgba(10,18,44,0.55)）は描画時に文字の下へ重ねる。文字の実際の地は、背景に板を重ねた色
  const plated = (b) => mix([10, 18, 44], 0.55, bgRGB(b));
  const roundEff = mix([220, 225, 255], 0.8, plated(B.round));
  // 体力ゲージは地の上の backplate rgba(5,6,16,0.8) の上に、塗り（全 6 色）を描く
  const gBack = mix([5, 6, 16], 0.8, bgRGB(B.gauge));
  const fills = ['#9af0ff', '#2fa8d8', '#ff9aa2', '#d02f45', '#ffd36b', '#e0702a'];
  const boxes = Object.fromEntries(Object.entries(B).map(([n, b]) => [n, b.map(v => Math.round(v))]));
  return { k, boxes, band,
    p1: ratio(hexL('#f2f6ff'), band), p2: ratio(hexL('#ff5a64'), band),
    you: ratio(hexL('#e8f6ff'), relL(...plated(B.you))), cpu: ratio(hexL('#ffd0d4'), relL(...plated(B.cpu))),
    timer: Math.min(ratio(hexL('#ffffff'), bgL(B.timer)), ratio(hexL('#ffd45e'), bgL(B.timer))),
    round: ratio(relL(...roundEff), relL(...plated(B.round))),
    gauge: Math.min(...fills.map(c => ratio(hexL(c), relL(...gBack)))) };
});
console.log('  文字の箱（論理 px）k=' + contrast.k.toFixed(2) + ' ' + JSON.stringify(contrast.boxes));
check(`昼：棒人間が立つ帯の中央値（相対輝度 ${contrast.band.toFixed(3)}）と P1 の体の色（#f2f6ff）の比が 3 以上`, contrast.p1 >= 3, ' 比 ' + contrast.p1.toFixed(2));
check('昼：同じ帯と P2 の体の色（#ff5a64）の比が 3 以上', contrast.p2 >= 3, '比 ' + contrast.p2.toFixed(2));
check('昼：体力ゲージの文字（YOU・CPU）と背景の比が 3 以上', contrast.you >= 3 && contrast.cpu >= 3, `YOU ${contrast.you.toFixed(2)} / CPU ${contrast.cpu.toFixed(2)}`);
check('昼：タイマーの文字（白・残り 10 秒以下の黄）と背景の比が 3 以上', contrast.timer >= 3, '最小比 ' + contrast.timer.toFixed(2));
check('昼：ROUND の文字（alpha 0.8）と背景の比が 3 以上', contrast.round >= 3, '比 ' + contrast.round.toFixed(2));
check('昼：体力ゲージの塗り（全 6 色）と、その地の比が 3 以上', contrast.gauge >= 3, '最小比 ' + contrast.gauge.toFixed(2));
{ const url = await page.evaluate(() => window.__game.BG.day.toDataURL('image/png')); fs.writeFileSync(path.join(shots, 'day_bg_only.png'), Buffer.from(url.split(',')[1], 'base64')); }
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
// M4：結果画面の注記（#resultNote）と、スコア文字・注記の比（WCAG）。背景は、文字だけを透明にして撮った画面の、文字の箱の中央値の相対輝度で測る
{
  const info = await page.evaluate(() => {
    const sc = document.querySelector('#resultScore'); const nt = document.querySelector('#resultNote');
    const rc = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    return { score: sc.textContent, note: nt ? nt.textContent : '', scoreColor: getComputedStyle(sc).color, noteColor: nt ? getComputedStyle(nt).color : '', scoreBox: rc(sc), noteBox: rc(nt) };
  });
  // 文字だけを透明にして、文字の箱の画素（背景）を撮る
  await page.evaluate(() => { const s = document.createElement('style'); s.id = '__hidetext'; s.textContent = '#resultScore, #resultScore *, #resultNote { color: transparent !important; text-shadow: none !important; }'; document.head.appendChild(s); });
  const shotOf = async (b) => b ? (await page.screenshot({ clip: { x: b[0], y: b[1], width: b[2], height: b[3] } })).toString('base64') : '';
  const bgScore = await shotOf(info.scoreBox), bgNote = await shotOf(info.noteBox);
  await page.evaluate(() => document.getElementById('__hidetext').remove());
  const ratioOf = async (b64, color) => b64 ? page.evaluate(async ({ b64, color }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const relL = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
    const L = []; for (let i = 0; i < d.length; i += 4) L.push(relL(d[i], d[i + 1], d[i + 2]));
    L.sort((a, b) => a - b); const med = L[Math.floor(L.length / 2)];
    const ratio = (A, B) => (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
    return { r: ratio(relL(...rgb(color)), med), bgL: med };
  }, { b64, color }) : { r: 0, bgL: 0 };
  const rs = await ratioOf(bgScore, info.scoreColor), rn = await ratioOf(bgNote, info.noteColor);
  check('結果：注記がある（2 本先取で決着、3 ラウンドで打ち切りは本数の多いほう）', info.note.includes('2 本先取で決着') && info.note.includes('3 ラウンド'), JSON.stringify(info.note));
  check('結果：スコア文字と背景の比が 3 以上', rs.r >= 3, `比 ${rs.r.toFixed(2)}（背景の中央値の輝度 ${rs.bgL.toFixed(3)}、文字 ${info.scoreColor}）`);
  check('結果：注記の文字と背景の比が 3 以上', rn.r >= 3, `比 ${rn.r.toFixed(2)}（背景の中央値の輝度 ${rn.bgL.toFixed(3)}、文字 ${info.noteColor}）`);
  check('結果：ボタンの上端の位置（注記を足す前の HEAD は 416.6 px。下がっていない）', (await page.evaluate(() => document.querySelector('#scrResult .btn').getBoundingClientRect().top)) <= 419, 'top ' + (await page.evaluate(() => document.querySelector('#scrResult .btn').getBoundingClientRect().top)).toFixed(1));
}
// M1：項目 20 の手順（1 本ずつ取り、3 ラウンド目に入る）を core の規則で再現する。2 本続けて取る旧手順は、決着になる
{
  const r = await page.evaluate(() => {
    const C = window.Core; const m = new C.Match({ seed: 1 });
    const endRound = (loser) => { m.phase = 'fight'; m.f[loser].hp = 0; m.checkRoundEnd(); m.afterRound(); };
    endRound(1); // 1 ラウンド目を自分が取る
    const afterR1 = { round: m.round, wins: m.wins.slice(), phase: m.phase };
    endRound(0); // 2 ラウンド目を CPU が取る
    return { afterR1, afterR2: { round: m.round, wins: m.wins.slice(), phase: m.phase } };
  });
  check('手順：1 本ずつ取ると 3 ラウンド目に入る', r.afterR2.round === 3 && r.afterR2.phase === 'intro' && r.afterR2.wins.join('-') === '1-1', JSON.stringify(r));
  const old = await page.evaluate(() => {
    const C = window.Core; const m = new C.Match({ seed: 1 });
    for (let i = 0; i < 2; i++) { m.phase = 'fight'; m.f[1].hp = 0; m.checkRoundEnd(); m.afterRound(); }
    return { round: m.round, phase: m.phase, wins: m.wins.slice() };
  });
  check('手順（旧）：2 本続けて取ると決着になり、3 ラウンド目は無い', old.phase === 'matchEnd' && old.round === 2, JSON.stringify(old));
}
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
  const outOfBox = [], overlaps = [], boxes = [], winPts = [];
  // sf 20 は刃を描く間（右端で刃の先が画面外へ出ていた場面）、sf 45 は刃を描かない結果画面
  for (const [outcome, side] of [['勝ち', 1], ['負け', 0]]) for (const round of [1, 2, 3]) for (const [edge, x] of [['右端', 1200], ['左端', 80]]) for (const sf of [20, 45]) {
    const facing = edge === '右端' ? -1 : 1;
    const r = await page.evaluate(({ side, round, x, facing, sf }) => {
      const g = window.__game, m = g.S.match;
      m.round = round; m.phase = 'matchEnd'; m.winner = 1 - side;
      for (const f of m.f) { f.state = 'idle'; f.sf = 0; f.y = 600; f.vx = 0; f.vy = 0; }
      const w = m.f[1 - side], f = m.f[side];
      w.x = x + facing * 90; w.facing = -facing; w.state = 'win'; w.sf = 30; // 勝ちの姿勢は 14 フレームで掲げ終わる。掲げ終えた後（sf 30）を描く
      f.state = 'ko'; f.sf = sf; f.x = x; f.facing = facing;
      return { stage: m.stage(), screen: g.S.screen, lose: g.pose(f), win: g.pose(w), sf: f.sf };
    }, { side, round, x, facing, sf });
    winPts.push(r.win);
    const lr = rect(r.lose, r.sf);
    const label = `${outcome}/${r.stage}/${edge}/sf${sf}`;
    const g = gap(drawn(r.lose, r.sf), drawn(r.win, 0));
    boxes.push(label + ' [' + lr.join(',') + '] 食い込み余裕 ' + g.toFixed(1) + 'px');
    if (lr[0] < 0 || lr[1] < 0 || lr[2] > Wc || lr[3] > Hc || r.screen !== 'result') outOfBox.push(label + ' [' + lr.join(',') + '] screen=' + r.screen);
    if (g < 0) overlaps.push(label + ' 食い込み ' + g.toFixed(1) + 'px');
  }
  check('結果画面：倒れた棒人間の外接矩形が canvas の内側に収まる（勝ち・負け × 背景 3 種 × 左右の端 × sf 20・45）', outOfBox.length === 0,
    outOfBox.length ? 'NG: ' + outOfBox.join(' ; ') : boxes.length + ' 通りすべて収まる');
  check('結果画面：倒れた棒人間が勝者に食い込まない（描く点どうしの間隔 ≥ 余白の和）', overlaps.length === 0,
    overlaps.length ? 'NG: ' + overlaps.join(' ; ') : boxes.join(' ; '));
  // 勝者の姿勢（win）：剣を頭上に真っすぐ掲げる（刃の先が頭より十分上で、腕と刃がほぼ垂直）。描く点はすべて canvas の内側
  const raisedBad = winPts.filter(p => !(p.tip[1] < p.head[1] - 100 && Math.abs(p.tip[0] - p.hand[0]) < 20 && Object.values(p).every(([x, y]) => x >= 0 && x <= Wc && y >= 0 && y <= Hc)));
  check('結果画面：勝者の姿勢（win）は剣を頭上に真っすぐ掲げ、描く点が canvas の内側に収まる', raisedBad.length === 0 && winPts.length === 24,
    raisedBad.length ? `NG ${raisedBad.length}/${winPts.length}: tip ${raisedBad[0].tip.map(Math.round)} head ${raisedBad[0].head.map(Math.round)} hand ${raisedBad[0].hand.map(Math.round)}` : `${winPts.length} 通り`);
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
// C1 勝者の喜び：勝者が剣を掲げた画像。名前は win_<勝った側>_round<ラウンド>.png（left＝P1 の自分、right＝CPU）。
// ラウンドを作って（HP を 0 にして KO）、勝者が win になり sf 40 に達したら debug.speed を 0 にして止め、その画面を撮る
async function winShot(name, round, side) {
  const p = await open({ viewport: { width: 1280, height: 764 } });
  await p.keyboard.press('Enter'); await p.waitForTimeout(250); await p.keyboard.press('Enter');
  await until(p, async () => (await st(p)).match.phase === 'fight');
  await p.evaluate(({ round, side }) => {
    const g = window.__game, m = g.S.match;
    g.S.auto = null; g.S.cpu.decide = () => window.Core.emptyInput();
    m.round = round; m.wins = round === 1 ? [0, 0] : round === 2 ? [1, 0] : [1, 1];
    for (const f of m.f) { f.state = 'idle'; f.sf = 0; f.y = 600; f.vx = 0; f.vy = 0; f.hp = 100; }
    m.f[1 - side].hp = 0;
  }, { round, side });
  const won = await until(p, async () => p.evaluate((s) => { const f = window.__game.S.match.f[s]; return f.state === 'win' && f.sf >= 40; }, side), 8000);
  await p.evaluate(() => { window.__game.debug.speed = 0; });
  const info = await p.evaluate((s) => { const g = window.__game, m = g.S.match; return { stage: m.stage(), state: m.f[s].state, sf: m.f[s].sf }; }, side);
  await p.screenshot({ path: path.join(shots, name) });
  check(`勝者の画像 ${name}：勝者（${side === 0 ? '左' : '右'}）が win で掲げている、背景は ${info.stage}`,
    won && info.state === 'win' && info.stage === ['day', 'space', 'volcano'][round - 1], JSON.stringify(info));
  await p.context().close();
}
await winShot('win_left_round1.png', 1, 0);
await winShot('win_right_round2.png', 2, 1);
await winShot('win_left_round3.png', 3, 0);
await winShot('win_right_round3.png', 3, 1);
// 昼の空に跳んだ棒人間（左 P1 と右 CPU）。空に溶けないかを目視する。速度 0 で止めて撮る
{
  const p = await open({ viewport: { width: 1280, height: 764 } });
  await p.keyboard.press('Enter'); await p.waitForTimeout(250); await p.keyboard.press('Enter');
  await until(p, async () => (await st(p)).match.phase === 'fight');
  await p.evaluate(() => {
    const g = window.__game, m = g.S.match;
    g.S.auto = null; g.S.cpu.decide = () => window.Core.emptyInput();
    m.round = 1; m.wins = [0, 0];
    m.f[0].state = 'jump'; m.f[0].y = 600 - 200; m.f[0].vy = 0; m.f[0].sf = 0; m.f[0].x = 420;
    m.f[1].state = 'jump'; m.f[1].y = 600 - 200; m.f[1].vy = 0; m.f[1].sf = 0; m.f[1].x = 860;
    g.debug.speed = 0;
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(shots, 'jump_day_round1.png') });
  await p.context().close();
}
// 昼（ラウンド 1）の必殺の稲妻と、当たった瞬間の火花。空・雲の上で見えるかを目で確かめる用の画像（検査の数には入れない）
{
  const p = await open({ viewport: { width: 1280, height: 764 } });
  await p.keyboard.press('Enter'); await p.waitForTimeout(250); await p.keyboard.press('Enter');
  await until(p, async () => (await st(p)).match.phase === 'fight');
  await p.evaluate(() => {
    const g = window.__game, m = g.S.match;
    g.S.auto = null; g.S.cpu.decide = () => window.Core.emptyInput();
    m.round = 1; m.wins = [0, 0]; m.f[0].meter = 100;
    m.f[0].x = 360; m.f[1].x = 900;
    for (const f of m.f) { f.state = 'idle'; f.sf = 0; f.y = 600; f.vx = 0; f.vy = 0; }
  });
  await p.waitForTimeout(100);
  const l0 = (await st(p)).sfx.lightning;
  await p.keyboard.press('KeyL');
  await until(p, async () => (await st(p)).sfx.lightning > l0, 3000);
  await p.screenshot({ path: path.join(shots, 'day_super_lightning.png') });
  await p.evaluate(() => {
    const g = window.__game, m = g.S.match;
    m.f[0].meter = 0; m.f[0].x = 560; m.f[1].x = 670; m.f[1].hp = 100;
    for (const f of m.f) { f.state = 'idle'; f.sf = 0; f.y = 600; f.vx = 0; f.vy = 0; }
  });
  await p.waitForTimeout(1200);
  await p.keyboard.press('KeyK');
  await until(p, async () => (await st(p)).parts >= 20, 3000);
  await p.screenshot({ path: path.join(shots, 'day_hit_spark.png') });
  await p.context().close();
}
await browser.close();
done('visual');
