$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location -LiteralPath $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
& $config.nodePath (Join-Path (Join-Path $PSScriptRoot 'scripts') 'anonymous_group_header_capture.mjs') (Join-Path $PSScriptRoot 'config.json')
exit $LASTEXITCODE
