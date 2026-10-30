# Shared startup, database configuration, and console helpers. No secrets are logged.
function Test-FinAppPortOpen([int] $Port) {
    # Replaced Windows connection-table queries with a bounded loopback connection,
    # avoiding false negatives when the networking cmdlet could not list listeners.
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync('localhost', $Port)
        return ($connection.Wait(500) -and $client.Connected)
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Test-FinAppBackendReady([uri] $Uri = 'http://127.0.0.1:8081/api/v1/health') {
    # Confirmed the application's health response instead of merely finding a port.
    # Bypassed system proxies and bounded each request for Windows PowerShell 5.1
    # compatibility, keeping normal startup retries quick and non-interactive.
    $response = $null
    $reader = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create($Uri)
        $request.Proxy = $null
        $request.Timeout = 1500
        $request.ReadWriteTimeout = 1500
        $request.AllowAutoRedirect = $false
        $response = $request.GetResponse()
        if ([int] $response.StatusCode -ne 200) {
            return $false
        }
        $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
        $health = $reader.ReadToEnd() | ConvertFrom-Json
        return ($health.success -eq $true -and $health.data.status -eq 'UP' -and
            $health.data.service -eq 'java-backend')
    }
    catch {
        if ($_.Exception.Response) {
            $_.Exception.Response.Dispose()
        }
        return $false
    }
    finally {
        if ($null -ne $reader) {
            $reader.Dispose()
        }
        if ($null -ne $response) {
            $response.Dispose()
        }
    }
}

function ConvertTo-FinAppAscii([string] $Text) {
    # Removed terminal control sequences and translated known Unicode symbols,
    # keeping startup output readable in Windows terminals with mixed encodings.
    $textValue = [regex]::Replace($Text, ([char]27 + '\[[0-?]*[ -/]*[@-~]'), '')
    $replacements = @{
        0x2713 = '[OK]'
        0x2714 = '[OK]'
        0x2717 = '[ERROR]'
        0x2718 = '[ERROR]'
        0x2502 = '|'
        0x2192 = '->'
        0x2190 = '<-'
        0x2197 = '->'
        0x2248 = '~'
        0x2013 = '-'
        0x2014 = '-'
        0x2026 = '...'
        0x00A0 = ' '
        0x2018 = "'"
        0x2019 = "'"
        0x201C = '"'
        0x201D = '"'
    }
    foreach ($code in $replacements.Keys) {
        $textValue = $textValue.Replace([string][char]$code, $replacements[$code])
    }
    return [regex]::Replace($textValue, '[^\x09\x20-\x7E]', '?')
}

function Invoke-Native([string] $Program, [string[]] $Arguments, [switch] $Quiet) {
    # Captured native stderr as readable output while retaining its exit code,
    # allowing Invoke-Checked to report command failures consistently.
    $ErrorActionPreference = 'Continue'
    & $Program @Arguments 2>&1 | ForEach-Object {
        # Windows PowerShell wraps native stderr in ErrorRecord, including blank
        # lines. Read its actual message instead of printing the exception type.
        $message = if ($_ -is [System.Management.Automation.ErrorRecord]) {
            $_.Exception.Message
        }
        else {
            $_.ToString()
        }
        if (!$Quiet -and ![string]::IsNullOrEmpty($message)) {
            Write-Host (ConvertTo-FinAppAscii $message)
        }
    }
    return $LASTEXITCODE
}

function Invoke-Checked([string] $Program, [string[]] $Arguments) {
    $nativeExitCode = Invoke-Native $Program $Arguments
    if ($nativeExitCode -ne 0) {
        throw "$Program failed (exit $nativeExitCode)."
    }
}

function Import-FinAppEnvironment([string] $Path) {
    if (!(Test-Path -LiteralPath $Path)) {
        return
    }
    # Parse values as data, never PowerShell commands. Existing shell values win.
    $allowed = @('FINAPP_DATABASE_MODE', 'FINAPP_POSTGRES_VOLUME', 'FINAPP_PG_CLIENT_IMAGE',
        'SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD',
        'ANTHROPIC_API_KEY', 'PYTHON_SERVICE_URL')
    foreach ($line in [System.IO.File]::ReadAllLines($Path, [System.Text.Encoding]::UTF8)) {
        if ($line -match '^\s*(?:#|$)') {
            continue
        }
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            throw 'Invalid .env line. Use NAME=value entries.'
        }
        $key = $Matches[1]
        $value = $Matches[2].Trim()
        if ($key -notin $allowed) {
            continue
        }
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($null -eq [Environment]::GetEnvironmentVariable($key, 'Process')) {
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

function Get-FinAppDatabaseMode([string] $RequestedMode) {
    # Retained legacy selection for explicit shared-database recovery utilities;
    # normal startup selected local mode directly instead of using this fallback.
    if ($RequestedMode) {
        return $RequestedMode
    }
    if ($env:FINAPP_DATABASE_MODE) {
        if ($env:FINAPP_DATABASE_MODE -notin @('local', 'shared')) {
            throw 'FINAPP_DATABASE_MODE must be local or shared.'
        }
        return $env:FINAPP_DATABASE_MODE
    }
    if ($env:SPRING_DATASOURCE_URL) {
        return 'shared'
    }
    # A new checkout must not silently create a separate account database.
    return 'shared'
}

function Assert-FinAppSharedDatabase {
    foreach ($key in @('SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD')) {
        if (![Environment]::GetEnvironmentVariable($key, 'Process')) {
            throw "Shared database setup needs $key in the root .env file. See docs/database-setup.md."
        }
    }
    if ($env:SPRING_DATASOURCE_URL -notmatch '^jdbc:postgresql://') {
        throw 'Use a jdbc:postgresql:// JDBC URL for the shared server.'
    }
    $target = [uri]$env:SPRING_DATASOURCE_URL.Substring(5)
    if (!$target.Host -or $target.Host -in @('localhost', '127.0.0.1', '::1', '[::1]', 'db', 'postgres', 'host.docker.internal') -or $target.Host -like '127.*') {
        throw 'Shared mode requires a remote database host. localhost and Docker db are separate databases on each computer.'
    }
    if ($target.UserInfo -or $target.Query -match '(?i)(?:[?&])(password|user)=') {
        throw 'Keep the database username and password in their separate .env settings, not inside the JDBC URL.'
    }
    if ($target.Query -notmatch '(?i)(?:[?&])sslmode=(require|verify-ca|verify-full)(?:&|$)') {
        throw 'Shared database connections must use the provider TLS settings (sslmode=require or stronger).'
    }
}

function Open-ServiceLog([string] $Path) {
    # Opened each log with read/write sharing so the launcher could follow output
    # while the Java and Node child processes continued appending new lines.
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    return [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $true)
}

function Invoke-FinAppPgClient([string[]] $ClientArguments, [string] $BackupDirectory) {
    Assert-FinAppSharedDatabase
    $target = [uri]$env:SPRING_DATASOURCE_URL.Substring(5)
    $settings = @{
        PGHOST            = $target.Host
        PGPORT            = '5432'
        PGDATABASE        = [uri]::UnescapeDataString($target.AbsolutePath.TrimStart('/'))
        PGUSER            = $env:SPRING_DATASOURCE_USERNAME
        PGPASSWORD        = $env:SPRING_DATASOURCE_PASSWORD
        PGSSLMODE         = 'require'
        PGCONNECT_TIMEOUT = '60'
    }
    if ($target.Port -gt 0) {
        $settings.PGPORT = [string]$target.Port
    }
    if ($target.Query -match '(?i)(?:[?&])sslmode=([^&]+)') {
        $settings.PGSSLMODE = $Matches[1]
    }
    $saved = @{}
    $dockerArguments = @('run', '--rm')
    foreach ($key in $settings.Keys) {
        $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
        # Pass variable names, never passwords in command-line arguments.
        $dockerArguments += @('-e', $key)
    }
    if ($BackupDirectory) {
        $dockerArguments += @('--mount', "type=bind,source=$BackupDirectory,target=/backups")
    }
    $clientImage = if ($env:FINAPP_PG_CLIENT_IMAGE) {
        $env:FINAPP_PG_CLIENT_IMAGE
    }
    else {
        'postgres:15-alpine'
    }
    try {
        & docker @dockerArguments $clientImage @ClientArguments
        if ($LASTEXITCODE -ne 0) {
            throw 'PostgreSQL client failed. No database credentials were printed.'
        }
    }
    finally {
        foreach ($key in $saved.Keys) {
            [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
        }
    }
}

function Write-ServiceOutput($Reader, [string] $Label, [ConsoleColor] $Color) {
    if ($null -eq $Reader) {
        return
    }
    while ($null -ne ($line = $Reader.ReadLine())) {
        Write-Host "[$Label] $(ConvertTo-FinAppAscii $line)" -ForegroundColor $Color
    }
}
