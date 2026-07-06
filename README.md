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

**Broadcast mode**

1. Open ChatGPT / Claude / Gemini in separate tabs (logged in)
2. Click the extension icon to open the popup
3. Toggle target AIs on/off using the pills at the top
4. Type your message in the textarea
5. Click **Send** or press **Ctrl+Enter** to broadcast

**3 Monkeys mode**

Switch to the "3 Monkeys" tab. There are three fixed boxes — Monday (GPT), Claude, Gemini — paste what each AI said into its box (leave any blank to skip it). Toggle which destination(s) should receive the result using the pills below. Click **Send Combined** and the non-empty boxes are merged into one message (`Monday: ...` / `---` / `Claude: ...`) and sent to whichever destination(s) you selected — which can be different from which boxes had content. Capped at 5 combined sends per rolling hour, on purpose (this loop can spiral).

**ブロードキャストモード**

1. ChatGPT / Claude / Gemini を各タブで開いておく（ログイン済みの状態）
2. 拡張機能のアイコンをクリックしてポップアップを開く
3. 上部のボタンで送信先を選択（クリックでON/OFF）
4. テキストエリアにメッセージを入力
5. **Send** ボタン or **Ctrl+Enter** で一斉送信

**3 Monkeysモード**

「3 Monkeys」タブに切り替える。Monday(GPT)・Claude・Geminiの固定3枠に、それぞれのAIが言ったことを貼り付ける（空欄はスキップされる）。下のpillで送信先をトグルして選択（貼り付けた枠と送信先は独立）。「Send Combined」を押すと、空じゃない枠だけが`Monday: ...` / `---` / `Claude: ...`の形に結合されて、選んだ送信先に送られる。1時間あたり5回までのレート制限あり（意図的——この往復はやろうと思えば無限に回せてしまうため）。

## Logging / ログ保存

Broadcast and 3 Monkeys keep **separate** logs. Each has one export button:

- **Export** — your own messages only, grouped by date (`2026-07-04 ────────────────`) with `[HH:MM]` per entry, saved as `YY_MMDD_broadcast.txt` or `YY_MMDD_monkeys.txt`. The log clears after a successful export (it's safely on disk).
- Exports use `browser.downloads.download` with `saveAs:false` — no dialog, straight to Firefox's default download folder. Point that folder at wherever you want exports to live (`about:preferences` → General → Downloads) and every export lands there automatically.

BroadcastとMonkeysのログは**別々**に保持される。それぞれエクスポートボタンが1つ:

- **Export** — 自分の発言だけを日付ごとにグループ化して（`2026-07-04 ────────────────`）、`[HH:MM]`付きで`YY_MMDD_broadcast.txt`／`YY_MMDD_monkeys.txt`として保存。エクスポート成功後はログがクリアされる（ディスクに残ってるので）。
- ダイアログなしで即保存（`saveAs:false`）。Firefoxのデフォルトのダウンロード先を好きなフォルダに設定しておけば（`about:preferences` → 一般 → ダウンロード）、そこに毎回自動で落ちる。

## Notes / 注意

- Automation may break if any AI service changes its UI
- Gemini waits (no reload) if it looks mid-response before sending — usually fine, but can time out if the response runs long
- "New Chat" buttons force-navigate the tab to a fresh conversation for that AI (or the whole row with "ALL")
- Target pills, drafts, and mode are remembered across popup close/reopen (`browser.storage.local`, keyed to a fixed extension ID — see manifest)
- Requires the `downloads` permission (for exporting logs)
- Permanent install requires signing via Firefox Add-ons (temporary loading is fine for dev use)

- 各AIサービスのUI変更により、送信が効かなくなることがあります
- Geminiは応答中っぽいときはリロードせず待ってから送信します（基本問題ないですが、応答が長引くとタイムアウトすることがあります）
- 「New Chat」ボタンは、そのAIのタブを新規会話のURLに強制ナビゲートします（「ALL」で全部まとめて）
- 送信先pill・下書き・モードはポップアップを閉じても記憶されます（`browser.storage.local`、manifestの固定IDに紐づく）
- ログのエクスポートには`downloads`権限が必要です
- 永続的なインストールはFirefox Add-onsへの署名申請が必要です（開発用は一時読み込みでOK）

## License

MIT
