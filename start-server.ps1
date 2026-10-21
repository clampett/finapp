[CmdletBinding()]
param([ValidateSet('local', 'shared')][string] $DatabaseMode)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$javaProcess = $null
$frontendProcess = $null
$javaOutput = $null
$javaError = $null
$frontendOutput = $null
$frontendError = $null
$infrastructureStarted = $false
$infrastructureServices = @()
$composeFile = Join-Path $projectRoot 'docker-compose.yml'
$previousConsoleEncoding = [Console]::OutputEncoding
$previousOutputEncoding = $OutputEncoding
$environmentKeys = @('FINAPP_DATABASE_MODE', 'FINAPP_POSTGRES_VOLUME', 'FINAPP_PG_CLIENT_IMAGE',
    'SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD',
    'ANTHROPIC_API_KEY', 'PYTHON_SERVICE_URL', 'NO_COLOR')
$previousEnvironment = @{}
foreach ($key in $environmentKeys) { $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }

. (Join-Path $projectRoot 'scripts\FinApp.Common.ps1')

function Show-ServiceLogs {
    Write-ServiceOutput $javaOutput 'SPRING' 'Cyan'
    Write-ServiceOutput $javaError 'SPRING' 'Yellow'
    Write-ServiceOutput $frontendOutput 'WEB' 'Green'
    Write-ServiceOutput $frontendError 'WEB' 'Yellow'
}

try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [Console]::OutputEncoding
    $env:NO_COLOR = '1'
    Import-FinAppEnvironment (Join-Path $projectRoot '.env')
    $mode = Get-FinAppDatabaseMode $DatabaseMode
    if ($mode -eq 'shared') {
        Assert-FinAppSharedDatabase
        $composeFile = Join-Path $projectRoot 'docker-compose.shared.yml'
        $infrastructureServices = @('python-backend')
        Write-Host '[DATABASE] SHARED - accounts are stored on the team server.' -ForegroundColor Green
    } else {
        # Local mode is deliberately isolated. Never pretend it synchronizes users.
        $env:SPRING_DATASOURCE_URL = 'jdbc:postgresql://localhost:5432/finapp'
        $env:SPRING_DATASOURCE_USERNAME = 'postgres'
        $env:SPRING_DATASOURCE_PASSWORD = 'postgres'
        $infrastructureServices = @('db', 'python-backend')
        Write-Host '[DATABASE] LOCAL - accounts exist only on this computer. Use shared mode for team accounts.' -ForegroundColor Yellow
    }
    foreach ($port in @(8080, 8081)) {
        if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
            throw "Port $port is already in use. Stop the previous FinApp launch before retrying."
        }
    }
    Write-Host 'Checking Docker Engine...' -ForegroundColor Cyan
    if ((Invoke-Native 'docker' @('info') -Quiet) -ne 0) {
        Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Hidden
        $deadline = (Get-Date).AddSeconds(90)
        do {
            Start-Sleep -Seconds 2
            $dockerReady = (Invoke-Native 'docker' @('info') -Quiet) -eq 0
            if ((Get-Date) -gt $deadline) { throw 'Docker did not start within 90 seconds. Open Docker Desktop and retry.' }
        } while (!$dockerReady)
    }
    # This launch mode runs Java and Express on the host, Python and PostgreSQL in Docker.
    # Compose service names are safe even when their containers do not exist.
    Invoke-Checked 'docker' @('compose', '-f', $composeFile, 'stop', 'backend', 'frontend')
    if ($mode -eq 'local') {
        $volume = if ($env:FINAPP_POSTGRES_VOLUME) { $env:FINAPP_POSTGRES_VOLUME } else { 'finapp_postgres_data' }
        # An external volume survives compose down -v. Reuse existing data in place.
        if ((Invoke-Native 'docker' @('volume', 'inspect', $volume) -Quiet) -ne 0) {
            Invoke-Checked 'docker' @('volume', 'create', $volume)
        }
    }
    Invoke-Checked 'docker' (@('compose', '-f', $composeFile, 'up', '--build', '-d') + $infrastructureServices)
    $infrastructureStarted = $true
    Set-Location -LiteralPath (Join-Path $projectRoot 'frontend')
    Write-Host 'Building landing pages and dashboard...' -ForegroundColor Cyan
    Invoke-Checked 'npm.cmd' @('run', 'build')
    Set-Location -LiteralPath (Join-Path $projectRoot 'java-backend')
    # Keep Python routing correct when a shared .env was copied from Docker setup.
    $env:PYTHON_SERVICE_URL = 'http://localhost:5000'
    # Compile in this terminal so startup failures are visible before opening the dashboard.
    Invoke-Checked '.\mvnw.cmd' @('-DskipTests', 'compile')
    $javaProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', '.\mvnw.cmd spring-boot:run' -WorkingDirectory (Join-Path $projectRoot 'java-backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'java-backend\target\finapp-start.log') -RedirectStandardError (Join-Path $projectRoot 'java-backend\target\finapp-start-error.log') -PassThru
    $javaOutput = Open-ServiceLog (Join-Path $projectRoot 'java-backend\target\finapp-start.log')
    $javaError = Open-ServiceLog (Join-Path $projectRoot 'java-backend\target\finapp-start-error.log')
    Write-Host 'Spring Boot output and verification codes appear below with [SPRING].' -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds(90)
    do {
        Show-ServiceLogs
        if ($javaProcess.HasExited) { throw 'Spring Boot stopped. See java-backend\target\finapp-start.log and finapp-start-error.log.' }
        if ((Get-Date) -gt $deadline) { throw 'Spring Boot did not become ready on port 8081 within 90 seconds.' }
        Start-Sleep -Seconds 1
    } while (!(Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue))
    Set-Location -LiteralPath (Join-Path $projectRoot 'frontend')
    $frontendProcess = Start-Process -FilePath (Get-Command 'node.exe').Source -ArgumentList 'express.js' -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'java-backend\target\finapp-web.log') -RedirectStandardError (Join-Path $projectRoot 'java-backend\target\finapp-web-error.log') -PassThru
    $frontendOutput = Open-ServiceLog (Join-Path $projectRoot 'java-backend\target\finapp-web.log')
    $frontendError = Open-ServiceLog (Join-Path $projectRoot 'java-backend\target\finapp-web-error.log')
    Write-Host 'FinApp: http://localhost:8080 - press Ctrl+C to stop.' -ForegroundColor Green
    while (!$javaProcess.HasExited -and !$frontendProcess.HasExited) {
        Show-ServiceLogs
        Start-Sleep -Milliseconds 200
    }
    Show-ServiceLogs
    if ($javaProcess.HasExited) { throw 'Spring Boot stopped. See the [SPRING] output above.' }
    if ($frontendProcess.ExitCode -ne 0) { throw "Frontend stopped (exit $($frontendProcess.ExitCode))." }
} finally {
    Show-ServiceLogs
    foreach ($reader in @($javaOutput, $javaError, $frontendOutput, $frontendError)) {
        if ($null -ne $reader) { $reader.Dispose() }
    }
    if ($null -ne $frontendProcess -and !$frontendProcess.HasExited) {
        Invoke-Native 'taskkill' @('/PID', [string]$frontendProcess.Id, '/T', '/F') -Quiet | Out-Null
    }
    if ($null -ne $javaProcess -and !$javaProcess.HasExited) {
        # Stop only the Java process tree created by this launch.
        Invoke-Native 'taskkill' @('/PID', [string]$javaProcess.Id, '/T', '/F') -Quiet | Out-Null
    }
    Set-Location -LiteralPath $projectRoot
    if ($infrastructureStarted) {
        Write-Host 'Stopping FinApp infrastructure...' -ForegroundColor Yellow
        Invoke-Native 'docker' (@('compose', '-f', $composeFile, 'stop') + $infrastructureServices) | Out-Null
    }
    foreach ($key in $environmentKeys) { [Environment]::SetEnvironmentVariable($key, $previousEnvironment[$key], 'Process') }
    [Console]::OutputEncoding = $previousConsoleEncoding
    $OutputEncoding = $previousOutputEncoding

}
