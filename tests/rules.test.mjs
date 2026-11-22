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
// M10（B3・B4）：斜めジャンプと必殺のゲージ条件
{ const m = fightReady(); place(m, 400, 900); const x0 = m.f[0].x; let minY = C.GROUND; run(m, 1, () => inp({ jump: true, right: true }));
  for (let i = 0; i < 20; i++) { m.step([inp({ right: true }), E()]); minY = Math.min(minY, m.f[0].y); }
  check('B3：右とジャンプを同時に押すと、右に跳ぶ（x と y が両方変わる）', m.f[0].x > x0 + 40 && minY < C.GROUND - 40, `x ${x0}->${m.f[0].x}, 最高 y ${minY}`); }
{ const m = fightReady(); place(m, 400, 900); const x0 = m.f[0].x; let minY = C.GROUND; run(m, 1, () => inp({ jump: true, left: true }));
  for (let i = 0; i < 20; i++) { m.step([inp({ left: true }), E()]); minY = Math.min(minY, m.f[0].y); }
  check('B3：左とジャンプを同時に押すと、左に跳ぶ（x と y が両方変わる）', m.f[0].x < x0 - 40 && minY < C.GROUND - 40, `x ${x0}->${m.f[0].x}, 最高 y ${minY}`); }
{ const m = fightReady(); place(m, 400, 900); const x0 = m.f[0].x; run(m, 1, () => inp({ jump: true })); run(m, 20); check('B3：ジャンプだけなら横に動かない', m.f[0].x === x0); }
{ const m = fightReady(); place(m, 400, 900); m.f[0].meter = 99; run(m, 1, () => inp({ super: true })); run(m, 1); check('B4：ゲージ 99 では必殺が出ない（無効）', m.f[0].state !== 'attack' && m.f[0].meter === 99, m.f[0].state); }
{ const m = fightReady(); place(m, 400, 900); m.f[0].meter = 100; run(m, 1, () => inp({ super: true })); check('B4：ゲージ 100 で必殺が出る', m.f[0].state === 'attack' && m.f[0].move === 'super'); }
{ const m = fightReady(); place(m, 400, 900); m.f[0].meter = 99; m.f[0].state = 'attack'; m.f[0].move = 'light'; m.f[0].sf = C.MOVES.light.startup + C.MOVES.light.active + C.MOVES.light.recovery - 3;
  run(m, 1, () => inp({ super: true })); m.f[0].meter = 100; run(m, 20);
  check('B4：ゲージ 99 で押した必殺は、後で 100 になっても出ない', m.f[0].stats.supers === 0, 'supers ' + m.f[0].stats.supers); }
// 審査の指摘（B3）：方向キーがジャンプと数フレームずれても斜めに跳ぶ。ただし遅すぎる方向入力は空中で効かない
for (const n of [1, 2, 3, 5]) {
  const m = fightReady(); place(m, 400, 900); const x0 = m.f[0].x;
  for (let i = 0; i < 20; i++) m.step([inp({ jump: i === 0, right: i >= n }), E()]);
  check(`B3：右を押すのがジャンプより ${n} フレーム遅れても、右に跳ぶ`, m.f[0].x > x0 + 30, `x ${x0}->${m.f[0].x}`);
}
{ const m = fightReady(); place(m, 400, 900); const x0 = m.f[0].x;
  for (let i = 0; i < 20; i++) m.step([inp({ jump: i === 0, right: i >= 12 }), E()]);
  check('B3：空中で遅れて押した方向は効かない（ジャンプの軌道を保つ）', m.f[0].x === x0, `x ${x0}->${m.f[0].x}`); }
{ const m = fightReady(); place(m, 400, 900); const x0 = m.f[0].x;
  for (let i = 0; i < 20; i++) m.step([inp({ jump: i === 0, right: i >= 2, left: i >= 2 }), E()]);
  check('B3：左右を両方押すと動かない', m.f[0].x === x0); }
// 審査の指摘（A1）：core 単体で、導入の間の押しっぱなしを開始の押下にしない
{ const m = new C.Match({ seed: 1 }); for (let i = 0; i < C.INTRO_FRAMES; i++) m.step([inp({ light: true }), E()]);
  let atk = 0; for (let i = 0; i < 10; i++) { m.step([inp({ light: true }), E()]); if (m.f[0].state === 'attack') atk++; }
  check('A1：導入から押しっぱなしの攻撃は、対戦の開始で出ない（core）', atk === 0, 'attack ' + atk); }
{ const m = new C.Match({ seed: 1 }); for (let i = 0; i < C.INTRO_FRAMES; i++) m.step([inp({ light: true }), E()]);
  m.step([E(), E()]); m.step([inp({ light: true }), E()]);
  check('A1：離してから押し直せば、対戦の開始でも攻撃が出る（対照）', m.f[0].state === 'attack'); }
// M10a（D1）：ジャンプの当たりの高さ。相手の y を毎フレーム固定し、判定の時点の高さを揃える（重力のずれを避ける）
function holdAt(m, h, n, atk = () => E()) {
  const evs = [];
  for (let i = 0; i < n; i++) {
    const o = m.f[1]; o.y = C.GROUND - h; o.vy = 0; o.state = 'jump';
    evs.push(...m.step([atk(i), E()]));
  }
  return evs;
}
check('D1：定数 HIT_DY = 140、SUPER_CLEAR = 100 が Core から読める', C.HIT_DY === 140 && C.SUPER_CLEAR === 100, `HIT_DY ${C.HIT_DY}, SUPER_CLEAR ${C.SUPER_CLEAR}`);
{ const m = fightReady(); place(m, 500, 600); holdAt(m, 135, 30, (i) => inp({ light: i === 0 }));
  check('D1：通常技（弱）：高さの差 135 で当たる', m.f[1].hp === 94, 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 500, 600); holdAt(m, 145, 30, (i) => inp({ light: i === 0 }));
  check('D1：通常技（弱）：高さの差 145 で外れる', m.f[1].hp === 100, 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 500, 640); holdAt(m, 135, 40, (i) => inp({ heavy: i === 0 }));
  check('D1：通常技（強）：高さの差 135 で当たる', m.f[1].hp === 86, 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 500, 640); holdAt(m, 145, 40, (i) => inp({ heavy: i === 0 }));
  check('D1：通常技（強）：高さの差 145 で外れる', m.f[1].hp === 100, 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 400, 1000); m.f[0].meter = 100; holdAt(m, 95, 70, (i) => inp({ super: i === 0 }));
  check('D1：必殺の稲妻：相手の高さ 95 で当たる', m.f[1].hp === 72, 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 400, 1000); m.f[0].meter = 100; holdAt(m, 105, 70, (i) => inp({ super: i === 0 }));
  check('D1：必殺の稲妻：相手の高さ 105 で外れる', m.f[1].hp === 100, 'hp ' + m.f[1].hp); }
// M1（境界）：判定の直前（resolveHits に入る時点）の実測値で、境界の ±1 を確かめる。
// physics() が先に走るため、設定した高さより 0.9 px 低く判定される（上の holdAt の注意）。その分を見込んで設定値を決める。
function measureHits(m) {
  const log = [];
  const orig = m.resolveHits.bind(m);
  m.resolveHits = () => {
    const a = m.f[0], o = m.f[1];
    const mv = a.state === 'attack' ? C.MOVES[a.move] : null;
    if (mv && a.sf >= mv.startup && a.sf < mv.startup + mv.active) log.push({ dy: Math.abs(o.y - a.y), oy: o.y });
    orig();
  };
  return log;
}
// 攻撃側を空中の高さ h に固定する（相手は地面）。空中の攻撃側の判定（M2）に使う
function holdAttackerAt(m, h, n, atk) {
  const evs = [];
  for (let i = 0; i < n; i++) { const a = m.f[0]; a.y = C.GROUND - h; a.vy = 0; evs.push(...m.step([atk(i), E()])); }
  return evs;
}
const near = (v, x) => Math.abs(v - x) < 1e-6;
{ const m = fightReady(); place(m, 500, 600); const log = measureHits(m); holdAt(m, 140.9, 30, (i) => inp({ light: i === 0 }));
  check('M1：通常技（弱）：判定時の差がちょうど 140 で当たる', log.length > 0 && log.every(e => near(e.dy, 140)) && m.f[1].hp === 94, `実測 ${log.map(e => e.dy).join(',')}, hp ${m.f[1].hp}`); }
{ const m = fightReady(); place(m, 500, 600); const log = measureHits(m); holdAt(m, 141.9, 30, (i) => inp({ light: i === 0 }));
  check('M1：通常技（弱）：判定時の差が 141 で外れる', log.length > 0 && log.every(e => near(e.dy, 141)) && m.f[1].hp === 100, `実測 ${log.map(e => e.dy).join(',')}, hp ${m.f[1].hp}`); }
{ const m = fightReady(); place(m, 400, 1000); m.f[0].meter = 100; const log = measureHits(m); holdAt(m, 100.9, 70, (i) => inp({ super: i === 0 }));
  check('M1：稲妻：判定時の高さがちょうど 100 で当たる', log.length > 0 && log.every(e => near(e.oy, C.GROUND - 100)) && m.f[1].hp === 72, `実測 y ${log.map(e => e.oy).join(',')}, hp ${m.f[1].hp}`); }
{ const m = fightReady(); place(m, 400, 1000); m.f[0].meter = 100; const log = measureHits(m); holdAt(m, 101.9, 70, (i) => inp({ super: i === 0 }));
  check('M1：稲妻：判定時の高さが 101 で外れる', log.length > 0 && log.every(e => near(e.oy, C.GROUND - 101)) && m.f[1].hp === 100, `実測 y ${log.map(e => e.oy).join(',')}, hp ${m.f[1].hp}`); }
// M2：攻撃側が空中のときも、式 Math.abs(o.y - f.y) で差を測る（相手は地面に立つ）
{ const m = fightReady(); place(m, 500, 600); const log = measureHits(m); holdAttackerAt(m, 135.9, 30, (i) => inp({ light: i === 0 }));
  check('M2：攻撃側が空中で、判定時の差 135 で当たる', log.length > 0 && log.every(e => near(e.dy, 135)) && m.f[1].hp === 94, `実測 ${log.map(e => e.dy).join(',')}, hp ${m.f[1].hp}`); }
{ const m = fightReady(); place(m, 500, 600); const log = measureHits(m); holdAttackerAt(m, 145.9, 30, (i) => inp({ light: i === 0 }));
  check('M2：攻撃側が空中で、判定時の差 145 で外れる', log.length > 0 && log.every(e => near(e.dy, 145)) && m.f[1].hp === 100, `実測 ${log.map(e => e.dy).join(',')}, hp ${m.f[1].hp}`); }
for (const k of [8, 10]) { // 既存の「押す時刻 14」と同じ数え方：必殺入力の後、k フレーム待ってからジャンプを押す
  const m = fightReady(); place(m, 400, 900); m.f[0].meter = 100;
  run(m, 1, () => inp({ super: true })); run(m, k); run(m, 1, null, () => inp({ jump: true })); run(m, 60);
  check(`必殺技：押す時刻 ${k} で跳んでかわせる`, m.f[1].hp === 100, 'hp ' + m.f[1].hp); }
// M10b（D2）：空中攻撃。跳んだ次のフレームを 1 とし、k フレーム目に押す（相手は水平距離 100 px、地面に立つ）
function airAttack(m, k, key, n = 60, guard = false) {
  const evs = []; let st = null;
  for (let i = 0; i <= n; i++) {
    const a = i === 0 ? inp({ jump: true }) : (i === k ? inp({ [key]: true }) : E());
    const b = guard ? inp({ guard: true }) : E();
    evs.push(...m.step([a, b]));
    if (i === k) st = { state: m.f[0].state, move: m.f[0].move, air: C.airborne(m.f[0]) };
  }
  return { evs, st };
}
for (const k of [4, 10]) {
  const m = fightReady(); place(m, 500, 600); const { st } = airAttack(m, k, 'heavy', k);
  check(`D2：空中の強（押す時刻 ${k}）：空中のまま強攻撃の状態になる`, st.air && st.state === 'attack' && st.move === 'heavy', `state ${st.state}, move ${st.move}`);
}
for (const k of [4, 10]) {
  const m = fightReady(); place(m, 500, 600); airAttack(m, k, 'heavy');
  check(`D2：空中の強（押す時刻 ${k}）：届く相手に当たり 14 減る`, m.f[1].hp === 86, 'hp ' + m.f[1].hp);
}
for (const k of [3, 6]) {
  const m = fightReady(); place(m, 500, 600); const { st } = airAttack(m, k, 'light');
  check(`D2：空中の弱（押す時刻 ${k}）：攻撃の状態になり、当たると 6 減る`, st.state === 'attack' && st.move === 'light' && m.f[1].hp === 94, `state ${st.state}, hp ${m.f[1].hp}`);
}
{ const m = fightReady(); place(m, 400, 900); m.f[0].meter = 100; const { st } = airAttack(m, 5, 'super', 20);
  check('D2：空中で必殺を押しても出ない（ゲージは 100 のまま）', st.state !== 'attack' && m.f[0].meter === 100 && m.f[0].stats.supers === 0, `state ${st.state}, meter ${m.f[0].meter}`); }
{ const m = fightReady(); place(m, 500, 600); const { evs } = airAttack(m, 4, 'heavy', 60, true);
  check('D2：ガードの相手に空中の強が当たると、削りの 2 だけ', m.f[1].hp === 98 && evs.some(e => e.type === 'block'), 'hp ' + m.f[1].hp); }
{ const m = fightReady(); place(m, 500, 600); const { evs } = airAttack(m, 4, 'light', 60, true);
  check('D2：ガードの相手に空中の弱が当たると、削りは 0', m.f[1].hp === 100 && evs.some(e => e.type === 'block'), 'hp ' + m.f[1].hp + ', block ' + evs.some(e => e.type === 'block')); }
{ // 着地の瞬間に攻撃中（強は 52 フレーム続く）。着地の後も状態が壊れず、攻撃が終わると操作できる
  const m = fightReady(); place(m, 400, 900); run(m, 1, () => inp({ jump: true })); run(m, 29); run(m, 1, () => inp({ heavy: true }));
  let landed = false, landedAttack = false;
  for (let i = 0; i < 12; i++) { m.step([E(), E()]); if (m.f[0].y === C.GROUND && m.f[0].vy === 0) { landed = true; if (m.f[0].state === 'attack') landedAttack = true; } }
  run(m, 60);
  const x0 = m.f[0].x; run(m, 10, () => inp({ right: true }));
  check('D2：攻撃中に着地しても、攻撃の状態のまま地上にいる', landed && landedAttack, `landed ${landed}, attack ${landedAttack}`);
  check('D2：着地と攻撃の終了の後は、右へ動ける（操作できる）', (m.f[0].state === 'walk') && m.f[0].x > x0 + 30, `state ${m.f[0].state}, x ${x0}->${m.f[0].x}`); }
// M10c（B1）：後退の防御。相手と逆向きに 18 フレーム入力し続けると防御になる
const backIn = () => inp({ left: true });
const oppGuard = () => inp({ guard: true });
const guardSeq = (m, n, a = backIn, b = E) => { const st = []; for (let i = 0; i < n; i++) { run(m, 1, a, b); st.push(m.f[0].state); } return st; };
{ const m0 = fightReady(); place(m0, 400, 500); const st = guardSeq(m0, 18);
  check('B1：後退を 17 フレーム押すまでは防御にならない', st.slice(0, 17).every(s => s !== 'guard'), st.slice(0, 17).join(','));
  check('B1：後退を 18 フレーム目に防御になる', st[17] === 'guard', 'state ' + st[17]); }
{ const m = fightReady(); place(m, 200, 500); const st = guardSeq(m, 30);
  check('B1：相手が遠い（205 px を超える）と防御にならない', st.every(s => s !== 'guard'), 'last ' + st[29]); }
{ const m = fightReady(); place(m, 400, 500); run(m, 1, () => inp({ light: true })); const st = guardSeq(m, 20, backIn, oppGuard);
  check('B1：攻撃中は後退しても防御にならない', st.every(s => s !== 'guard') && m.f[0].state === 'attack', st.join(',')); }
{ const m = fightReady(); place(m, 420, 500); run(m, 10, backIn, oppGuard); run(m, 1, () => inp({ light: true }), oppGuard); run(m, 30, E, oppGuard);
  const st = guardSeq(m, 18, backIn, oppGuard);
  check('B1：攻撃を挟んだら数え直す（17 フレームでは防御にならない）', st.slice(0, 17).every(s => s !== 'guard'), st.slice(0, 17).join(','));
  check('B1：攻撃を挟んだあと、18 フレーム目に防御になる', st[17] === 'guard', 'state ' + st[17]); }
for (const kind of ['hitstun', 'blockstun']) {
  const m = fightReady(); place(m, 400, 500); run(m, 10, backIn); m.f[0].state = kind; m.f[0].sf = 0; m.f[0].stun = 5;
  run(m, 5, backIn); m.f[0].x = 400; const st = guardSeq(m, 18); // 数えの検査なので、距離を 100 に戻す
  check(`B1：${kind}を挟んだら数え直す（17 フレームでは防御にならない、18 で防御）`, st.slice(0, 17).every(s => s !== 'guard') && st[17] === 'guard', st.slice(0, 18).join(',')); }
{ const m = fightReady(); place(m, 400, 500); run(m, 10, backIn); run(m, 1, () => inp({ right: true }));
  const st = guardSeq(m, 17);
  check('B1：前向きの入力で数えが 0 に戻る（17 フレームでは防御にならない）', st.every(s => s !== 'guard'), st.join(',')); }
{ const m = fightReady(); place(m, 400, 500); run(m, 20, () => inp({ left: true, guard: true }));
  const st = guardSeq(m, 5);
  check('B1：ガードボタンと同時に押した間は数えない（離した後は防御にならない）', st.every(s => s !== 'guard'), st.join(',')); }
{ const m = fightReady(); place(m, 400, 500); run(m, 17, backIn); run(m, 1, () => inp({ jump: true, left: true }));
  check('B1：後退の防御より、ジャンプが優先する', m.f[0].state === 'jump' && m.f[0].y < C.GROUND - 10, `state ${m.f[0].state}`); }
{ const m = fightReady(); place(m, 400, 500); run(m, 17, backIn); run(m, 1, () => inp({ light: true, left: true }));
  check('B1：後退の防御より、攻撃が優先する', m.f[0].state === 'attack' && m.f[0].move === 'light', `state ${m.f[0].state}`); }
{ const m = fightReady(); place(m, 400, 500); run(m, 18, backIn); const s0 = m.f[0].state; run(m, 1); check('B1：離すと次のフレームで防御が解ける', s0 === 'guard' && m.f[0].state !== 'guard', `${s0} -> ${m.f[0].state}`); }
{ const m = fightReady(); place(m, 400, 500); run(m, 18, backIn); const x0 = m.f[0].x; run(m, 10, backIn);
  check('B1：防御中は後ろへ毎フレーム 2 動く（10 フレームで 20 px）', m.f[0].state === 'guard' && x0 - m.f[0].x === 20, `x ${x0} -> ${m.f[0].x}`); }
{ const m = fightReady(); place(m, 400, 500); run(m, 18, backIn); m.f[1].x = m.f[0].x + 100;
  const evs = run(m, 40, backIn, (i) => inp({ light: i === 0 }));
  check('B1：防御中に弱を受けても削りは 0', m.f[0].hp === 100 && evs.some(e => e.type === 'block'), 'hp ' + m.f[0].hp); }
{ const m = fightReady(); place(m, 400, 500); run(m, 18, backIn); m.f[1].x = m.f[0].x + 100;
  const evs = run(m, 40, backIn, (i) => inp({ heavy: i === 0 }));
  check('B1：防御中に強を受けると削りの 2 だけ', m.f[0].hp === 98 && evs.some(e => e.type === 'block'), 'hp ' + m.f[0].hp); }
{ // 空中では数えない：跳んで 6 フレーム後（向きの入力を受け付けない期間の後）から後ろへ入れ続けても、着地の後の 17 フレームでは防御にならない
  const m = fightReady(); place(m, 400, 500); run(m, 1, () => inp({ jump: true })); run(m, 6); const st = [], air = [];
  for (let i = 0; i < 60; i++) { run(m, 1, backIn); st.push(m.f[0].state); air.push(C.airborne(m.f[0])); }
  const j = air.indexOf(false); const after = st.slice(j, j + 17);
  check('B1：空中では数えない（着地の後、17 フレームでは防御にならない）', air.some(Boolean) && j > 0 && after.every(s => s !== 'guard'), 'landed at ' + j + ' ' + after.join(',')); }
done('rules.test');
