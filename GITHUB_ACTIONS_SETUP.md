# GitHub Actions で常時監視し Slack に通知する（PC 常時起動なし）

## 仕組み

```text
GitHub Actions（公開リポジトリ、15分ごと）
  ├ cyberagent-snar-checker   2次選考の空き通知＋自動予約
  ├ simplex-iwebs-checker     人事面談の空き通知＋自動予約
  ├ baycurrent-e2r-checker    東大・京大生限定選考会の空き通知
  └ mizuho-axol-checker       クオンツ・アクチュアリーの空き通知
       ↓ 各ジョブ: npm ci → Chromium 準備 → node src/check.js（コードは Mac 版と同じ）
       ↓ 通知済み・自動予約済みの記録（data/*.json）は Actions のキャッシュで次回へ引き継ぐ
  Slack（Incoming Webhook。フリープランのアプリ10個の枠のうち1つを使用）
```

- ワークフロー: `.github/workflows/job-monitor.yml`
- 通知先は `SLACK_WEBHOOK_URL`。Mac で使う場合は今までどおり `DISCORD_WEBHOOK_URL` も使え、両方設定すれば両方へ送ります。
- Mac 専用のスリープ処理（`pmset`）は、Mac 以外では何もしません。
- 公開リポジトリでは実行ログを誰でも見られるため、画面の HTML/スクリーンショットは保存しません（`SAVE_DEBUG=false`）。ID・パスワード・Webhook URL はログ上で自動的に伏せ字になります。

> **Job-hunting リポジトリ本体は公開しないでください。** 履歴書（PDF）・ES・写真などの個人ファイルが入っています。
> 以下の手順で、`confirm_system/` の中身だけを新しい公開リポジトリに置きます。

---

## 手動で行う作業

### 1. Slack: Incoming Webhook の URL を作る

1. https://api.slack.com/apps を開き **Create New App** → **From scratch**
2. App Name（例: `job-monitor`）と通知先のワークスペースを選んで作成
3. 左メニュー **Incoming Webhooks** → **Activate Incoming Webhooks** を On
4. 画面下の **Add New Webhook to Workspace** → 通知先チャンネルを選んで **許可する**
5. 表示された `https://hooks.slack.com/services/...` をコピー（手順 4 の Secrets に登録。他人に見せない）

### 2. このブランチを Job-hunting の main にマージ

PR をマージしてください。以降の手順は main の `confirm_system/` を使います。

### 3. 公開リポジトリを作り、`confirm_system/` の中身だけを置く

1. GitHub で新しいリポジトリを作成（例: `job-site-monitor`）
   - Visibility: **Public**（公開リポジトリは Actions の実行時間が無料・無制限。非公開だと月2,000分の無料枠を大きく超えます）
   - README などは追加せず空のまま
2. Mac のターミナルで実行（Git 管理下のファイルだけを取り出すので、`.env`・`node_modules`・`logs` は含まれません。履歴も引き継がないので、過去のコミットのメールアドレスは公開されません）

```bash
cd ~/"Documents/src/Job hunting"
git checkout main
git pull origin main
mkdir ~/job-site-monitor
git archive main:confirm_system | tar -x -C ~/job-site-monitor
cd ~/job-site-monitor
git init -b main
git add .
git commit -m "job site monitor"
git remote add origin https://github.com/<GitHubユーザー名>/job-site-monitor.git
git push -u origin main
```

> コミットに使うメールアドレスを公開したくない場合は、`git commit` の前に
> `git config user.email "<ID>+<ユーザー名>@users.noreply.github.com"` を設定してください
> （GitHub の Settings → Emails で確認できます）。

### 4. GitHub Secrets を登録

公開リポジトリの **Settings → Secrets and variables → Actions → Secrets → New repository secret** で、次を1つずつ登録します。

| Name | 値 |
| --- | --- |
| `SLACK_WEBHOOK_URL` | 手順 1 の URL |
| `CYBERAGENT_ID` / `CYBERAGENT_PASSWORD` | サイバーエージェントのマイページ ID / パスワード |
| `SIMPLEX_ID` / `SIMPLEX_PASSWORD` | シンプレクスのマイページ ID / パスワード |
| `BAYCURRENT_ID` / `BAYCURRENT_PASSWORD` | ベイカレントのマイページ ID / パスワード |
| `MIZUHO_ID` / `MIZUHO_PASSWORD` | みずほのマイページ ID / パスワード |

- 各社の値は、Mac の各フォルダの `.env` に書いたものと同じです。
- 監視が不要な会社は、Secrets を登録する代わりに `.github/workflows/job-monitor.yml` の `matrix.include` からその会社の5行を削除してください（Secrets が無いとそのジョブは失敗表示になります）。

### 5.（任意）自動予約を止める

**Settings → Secrets and variables → Actions → Variables → New repository variable** で `AUTO_RESERVE` = `false`。
未設定なら今までどおり、サイバーエージェントとシンプレクスで自動予約が有効です。

### 6. 初回の動作確認

1. リポジトリの **Actions** タブを開く（無効になっていたら有効化）
2. 左の **job-monitor** → **Run workflow** → **always_notify** にチェック → **Run workflow**
3. 4社分のジョブが緑になり、Slack に `[DEBUG] … 実行通知` が届けば成功
4. 以後は15分ごとに自動実行されます（通常の通知は新しい空きが出たときだけ）

### 7. Mac の自動実行を止める（二重通知・二重予約の防止）

各フォルダで次を実行します。

```bash
cd ~/"Documents/src/Job hunting"/confirm_system/cyberagent-snar-checker && ./scripts/uninstall-launchd.sh
cd ../simplex-iwebs-checker && ./scripts/uninstall-launchd.sh
cd ../baycurrent-e2r-checker && ./scripts/uninstall-launchd.sh
cd ../mizuho-axol-checker && ./scripts/uninstall-launchd.sh
```

（launchd に登録していないフォルダでは何も起きません。）

---

## 運用上の注意

- **60日ルール:** 公開リポジトリで60日間コミットが無いと、GitHub が定期実行を自動で止めます。止まったら Actions タブから再度有効化してください（メールで通知されます）。
- **遅延:** 15分ごとの指定でも、GitHub の混雑時は数分〜十数分遅れたり、まれに1回分飛ばされたりします。
- **コードの更新:** Job-hunting 側で `confirm_system/` を直したら、公開リポジトリにも同じ変更を反映してください（手順 3 と同様にファイルを取り出し直してコミット）。
- **ログの公開範囲:** Actions のログ（空き日程・処理の流れ）は誰でも閲覧できます。ID・パスワード・Webhook URL は伏せ字になります。
- **規約:** アクセス元が GitHub のサーバーになる点を含め、各社マイページの規約（例: シンプレクス会員規約 第5条3項・第7条）との関係は、Mac で動かしていたときと同様に自己判断になります。
