$ErrorActionPreference = 'Stop'
$parseErrors = $null
$tokens = $null
$startupAst = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'start.ps1'), [ref]$tokens, [ref]$parseErrors)
$helpers = $startupAst.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)
foreach ($helper in $helpers) { . ([scriptblock]::Create($helper.Extent.Text)) }
Invoke-Checked $env:ComSpec @('/d', '/c', 'echo harmless-warning 1>&2 & exit /b 0')
Write-Host 'PASS: stderr with exit 0 does not terminate startup'
$failedCorrectly = $false
try { Invoke-Checked $env:ComSpec @('/d', '/c', 'exit /b 3') } catch { $failedCorrectly = $_.Exception.Message -like '*exit 3*' }
if (!$failedCorrectly) { throw 'Nonzero exit was not detected' }
Write-Host 'PASS: real command failures still stop startup'
Invoke-Checked 'docker' @('compose', 'stop', 'backend', 'frontend')
Write-Host 'PASS: absent optional containers do not terminate startup'
