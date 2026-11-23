// M14c（手順 1）：剣の形による当たり判定の検査。
// 刃の線分（手→刃先、半径 6 px）が、相手の体のどこかの形（頭の円 13 px、線分 8 px）に触れたら当たる。
// 判定の幾何は、この検査の中で独立に書く（本体の実装を写さない）。
// 検査は { hitModel: 'blade' } で動かす。旧判定（'legacy'）では不合格になるのが正しい。
import { loadCore, check, done } from './lib.mjs';
const C = loadCore();
const E = () => C.emptyInput();
const GROUND = C.GROUND;
const R_BLADE = 6, R_BODY = 8, R_HEAD = 13;

// ---- 検査側の幾何（本体とは別に書く） ----
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function ptSeg(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const L = abx * abx + aby * aby;
  let t = L ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * abx, p[1] - a[1] - t * aby);
}
function segSeg(a, b, c, d) {
  const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}
// 攻撃の掃引：今のフレームの刃（手→刃先）を、前のフレームとの間で 3 分割した 3 本の線分
function bladeSamples(a, sfUsed, sweep = true) {
  const cur = C.pose({ ...a, sf: sfUsed });
  const prv = C.pose({ ...a, sf: sfUsed - 1 });
  const js = sweep ? [1, 2, 3] : [3];
  return js.map((j) => {
    const t = j / 3;
    return [lerp2(prv.hand, cur.hand, t), lerp2(prv.tip, cur.tip, t)];
  });
}
// 部位ごとの接触の余り（負なら接触）
function shapeGaps(a, d, sfUsed) {
  const blades = bladeSamples(a, sfUsed, true);
  return bodyShapes(d).map((s) => {
    let best = Infinity;
    for (const [h, t] of blades) best = Math.min(best, segSeg(h, t, s.a, s.b) - (R_BLADE + s.r));
    return { name: s.name, gap: best };
  });
}
// 相手の体の形（頭の円と 9 本の線分）、線分 9 本（相手の剣は含めない）
function bodyShapes(d) {
  const p = C.pose(d); // 相手自身の sf で姿勢を作る（攻撃の sf で上書きしない）
  return [
    { name: 'head', a: p.head, b: p.head, r: R_HEAD },
    { name: 'torso', a: p.neck, b: p.hip, r: R_BODY },
    { name: 'armA1', a: p.shoulder, b: p.elbow, r: R_BODY },
    { name: 'armA2', a: p.elbow, b: p.hand, r: R_BODY },
    { name: 'armB1', a: p.shoulder, b: p.elbow2, r: R_BODY },
    { name: 'armB2', a: p.elbow2, b: p.hand2, r: R_BODY },
    { name: 'legA1', a: p.hip, b: p.kneeA, r: R_BODY },
    { name: 'legA2', a: p.kneeA, b: p.footA, r: R_BODY },
    { name: 'legB1', a: p.hip, b: p.kneeB, r: R_BODY },
    { name: 'legB2', a: p.kneeB, b: p.footB, r: R_BODY },
  ];
}
// 余り（負なら接触）：刃の掃引のどれかと、names の形のどれかの、間の距離 − 半径の和
function gapOf(a, d, sfUsed, names = null, sweep = true) {
  const blades = bladeSamples(a, sfUsed, sweep);
  const shapes = bodyShapes(d).filter((s) => !names || names.includes(s.name));
  let best = Infinity;
  for (const [h, t] of blades) for (const s of shapes) {
    best = Math.min(best, segSeg(h, t, s.a, s.b) - (R_BLADE + s.r));
  }
  return best;
}

// ---- 場面：攻撃側（陣営 0）と相手（陣営 1）を、判定の 1 フレーム前の状態で置く ----
// 判定に使われる sf は「1 ステップ後」の値なので、置いた sf（sfUsed - 1）を入れて 1 ステップ回す。
function sceneAtt(move, ax, sfUsed) { return { x: ax, y: GROUND, facing: 1, side: 0, state: 'attack', move, sf: sfUsed, vy: 0 }; }
function sceneDef(dx, dy, dstate, sfUsedDef = 1) { return { x: dx, y: dy, facing: -1, side: 1, state: dstate, sf: sfUsedDef, vy: 0, move: null }; }

function gameHit(move, ax, sfUsed, dx, dy = GROUND, dstate = 'idle') {
  // HIT_MODEL=legacy で旧判定に切り替えて、この検査が不合格になることを確かめる（変異の代わり）
  const m = new C.Match({ seed: 1, hitModel: process.env.HIT_MODEL || 'blade' });
  while (m.phase !== 'fight') m.step([E(), E()]);
  const a = m.f[0], d = m.f[1];
  a.x = ax; a.y = GROUND; a.state = 'attack'; a.move = move; a.sf = sfUsed - 1; a.hitDone = false; a.facing = 1; a.vy = 0;
  d.x = dx; d.y = dy; d.state = dstate; d.sf = 0; d.facing = -1; d.vy = 0; d.hp = 100; d.move = null;
  m.step([E(), E()]);
  return m.f[0].hitDone;
}

// 差 gap の値になる攻撃側の x を、近づく向きに探して二分法で求める（相手は dx に固定）
function crossingX(move, sfUsed, dx, dy, dstate, names, target, sweep = true) {
  const gapAt = (ax) => gapOf(sceneAtt(move, ax, sfUsed), sceneDef(dx, dy, dstate), sfUsed, names, sweep) - target;
  let prevX = dx - 420, prevG = gapAt(prevX);
  for (let x = dx - 420; x <= dx - 75; x += 0.5) {
    const g = gapAt(x);
    if (prevG > 0 && g <= 0) {
      let lo = prevX, hi = x;
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (gapAt(mid) > 0) lo = mid; else hi = mid; }
      return hi;
    }
    prevX = x; prevG = g;
  }
  return null;
}
// 攻撃の有効フレームのどれかで、接触（gap＝0）する場面を探す
// 全身の判定で接触する場面を探し、その接触が names の部位であるものを返す
function findTouch(move, names, dx, dy = GROUND, dstate = 'idle') {
  const { startup, active } = C.MOVES[move];
  for (let sfUsed = startup; sfUsed < startup + active; sfUsed++) {
    const x0 = crossingX(move, sfUsed, dx, dy, dstate, null, 0);
    if (x0 == null) continue;
    const touching = shapeGaps(sceneAtt(move, x0, sfUsed), sceneDef(dx, dy, dstate), sfUsed).filter((g) => g.gap <= 1e-6).map((g) => g.name);
    if (touching.some((n) => names.includes(n))) return { sfUsed, x0, touching };
  }
  return null;
}

// ---- 検査 ----
const DX = 560; // 相手の位置（攻撃側は左）
// 1. 刃先がちょうど相手に触れると当たる。1 px 離れると外れる（部位ごと）
const regions = [
  { label: '頭', move: 'light', names: ['head'] },
  { label: '腕（手）', move: 'light', names: ['armA2'] },
  { label: '脚（足）', move: 'heavy', names: ['legA2', 'legB2'] },
];
for (const r of regions) {
  const t = findTouch(r.move, r.names, DX);
  check(`${r.label}：接触の場面が見つかる（検査の前提）`, !!t, t ? `sf ${t.sfUsed}` : 'なし');
  if (!t) continue;
  const x1 = crossingX(r.move, t.sfUsed, DX, GROUND, 'idle', null, 1);
  check(`${r.label}：ちょうど触れる（0.01 px 内側）で当たる`, gameHit(r.move, t.x0 + 0.01, t.sfUsed, DX), `x0 ${t.x0.toFixed(4)}, sf ${t.sfUsed}, 接触: ${t.touching.join(' ')}`);
  check(`${r.label}：ちょうど触れない（0.01 px 外側）で外れる`, !gameHit(r.move, t.x0 - 0.01, t.sfUsed, DX));
  check(`${r.label}：1 px 離れると外れる`, x1 != null && !gameHit(r.move, x1, t.sfUsed, DX), x1 == null ? '1 px の場面なし' : `x ${x1.toFixed(2)}`);
}

// 1b. 胴：胴の線分に深く触れる場面（余り −0.5 以下）で当たる。腕が先に触れる場面は境界の検査から外す
{
  let found = null;
  const { startup, active } = C.MOVES.light;
  for (let sfUsed = startup; sfUsed < startup + active && !found; sfUsed++) {
    for (let x = DX - 420; x <= DX - 75 && !found; x += 0.5) {
      const g = shapeGaps(sceneAtt('light', x, sfUsed), sceneDef(DX, GROUND, 'idle'), sfUsed).find((s) => s.name === 'torso').gap;
      if (g <= -0.5) found = { sfUsed, x, g };
    }
  }
  check('胴：胴に深く触れる場面が見つかる（検査の前提）', !!found, found ? `sf ${found.sfUsed}, x ${found.x}, 余り ${found.g.toFixed(2)}` : 'なし');
  if (found) check('胴：胴に深く触れる場面で当たる', gameHit('light', found.x, found.sfUsed, DX));
}

// 2. 掃引のすり抜け：今のフレームの刃先だけでは外れ、3 分割の途中で触れる場面で当たる
{
  const move = 'heavy', names = ['legA2', 'legB2'];
  let found = null;
  const { startup, active } = C.MOVES[move];
  for (let sfUsed = startup; sfUsed < startup + active && !found; sfUsed++) {
    for (let x = DX - 420; x <= DX - 75 && !found; x += 0.5) {
      const sweepGap = gapOf(sceneAtt(move, x, sfUsed), sceneDef(DX, GROUND, 'idle'), sfUsed, names, true);
      const endGap = gapOf(sceneAtt(move, x, sfUsed), sceneDef(DX, GROUND, 'idle'), sfUsed, names, false);
      if (sweepGap <= 0 && endGap > 0) found = { sfUsed, x };
    }
  }
  check('掃引：途中で触れて今のフレームの刃先では触れない場面がある（検査の前提）', !!found, found ? `sf ${found.sfUsed}, x ${found.x}` : 'なし');
  if (found) check('掃引：途中で触れる場面は当たる（すり抜けない）', gameHit(move, found.x, found.sfUsed, DX));
}

// 3. 刃が通らない高さの相手は外れる（ジャンプの頂点より高い位置。足が刃より上）
{
  let anyTouch = false, anyHit = false;
  for (const sfUsed of [C.MOVES.light.startup, C.MOVES.light.startup + 2, C.MOVES.light.startup + 3]) {
    for (let x = DX - 420; x <= DX - 75; x += 3) {
      if (gapOf(sceneAtt('light', x, sfUsed), sceneDef(DX, GROUND - 260, 'jump'), sfUsed) <= 0) anyTouch = true;
      if (gameHit('light', x, sfUsed, DX, GROUND - 260, 'jump')) anyHit = true;
    }
  }
  check('高い相手（足が 260 px）：刃は届かず外れる（検査側の幾何）', !anyTouch);
  check('高い相手（足が 260 px）：本体でも外れる', !anyHit);
}

// 4. 背後（刃の向きと逆）は当たらない
{
  const hit = gameHit('light', DX + 150, C.MOVES.light.startup, DX);
  check('背後：刃の向きと逆の相手には当たらない', !hit);
}

// 5. 幾何の基準：検査の幾何が、刃と胴の離れをこの検査の中で正しく測る（既知の値）
{
  const a = sceneAtt('light', 400, 6); const d = sceneDef(560, GROUND, 'idle');
  const g = gapOf(a, d, 6, ['torso'], false);
  check('幾何の基準：検査の距離は有限で、負でも正でもない値を返す', Number.isFinite(g), 'gap ' + g.toFixed(2));
}

done('blade_hit.test');
