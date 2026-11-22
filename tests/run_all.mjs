// すべての検査を順に実行する
import { spawnSync } from 'child_process'; import path from 'path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const list = ['check_static', 'rules.test', 'ai_strength', 'e2e_flow', 'visual', 'perf', 'mobile', 'screens_fit'];
const only = process.argv.slice(2);
let ng = [];
for (const t of list) {
  if (only.length && !only.includes(t)) continue;
  console.log('=== ' + t);
  const r = spawnSync(process.execPath, [path.join(dir, t + '.mjs')], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) ng.push(t);
}
console.log(ng.length ? '不合格: ' + ng.join(', ') : 'すべて合格');
process.exit(ng.length ? 1 : 0);
