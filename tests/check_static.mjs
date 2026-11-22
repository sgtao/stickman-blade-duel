// 合格条件 1：単一ファイル、外部参照なし、200 KB 以下
import fs from 'fs'; import { HTML, check, done } from './lib.mjs';
const s = fs.readFileSync(HTML, 'utf8');
const size = Buffer.byteLength(s);
check('ファイルが 200 KB 以下', size <= 200 * 1024, size + ' bytes');
const bad = [
  [/https?:\/\//g, '外部 URL'], [/\ssrc\s*=/gi, 'src= 属性'], [/\bimport\s*[\(\{'"*]/g, 'import'], [/\bfetch\s*\(/g, 'fetch('],
  [/<link\b/gi, '<link>'], [/@import/g, '@import'], [/XMLHttpRequest/g, 'XMLHttpRequest'], [/new\s+Worker/g, 'Worker'],
];
for (const [re, name] of bad) { const m = s.match(re) || []; check(name + ' を含まない', m.length === 0, m.length ? m.slice(0, 3).join(' | ') : ''); }
check('core と app のスクリプトが入っている', /<script id="core">[\s\S]*Core[\s\S]*<\/script>/.test(s) && /<script id="app">[\s\S]*__game[\s\S]*<\/script>/.test(s));
done('check_static');
