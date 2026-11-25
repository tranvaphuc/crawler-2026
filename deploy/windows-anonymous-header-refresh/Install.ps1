param([string]$TaskName = 'Crawler Anonymous Group Headers Hourly')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'Run.ps1') + '"') -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddHours(1)) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 8)
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Capture a fresh isolated anonymous Group request hourly. Server validates it using the Group proxy and production parser; failed validation preserves the active template and all checkpoints.' -Force | Out-Null
[pscustomobject]@{TaskName=$TaskName;Account=$account;Interval='1 hour';RunsWithoutInteractiveLogin=$true;MultipleInstances='IgnoreNew';ExecutionLimitMinutes=8}|ConvertTo-Json -Compress
