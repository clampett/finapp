$ErrorActionPreference = 'Stop'
$parseErrors = $null
$tokens = $null
$startupAst = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'start.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Invalid startup syntax' }
foreach ($helper in $startupAst.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([scriptblock]::Create($helper.Extent.Text))
}
$testLog = Join-Path (Get-Location) 'tmp\live-log-fixture.txt'
$reader = $null
try {
    [System.IO.File]::WriteAllText($testLog, "Boot ready`r`n")
    $reader = Open-ServiceLog $testLog
    $initial = @(Write-ServiceOutput $reader 'SPRING' 'Cyan' 6>&1)
    if ($initial.Count -ne 1 -or [string]$initial[0] -ne '[SPRING] Boot ready') { throw 'Initial log output failed' }
    [System.IO.File]::AppendAllText($testLog, "TEST verification message`r`n")
    $appended = @(Write-ServiceOutput $reader 'SPRING' 'Cyan' 6>&1)
    if ($appended.Count -ne 1 -or [string]$appended[0] -ne '[SPRING] TEST verification message') { throw 'Live log output failed' }
    $empty = @(Write-ServiceOutput $reader 'SPRING' 'Cyan' 6>&1)
    if ($empty.Count -ne 0) { throw 'Log lines were repeated' }
    Write-Host 'PASS: startup logs, newly appended messages, and no duplicate lines (Windows PowerShell 5.1)'
} finally {
    if ($null -ne $reader) { $reader.Dispose() }
    Remove-Item -LiteralPath $testLog -ErrorAction SilentlyContinue
}
