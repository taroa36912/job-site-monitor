# cyberagent-snar-checker

サイバーエージェント 新卒マイページ（`cyberagent.snar.jp`）で、
**「【内定直結型インターンシップ選考】2次選考のご予約・確認はこちら」** の予約画面に予約可能な日程が出たら
Discord へ通知し、あわせて **予約可能な日付の一覧** も送る macOS 用ローカル自動チェックツールです。

構成・運用方法（launchd による15分ごとの実行、`pmset` によるスリープ解除、通知済み記録）は
`mizuho-axol-checker` と同じです。

> 2026-10-04 に実際のマイページへログインし、画面構造を確認したうえで作成しています（確認結果は `QUESTIONS.md`）。
> 予約操作そのものは行いません（検知と通知のみ。「予約受付中」のリンクは押しません）。

## 動作フロー

```text
ログイン（login.aspx の #id / #password、フォーム mypage/loginCheck.aspx へ送信）
  └ 失敗時は lib/error.aspx「ID・パスワードが正しくありません。」→ エラー終了
↓
マイページトップ（mypage/index.aspx）の左メニューから「2次選考のご予約」を含むリンクを開く
  （ASP.NET のポストバックで mypage/seminar.aspx へ遷移）
↓
日程表（table#grv_EventList：開催日 / 開始時間 / 会場名 / 予約状況）を読む
  ├ 予約状況が「予約受付中」のリンク            → 予約可能
  ├ 予約状況が「満　席」                        → 予約不可
  └ 日程が多い場合はページ送り（右矢印）で全ページを読む
↓
新しく予約可能になった枠があれば Discord 通知（予約可能日程を全件列挙、新規は 🆕）
↓
通知済み枠は data/notified_slots.json に記録して再通知しない
（満席などで予約不可に戻った枠は記録から外すので、再び空けばもう一度通知する）
```

通知例（実サイトで予約受付中のイベントを対象にした動作確認時の実際の出力）：

```text
@everyone
**サイバーエージェントで予約可能な日程を検知しました**

**■ サイバーエージェント流！「企画書の作り方講座」**
予約可能な日程: 1件 / 全1件
・2026年10月6日(火) 18:00 / 〈オンライン配信〉 Zoom / [予約受付中] 🆕
予約: https://cyberagent.snar.jp/login.aspx にログイン →「サイバーエージェント流！「企画書の作り方講座」」
```

## 自動予約

2次選考の予約画面に空き枠が出たら、**一番最後（開催日時が最も遅い）の日程を自動で予約**し、結果を Discord に通知します。

```text
日程表の該当行の「予約受付中」を押す
↓
予約確認画面「この日程に予約しますか？」で、開催日・開催時間が選んだ日程と一致するか確認（違えば中止）
↓
「予約する」（#lkb_Entry）を押し、確認ダイアログ「日程の予約を行います。よろしいですか？」だけ OK
↓
「この日程に予約しますか？」が消え、完了の文言か「予約をキャンセル」ボタンが出ていれば予約完了
↓
Discord に「✅ 自動予約しました」/「⚠️ 自動予約できませんでした」を通知（画面は logs/reserve/ に保存）
```

- 予約に成功すると `data/reserved.json` に記録し、以後は自動予約しません（日程表に「予約済」の枠がある場合もしません）。
- 失敗した場合は次回も再試行しますが、同じ枠の失敗通知は初回だけです。
- 予約の完了画面は事前に確認できていないため、完了を確認できなかった場合は「失敗」として通知します。その場合はマイページで予約状況を確かめてください。
- 自動予約するのは `AUTO_RESERVE_MENU_TEXTS`（既定: `2次選考のご予約`）を含む予約画面だけです。
- 止めるときは `.env` で `AUTO_RESERVE=false`。

お試し（確定は押さず、予約確認画面まで進むだけ）：

```bash
TARGET_MENU_TEXTS=企画書の作り方講座 AUTO_RESERVE_MENU_TEXTS=企画書の作り方講座 AUTO_RESERVE_DRY_RUN=true npm run debug
```

## セットアップ

```bash
cd ~/Job-hunting/confirm_system/cyberagent-snar-checker
npm install
npm run install-browsers
cp .env.example .env
nano .env                  # SNAR_ID / SNAR_PASSWORD / DISCORD_WEBHOOK_URL を設定（Ctrl+X → Y → Enter で保存）
```

## 手動実行

```bash
npm run check   # ヘッドレス
npm run debug   # ブラウザ表示あり
```

ログ例：

```text
[main] "【内定直結型インターンシップ選考】2次選考のご予約・確認はこちら": 予約可能 0件 / 全1件
[main] no reservable slots
```

## 動作確認（通知まで）

2次選考が満席でも、**現在「予約受付中」の別イベント**を対象にすると通知までの流れを試せます。

```bash
TARGET_MENU_TEXTS=企画書の作り方講座 ALWAYS_NOTIFY_DISCORD=true npm run debug
./scripts/reset-notified.sh
```

（`企画書の作り方講座` は、その時点でマイページ左メニューにあるイベント名の一部に置き換えてください。）

## レイアウト確認（画面が変わったとき用）

```bash
npm run inspect
```

マイページトップと、左メニューの各予約画面を順に開き、`logs/inspect/<日時>/` に HTML・スクリーンショット・抽出結果JSON を保存します（予約は押しません）。

## 15分ごとの自動実行（macOS launchd）

```bash
./scripts/install-launchd.sh     # 登録
./scripts/uninstall-launchd.sh   # 停止
tail -f logs/cyberagent-snar-checker.out.log
```

## 設定（.env）

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `TARGET_MENU_TEXTS` | `2次選考のご予約` | 左メニューのリンク名に含まれる文字列（カンマ区切り） |
| `MAX_PAGES` | `20` | 日程表のページ送りの上限 |
| `AFTER_LOGIN_WAIT_MS` | `2000` | ログイン直後の待機 |
| `ALWAYS_NOTIFY_DISCORD` | `false` | `true` で毎回結果をDiscordへ送る（疎通確認用） |
| `SAVE_DEBUG` | `true` | `logs/debug/` にHTML/スクリーンショットを保存 |
| `HEADLESS` / `AUTO_SLEEP` / `CHECK_INTERVAL_MINUTES` | | 他ツールと同じ |

## 判定ルール

- 予約状況（空白を除いて比較）が `満席` `受付終了` `締切` `予約済` `キャンセル` `変更` などを含む枠は予約不可
- `予約受付中` `受付中` `空席` `残りわずか` などは予約可能
- どちらにも当てはまらなくても、予約リンクに文字が入っている枠は予約可能として通知（取りこぼし防止）
- 文言は `src/config.js` の `closedStatuses` / `openStatusKeywords` で調整できます
