# stickman-blade-duel
## `Stickman Blade Duel` - 棒人間の剣戦対戦

光る剣で戦う棒人間の 1 対 1 格闘ゲーム。ブラウザで CPU と対戦する。

[遊ぶ](https://sgtao.github.io/stickman-blade-duel/)

## 遊び方
`index.html` をブラウザで開く（サーバー不要）。

| 操作 | キー | スマホ |
|---|---|---|
| 移動 | A / D（← / →） | ◀ ▶ |
| ジャンプ | W（↑ / Space） | ▲ |
| ガード | S（↓）を押し続ける | 守 |
| 弱攻撃 | J（Z） | 弱 |
| 強攻撃 | K（X） | 強 |
| 必殺技（ゲージ満タン） | L（C） | 必殺 |
| 一時停止 | P / Esc | II |
| 消音 | M | 音 ON/OFF |

- 体力 100、1 ラウンド 60 秒、2 本先取（最大 3 ラウンド）
- 必殺技の稲妻は、ガードで削りだけになり、ジャンプでかわせる
- CPU の強さは「弱い・普通・強い」

## 開発
`src/`（`core.js` 規則と CPU、`app.js` 画面・描画・音、`template.html`）を直し、`node build.mjs` で `index.html` を作る。

```bash
node build.mjs
export NODE_PATH=$(npm root -g)   # Playwright（グローバル）
node tests/run_all.mjs
```

## License

MIT

---

🤖 Built with [Claude Code](https://claude.ai/code)
