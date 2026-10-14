# simplex-iwebs-checker

シンプレクス 2028 新卒マイページ（i-webs: `mypage.3030.i-webs.jp/simplex2028/`）で、
**「人事面談」** に空き日程が出たら Discord へ通知（予約可能な日付の一覧つき）し、
**一番最後（開催日時が最も遅い）の日程を自動で予約** する macOS 用ローカル自動チェックツールです。

構成・運用方法（launchd による15分ごとの実行、`pmset` によるスリープ解除、通知済み記録）は
`cyberagent-snar-checker` と同じです。

> 2026-10-04 に実際のマイページへログインし、日程選択画面までの構造を確認して作成しています（確認結果は `QUESTIONS.md`）。
> 確認画面・完了画面は、予約操作にあたるため開発環境からは開けておらず未確認です。運用前に「お試しモード」で確認してください。

## 動作フロー

```text
ログイン（#gksid / gkspw → #loginbtn。成功すると applicant/top/index へ）
↓
マイページトップの「人事面談」（div.contents_bdr_wrap の h3）の「申込/確認」を押す
↓
説明画面「人事面談のご案内」の「予約開始」を押す
  └ 予約済みの画面（「申込内容を変更」など）だった場合は何もしない
↓
日程選択画面（table.scheduletable：予約状況 / 開催日 / 開催時間 / 会場名）を読む
  ├ 「予約」ボタン（jsSubmit('番号')）がある行 → 空きあり
  └ 「満席」                                  → 予約不可
↓
空きがあれば自動予約（下記）→ 結果を Discord 通知
↓
新しく空いた日程を Discord 通知（予約可能日程を全件列挙、新規は 🆕）
↓
通知済み枠は data/notified_slots.json に記録して再通知しない
（満席に戻った枠は記録から外すので、再び空けばもう一度通知する）
```

## 自動予約

```text
空き日程のうち開催日時が最も遅いものを選ぶ
↓
日程選択画面を開き直し、その行の「予約」を押す → 確認画面
↓
確認画面に選んだ日程の日付・時刻が表示されているか確認（違えば中止）
↓
「予約申し込み」を押す（このとき出る確認ダイアログだけ OK）
↓
完了の文言（「予約が完了」「受け付けました」など）が出ていれば成功
↓
Discord に「✅ 自動予約しました」/「⚠️ 自動予約できませんでした」を通知（画面は logs/reserve/ に保存）
```

- 成功すると `data/reserved.json` に記録し、以後は自動予約しません。予約済みの画面になった場合もしません。
- 失敗した場合は次回も再試行しますが、同じ枠の失敗通知は初回だけです。
- 完了画面は未確認のため、完了を確認できなかった場合は「失敗」として通知します。その場合はマイページで予約状況を確かめてください。
- 自動予約するのは `AUTO_RESERVE_TEXTS`（既定: `人事面談`）を含む項目だけです。止めるときは `.env` で `AUTO_RESERVE=false`。

## セットアップ

```bash
cd ~/Job-hunting/confirm_system/simplex-iwebs-checker
npm install
npm run install-browsers
cp .env.example .env
nano .env                  # IWEBS_ID / IWEBS_PASSWORD / DISCORD_WEBHOOK_URL を設定（Ctrl+X → Y → Enter で保存）
```

## 動作確認

通知まで（人事面談が満席でも、予約できる別イベントで試せます。自動予約はしません）：

```bash
TARGET_TEXTS=CEO特別セミナー ALWAYS_NOTIFY_DISCORD=true npm run debug
./scripts/reset-notified.sh
```

自動予約のお試し（確認画面まで進み、「予約申し込み」は押しません）：

```bash
TARGET_TEXTS=CEO特別セミナー AUTO_RESERVE_TEXTS=CEO特別セミナー AUTO_RESERVE_DRY_RUN=true npm run debug
```

成功するとログに `[reserve] result: dry-run - 確認画面まで進みました（「予約申し込み」ボタンを確認…）` と出て、
`logs/reserve/` に確認画面のスクリーンショットが保存されます。

（`CEO特別セミナー` は、その時点で予約できるイベントの見出しの一部に置き換えてください。）

## 手動実行

```bash
npm run check   # ヘッドレス
npm run debug   # ブラウザ表示あり
```

ログ例：

```text
[main] "人事面談": 予約可能 0件 / 全10件
[main] no reservable slots
```

## レイアウト確認（画面が変わったとき用）

```bash
npm run inspect
```

トップの「申込/確認」がある各項目について、日程選択画面まで開いて `logs/inspect/<日時>/` に保存します（予約は押しません）。

## 15分ごとの自動実行（macOS launchd）

```bash
./scripts/install-launchd.sh     # 登録
./scripts/uninstall-launchd.sh   # 停止
tail -f logs/simplex-iwebs-checker.out.log
```

## 設定（.env）

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `TARGET_TEXTS` | `人事面談` | トップの項目見出しに含まれる文字列（カンマ区切り） |
| `AUTO_RESERVE` | `true` | 自動予約するか |
| `AUTO_RESERVE_TEXTS` | `人事面談` | 自動予約する項目 |
| `AUTO_RESERVE_DRY_RUN` | `false` | `true` で確認画面まで進み「予約申し込み」は押さない |
| `ALWAYS_NOTIFY_DISCORD` | `false` | `true` で毎回結果をDiscordへ送る（疎通確認用） |
| `SAVE_DEBUG` | `true` | `logs/debug/` にHTML/スクリーンショットを保存 |
| `HEADLESS` / `AUTO_SLEEP` / `CHECK_INTERVAL_MINUTES` | | 他ツールと同じ |
