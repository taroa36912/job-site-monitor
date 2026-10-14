# Run each monitor once, in order. Called every 15 minutes by Windows Task Scheduler
# (registered with scripts/register-task.ps1). Output is appended to logs/local-monitor.log.
# To change the target sites, edit $Checkers (e.g. add 'mizuho-axol-checker').

$Checkers = @('cyberagent-snar-checker', 'simplex-iwebs-checker', 'baycurrent-e2r-checker')

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root 'logs'
$Log = Join-Path $LogDir 'local-monitor.log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Node prints UTF-8; decode it as UTF-8 so Japanese text is not garbled in the log
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Automatic reservation is disabled (overrides AUTO_RESERVE in each .env)
$env:AUTO_RESERVE = 'false'
$env:AUTO_SLEEP = 'false'
$env:HEADLESS = 'true'

function Write-Log([string]$Message) {
  Add-Content -Path $Log -Value $Message -Encoding utf8
}

foreach ($checker in $Checkers) {
  $dir = Join-Path $Root $checker
  Write-Log ("=== {0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $checker)
  if (-not (Test-Path (Join-Path $dir '.env'))) {
    Write-Log "!!! $checker\.env not found. skipped"
    continue
  }
  Push-Location $dir
  try {
    & node src/check.js 2>&1 | ForEach-Object { Write-Log "$_" }
    if ($LASTEXITCODE -ne 0) { Write-Log "!!! $checker failed (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}
