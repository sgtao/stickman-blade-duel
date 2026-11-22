// Shared helpers for tests. Playwright is the global install (NODE_PATH=$(npm root -g)).
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { createRequire } from 'module';
export const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
export const HTML = process.env.GAME_HTML || path.join(ROOT, 'index.html');
export const URL_ = 'file://' + HTML;
export function loadCore(file = HTML) {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('core script not found');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(m[1], ctx); return ctx.Core;
}
export function playwright() {
  const req = createRequire(import.meta.url);
  const g = process.env.NODE_PATH || '';
  try { return req('playwright'); } catch (_) {}
  for (const p of g.split(path.delimiter)) { try { return req(path.join(p, 'playwright')); } catch (_) {} }
  throw new Error('playwright not found: run with NODE_PATH=$(npm root -g)');
}
let fails = 0, passes = 0;
export function check(name, ok, detail) {
  if (ok) { passes++; console.log('  OK  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fails++; console.log('  NG  ' + name + (detail ? '  (' + detail + ')' : '')); }
}
export function done(title) { console.log(`${title}: ${passes} 合格, ${fails} 不合格`); process.exit(fails ? 1 : 0); }
