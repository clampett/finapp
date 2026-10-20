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

function Invoke-Native([string] $Program, [string[]] $Arguments, [switch] $Quiet) {
    # Windows PowerShell 5.1 turns native stderr (including harmless warnings)
    # into ErrorRecords. Judge native programs by their exit code instead.
    $ErrorActionPreference = 'Continue'
    & $Program @Arguments 2>&1 | ForEach-Object {
        if (!$Quiet) { Write-Host $_.ToString() }
    }
    return $LASTEXITCODE
}

function Invoke-Checked([string] $Program, [string[]] $Arguments) {
    $nativeExitCode = Invoke-Native $Program $Arguments
    if ($nativeExitCode -ne 0) { throw "$Program failed (exit $nativeExitCode)." }
}

function Open-ServiceLog([string] $Path) {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    return [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $true)
}

function Write-ServiceOutput($Reader, [string] $Label, [ConsoleColor] $Color) {
    if ($null -eq $Reader) { return }
    while ($null -ne ($line = $Reader.ReadLine())) {
        Write-Host "[$Label] $line" -ForegroundColor $Color
    }
}

function Show-ServiceLogs {
    Write-ServiceOutput $javaOutput 'SPRING' 'Cyan'
    Write-ServiceOutput $javaError 'SPRING' 'Yellow'
    Write-ServiceOutput $frontendOutput 'WEB' 'Green'
    Write-ServiceOutput $frontendError 'WEB' 'Yellow'
}

try {
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
    Invoke-Checked 'docker' @('compose', 'stop', 'backend', 'frontend')
    Invoke-Checked 'docker' @('compose', 'up', '--build', '-d', 'db', 'python-backend')
    $infrastructureStarted = $true
    Set-Location -LiteralPath (Join-Path $projectRoot 'frontend')
    Write-Host 'Building landing pages and dashboard...' -ForegroundColor Cyan
    Invoke-Checked 'npm.cmd' @('run', 'build')
    Set-Location -LiteralPath (Join-Path $projectRoot 'java-backend')
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
    Write-Host 'FinApp: http://localhost:8080 — press Ctrl+C to stop.' -ForegroundColor Green
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
        Invoke-Native 'docker' @('compose', 'stop', 'db', 'python-backend') | Out-Null
    }
}
