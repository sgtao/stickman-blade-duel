// Inline src/core.js and src/app.js into a single index.html.
import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname;
const t = fs.readFileSync(dir + 'src/template.html', 'utf8');
const core = fs.readFileSync(dir + 'src/core.js', 'utf8');
const app = fs.readFileSync(dir + 'src/app.js', 'utf8');
const out = t.replace('/*CORE*/', () => core).replace('/*APP*/', () => app);
fs.writeFileSync(dir + 'index.html', out);
console.log('index.html', out.length, 'bytes');
