# Stop and remove the task registered by scripts/register-task.ps1.
$TaskName = 'job-site-monitor'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "unregistered: $TaskName"
} else {
  Write-Host "task not found: $TaskName"
}
