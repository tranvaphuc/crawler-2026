param(
    [Parameter(Mandatory)] [int]$YouTubeId,
    [Parameter(Mandatory)] [int]$NewsId,
    [Parameter(Mandatory)] [string]$PythonPath,
    [switch]$YouTubeComplete
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $workspace
$audit = 'outputs/source-keyword-catalog-2026-11-19/cross-platform-audit'
$result = "$audit/plan-audit-live/scope-followup"
$queryFile = "$result/queries.json"
$progressFile = "$result/collection-progress.json"
$stages = [ordered]@{
    youtube = @{ Id = $YouTubeId; Process = $(if (-not $YouTubeComplete) { Get-Process -Id $YouTubeId }); Resumed = [bool]$YouTubeComplete }
    news = @{ Id = $NewsId; Process = (Get-Process -Id $NewsId); Resumed = $false }
}

function Test-CollectorActive($stage) {
    ($null -ne $stage.Process) -and (-not $stage.Process.HasExited)
}

function Start-RemainingSearch([string]$channel) {
    Start-Process -FilePath $PythonPath -WorkingDirectory $workspace -WindowStyle Hidden -PassThru `
        -ArgumentList @('-X','utf8','scripts/collect_catalog_platform_audit.py',$channel,'--query-file',$queryFile,'--wait-on-rate-limit') `
        -RedirectStandardOutput "$result/$channel-resume.stdout.log" -RedirectStandardError "$result/$channel-resume.stderr.log"
}

function Write-ProgressSnapshot([string]$status) {
    $channels = [ordered]@{}
    foreach ($name in $stages.Keys) {
        $run = $stages[$name]
        $isRunning = Test-CollectorActive $run
        $channels[$name] = @{ id = $run.Id; active = $isRunning; resumed = $run.Resumed }
        if ($run.Resumed -and -not $isRunning) {
            $channels[$name].exit_code = $(if ($null -eq $run.Process) { 0 } else { $run.Process.ExitCode })
        }
    }
    $snapshot = @{ status = $status; supervisor_id = $PID; checked_at = [DateTimeOffset]::UtcNow.ToString('o'); channels = $channels }
    $temp = "$progressFile.partial"
    $snapshot | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temp -Encoding utf8
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        try {
            Move-Item -LiteralPath $temp -Destination $progressFile -Force
            break
        } catch {
            if ($attempt -eq 9) { throw }
            Start-Sleep -Milliseconds 150
        }
    }
}

function Get-AuditRevision {
    $files = @("$audit/youtube-search-followup.jsonl", "$audit/news-search-followup.jsonl",
        "$result/reviewed-channel-evidence.json", "$result/inputs.json")
    ($files | ForEach-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc.Ticks }) -join '-'
}

$revision = ''
try {
    do {
        foreach ($name in $stages.Keys) {
            $run = $stages[$name]
            if (-not (Test-CollectorActive $run) -and -not $run.Resumed) {
                $run.Process = Start-RemainingSearch $name
                $run.Id = $run.Process.Id
                $run.Resumed = $true
            }
        }
        $active = @($stages.Values | Where-Object { Test-CollectorActive $_ }).Count -gt 0
        if (($currentRevision = Get-AuditRevision) -ne $revision) {
            & $PythonPath -X utf8 scripts/review_catalog_scope_followup.py apply
            if ($LASTEXITCODE -ne 0) { throw "Catalog checkpoint exited with code $LASTEXITCODE" }
            $revision = $currentRevision
        }
        Write-ProgressSnapshot $(if ($active) { 'COLLECTING' } else { 'COLLECTORS_EXITED' })
        if ($active) { Start-Sleep -Seconds 45 }
    } while ($active)
} catch {
    Write-ProgressSnapshot 'SUPERVISOR_ERROR'
    throw
}
