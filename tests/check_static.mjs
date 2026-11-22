// 合格条件 1：単一ファイル、外部参照なし、200 KB 以下
import fs from 'fs'; import path from 'path'; import { HTML, ROOT, check, done } from './lib.mjs';
const s = fs.readFileSync(HTML, 'utf8');
const size = Buffer.byteLength(s);
check('ファイルが 200 KB 以下', size <= 200 * 1024, size + ' bytes');
const bad = [
  [/https?:\/\//g, '外部 URL'], [/\ssrc\s*=/gi, 'src= 属性'], [/\bimport\s*[\(\{'"*]/g, 'import'], [/\bfetch\s*\(/g, 'fetch('],
  [/<link\b/gi, '<link>'], [/@import/g, '@import'], [/XMLHttpRequest/g, 'XMLHttpRequest'], [/new\s+Worker/g, 'Worker'],
];
for (const [re, name] of bad) { const m = s.match(re) || []; check(name + ' を含まない', m.length === 0, m.length ? m.slice(0, 3).join(' | ') : ''); }
check('core と app のスクリプトが入っている', /<script id="core">[\s\S]*Core[\s\S]*<\/script>/.test(s) && /<script id="app">[\s\S]*__game[\s\S]*<\/script>/.test(s));
// M3：index.html の core の中身が src/core.js と一致する。build.mjs と同じ結合（テンプレートの /*CORE*/ の位置に core をそのまま入れる）で比べる
{
  const tpl = fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'src/core.js'), 'utf8');
  const expected = tpl.replace('/*CORE*/', () => core);
  const block = expected.match(/<script id="core">[\s\S]*?<\/script>/)[0];
  const got = s.match(/<script id="core">[\s\S]*?<\/script>/);
  check('index.html の core が src/core.js と一致する（build.mjs と同じ結合で比べる）', !!got && got[0] === block, got ? (got[0] === block ? '' : 'build 結合と差がある') : 'core の script が見つからない');
}
done('check_static');
