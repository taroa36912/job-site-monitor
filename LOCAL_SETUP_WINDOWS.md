# Windows で15分ごとに監視する（タスク スケジューラ）

サイバーエージェント・シンプレクス・ベイカレントの3社を、Windows のタスク スケジューラから15分ごとに順番に確認し、
新しい空き日程があれば Discord に通知します。**自動予約は行いません**（`scripts/run-all.ps1` で `AUTO_RESERVE=false` を固定）。

```text
タスク スケジューラ（タスク名 job-site-monitor、15分ごと・ログオン中のみ）
  └ powershell scripts/run-all.ps1
       ├ cyberagent-snar-checker   本選考（メニューに「本選考」を含むリンクがあるときだけ動く）
       ├ simplex-iwebs-checker     人事面談
       └ baycurrent-e2r-checker    東大・京大生限定選考会
     ログ: logs/local-monitor.log
```

GitHub Actions の定期実行は停止済みです（二重通知を防ぐため）。

---

## 手順（PowerShell で実行）

### 0. 必要なもの

- Git と Node.js（18 以上）。`node -v` と `git --version` で確認できます。

### 1. リポジトリを取得

```powershell
cd $HOME
git clone https://github.com/taroa36912/job-site-monitor.git
cd job-site-monitor
```

### 2. 依存関係と Chromium をインストール

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
```

### 3. 各社の `.env` を作る

3つのフォルダそれぞれで `.env.example` をコピーし、メモ帳で ID・パスワード・Discord の Webhook URL を書き込みます。

```powershell
foreach ($c in 'cyberagent-snar-checker','simplex-iwebs-checker','baycurrent-e2r-checker') {
  Copy-Item ".\$c\.env.example" ".\$c\.env"
  notepad ".\$c\.env"
}
```

| フォルダ | 書き込む項目 |
| --- | --- |
| `cyberagent-snar-checker` | `SNAR_ID` / `SNAR_PASSWORD` / `DISCORD_WEBHOOK_URL` |
| `simplex-iwebs-checker` | `IWEBS_ID` / `IWEBS_PASSWORD` / `DISCORD_WEBHOOK_URL` |
| `baycurrent-e2r-checker` | `E2R_ID` / `E2R_PASSWORD` / `DISCORD_WEBHOOK_URL` |

- `SLACK_WEBHOOK_URL=` は空のままにしてください。
- `.env` は Git 管理外なので、GitHub には上がりません。

### 4. 動作確認（1回だけ実行）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
Get-Content .\logs\local-monitor.log -Tail 40
```

ログに3社分の `[main] ... finished` が出ていれば成功です。新しい空きがあれば Discord に通知が届きます。

### 5. 15分ごとの定期実行を登録

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-task.ps1
```

約1分後から15分ごとに実行されます。確認:

```powershell
Get-ScheduledTask -TaskName job-site-monitor | Get-ScheduledTaskInfo
Get-Content .\logs\local-monitor.log -Tail 40 -Wait
```

### 停止する場合

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\unregister-task.ps1
```

---

## 以前の定期実行を止める

- **GitHub Actions:** 定期実行（`schedule`）はワークフローから外したので、もう動きません。手動実行（Run workflow）だけ残しています。
- **Mac の launchd:** Mac をまだ使う場合は、各社フォルダで `./scripts/uninstall-launchd.sh` を実行してください（Mac を使わないなら不要）。
- **Windows で以前に登録したタスクがあるか:** 次で確認できます。

```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -match 'checker|job|monitor' } | Select-Object TaskName, State
```

不要なものは `Unregister-ScheduledTask -TaskName <名前> -Confirm:$false` で削除できます。

---

## 注意

- タスクは **Windows にログオンしている間だけ**動きます（パスワードを保存しない設定のため）。スリープ中は動かず、復帰後に実行されます（`StartWhenAvailable` / `WakeToRun` を設定）。
- 実行のたびに PowerShell のウィンドウが一瞬表示されることがあります。
- 対象を変えたいときは `scripts/run-all.ps1` の `$Checkers` を編集します（例: みずほも見るなら `'mizuho-axol-checker'` を追加し、`setup-local.ps1` の一覧にも追加して実行し、`.env` を作成）。
- 通知済みの記録は各フォルダの `data/notified_slots.json` です。もう一度通知させたいときはこのファイルを削除してください。
