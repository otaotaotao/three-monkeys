# 三人よれば文殊の猿知恵 (3 Monkeys)

Sends one message to 3AI at once. Keeps only your own words.

A Firefox extension (Manifest V2) that broadcasts a single message to ChatGPT, Claude, and Gemini at once — then discards all AI responses and keeps only your own messages as a clean log.

Firefox拡張機能（Manifest V2）。ChatGPT・Claude・Geminiに同じメッセージを同時送信し、AIの応答は捨てて**自分の発言だけ**をログとして残す。

For the philosophy/architecture behind this, see [SPEC.md](./SPEC.md).
思想・アーキテクチャの詳細は [SPEC.md](./SPEC.md) を参照。

---

## Install / インストール方法

1. Open `about:debugging` in Firefox
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select **manifest.json** inside this repo

1. Firefoxで `about:debugging` を開く
2. 「このFirefox」をクリック
3. 「一時的なアドオンを読み込む」をクリック
4. このリポジトリ内の **manifest.json** を選択

## Usage / 使い方

1. Open ChatGPT / Claude / Gemini in separate tabs (logged in)
2. Click the extension icon to open the popup
3. Toggle target AIs on/off using the pills at the top
4. Type your message in the textarea
5. Click "送信" (Send) or press **Ctrl+Enter** to broadcast

1. ChatGPT / Claude / Gemini を各タブで開いておく（ログイン済みの状態）
2. 拡張機能のアイコンをクリックしてポップアップを開く
3. 上部のボタンで送信先を選択（クリックでON/OFF）
4. テキストエリアにメッセージを入力
5. 「送信」ボタン or **Ctrl+Enter** で一斉送信

## Logging / ログ保存

- **All history .txt** — full timestamped conversation log
- **My messages only .txt** — only your own inputs, stripped of all AI text

- **全履歴 .txt** — すべての送信をタイムスタンプ付きで保存
- **自分の発言のみ .txt** — 自分の入力だけを抽出したテキストファイル

## Notes / 注意

- Automation may break if any AI service changes its UI
- Gemini sometimes needs a manual tab reload to reconnect
- Permanent install requires signing via Firefox Add-ons (temporary loading is fine for dev use)

- 各AIサービスのUI変更により、送信が効かなくなることがあります
- Geminiは時々タブのリロードが必要になります
- 永続的なインストールはFirefox Add-onsへの署名申請が必要です（開発用は一時読み込みでOK）

## License

MIT
