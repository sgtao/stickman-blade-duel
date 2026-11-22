// 合格条件 3：試合の規則と操作の単体検査
import { loadCore, check, done } from './lib.mjs';
const C = loadCore();
const E = () => C.emptyInput();
const inp = (o) => Object.assign(E(), o);
function fightReady(seed = 1) { const m = new C.Match({ seed }); for (let i = 0; i < C.INTRO_FRAMES; i++) m.step([E(), E()]); return m; }
function run(m, n, a, b) { const evs = []; for (let i = 0; i < n; i++) evs.push(...m.step([a ? a(i) : E(), b ? b(i) : E()])); return evs; }
function place(m, x0, x1) { m.f[0].x = x0; m.f[1].x = x1; }

{ const m = new C.Match({ seed: 3 });
  check('開始：1 ラウンド目・導入・体力 100・60 秒', m.round === 1 && m.phase === 'intro' && m.f[0].hp === 100 && m.f[1].hp === 100 && m.timer === 60 * 60); }
{ const m = fightReady(); check('導入の後に対戦の段に入る', m.phase === 'fight'); }
{ const m = fightReady(); const x = m.f[0].x; run(m, 10, () => inp({ right: true })); check('右：右へ動く', m.f[0].x > x + 30, `${x} -> ${m.f[0].x}`); }
{ const m = fightReady(); const x = m.f[0].x; run(m, 10, () => inp({ left: true })); check('左：左へ動く', m.f[0].x < x - 25, `${x} -> ${m.f[0].x}`); }
{ const m = fightReady(); run(m, 1, () => inp({ jump: true })); run(m, 8); const up = m.f[0].y < C.GROUND - 50; run(m, 60); check('ジャンプ：浮いて、着地する', up && m.f[0].y === C.GROUND && m.f[0].state === 'idle'); }
{ const m = fightReady(); run(m, 3, () => inp({ guard: true })); check('ガード：押している間はガードの状態', m.f[0].state === 'guard'); run(m, 2); check('ガード：離すと戻る', m.f[0].state === 'idle'); }
{ const m = fightReady(); place(m, 500, 600); run(m, 1, () => inp({ light: true })); check('弱攻撃：攻撃の状態になる', m.f[0].state === 'attack' && m.f[0].move === 'light'); run(m, 20); check('弱攻撃：当たると 6 減る', m.f[1].hp === 94, 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 500, 640); run(m, 1, () => inp({ heavy: true })); run(m, 40); check('強攻撃：当たると 14 減る', m.f[1].hp === 86, 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 500, 640); const evs = run(m, 40, (i) => inp({ heavy: i === 0 }), () => inp({ guard: true }));
  check('ガード：強攻撃を受けても削りの 2 だけ', m.f[1].hp === 98 && evs.some(e => e.type === 'block'), 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 500, 600); run(m, 30, (i) => inp({ light: i === 0 }), () => inp({ guard: true })); check('ガード：弱攻撃の削りは 0', m.f[1].hp === 100); }
{ const m = fightReady(); place(m, 400, 1000); run(m, 1, () => inp({ super: true })); check('必殺技：ゲージ不足では出ない', m.f[0].state !== 'attack');
  m.f[0].meter = 100; run(m, 1); run(m, 1, () => inp({ super: true })); const st = m.f[0].state === 'attack' && m.f[0].move === 'super' && m.f[0].meter === 0;
  const evs = run(m, 70); check('必殺技：ゲージ 100 で出て、ゲージが 0 になる', st); check('必殺技：600 px 先に稲妻が当たり 28 減る', m.f[1].hp === 72 && evs.some(e => e.type === 'lightning'), 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 400, 900); m.f[0].meter = 100; run(m, 1, () => inp({ super: true })); run(m, 14); run(m, 1, null, () => inp({ jump: true })); run(m, 60);
  check('必殺技：跳んでかわせる', m.f[1].hp === 100, 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 500, 600); m.f[1].hp = 5; const evs = run(m, 20, (i) => inp({ light: i === 0 }));
  check('KO：体力 0 でラウンド終了、1 本取る', m.phase === 'roundEnd' && m.wins[0] === 1 && evs.some(e => e.type === 'ko')); }
{ const m = fightReady(); m.timer = 2; m.f[1].hp = 50; const evs = run(m, 3);
  check('時間切れ：体力の多いほうが 1 本取る', m.wins[0] === 1 && m.wins[1] === 0 && evs.some(e => e.type === 'timeup')); }
{ const m = fightReady(); m.timer = 2; const evs = run(m, 3); check('時間切れ：同じ体力なら引き分けで本数は動かない', m.wins[0] === 0 && m.wins[1] === 0 && evs.some(e => e.type === 'timeup' && e.winner === 'draw')); }
function finishRound(m, winner) { // winner: 0, 1, 'draw'
  while (m.phase !== 'fight') m.step([E(), E()]);
  m.timer = 1; if (winner === 0) m.f[1].hp = 10; else if (winner === 1) m.f[0].hp = 10;
  m.step([E(), E()]); for (let i = 0; i < C.ROUND_END_FRAMES + 1 && m.phase !== 'matchEnd' && m.phase !== 'intro'; i++) m.step([E(), E()]);
}
{ const m = new C.Match({ seed: 1 }); finishRound(m, 0); const r2 = m.round; finishRound(m, 0);
  check('2 本先取で決着（2-0 で 2 ラウンドで終わる）', r2 === 2 && m.phase === 'matchEnd' && m.winner === 0 && m.round === 2); }
{ const m = new C.Match({ seed: 1 }); finishRound(m, 0); finishRound(m, 1); finishRound(m, 1);
  check('1-1 なら 3 ラウンド目で決着', m.phase === 'matchEnd' && m.winner === 1 && m.round === 3); }
{ const m = new C.Match({ seed: 1 }); finishRound(m, 'draw'); finishRound(m, 'draw'); finishRound(m, 'draw');
  check('引き分けが続いても 3 ラウンドで打ち切り、引き分け', m.phase === 'matchEnd' && m.winner === 'draw' && m.round === 3); }
{ const m = new C.Match({ seed: 1 }); finishRound(m, 1); finishRound(m, 'draw'); finishRound(m, 'draw');
  check('3 ラウンド後は本数の多いほうの勝ち（1-0）', m.phase === 'matchEnd' && m.winner === 1); }
{ const m = fightReady(); m.paused = true; const fr = m.frame, x = m.f[0].x; run(m, 30, () => inp({ right: true }));
  check('一時停止：止めている間は進まない', m.frame === fr && m.f[0].x === x); m.paused = false; run(m, 5, () => inp({ right: true })); check('一時停止：解除で再開', m.frame === fr + 5); }
{ const m = fightReady(); check('背景：1 ラウンド目は宇宙の街', m.stage() === 'space'); finishRound(m, 0); while (m.phase !== 'intro') m.step([E(), E()]); check('背景：2 ラウンド目は火山', m.stage() === 'volcano'); }
done('rules.test');
