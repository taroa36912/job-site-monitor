# mizuho-axol-checker

みずほフィナンシャルグループ AXOL マイページ（`mizuho-fg_28`）の予約一覧（左メニュー「予約・確認フォーム」）で、
**「クオンツ」「アクチュアリー」** のそれぞれが予約可能な状態になったら Discord へ通知し、
あわせて **予約可能な日付の一覧** も送る macOS 用ローカル自動チェックツールです。

構成・運用方法（launchd による15分ごとの実行、`pmset` によるスリープ解除、通知済み記録）は
同じAXOL基盤の `muam-axol-checker` / `metlife-axol-checker` と同じです。

> 2026-10-04 に実際のマイページへログインし、画面構造を確認したうえで作成しています（確認結果は `QUESTIONS.md`）。
> 応募・予約操作そのものは行いません（検知と通知のみ。「上記日時で予約する」は押しません）。

## 動作フロー

```text
ログイン（input[name="id"], input[name="password"]）
↓
予約・確認フォーム（mypage/form）を開く
  └ 直接開けない場合は、トップの左メニュー「予約・確認フォーム」をクリック
↓
一覧（ul.event__list > li.event__item）のうち、タイトル（h2.title）に「クオンツ」「アクチュアリー」を含む項目を探す
↓
項目ごとに判定
  ├ 項目が無い                                         → 予約不可（例：現在アクチュアリーは一覧に無い）
  ├ 「現在、受付可能な日程はありません。」でボタン無し       → 予約不可（例：現在のクオンツ）
  ├ 「※…に予約されています。」＋「予約内容を確認する」     → 予約済みのため通知しない
  └ 「予約画面へ進む」ボタンあり → 押して日程画面（form/<番号>/select）へ
       └ 日程（label.reserve__item）のうち、ラジオボタンがあり状態が「受付中」等の枠を予約可能とする
         （過去日程は「- 受付終了」と表示されラジオボタンが無いので除外）
↓
新しく予約可能になった枠があれば Discord 通知（そのプログラムの予約可能日程を全件列挙、新規は 🆕）
↓
通知済み枠は data/notified_slots.json に記録して再通知しない
（満席・受付終了などで予約不可に戻った枠は記録から外すので、再び空けばもう一度通知する）
```

通知例（実サイトの「MIZUHO証券業界まるわかりセミナー」を対象にした動作確認時の実際の出力）：

```text
@everyone
**みずほフィナンシャルグループ（まるわかり）で予約可能な日程を検知しました**

**■ まるわかり：【WEB】MIZUHO証券業界まるわかりセミナー**
URL: https://axol.jp/zw/s/mizuho-fg_28/mypage/form/15/select
予約可能な日程: 2件 / 全18件
・2026年 10月 14日(水) 17:00～18:30 / WEB / [受付中] 🆕
・2026年 10月 23日(金) 17:00～18:30 / WEB / [受付中] 🆕
```

## セットアップ

```bash
cd ~/mizuho-axol-checker   # 置いた場所
npm install
npm run install-browsers
cp .env.example .env
nano .env                  # AXOL_ID / AXOL_PASSWORD / DISCORD_WEBHOOK_URL を設定
```

## レイアウト確認（画面が変わったとき用）

```bash
npm run inspect
```

ログイン → トップ → 予約・確認フォーム → 押せる「予約画面へ進む」の先すべて を順に開き、
`logs/inspect/<日時>/` に HTML・スクリーンショット・抽出結果JSON を保存します（日程の選択や予約は押しません）。
通知が来ない・解析エラーが出るなど、サイトの構造が変わった疑いがあるときに使ってください。

## 動作確認（通知まで）

クオンツ/アクチュアリーが受付前でも、**現在予約できる別イベント**を対象にすると通知までの流れを試せます。

```bash
TARGET_KEYWORDS=まるわかり ALWAYS_NOTIFY_DISCORD=true npm run debug
```

（`まるわかり` の部分は、その時点で「予約画面へ進む」が出ているイベント名の一部に置き換えてください。）
試したあとは `./scripts/reset-notified.sh` で通知済み記録を消してください。

## 手動実行

```bash
npm run check   # ヘッドレス
npm run debug   # ブラウザ表示あり
```

ログ例：

```text
[main] クオンツ "【2nd season】グローバルマーケッツ -クオンツ編- 二次面接（WEB）": 予約不可 (受付可能な日程はありません)
[main] アクチュアリー "（予約一覧に該当項目なし）": 予約不可 (予約一覧に項目なし)
[main] no reservable target
```

## 15分ごとの自動実行（macOS launchd）

```bash
./scripts/install-launchd.sh     # 登録
./scripts/uninstall-launchd.sh   # 停止
tail -f logs/mizuho-axol-checker.out.log
```

スリープ解除の仕組みと注意点は `metlife-axol-checker/README.md` と同じです（`pmset -g sched` で確認）。

## 設定（.env）

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `TARGET_KEYWORDS` | `クオンツ,アクチュアリー` | 予約一覧の項目名に含まれる文字列（カンマ区切り） |
| `FORM_LIST_PATH` | `form` | 予約一覧のパス |
| `FORM_LIST_MENU_TEXTS` | `予約・確認フォーム` | 直接遷移に失敗した時にクリックするメニュー文言 |
| `AFTER_LOGIN_WAIT_MS` | `5000` | ログイン直後の待機 |
| `ALWAYS_NOTIFY_DISCORD` | `false` | `true` で毎回結果をDiscordへ送る（疎通確認用） |
| `SAVE_DEBUG` | `true` | `logs/debug/` にHTML/スクリーンショットを保存 |
| `HEADLESS` / `AUTO_SLEEP` / `CHECK_INTERVAL_MINUTES` | | 他ツールと同じ |

## 判定ルール

- ラジオボタン（`input[name="yoyaku_id"]`）が無い・無効な枠は予約不可（実画面の「- 受付終了」の枠）
- 状態が `満席` `受付終了` `締切` などの枠は予約不可
- それ以外でラジオボタンが選べる枠（実画面では `受付中`、未知の文言も含む）は予約可能として通知
- 「タイトルに含む」判定なので、例えば「クオンツ」は「グローバルマーケッツ -クオンツ編- 二次面接」などにも一致します
- 文言は `src/config.js` の `closedStatuses` / `openStatusKeywords` で調整できます
