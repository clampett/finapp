@{
    IncludeRules = @(
        'PSPlaceOpenBrace'
        'PSPlaceCloseBrace'
        'PSUseConsistentWhitespace'
        'PSUseConsistentIndentation'
        'PSAlignAssignmentStatement'
    )
    Rules = @{
        PSPlaceOpenBrace = @{
            Enable = $true
            OnSameLine = $true
            NewLineAfter = $true
            IgnoreOneLineBlock = $false
        }
        PSPlaceCloseBrace = @{
            Enable = $true
            NewLineAfter = $true
            IgnoreOneLineBlock = $false
        }
        PSUseConsistentWhitespace = @{
            Enable = $true
            CheckOpenBrace = $true
            CheckOpenParen = $true
            CheckOperator = $true
            CheckSeparator = $true
        }
        PSUseConsistentIndentation = @{
            Enable = $true
            Kind = 'space'
            IndentationSize = 4
        }
        PSAlignAssignmentStatement = @{
            Enable = $true
            CheckHashtable = $true
        }
    }
}
