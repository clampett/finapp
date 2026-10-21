[CmdletBinding()]
param([ValidateSet('local', 'shared')][string] $DatabaseMode)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\FinApp.Common.ps1')
Import-FinAppEnvironment (Join-Path $PSScriptRoot '.env')
$mode = Get-FinAppDatabaseMode $DatabaseMode
$directory = Join-Path $PSScriptRoot 'backups'
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
$name = 'finapp-' + $mode + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.dump'
$destination = Join-Path $directory $name
if ($mode -eq 'shared') {
    Assert-FinAppSharedDatabase
    Invoke-FinAppPgClient @('pg_dump', '--format=custom', '--no-owner', '--no-acl', "--file=/backups/$name") $directory
} else {
    $containers = @(& docker compose -f (Join-Path $PSScriptRoot 'docker-compose.yml') ps -q db)
    if ($LASTEXITCODE -ne 0 -or $containers.Count -ne 1) { throw 'Start the local database before backing it up.' }
    $container = $containers[0].Trim()
    Invoke-Checked 'docker' @('exec', $container, 'pg_dump', '-U', 'postgres', '-d', 'finapp', '--format=custom', '--no-owner', '--no-acl', "--file=/tmp/$name")
    Invoke-Checked 'docker' @('cp', "${container}:/tmp/$name", $destination)
}
if (!(Test-Path -LiteralPath $destination) -or (Get-Item -LiteralPath $destination).Length -eq 0) { throw 'Backup file was not created.' }
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
[System.IO.File]::WriteAllText(($destination + '.sha256'), $hash, [System.Text.Encoding]::ASCII)
Write-Host "Backup saved: $destination" -ForegroundColor Green
Write-Host 'Keep a private copy outside this computer. Backups contain account data and password hashes.'
