# baycurrent-e2r-checker

ベイカレント 2028 新卒マイページ（e2r: `www.e2r.jp/ja/baycurrent2028/`）で、
**「【秋冬本選考】東大・京大生限定選考会」** に予約可能な日程があれば Discord へ通知し、
予約可能な日付の一覧も送る macOS 用ローカル自動チェックツールです。**自動予約は行いません（通知のみ）。**

構成・運用方法（launchd による15分ごとの実行、`pmset` によるスリープ解除、通知済み記録）は
`simplex-iwebs-checker` と同じです。

> 2026-10-04 に実際のマイページへログインし、画面構造を確認したうえで作成しています。
> その時点で東大・京大生限定選考会は 4 日程（10/7, 10/11, 10/14, 10/18）すべて「予約可」でした。初回実行ですぐ通知が届きます。

## 動作フロー

```text
ログイン（フォーム frmLogon: userid / password →［ログイン］）
↓
ヘッダーメニュー「選考予約」（a#meeting）の下のリンクを順に開く
  （現在は「【秋冬本選考】1次選考：WEBテスト/ES」の1件。このページに複数の選考会がまとめて並ぶ）
↓
日程ページ（div.event）を読む
  見出し h3「【秋冬本選考】東大・京大生限定選考会」
   └ 日付帯 .schedule-title「2026/10/07(水)　オンライン」
      └ 枠 .schedule「17:05〜18:00」「予約可」［予約］
↓
「予約可」（または［予約］［予約変更］ボタンあり）の枠を予約可能とする
  「予約中」の枠がある（＝すでに予約済み）場合は通知しない
↓
新しく予約可能になった枠があれば Discord 通知（予約可能日程を全件列挙、新規は 🆕）
↓
通知済み枠は data/notified_slots.json に記録して再通知しない
（満席などで予約不可に戻った枠は記録から外すので、再び空けばもう一度通知する）
```

通知例（実サイトでの動作確認時の実際の出力）：

```text
@everyone
**ベイカレントで予約可能な日程を検知しました**

**■ 【秋冬本選考】東大・京大生限定選考会**
予約可能な日程: 4件 / 全4件
・2026/10/07(水) 17:05〜18:00 / オンライン / [予約可] 🆕
・2026/10/11(日) 15:05〜16:00 / オンライン / [予約可] 🆕
・2026/10/14(水) 17:05〜18:00 / オンライン / [予約可] 🆕
・2026/10/18(日) 15:05〜16:00 / オンライン / [予約可] 🆕
予約: https://www.e2r.jp/ja/baycurrent2028/ にログイン → 選考予約 →「【秋冬本選考】1次選考：WEBテスト/ES」
```

## セットアップ

```bash
cd ~/"Documents/src/Job hunting"/confirm_system/baycurrent-e2r-checker
npm install
npm run install-browsers
cp .env.example .env
nano .env                  # E2R_ID / E2R_PASSWORD / DISCORD_WEBHOOK_URL を設定（Ctrl+X → Y → Enter で保存）
```

## 実行

```bash
npm run check   # ヘッドレス
npm run debug   # ブラウザ表示あり
ALWAYS_NOTIFY_DISCORD=true npm run debug   # 毎回Discordへ結果を送る（疎通確認）
./scripts/reset-notified.sh                # 通知済み記録を消す（もう一度通知させたいとき）
```

ログ例：

```text
[main] "【秋冬本選考】東大・京大生限定選考会": 予約可能 4件 / 全4件
[main] new reservable slots: 4
```

## レイアウト確認（画面が変わったとき用）

```bash
npm run inspect
```

「選考予約」メニューの各ページを開き、`logs/inspect/<日時>/` に HTML・スクリーンショット・全選考会の枠一覧（JSON）を保存します（予約は押しません）。

## 15分ごとの自動実行（macOS launchd）

```bash
./scripts/install-launchd.sh     # 登録
./scripts/uninstall-launchd.sh   # 停止
tail -f logs/baycurrent-e2r-checker.out.log
```

## 設定（.env）

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `TARGET_EVENT_TEXTS` | `東大・京大生限定選考会` | 選考会の見出しに含まれる文字列（カンマ区切り） |
| `ALWAYS_NOTIFY_DISCORD` | `false` | `true` で毎回結果をDiscordへ送る（疎通確認用） |
| `SAVE_DEBUG` | `true` | `logs/debug/` にHTML/スクリーンショットを保存 |
| `HEADLESS` / `AUTO_SLEEP` / `CHECK_INTERVAL_MINUTES` | | 他ツールと同じ |

## 未確認の点

- 満席になったときの表示（現在は全枠「予約可」）。`満席` `受付終了` などの文言、または［予約］ボタンが無い枠は予約不可として扱います。
- 予約後の表示。ページの説明（「予約中の日程の［キャンセル］」「［予約変更］」）に合わせ、「予約中」の枠があれば通知しません。
