# aflac-axol-checker

アフラック 2028年新卒採用マイページで、`Aflac Summer 1day インターンシップ` の空き枠を監視し、空きがあればDiscordへ通知するローカルmacOS向けツールです。

GASなどのクラウドから直接アクセスせず、Mac上のPlaywright/Chromiumで通常ブラウザに近い形でログイン・画面遷移します。

## 監視フロー

1. ログインページを開く
2. ID / PASSWORDを入力してログイン
3. トップページの `予約フォーム -Aflac Summer 1day インターンシップ-` の `申込/確認` を選択
4. 既に予約済み画面の場合、`申込内容を変更する` を選択
5. 予約開始画面の場合、`予約開始` を選択
6. 日程選択画面を解析
7. `満席` / `受付終了` などでなく、選択可能な枠があればDiscordへ通知
8. 通知済み枠は `data/notified_slots.json` に記録し、再通知しない

## 事前準備

### 1. Node.jsをインストール

Homebrewを使う場合:

```bash
brew install node
```

確認:

```bash
node -v
npm -v
```

### 2. zipを解凍

```bash
cd ~
unzip ~/Downloads/aflac-axol-checker.zip
cd ~/aflac-axol-checker
```

### 3. 依存関係をインストール

```bash
npm install
npm run install-browsers
```

### 4. `.env` を作成

```bash
cp .env.example .env
nano .env
```

以下を設定してください。

```env
AFLAC_ID=あなたのID
AFLAC_PASSWORD=あなたのパスワード
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxxxxx/xxxxxxxx
```

初回テスト時は以下を推奨します。

```env
HEADLESS=false
AUTO_SLEEP=false
```

## 手動実行

ブラウザを見ながらデバッグする場合:

```bash
cd ~/aflac-axol-checker
npm run debug
```

ヘッドレスで通常実行する場合:

```bash
npm run check
```

成功例:

```txt
[main] parsed slots: 5
[main] open slots: 0
[main] no open slots
```

もし日程欄をうまく解析できなかった場合、`logs/` にHTMLとスクリーンショットが保存されます。

## 15分ごとの自動実行 macOS launchd

```bash
cd ~/aflac-axol-checker
./scripts/install-launchd.sh
```

ログ確認:

```bash
tail -f ~/aflac-axol-checker/logs/aflac-axol-checker.out.log
```

エラーログ:

```bash
tail -f ~/aflac-axol-checker/logs/aflac-axol-checker.err.log
```

停止:

```bash
cd ~/aflac-axol-checker
./scripts/uninstall-launchd.sh
```

## スリープ解除

`check.js` は起動時に次回のwakeを予約します。

```bash
pmset -g sched
```

で予約状況を確認できます。

チェック後にMacを再スリープさせたい場合は、`.env` を以下にします。

```env
AUTO_SLEEP=true
HEADLESS=true
```

最初から `AUTO_SLEEP=true` にするとデバッグが面倒なので、動作確認後に切り替えてください。

## 通知済み記録のリセット

同じ枠を再通知したい場合:

```bash
./scripts/reset-notified.sh
```

または手動で:

```bash
echo "[]" > ~/aflac-axol-checker/data/notified_slots.json
```

## 判定ロジック

以下を含む枠は通知対象外です。

- 満席
- 受付終了
- 受付締切
- 申込終了
- 予約終了
- 予約受付終了
- 締切

以下の場合は通知対象です。

- 日程行に有効なradio/checkboxがある
- `受付中` / `予約可` / `空席` / `残席` / `予約可能` などの文字列がある

`NOTIFY_UNKNOWN_OPEN_STATUS=false` の場合、未知の文言だけでは通知しません。誤通知を減らすため、初期設定では `false` にしています。

## 注意

採用マイページの規約・利用条件に反しない範囲で、自分のアカウントに対して低頻度で実行してください。15分間隔程度を想定しています。
