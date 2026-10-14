# Register a Windows Task Scheduler task that runs scripts/run-all.ps1 every 15 minutes.
# The task runs only while you are logged on (no password is stored).
$TaskName = 'job-site-monitor'
$Root = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $PSScriptRoot 'run-all.ps1'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'node not found. Install Node.js first.'
  exit 1
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`"" `
  -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "registered: $TaskName (every 15 minutes, first run in about 1 minute)"
Write-Host "log: $(Join-Path $Root 'logs\local-monitor.log')"
