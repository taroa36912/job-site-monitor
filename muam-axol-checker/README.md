# muam-axol-checker

三菱UFJアセットマネジメント AXOL マイページで、5daysサマーインターンの空き枠を監視し、満席ではない枠が出たらDiscordへ通知するローカル実行用ツールです。オンラインを先に確認し、オンラインが満席の場合は対面も確認します。

## 動作フロー

```text
ログイン
↓
[予約・確認フォーム] を選択
↓
[【オンライン】5daysサマーインターン　8/24(月)～8/28(金)] の日程一覧を確認
↓
オンラインが満席/空きなしなら [【対面】5daysサマーインターン　8/24(月)～8/28(金)] の日程一覧も確認
↓
どちらかに「満席」「受付終了」などではない表示があればDiscord通知
↓
通知済み枠は data/notified_slots.json に記録して再通知しない
```


## 今回の修正点

オンラインが満席だった場合に、対面の予約枠も追加確認するようにしました。添付HTMLでは予約フォーム一覧にオンライン `button#button2` と対面 `button#button1` があり、対面詳細ページでは `.item__recep.full` に `満席` が表示されます。この構造に合わせ、オンライン `form/2/select` を先に確認し、満席/空きなしなら対面 `form/1/select` も確認します。

また、トップページのHTMLでは、`予約・確認フォーム` のリンクがPCメニューとSP用dialog内に重複して存在します。Playwrightで単純に最初のリンクをクリックすると、非表示側のリンクを掴んで進まないことがあるため、修正版では以下の3つを組み合わせています。

1. ログイン後、セッションとメニューが安定するまで `AFTER_LOGIN_WAIT_MS` だけ待機します。
2. `[予約・確認フォーム]` はクリックではなく、まず `https://axol.jp/zw/s/am_mufg_28/mypage/form` へ直接遷移します。
3. 直接遷移後、URL・セレクタ・本文テキストを使って、画面が本当に進んだことを待機します。

さらに、予約フォーム一覧から各コースの `予約画面へ進む` を押す箇所も、ボタンの遷移先と同じURLへ直接遷移する方式に変更しました。オンラインは `https://axol.jp/zw/s/am_mufg_28/mypage/form/2/select`、対面は `https://axol.jp/zw/s/am_mufg_28/mypage/form/1/select` を開きます。ここでも `reserve__item` / `item__recep` が表示されるまで待機します。

直接遷移に失敗した場合のみ、PC左メニューの可視リンク、または `button#button2` をクリックするフォールバックを行います。

Discord通知デバッグ用に `ALWAYS_NOTIFY_DISCORD` を追加しました。`true` にすると、満席でも、枠が0件でも、実行ごとに必ずDiscordへデバッグ通知します。

## 事前準備

### 1. Node.jsを入れる

Homebrewを使う場合:

```bash
brew install node
```

### 2. zipを解凍

```bash
cd ~
unzip ~/Downloads/muam-axol-checker.zip
cd ~/muam-axol-checker
```

### 3. 依存関係をインストール

```bash
npm install
npm run install-browsers
```

### 4. .envを作成

```bash
cp .env.example .env
nano .env
```

以下を設定してください。

```env
AXOL_ID=あなたのID
AXOL_PASSWORD=あなたのパスワード
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxxxxx/xxxxxxxx
```

初回テスト時は次のままで大丈夫です。

```env
HEADLESS=true
AUTO_SLEEP=false
SAVE_DEBUG=true
ALWAYS_NOTIFY_DISCORD=false
```

ブラウザの動きを目視したい場合は、以下に変更してください。

```env
HEADLESS=false
AUTO_SLEEP=false
```

## 手動実行

```bash
cd ~/muam-axol-checker
npm run debug
```

Discord通知の疎通を確認したい場合は、`.env` を一時的に以下へ変更してください。

```env
ALWAYS_NOTIFY_DISCORD=true
```

この設定中は、満席でも毎回Discordにデバッグ通知が届きます。確認後は必ず `false` に戻してください。

成功すると、ログに次のような行が出ます。

```text
[check:online] total slots: 1
[check:online] non-full/open slots: 0
[main] online has no non-full/open slots. checking onsite as fallback.
[check:onsite] total slots: 1
[check:onsite] non-full/open slots: 0
[main] no non-full/open slots
```

デバッグ用HTMLとスクリーンショットは以下に保存されます。

```text
~/muam-axol-checker/logs/debug/
```

## 遷移設定

通常は変更不要ですが、URL構造が変わった場合は `.env` で変更できます。

```env
TOP_PATH=top
FORM_LIST_PATH=form
ONLINE_SELECT_PATH=form/2/select
ONSITE_SELECT_PATH=form/1/select
ONLINE_EVENT_TITLE=【オンライン】5daysサマーインターン　8/24(月)～8/28(金)
ONSITE_EVENT_TITLE=【対面】5daysサマーインターン　8/24(月)～8/28(金)
ONLINE_BUTTON_SELECTOR=button#button2
ONSITE_BUTTON_SELECTOR=button#button1
AFTER_LOGIN_WAIT_MS=5000
NAVIGATION_RETRIES=2
```

今回の対象は、左側メニューの `[予約・確認フォーム]` と同じ `form` を開き、その後オンライン側の `[予約画面へ進む]` と同じ `form/2/select` を先に開きます。オンラインが満席/空きなしの場合のみ、対面側の `form/1/select` も確認します。

画面が一瞬チカッとして戻る場合は、`.env` の `AFTER_LOGIN_WAIT_MS` を `8000`〜`10000` に増やして再テストしてください。

## 空き枠判定

以下を通知対象外にしています。

```text
満席
受付終了
終了
締切
予約済
キャンセル待ち終了
```

それ以外の状態、または以下のような文言は通知対象です。

```text
募集中
受付中
受付可能
予約可能
空席
空き
残席
申込可能
予約する
```

未知の状態も通知対象にする設定になっています。オンライン・対面とも、状態が `満席` でなくなった場合は通知対象です。

## 15分ごとの自動実行設定 macOS launchd

```bash
cd ~/muam-axol-checker
./scripts/install-launchd.sh
```

ログ確認:

```bash
tail -f ~/muam-axol-checker/logs/muam-axol-checker.out.log
```

エラーログ:

```bash
tail -f ~/muam-axol-checker/logs/muam-axol-checker.err.log
```

## スリープ解除について

このツールは実行開始時に次回実行時刻のwake予約を行います。

```bash
pmset schedule wakeorpoweron 次回時刻
```

予約状況確認:

```bash
pmset -g sched
```

完全に運用する場合は `.env` で以下にできます。

```env
HEADLESS=true
AUTO_SLEEP=true
```

ただし、初回テスト中は `AUTO_SLEEP=false` のままにしてください。

## 自動実行を止める

```bash
cd ~/muam-axol-checker
./scripts/uninstall-launchd.sh
```

pmsetの予約を全部消す場合のみ、必要に応じて以下を実行してください。

```bash
sudo pmset schedule cancelall
```

ほかのwake予約も消えるので注意してください。

## 通知済み記録をリセット

```bash
cd ~/muam-axol-checker
./scripts/reset-notified.sh
```

## ファイル構成

```text
muam-axol-checker/
├── package.json
├── .env.example
├── README.md
├── src/
│   ├── check.js
│   ├── config.js
│   ├── discord.js
│   ├── logger.js
│   ├── parser.js
│   ├── store.js
│   └── wake.js
├── data/
│   └── notified_slots.json
├── logs/
├── plist/
└── scripts/
    ├── install-launchd.sh
    ├── uninstall-launchd.sh
    └── reset-notified.sh
```
