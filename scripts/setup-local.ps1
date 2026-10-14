# One-time setup: install dependencies and Chromium for each monitor.
$Checkers = @('cyberagent-snar-checker', 'simplex-iwebs-checker', 'baycurrent-e2r-checker')
$Root = Split-Path -Parent $PSScriptRoot

foreach ($checker in $Checkers) {
  Write-Host "=== $checker"
  Push-Location (Join-Path $Root $checker)
  try {
    npm ci --no-audit --no-fund
    npx playwright install chromium
  } finally {
    Pop-Location
  }
}
Write-Host 'done'
