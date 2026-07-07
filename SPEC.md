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

### 1.1 目的とモットー / Purpose & Motto

**日本語**
2026-07-07のアップデートで、このツールの立ち位置を改めて言語化した。Broadcasterは効率化ツールではなく、**「思考をそっと置くためのインターフェース」**である。目的は生産性ではなく:

- AIとの健全な距離感をつくること
- 思考を外へ置くこと
- 自分のリズムを観測すること
- 世界をそっと美しくすること

評価もしない。依存も促さない。禁止もしない。ただ、自分を映す鏡になる。

> 旗印：**世界をそっと美しく**

**English**
The 2026-07-07 update put this into words explicitly: Broadcaster isn't a productivity tool, it's **an interface for quietly setting thought down**. The goal isn't productivity — it's building a healthy distance from AI, externalizing thought, observing one's own rhythm, and quietly making the world a little more beautiful. It doesn't judge, doesn't encourage dependency, doesn't forbid. It's just a mirror.

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

送信ボタンのラベルは「Send for Yourself」（Broadcast）／「Send for Ourselves」（3 Monkeys）。「AIへ送る」ではなく「自分（たち）のために送る」というニュアンスを持たせている。送信前の確認ダイアログ（「本当に送りますか？」）は意図的に設けていない——摩擦はラベルの言い回しだけで十分、という判断。

### 4.2 DOM注入戦略（Claudeの例）

TipTap/ProseMirrorのようなリッチテキストエディタは `textarea.value` の直接書き換えでは内部状態に反映されない。そのため:

1. 入力欄にフォーカス、`Range`/`Selection` で全選択
2. クリップボードへ書き込み → `document.execCommand('paste')` を試行
3. 失敗時は `InputEvent(insertText)` を合成してフォールバック
4. `aria-label` で送信ボタンを特定してクリック、無ければ `Enter` キーイベントを合成

ChatGPT・Geminiもそれぞれ固有のセレクタ・イベント方式で個別対応（`content-chatgpt.js` / `content-gemini.js`）。

### 4.3 ログ構造と「自分の発言のみ」抽出

内部ログは `{ ts, tsFull, role, text, meta }` の配列として、送信した自分の発言だけを保存する（AIの応答自体はそもそも収集しない）。BroadcastとMonkeysは別々のログ配列を持ち、それぞれ直近1000件でキャップされる。表示・書き出しの時刻は24時間・コロン区切り（`HH:mm`）。書き出し時は `tsFull` を元に日付ごとにグループ化し、日記形式（`2026-07-04(火) ────────────────` の下に本文＋末尾に `[HH:MM]`）で `.txt` に整形する——時刻を本文の頭ではなく末尾に置くのは、まず言葉が先にあり、時刻は後から付く署名のような位置づけにしたいため。ファイル名は `YY_MMDD_{broadcast|monkeys}.txt`。

> これが本ツールの核。AIの応答はそもそも保存されない。夢日記や日記実践と同じ思想——AIとの対話は消える／残らなくていい、残るべきは自分の言葉。

### 4.4 3 Monkeysモード：統合送信

Broadcastが「1つの発言を複数AIに配る」のに対し、3 Monkeysは逆方向——**複数AIの発言を1つに束ねて、選んだ送信先に投げる**。

- Monday(GPT)・Claude・Geminiに対応する3つの固定枠があり、それぞれに「そのAIが言ったこと」を貼り付ける
- 空でない枠だけが `${AI名}: ${本文}` の形に整形され、`\n\n---\n\n` で連結される
- 送信先は独立したトグルpillで選択する。どの枠に書いたかと、どこに送るかは無関係——例えば2AIの意見を集約して3AI目に判断を仰ぐ、といった使い方ができる
- 濫用防止のレート制限（`MONKEY_RATE_LIMIT = 5`／ローリング1時間）付き。この往復はやろうと思えば無限に回せてしまうため、意図的に絞ってある（3 Monkeysで思考実験をしていたら「これは延々回してしまいそうで危険」と気づいたのがきっかけで追加された）

これは§6で構想していた「AI同士の自動往復モード」の、あえて自動化しない版——束ねる・送るの判断は毎回人間が握っている。

### 4.5 統計 — 鏡であって成績表ではない / Statistics (v1)

制限ではなく観測。送信回数や文字数を制御するのではなく、自分の傾向を眺めるための機能として、popupに3つ目のモードタブ「Stats」を追加した（対象はBroadcastログのみ）。

- **メイン画面（Broadcastビュー）**：直近1件だけを控えめな1行で表示——文字数と、前回投稿からの間隔（例：「8 chars · 1時間ぶり」）。デフォルト画面は静かに保つという方針上、ここではそれ以上の情報を出さない。
- **Statsタブ**：スライダー（直近2〜12件）または「Today」トグルで期間を選び、その窓の中での平均文字数・中央値・ペース（件／時）を表示。標準偏差そのものの数値は出さず、代わりに変動係数を3段階（steady / uneven / turbulent）の言葉とドット（●●●〜●○○）に丸めた「Rhythm」として表示する——生の分散値は直感的に読めないため
- **アンビエントな円グラフ**：直近12件までを円で並べ、文字数を大きさに、直前の投稿との間隔を色温度（穏やかな青〜性急な暖色）にマッピングする

> 留意点（自己言及）：色温度による表現は「青＝穏やか」「暖色＝性急」という連想を伴い、完全に評価から自由なニュートラルな記号とは言い切れない。§6で構想する v2 の傾向記号では、この点を踏まえてより中立的な表現（単色の濃淡・形の変化のみ等）を検討する。

---

## 5. 既知の制限 / Known Limitations

- **Gemini desyncバグ（軽減済み）**：以前は応答中のリロードで対処していたが、現在は非破壊的な「待つだけ」方式に変更。応答が長引くとタイムアウトすることはまだある。
- **DOMの脆弱性**：各AIサイトのUI変更（クラス名・aria-label変更等）で自動化が壊れる可能性が常にある。
- 応答タイミングの非同期性、プラットフォーム間のUI差異。

---

## 6. 今後の展望 / Future Extensions

### 6.1 実装優先順位（2026-07-07時点）

| # | 項目 | 状態 |
|---|---|---|
| 1 | 時刻表示 `HH:mm`（24時間・コロン区切り） | ✅ 実装済み |
| 2 | 入力欄・popupサイズの拡大 | ✅ 実装済み |
| 3 | Sendボタンラベル変更（Send for Yourself / Ourselves） | ✅ 実装済み |
| 4 | 統計表示 v1（メイン画面は直近1件のみ、静かに） | ✅ 実装済み（§4.5） |
| 5 | ログ／ビュー分離設計、CSV/JSONエクスポート | 未着手（現状は`.txt`のみ） |
| 6 | 別タブでの可視化（FXチャート的、インジケータON/OFF） | 未着手 |
| 7 | （保留）アンビエント可視化モード | 構想のみ |
| 8 | （保留）ダウンタイム関連機能 | 構想のみ・意図的に見送り |

### 6.2 統計 v2：より深い観測

v1の「Rhythm」を土台に、以下を段階的に追加する構想:

- **文字数**：今回の値・平均・中央値・標準偏差・平均からのずれ（z-score）
- **送信回数**：1時間あたり／1日あたり、それぞれの平均・中央値・標準偏差・現在との差
- **沈黙時間**：前回投稿からの経過・平均・中央値・標準偏差・現在との差——「良い／悪い」の評価ではなく、「今日は長く潜っていた」のようにリズムを見るための指標
- **傾向記号**：矢印の向きや「赤＝悪い／青＝良い」のような評価的な連想を避け、単に「今との差」だけを示すニュートラルな記号（色ではなく形・濃淡など）を検討する。統計は鏡であって成績表ではない、という原則をv1以上に徹底する

### 6.3 ログ／ビューの分離とエクスポート

Broadcaster本体は「ログを残すだけ」の役割に徹し、可視化とは明確に分離する設計へ移行する。

- ログをCSV／JSONでエクスポート可能にする（現状の`.txt`日記形式に加えて）
- 外部のHTMLやチャートツールで自由に分析・可視化できるようにする——可視化ロジックを拡張本体から切り離すことで、拡張自体をシンプルに保てる

### 6.4 可視化タブ：FXチャートのような自由度

別タブ（popup内のStatsタブとは別に、より広い画面を想定）に、分析・観賞用の可視化画面を用意する。デフォルト画面はあくまで静かに保ち、可視化は見に行く人だけが見る場所にする。

- **時間軸の切り替え**：時間足・日足・週足・月足——FXチャートのように期間の粒度を選べる
- **インジケータの自由なON/OFF**：SMA・EMA・Bollinger Bands（±σ）・Median・Histogram・Trend など、見たいものだけ重ねられる
- エクスポートしたCSV/JSONを読み込んで、各自が好きなように可視化・インジケータ操作できる設計を志向する

### 6.5 専用のアンビエントサイト（構想）

拡張のpopupとは別に、眺めるためだけの独立したアンビエントサイトを将来的に作りたいという構想がある。数値やチャートではなく、粒子・波紋・色・時間の流れといった質感で「今の自分のリズム」を映すもの。v1のアンビエント円グラフ（§4.5）はこの構想の小さな先取りにあたる。

### 6.6 その他の展望

- **N-model化**：Ollama/WebLLMなどローカルモデルやマイナーなプラットフォームへの対応（"12monkeys"への拡張）
- **応答の自動収集**：MutationObserverでAI応答自体もログ化するオプション
- ~~**AI同士の自動往復モード**：一匹の出力を次の猿へ自動的に流し込み、人間は観察者として記録に徹する~~ → 3 Monkeysモードとして部分的に実現済み（§4.4）。ただし「自動的に」ではなく、束ねる・送る判断は毎回人間が握ったまま——全自動化は意図的に見送っている
- Markdown/Obsidian連携、会話リプレイ機能 など

### 6.7 ダウンタイムについて（今回は実装しない）

「一定時間送れない」のような強制的な制限は入れない方針を維持する。代わりに統計・可視化によって自分自身がリズムを観測できるようにする、という間接的なアプローチを取る。将来オプションとして検討しうるもの（現時点ではスコープ外）:

- 下書き保存
- 一定時間後に送信
- AI返信を少し遅らせる

ただしデフォルトではシンプルさを優先する——3 Monkeysのレート制限（§4.4）のような明示的な制限は、乱用が具体的に観測された機能に限って例外的に設けている。

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
