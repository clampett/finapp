# One-time import into a NEW, EMPTY shared database. Never overwrites existing tables.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string] $BackupFile)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'FinApp.Common.ps1')
Import-FinAppEnvironment (Join-Path $projectRoot '.env')
Assert-FinAppSharedDatabase
$source = (Resolve-Path -LiteralPath $BackupFile).Path
# Restricted this retained recovery utility to an empty target, preventing an
# import from replacing an already populated shared database by accident.
if ([System.IO.Path]::GetExtension($source) -ne '.dump') {
    throw 'Use a PostgreSQL custom-format .dump backup.'
}
$objects = Invoke-FinAppPgClient @('psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f');")
if (($objects -join '').Trim() -ne '0') {
    throw 'Import refused: the shared database already contains objects. Existing data was not changed.'
}
$directory = Split-Path -Parent $source
$name = Split-Path -Leaf $source
Invoke-FinAppPgClient @('pg_restore', '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction', '-d', $env:SPRING_DATASOURCE_URL.Substring(5), "/backups/$name") $directory
Write-Host 'Import completed. Existing user IDs and password hashes were preserved.' -ForegroundColor Green
