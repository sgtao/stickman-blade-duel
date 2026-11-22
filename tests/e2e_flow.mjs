// 合格条件 2・9（と 8 のスロー）：キー操作だけで通しの流れ、エラー 0、効果音と消音
import { playwright, URL_, check, done } from './lib.mjs';
const { chromium } = playwright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL_ + '?seed=5');
const st = () => page.evaluate(() => window.__game.state());
const wait = (ms) => page.waitForTimeout(ms);
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(50); } return false; }

check('タイトル画面から始まる', (await st()).screen === 'title');
await page.keyboard.press('Enter');
check('Enter で強さ選択へ', (await st()).screen === 'select');
const labels = await page.$$eval('#scrSelect .btn', bs => bs.map(b => [b.dataset.level, b.childNodes[0].textContent.trim()]));
check('強さのボタンの文言が 弱い・普通・強い', JSON.stringify(labels) === JSON.stringify([['weak', '弱い'], ['normal', '普通'], ['strong', '強い']]), JSON.stringify(labels));
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
let s = await st();
check('→ と Enter で「強い」を選び対戦へ', s.screen === 'fight' && s.level === 'strong', s.level);
check('対戦に入るとファイト前の導入', await until(async () => (await st()).match.phase === 'fight', 5000));

// 8 種の操作（キー）
await page.evaluate(() => { window.__game.S.cpu.decide = () => window.Core.emptyInput(); }); // 操作の確認中は CPU を止める
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); const v = await st(); await page.keyboard.up(key); return v; };
s = await st(); const x0 = s.match.f[0].x;
let v = await hold('KeyD', 300); check('D：右へ動く', v.match.f[0].x > x0 + 20, `${x0}→${v.match.f[0].x}`);
const x1 = v.match.f[0].x; v = await hold('KeyA', 300); check('A：左へ動く', v.match.f[0].x < x1 - 15, `${x1}→${v.match.f[0].x}`);
await page.keyboard.press('KeyW'); await wait(120); v = await st(); check('W：ジャンプ', v.match.f[0].y < 590, 'y ' + v.match.f[0].y); await wait(800);
v = await hold('KeyS', 200); check('S：ガード', v.match.f[0].state === 'guard', v.match.f[0].state); await wait(100);
await page.keyboard.down('KeyJ'); await wait(40); v = await st(); await page.keyboard.up('KeyJ'); check('J：弱攻撃', v.match.f[0].state === 'attack', v.match.f[0].state); await wait(600);
await page.keyboard.down('KeyK'); await wait(40); v = await st(); await page.keyboard.up('KeyK'); check('K：強攻撃', v.match.f[0].state === 'attack', v.match.f[0].state); await wait(900);
await page.evaluate(() => { window.__game.S.match.f[0].meter = 100; });
await page.keyboard.down('KeyL'); await wait(40); v = await st(); await page.keyboard.up('KeyL'); check('L：必殺技（ゲージ 100）', v.match.f[0].state === 'attack' && v.match.f[0].meter === 0, v.match.f[0].state); await wait(1300);
await page.keyboard.press('KeyP'); v = await st(); const fr = v.match.frame; await wait(300);
check('P：一時停止の画面になり、時間が止まる', v.screen === 'pause' && (await st()).match.frame === fr);
await page.keyboard.press('KeyP'); await wait(200); check('P：再開', (await st()).screen === 'fight' && (await st()).match.frame > fr);

// 消音（M キーとボタン）
v = await st(); const vol = v.master;
await page.keyboard.press('KeyM'); v = await st(); check('M：消音で出力の音量が 0', v.muted && v.master === 0, 'master ' + v.master);
await page.keyboard.press('KeyM'); v = await st(); check('M：もう一度で戻る', !v.muted && v.master === vol && vol > 0, 'master ' + v.master);
await page.click('#btnMute'); v = await st(); check('消音ボタン：音量 0', v.master === 0);
await page.click('#btnMute'); v = await st(); check('消音ボタン：戻る', v.master > 0);

// 残りは自動の「強い」に操作させ、速めて最後まで流す。スローの長さを実時間で測る
await page.evaluate(() => {
  const g = window.__game; g.S.cpu = new window.Core.AI('strong', 99); g.S.auto = new window.Core.AI('strong', 7); g.debug.speed = 6;
  window.__slow = { min: 1, ms: 0, last: performance.now() };
  setInterval(() => { const n = performance.now(); const sl = window.__slow; if (g.S.timeScale <= 0.5) sl.ms += n - sl.last; sl.min = Math.min(sl.min, g.S.timeScale); sl.last = n; }, 20);
});
const ended = await until(async () => (await st()).screen === 'result', 90000);
check('決着の画面まで進む', ended);
v = await st();
check('決着：2 本先取か 3 ラウンドで終わっている', v.match.phase === 'matchEnd' && (Math.max(...v.match.wins) === 2 || v.match.round === 3), JSON.stringify(v.match.wins));
const slow = await page.evaluate(() => window.__slow);
const ko = v.sfx.ko > 0;
check('KO の一撃でスロー（倍率 0.5 以下が 1 秒以上）', ko && (slow.min <= 0.5 && slow.ms >= 1000 * Math.min(1, v.sfx.ko)), `min ${slow.min} ${Math.round(slow.ms)}ms, ko ${v.sfx.ko}`);
for (const k of ['swing', 'hit', 'block', 'lightning', 'ko']) check(`効果音「${k}」が鳴った`, v.sfx[k] > 0, String(v.sfx[k]));
const resultText = await page.textContent('#resultText');
const expect = v.match.winner === 0 ? 'YOU WIN' : v.match.winner === 1 ? 'YOU LOSE' : 'DRAW';
const scoreText = await page.textContent('#resultScore');
check('決着の表示が勝敗と一致', resultText === expect, `${resultText} / winner ${v.match.winner}`);
check('決着の本数の表示が一致', scoreText.startsWith(`${v.match.wins[0]} - ${v.match.wins[1]}`), scoreText);
const lvShown = await page.evaluate(() => document.querySelector('#resultScore').textContent);
check('決着の表示の強さが選んだもの（強い）', /強い/.test(lvShown), lvShown);
await page.evaluate(() => { window.__game.debug.speed = 1; window.__game.S.auto = null; });
await page.keyboard.press('Enter');
v = await st();
check('Enter で「もう一度」→ 次の対戦が始まる', v.screen === 'fight' && v.match.round === 1 && v.match.wins[0] === 0 && v.match.frame < 60, `frame ${v.match.frame}`);
await wait(500);
check('コンソールのエラーと例外が 0 件', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
done('e2e_flow');
