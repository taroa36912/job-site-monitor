# metlife-axol-checker

メットライフ生命 AXOL マイページで、

1. ログインIDとパスワードを入力してログイン
2. トップページを開く
3. トップページ上部/メニューの「応募フォーム」をクリック
4. 応募フォーム一覧から「③ 専門職 アクチュアリー 仕事体験（選考なし）」の「応募画面へ進む」を選択
5. 日程枠の表示が「満席」「受付終了」以外になった場合、Discord Webhookへ通知

を行う macOS 用ローカル自動チェックツールです。

GASやクラウドからAXOLへ直接アクセスせず、Mac上の通常回線からPlaywrightのChromiumを起動して操作します。Macがスリープしていても、`pmset schedule wakeorpoweron` により次回チェック時刻にスリープ解除する構成です。

> 利用にあたっては、AXOLおよび企業マイページの規約に反しない範囲で、過度に高頻度なアクセスを避けてください。初期設定は15分間隔です。

---

## ディレクトリ構成

```txt
metlife-axol-checker/
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
│   └── com.local.metlife-axol-checker.plist.template
└── scripts/
    ├── install-launchd.sh
    ├── uninstall-launchd.sh
    └── reset-notified.sh
```

---

## 事前準備

### 1. Node.jsをインストール

Homebrewがある場合：

```bash
brew install node
```

確認：

```bash
node -v
npm -v
```

Node.js 18以上を想定しています。

---

### 2. zipを解凍して配置

例：ホームディレクトリ直下に置く場合。

```bash
cd ~
unzip ~/Downloads/metlife-axol-checker.zip
cd ~/metlife-axol-checker
```

---

### 3. 依存関係をインストール

```bash
npm install
npm run install-browsers
```

---

### 4. 環境変数を設定

```bash
cp .env.example .env
nano .env
```

`.env` の以下を自分の値に変更してください。

```env
AXOL_ID=xxxxxxxx
AXOL_PASSWORD=yyyyyyyyyy
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxxxxx/xxxxxxxx
```

基本的に以下は変更不要です。ログイン後、トップページから「応募フォーム」をクリックして一覧へ進む設計です。

```env
AXOL_LOGIN_URL=https://axol.jp/zw/s/metlife_28/mypage/login
AXOL_TOP_URL=https://axol.jp/zw/s/metlife_28/mypage/top
AXOL_FORM_URL=https://axol.jp/zw/s/metlife_28/mypage/form
AXOL_TARGET_SELECT_URL=https://axol.jp/zw/s/metlife_28/mypage/form/3/select
TARGET_PROGRAM_TITLE=③ 専門職 アクチュアリー 仕事体験（選考なし）
```

初回テストでは、ブラウザの動きを見えるようにするため、次の設定がおすすめです。

```env
HEADLESS=false
AUTO_SLEEP=false
SAVE_DEBUG_ARTIFACTS=true
```

安定運用に入ったら、次のように変更します。

```env
HEADLESS=true
AUTO_SLEEP=true
SAVE_DEBUG_ARTIFACTS=false
```

---

## 手動実行方法

```bash
cd ~/metlife-axol-checker
npm run check
```

初回デバッグ用に、ブラウザ表示ありで動かしたい場合：

```bash
npm run debug
```

成功すると、次のようなログが出ます。

```txt
[main] total slots: 3
[main] open slots: 0
[main] no open slots. all target slots are 満席/受付終了 or closed.
```

空き枠が出た場合はDiscordへ通知し、通知済み枠を以下に記録します。

```txt
data/notified_slots.json
```

同じ枠は再通知しません。

---

## 通知済み記録をリセットする方法

テスト通知後に再通知させたい場合：

```bash
./scripts/reset-notified.sh
```

または手動で：

```bash
echo "[]" > data/notified_slots.json
```

---

## タスクスケジューラ設定方法（macOS launchd）

macOSではWindowsの「タスクスケジューラ」に相当するものとして `launchd` を使います。

このプロジェクトには自動登録スクリプトを入れてあります。

```bash
cd ~/metlife-axol-checker
./scripts/install-launchd.sh
```

これで以下が設定されます。

- 起動時に実行
- 900秒、つまり15分ごとに実行
- 標準出力ログ：`logs/metlife-axol-checker.out.log`
- エラーログ：`logs/metlife-axol-checker.err.log`

ログ確認：

```bash
tail -f ~/metlife-axol-checker/logs/metlife-axol-checker.out.log
```

エラー確認：

```bash
tail -f ~/metlife-axol-checker/logs/metlife-axol-checker.err.log
```

---

## スリープ解除の仕組み

`launchd` の `StartInterval` だけでは、Macが完全にスリープしている間は実行されません。

そのため、このツールは毎回の実行開始時に次回のスリープ解除を予約します。

```bash
pmset schedule wakeorpoweron 次回時刻
```

予約状況は以下で確認できます。

```bash
pmset -g sched
```

流れはこうです。

```txt
1. 手動またはlaunchdでチェック実行
2. 次回15分後のwakeをpmsetで予約
3. チェック完了
4. AUTO_SLEEP=trueならMacを再スリープ
5. 15分後にMacが起きる
6. launchdが再実行
```

初回だけは、手動で一度実行してください。

```bash
cd ~/metlife-axol-checker
npm run check
pmset -g sched
```

---

## 自動実行を停止する方法

```bash
cd ~/metlife-axol-checker
./scripts/uninstall-launchd.sh
```

すでに登録されたwake予約を確認：

```bash
pmset -g sched
```

全てのwake予約を消す場合：

```bash
sudo pmset schedule cancelall
```

ただし、`cancelall` は他のwake予約も消すので注意してください。

---

## ログインや解析に失敗した場合

`.env` を以下に変更してください。

```env
HEADLESS=false
AUTO_SLEEP=false
SAVE_DEBUG_ARTIFACTS=true
```

その上で実行します。

```bash
npm run check
```

`logs/` にスクリーンショットとHTMLが保存されます。

```txt
logs/YYYY-MM-DD..._login_failed.png/html
logs/YYYY-MM-DD..._unexpected_target_page.png/html
logs/YYYY-MM-DD..._no_slots_parsed.png/html
```

見るべきポイント：

- ログイン画面のままになっていないか
- ID/PWが間違っていないか
- トップページに「応募フォーム」リンクがあるか
- 応募フォーム一覧に「③ 専門職 アクチュアリー 仕事体験（選考なし）」があるか
- `form/3/select` のページ構造が変わっていないか
- 「満席」「受付終了」以外の文言が出ていないか

---

## 判定ロジック

通知しないステータス：

```txt
満席
受付終了
```

上記以外のステータスが `.item__recep` に表示された場合、通知対象にします。

例：

```txt
募集中
受付中
応募可能
受付可能
空席
残席あり
```

未知の文言でも、「満席」「受付終了」でなければ通知します。

---

## 注意

- このツールは応募操作そのものは行いません。空き枠検知と通知のみです。
- 空き枠が出た場合は自分でマイページから応募してください。
- `AUTO_SLEEP=true` は、手動テストが成功してから有効化してください。
- Macの電源設定やセキュリティ設定により、wakeや自動実行の挙動が変わる場合があります。
