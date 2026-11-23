// 合格条件 4・5：CPU の強さの差と再現性
import { loadCore, check, done } from './lib.mjs';
const C = loadCore();
function series(a, b) {
  let w = 0, l = 0, d = 0;
  for (let s = 1; s <= 100; s++) {
    const swap = s % 2 === 0; // 左右の有利を打ち消すため、交互に入れ替える
    const r = C.simulate({ seed: s, levels: swap ? [b, a] : [a, b] });
    const me = swap ? 1 : 0;
    if (r.winner === 'draw') d++; else if (r.winner === me) w++; else l++;
  }
  return { w, l, d };
}
const t = [['strong', 'weak', 85], ['normal', 'weak', 65], ['strong', 'normal', 65]];
for (const [a, b, need] of t) { const r = series(a, b); check(`${a} 対 ${b}：${need} 勝以上`, r.w >= need, `${r.w} 勝 ${r.l} 敗 ${r.d} 分`); }
const a1 = JSON.stringify(C.simulate({ seed: 42, levels: ['normal', 'strong'] }).snapshot);
const a2 = JSON.stringify(C.simulate({ seed: 42, levels: ['normal', 'strong'] }).snapshot);
const b1 = JSON.stringify(C.simulate({ seed: 43, levels: ['normal', 'strong'] }).snapshot);
check('同じ種なら最終状態が完全に一致', a1 === a2);
check('種を変えると一致しない', a1 !== b1);
// 入力列の再現：決まった入力列を 2 回流す
function scripted(seed) { const m = new C.Match({ seed }); const ai = new C.AI('normal', seed); const r = C.mulberry32(5);
  for (let i = 0; i < 4000 && m.phase !== 'matchEnd'; i++) { const v = r(); const p = C.emptyInput(); if (v < 0.3) p.right = true; else if (v < 0.4) p.light = true; else if (v < 0.45) p.heavy = true; else if (v < 0.5) p.guard = true; m.step([p, ai.decide(m, 1)]); }
  return JSON.stringify(m.snapshot()); }
check('同じ種・同じ入力列なら一致', scripted(7) === scripted(7));
// 単純な連打の戦略（人が真っ先に試すもの）に、「強い」が負け越さない
// 人が続けて押せる範囲の連打（SPEC 合格条件 4）：3 回押したら 30 フレーム止め、を繰り返す
function spamBot(move, every) {
  let presses = 0, rest = 0;
  return { reset() { presses = 0; rest = 0; }, decide(m, side) { const me = m.f[side], o = m.f[1 - side]; const p = C.emptyInput(); if (m.phase !== 'fight') return p;
    const d = Math.abs(o.x - me.x); if (d > 110) { if (o.x > me.x) p.right = true; else p.left = true; }
    if (rest > 0) { rest -= 1; return p; }
    if (m.frame % every === 0) {
      p[me.meter >= 100 && move === 'mix' ? 'super' : (move === 'mix' ? 'light' : move)] = true;
      presses += 1; if (presses >= 3) { presses = 0; rest = 30; }
    }
    return p; } };
}
function vsBot(bot, level) {
  let w = 0;
  for (let s = 1; s <= 100; s++) {
    const m = new C.Match({ seed: s }); const cpu = new C.AI(level, s * 2 + 2);
    if (bot.reset) bot.reset();
    for (let i = 0; i < 20000 && m.phase !== 'matchEnd'; i++) m.step([bot.decide(m, 0), cpu.decide(m, 1)]);
    if (m.winner === 1) w++;
  }
  return w;
}
for (const [name, bot] of [['弱攻撃を 4 フレームごと', spamBot('light', 4)], ['弱攻撃を 20 フレームごと', spamBot('light', 20)], ['強攻撃を 4 フレームごと', spamBot('heavy', 4)], ['弱攻撃と必殺技の連打', spamBot('mix', 4)]]) {
  const w = vsBot(bot, 'strong'); check(`連打（${name}）に「強い」が 70 勝以上`, w >= 70, `${w} 勝`);
}
done('ai_strength');
