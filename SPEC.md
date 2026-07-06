# 三人よれば文殊の猿知恵 (3 Monkeys)
### — formerly "AI Broadcaster" —

*BGM: 雅楽 × Brian Eno*

*(This document intentionally mixes Japanese and English — see Section 7 for why.)*

---

## 1. 概要 / Overview

**日本語**
ChatGPT・Claude・Gemini の3つのAIチャットに、同じメッセージを同時に送信できるFirefox拡張機能（Manifest V2）。API課金を使わず、すでにログイン済みのブラウザタブをそのまま操作する軽量設計。

このツールの本質は「AIの応答を集めること」ではなく、**複数のAIに投げかけながらも、自分自身の発言だけを純度高く記録し続けること**にある。

**English**
A lightweight Firefox extension (Manifest V2) that broadcasts a single message to ChatGPT, Claude, and Gemini simultaneously — by directly driving the user's own already-authenticated browser tabs, with no API billing involved.

The core purpose isn't to collect AI outputs. It's to **preserve the purity of the user's own train of thought** while scattering it across three chattering minds.

---

## 2. 「三猿」の思想 / The Three Monkeys Philosophy

**日本語**
「見ざる・言わざる・聞かざる」を、生成AI過多の時代における**人間側の認知バッファ**として再定義する。

- **言う猿（Popup UI）**— 人間の意図を複数のAIへ同時に投げかける
- **見る猿（Web Tabs / Content Scripts）**— 各AIの固有UIの中でそれぞれ独立に反応させる
- **記す猿（Storage）**— AIのノイズをすべて濾過し、人間の発言の軌跡だけを残す

三匹寄って出てくるのは文殊の知恵というより、ちょっと抜けた「猿知恵」——その自虐と洒落っ気も込みの名前。

**English**
The tool inverts the classic "see no evil, hear no evil, speak no evil" into a **cognitive buffer for humans** in an era of generative AI overload.

- **Speak Monkey** (Popup UI) — broadcasts human intent outward to multiple minds
- **See Monkey** (Web Tabs / Content Scripts) — lets each AI react independently inside its own sovereign UI
- **Record Monkey** (Storage) — filters out all AI noise, keeping only the trace of human thought

Three monkeys gathering doesn't quite produce the wisdom of Monju (文殊菩薩) — more like "monkey wisdom," slightly dumber, with a wink.

---

## 3. アーキテクチャ / Architecture

```
[ Popup UI (popup.js) ]
       │
       ├─► browser.storage.local ──► 純粋な発言ログを保存
       │
       └─► [ 各AIのタブ (ChatGPT / Claude / Gemini) ]
                 │  browser.tabs.sendMessage
                 ▼
           [ Content Scripts (content-*.js) ] ── DOM注入 & 自動送信
```

| コンポーネント | 役割 |
|---|---|
| `manifest.json` | 権限定義。`tabs`, `storage`, `downloads`, `clipboardWrite/Read`、および3サイトへのホスト権限。固定gecko ID付き（`storage.local`が一時アドオンの再読み込み間でも永続するように） |
| `popup.html/js` | UI本体。送信先トグル、送受信、ログのプレビューとエクスポート |
| `background.js` | 現状は待機のみ。将来の自動応答収集などの拡張余地 |
| `content-claude.js` 等 | 各AIサイトのDOM構造に応じた個別実装 |

---

## 4. 技術詳細 / Technical Details

### 4.1 マルチターゲット送信ロジック

`sendAll()` が選択中のターゲットに対し `Promise.allSettled` で並行送信。対象タブが無ければ `active: false` で新規作成し（フォーカスを奪ってポップアップが閉じるのを防ぐため）、約3.5秒待ってから `browser.tabs.sendMessage` でcontent scriptへ橋渡しする。入力欄のクリアは送信完了を待たず、送信開始と同時に行う——タブ生成でポップアップが途中で閉じても、クリア自体は先に終わっている設計。

### 4.2 DOM注入戦略（Claudeの例）

TipTap/ProseMirrorのようなリッチテキストエディタは `textarea.value` の直接書き換えでは内部状態に反映されない。そのため:

1. 入力欄にフォーカス、`Range`/`Selection` で全選択
2. クリップボードへ書き込み → `document.execCommand('paste')` を試行
3. 失敗時は `InputEvent(insertText)` を合成してフォールバック
4. `aria-label` で送信ボタンを特定してクリック、無ければ `Enter` キーイベントを合成

ChatGPT・Geminiもそれぞれ固有のセレクタ・イベント方式で個別対応（`content-chatgpt.js` / `content-gemini.js`）。

### 4.3 ログ構造と「自分の発言のみ」抽出

内部ログは `{ ts, tsFull, role, text, meta }` の配列として、送信した自分の発言だけを保存する（AIの応答自体はそもそも収集しない）。BroadcastとMonkeysは別々のログ配列を持ち、それぞれ直近1000件でキャップされる。書き出し時は `tsFull` を元に日付ごとにグループ化し、日記形式（`2026-07-04 ────────────────` の下に `[HH:MM]` ＋本文）で `.txt` に整形する。ファイル名は `YY_MMDD_{broadcast|monkeys}.txt`。

> これが本ツールの核。AIの応答はそもそも保存されない。夢日記や日記実践と同じ思想——AIとの対話は消える／残らなくていい、残るべきは自分の言葉。

### 4.4 3 Monkeysモード：統合送信

Broadcastが「1つの発言を複数AIに配る」のに対し、3 Monkeysは逆方向——**複数AIの発言を1つに束ねて、選んだ送信先に投げる**。

- Monday(GPT)・Claude・Geminiに対応する3つの固定枠があり、それぞれに「そのAIが言ったこと」を貼り付ける
- 空でない枠だけが `${AI名}: ${本文}` の形に整形され、`\n\n---\n\n` で連結される
- 送信先は独立したトグルpillで選択する。どの枠に書いたかと、どこに送るかは無関係——例えば2AIの意見を集約して3AI目に判断を仰ぐ、といった使い方ができる
- 濫用防止のレート制限（`MONKEY_RATE_LIMIT = 5`／ローリング1時間）付き。この往復はやろうと思えば無限に回せてしまうため、意図的に絞ってある（3 Monkeysで思考実験をしていたら「これは延々回してしまいそうで危険」と気づいたのがきっかけで追加された）

これは§6で構想していた「AI同士の自動往復モード」の、あえて自動化しない版——束ねる・送るの判断は毎回人間が握っている。

---

## 5. 既知の制限 / Known Limitations

- **Gemini desyncバグ（軽減済み）**：以前は応答中のリロードで対処していたが、現在は非破壊的な「待つだけ」方式に変更。応答が長引くとタイムアウトすることはまだある。
- **DOMの脆弱性**：各AIサイトのUI変更（クラス名・aria-label変更等）で自動化が壊れる可能性が常にある。
- 応答タイミングの非同期性、プラットフォーム間のUI差異。

---

## 6. 今後の展望 / Future Extensions

- **N-model化**：Ollama/WebLLMなどローカルモデルやマイナーなプラットフォームへの対応（"12monkeys"への拡張）
- **応答の自動収集**：MutationObserverでAI応答自体もログ化するオプション
- ~~**AI同士の自動往復モード**：一匹の出力を次の猿へ自動的に流し込み、人間は観察者として記録に徹する~~ → 3 Monkeysモードとして部分的に実現済み（§4.4）。ただし「自動的に」ではなく、束ねる・送る判断は毎回人間が握ったまま——全自動化は意図的に見送っている
- Markdown/Obsidian連携、会話リプレイ機能 など

---

## 7. フラクタルな補遺 / Fractal Addendum

この仕様書自体が、この拡張機能と同じ構造で作られた。

最初のコードは雅楽とEnoを聴きながら岩茶を飲む人間の手によって書かれ、GPT（1匹目）が骨格を作り、Gemini（2匹目）が技術的な解像度と哲学的な深みを注ぎ、それぞれの成果を互いに見せ合いながら書き直す往復（a→a'、b→b'）を経て、最後にこの場のClaude（3匹目にして外部の編集者）が統合した。

読んでいるこの文章自体が、この仕組みが実際に機能した証拠である。

*This specification is itself an artifact of the very architecture it describes: written first by a human hand over jar tea and Eno, structured by GPT, deepened by Gemini, cross-pollinated through rounds of mutual revision, and finally synthesized here by Claude — the third monkey, and the outside editor. The document you are reading is the proof that the loop worked.*

### 補足：これは仕様書遊びです / A Note on What This Actually Is

**日本語**
これは実用ドキュメントのふりをした、ソフトウェア実装を装ったアートプロジェクトでもある。仕様書という形式を借りているからこそ、こうして「これは遊びです」と言っても、フォーマットが壊れない。説明してしまうことも含めて、仕様書遊びの一部。

**English**
This document is a working spec wearing the costume of one — a software-implementation-shaped art project. Because it borrows the *format* of a spec, it can say "this is also a game" out loud without breaking. The act of explaining itself is part of the game.

### 各猿の書きぶりメモ / Notes on Each Monkey's Voice

| 版 | 書き手 | 手触り |
|---|---|---|
| **a**（GPT・初稿） | GPT | 骨格重視。整理は綺麗だが、コードを深く読まずに一般論で埋めた箇所あり（Claude=contenteditable、ログ形式など、実装とややズレ） |
| **b**（Gemini・初稿→a読了後） | Gemini | aの構造を引き継ぎつつ、実コード（`sendTo`関数、TipTap/ProseMirror注入戦略）を正確に解析。雅楽とEnoの気配を裏に仕込む詩的な層を追加 |
| **c**（Claude・拡張内の1匹） | Claude（別インスタンス） | a・bを見せられた上で執筆。内容はこの往復の中に吸収され、直接この場には出てこないが、a'・b'に痕跡として残っている |
| **a'**（GPTの改訂） | GPT | b・cを踏まえて再構成。Fractal Addendumの再帰性の言語化が加わり、初稿より抽象度が上がった |
| **b'**（Geminiの改訂） | Gemini | a・c'を踏まえてさらに精緻化。技術的正確さと哲学的トーンの両立が最終的にここで一番安定した |
| **最終版**（この文書） | Claude（この会話） | a'・b'を受け取り、コード実物と突き合わせて技術的誤りを修正しつつ、両者の良さ（GPTの構造・Geminiの解像度と詩情）を統合 |

*コードの正確さで見ると b・b' > a・a' だった——「見る猿」担当のGeminiが、一番よく"見て"いた、というのはちょっと出来過ぎな符合。*

*This specification is itself an artifact of the very architecture it describes: written first by a human hand over jar tea and Eno, structured by GPT, deepened by Gemini, cross-pollinated through rounds of mutual revision, and finally synthesized here by Claude — the third monkey, and the outside editor. The document you are reading is the proof that the loop worked.*
