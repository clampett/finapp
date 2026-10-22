[CmdletBinding()]
param([ValidateSet('local')][string] $Mode = 'local')
# Always use this computer's database and show Spring Boot logs in this terminal.
& (Join-Path $PSScriptRoot 'start-server.ps1') -DatabaseMode local
