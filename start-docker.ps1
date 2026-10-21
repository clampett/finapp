# Backend-owner Docker stack; credentials are kept on the owner's machine.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\FinApp.Common.ps1')
$keys = @('FINAPP_DATABASE_MODE', 'SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD', 'ANTHROPIC_API_KEY', 'PYTHON_SERVICE_URL', 'FINAPP_POSTGRES_VOLUME', 'FINAPP_PG_CLIENT_IMAGE')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
    Import-FinAppEnvironment (Join-Path $PSScriptRoot '.env')
    Assert-FinAppSharedDatabase
    Invoke-Checked 'docker' @('compose', '-f', (Join-Path $PSScriptRoot 'docker-compose.shared.yml'), 'up', '--build')
} finally {
    foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
