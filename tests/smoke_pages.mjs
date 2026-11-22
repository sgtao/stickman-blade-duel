// 公開された URL（GAME_URL）を開き、配信本文のバイト一致（再試行つき）と、通しの流れ・エラー 0 を確かめる
import fs from 'fs'; import crypto from 'crypto'; import path from 'path';
import { playwright, ROOT, check, done } from './lib.mjs';

const GAME_URL = process.env.GAME_URL;
// GAME_URL が無いときは使い方を出して不合格にする
if (!GAME_URL) {
  console.log('使い方: GAME_URL=<公開された index.html の URL> NODE_PATH=$(npm root -g) node tests/smoke_pages.mjs');
  console.log('例: GAME_URL=https://example.github.io/stickman-blade-duel/index.html');
  process.exit(1);
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// リポジトリ直下の index.html と sha256 で比べる
const local = fs.readFileSync(path.join(ROOT, 'index.html'));
const localSha = sha(local);

// 配信された本文を取得し、index.html と一致するまで再試行する。
// 取得の失敗と sha の不一致の両方を 10 秒おきに、最大 12 回まで再試行する（Pages の反映待ち）。
async function fetchUntilMatch(url) {
  let last = { ok: false, error: '未取得' };
  for (let i = 0; i <= 12; i++) {
    if (i > 0) { console.log(`  再試行 ${i}/12（10 秒後）`); await sleep(10000); }
    try {
      const res = await fetch(url); // GET のみ。個人情報は含めない
      if (res.ok) {
        const body = Buffer.from(await res.arrayBuffer());
        last = { ok: true, body };
        if (sha(body) === localSha) return last;
        last = { ok: true, body, error: '' };
      } else {
        last = { ok: false, error: 'HTTP ' + res.status };
      }
    } catch (e) { last = { ok: false, error: String(e.message || e) }; }
  }
  return last;
}

const got = await fetchUntilMatch(GAME_URL);

// ブラウザは再試行の後に 1 回だけ起動する
const { chromium } = playwright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// console の error と pageerror を集める
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const st = () => page.evaluate(() => window.__game.state());
// 条件が成り立つまで待つ（最大 ms）
async function until(fn, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return true; await page.waitForTimeout(50); }
  return false;
}

try {
  await page.goto(GAME_URL);
  // ゲームの初期化を待つ（無ければ例外になり、下の catch で不合格）
  await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
  const screen0 = (await st()).screen;
  check('タイトル画面から始まる', screen0 === 'title', screen0);
  await page.keyboard.press('Enter');
  check('Enter で強さ選択へ', await until(async () => (await st()).screen === 'select'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const fight = await until(async () => (await st()).screen === 'fight');
  check('→ と Enter で対戦へ', fight, (await st()).screen);
  await page.waitForTimeout(500); // 遅れて出るエラーを待つ
  check('コンソールのエラーと例外が 0 件', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('通しの流れを最後まで確かめられた', false, String(e.message).split('\n')[0]);
}
await browser.close();

// 配信の一致の項目（通しの項目の後に、まとめて出す）
check('GAME_URL の本文を取得できた', got.ok, got.ok ? `${got.body.length} バイト` : got.error);
const same = got.ok && sha(got.body) === localSha;
check('配信の本文が index.html とバイト一致（sha256）', same,
  got.ok ? `配信 ${sha(got.body).slice(0, 12)} ${got.body.length}B / 手元 ${localSha.slice(0, 12)} ${local.length}B` : '取得できず');

done('smoke_pages');
