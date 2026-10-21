[CmdletBinding()]
param([ValidateSet('client', 'local', 'server')][string] $Mode = 'client')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\FinApp.Common.ps1')
if ($Mode -ne 'client') {
    $databaseMode = if ($Mode -eq 'local') { 'local' } else { 'shared' }
    & (Join-Path $PSScriptRoot 'start-server.ps1') -DatabaseMode $databaseMode
    return
}
$previousUpstream = $env:FINAPP_API_UPSTREAM
$previousEncoding = [Console]::OutputEncoding
$previousOutputEncoding = $OutputEncoding
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [Console]::OutputEncoding
    $endpoint = if ($env:FINAPP_API_UPSTREAM) { $env:FINAPP_API_UPSTREAM } else {
        (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'shared-backend.json') -Raw | ConvertFrom-Json).url
    }
    if (!$endpoint) { throw 'The shared backend is not deployed yet. Its owner must finish docs/shared-hosting.md and set shared-backend.json once. Teammates do not need Neon access or .env files.' }
    $target = [uri]$endpoint
    if (!$target.IsAbsoluteUri -or $target.UserInfo -or $target.AbsolutePath -ne '/' -or $target.Query -or $target.Fragment -or
        ($target.Scheme -ne 'https' -and !($target.Scheme -eq 'http' -and $target.Host -in @('localhost', '127.0.0.1', '[::1]')))) {
        throw 'Configure an HTTPS shared backend origin without credentials or a path.'
    }
    if (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue) { throw 'Port 8080 is already in use. Stop the previous FinApp launch first.' }
    $env:FINAPP_API_UPSTREAM = $endpoint.TrimEnd('/')
    Write-Host '[API] Using the shared FinApp backend. No database or Neon login is needed on this computer.' -ForegroundColor Green
    foreach ($package in @('./frontend', './frontend/landing', './frontend/dashboard')) {
        if (!(Test-Path (Join-Path $package 'node_modules'))) {
            Invoke-Checked 'npm.cmd' @('ci', '--prefix', $package)
        }
    }
    Invoke-Checked 'npm.cmd' @('run', 'build', '--prefix', './frontend')
    Write-Host 'FinApp: http://localhost:8080 - press Ctrl+C to stop.' -ForegroundColor Green
    Set-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
    & node.exe express.js
    if ($LASTEXITCODE -ne 0) { throw 'FinApp frontend stopped with an error.' }
} finally {
    $env:FINAPP_API_UPSTREAM = $previousUpstream
    [Console]::OutputEncoding = $previousEncoding
    $OutputEncoding = $previousOutputEncoding
    Set-Location -LiteralPath $PSScriptRoot
}
