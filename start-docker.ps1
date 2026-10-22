[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\FinApp.Common.ps1')
$volume = if ($env:FINAPP_POSTGRES_VOLUME) {
    $env:FINAPP_POSTGRES_VOLUME
}
else {
    'finapp_postgres_data'
}
# Reused the external database volume so recreating application containers did
# not silently replace the persistent account records with an empty database.
if ((Invoke-Native 'docker' @('volume', 'inspect', $volume) -Quiet) -ne 0) {
    Invoke-Checked 'docker' @('volume', 'create', $volume)
}
Write-Host 'Local FinApp: http://localhost:8080 - testuser / test123'
Write-Host 'Verification codes appear in backend logs. Use docker compose stop to stop services.'
Invoke-Checked 'docker' @('compose', 'up', '--build')
