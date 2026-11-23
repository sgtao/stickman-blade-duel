// 姿勢（pose）の全状態・全フレームの掃引。座標を 1e-6 に丸め、状態の組ごとに sha256 を返す。
// 当たり判定を剣の形にする（M14c）ために pose を core に移した（M14b）とき、挙動を変えていないことの基準に使う。
import crypto from 'crypto';
export function sweep(C, poseFn) {
  const out = {};
  const groups = [
    ['idle', { state: 'idle' }, 60], ['intro', { state: 'intro' }, 60],
    ['walk+', { state: 'walk', vx: 2 }, 80], ['walk-', { state: 'walk', vx: -2 }, 80],
    ['walk-air-light', { state: 'walk', move: 'light', y: C.GROUND - 80, vy: -3 }, 40],
    ['jump-up', { state: 'jump', y: C.GROUND - 120, vy: -6 }, 40], ['jump-down', { state: 'jump', y: C.GROUND - 120, vy: 6 }, 40],
    ['guard', { state: 'guard' }, 40], ['hitstun', { state: 'hitstun' }, 60], ['blockstun', { state: 'blockstun' }, 40],
    ['ko', { state: 'ko' }, 80], ['win', { state: 'win' }, 80],
    ['atk-light', { state: 'attack', move: 'light' }, 40], ['atk-heavy', { state: 'attack', move: 'heavy' }, 70], ['atk-super', { state: 'attack', move: 'super' }, 80],
    ['atk-light-air', { state: 'attack', move: 'light', y: C.GROUND - 100, vy: -2 }, 40], ['atk-heavy-air', { state: 'attack', move: 'heavy', y: C.GROUND - 100, vy: -2 }, 70],
  ];
  const flat = (p) => Object.keys(p).sort().flatMap((k) => [k, +p[k][0].toFixed(6), +p[k][1].toFixed(6)]);
  for (const [name, base, n] of groups) {
    const h = crypto.createHash('sha256'); let count = 0;
    for (const side of [0, 1]) for (const facing of [1, -1]) for (let sf = 0; sf < n; sf++) {
      const f = Object.assign({ side, facing, x: 400, y: C.GROUND, vx: 0, vy: 0, sf, hp: 100, meter: 0, move: null }, base);
      h.update(JSON.stringify(flat(poseFn(f)))); count++;
    }
    out[name] = h.digest('hex').slice(0, 16) + ':' + count;
  }
  return out;
}
