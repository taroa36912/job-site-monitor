# GitHub Actions で常時監視し Discord に通知する（PC 常時起動なし）

## 仕組み

```text
GitHub Actions（公開リポジトリ、1時間に1回・毎時7分）
  ├ cyberagent-snar-checker   【本選考】の空き通知（メニューに【本選考】のリンクがあるときだけ動く）
  ├ simplex-iwebs-checker     人事面談の空き通知
  └ baycurrent-e2r-checker    東大・京大生限定選考会の空き通知
  （mizuho-axol-checker は対象外: GitHub Actions のサーバーからは AXOL のログイン画面が表示されないため。Mac でローカル実行）
       ↓ 各ジョブ: npm ci → Chromium 準備 → node src/check.js（コードは Mac 版と同じ）
       ↓ 通知済み・自動予約済みの記録（data/*.json）は Actions のキャッシュで次回へ引き継ぐ
  Discord（Webhook）
```

- ワークフロー: `.github/workflows/job-monitor.yml`
- 通知先は `DISCORD_WEBHOOK_URL`（Mac で使っているものと同じ Webhook で可）。コードは Slack（`SLACK_WEBHOOK_URL`）にも対応していますが、現在のワークフローでは使っていません。
- 自動予約は停止しています（ワークフローで `AUTO_RESERVE: 'false'` を固定）。空き日程の通知だけを行います。
- Mac 専用のスリープ処理（`pmset`）は、Mac 以外では何もしません。
- 公開リポジトリでは実行ログを誰でも見られるため、画面の HTML/スクリーンショットは保存しません（`SAVE_DEBUG=false`）。ID・パスワード・Webhook URL はログ上で自動的に伏せ字になります。

> **Job-hunting リポジトリ本体は公開しないでください。** 履歴書（PDF）・ES・写真などの個人ファイルが入っています。
> 以下の手順で、`confirm_system/` の中身だけを新しい公開リポジトリに置きます。

---

## 手動で行う作業

### 1. Discord: Webhook の URL を用意する

Mac の各 `.env` に書いている `DISCORD_WEBHOOK_URL` をそのまま使えます。新しく作る場合は、
Discord のチャンネル設定 → **連携サービス** → **ウェブフック** → **新しいウェブフック** → **ウェブフックURLをコピー**。
（手順 4 の Secrets に登録。他人に見せない）

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
| `DISCORD_WEBHOOK_URL` | 手順 1 の URL |
| `CYBERAGENT_ID` / `CYBERAGENT_PASSWORD` | サイバーエージェントのマイページ ID / パスワード |
| `SIMPLEX_ID` / `SIMPLEX_PASSWORD` | シンプレクスのマイページ ID / パスワード |
| `BAYCURRENT_ID` / `BAYCURRENT_PASSWORD` | ベイカレントのマイページ ID / パスワード |

- 各社の値は、Mac の各フォルダの `.env` に書いたものと同じです。
- 監視が不要な会社は、Secrets を登録する代わりに `.github/workflows/job-monitor.yml` の `matrix.include` からその会社の5行を削除してください（Secrets が無いとそのジョブは失敗表示になります）。

### 5. 自動予約について

自動予約は停止しています（`.github/workflows/job-monitor.yml` の `AUTO_RESERVE: 'false'`）。
再開する場合はこの値を `'true'` に変更してコミットしてください（サイバーエージェントとシンプレクスが対象）。

### 6. 初回の動作確認

1. リポジトリの **Actions** タブを開く（無効になっていたら有効化）
2. 左の **job-monitor** → **Run workflow** → **always_notify** にチェック → **Run workflow**
3. 3社分のジョブが緑になり、Discord に `[DEBUG] … 実行通知` が届けば成功
4. 以後は1時間に1回（毎時7分ごろ）自動実行されます（通常の通知は新しい空きが出たときだけ）

### 7. Mac の自動実行を止める（二重通知・二重予約の防止）

各フォルダで次を実行します。

```bash
cd ~/"Documents/src/Job hunting"/confirm_system/cyberagent-snar-checker && ./scripts/uninstall-launchd.sh
cd ../simplex-iwebs-checker && ./scripts/uninstall-launchd.sh
cd ../baycurrent-e2r-checker && ./scripts/uninstall-launchd.sh
```

（launchd に登録していないフォルダでは何も起きません。）

---

## 運用上の注意

- **60日ルール:** 公開リポジトリで60日間コミットが無いと、GitHub が定期実行を自動で止めます。止まったら Actions タブから再度有効化してください（メールで通知されます）。
- **遅延:** 毎時7分の指定でも、GitHub の混雑時は数分〜十数分遅れたり、まれに1回分飛ばされたりします。
- **コードの更新:** Job-hunting 側で `confirm_system/` を直したら、公開リポジトリにも同じ変更を反映してください（手順 3 と同様にファイルを取り出し直してコミット）。
- **ログの公開範囲:** Actions のログ（空き日程・処理の流れ）は誰でも閲覧できます。ID・パスワード・Webhook URL は伏せ字になります。
- **規約:** アクセス元が GitHub のサーバーになる点を含め、各社マイページの規約（例: シンプレクス会員規約 第5条3項・第7条）との関係は、Mac で動かしていたときと同様に自己判断になります。
