# DSH plugin market index: daily refresh + profile index-source self-heal.
# Called by the Windows scheduled task "DSH Plugin Market Index Refresh".
# Keep this file ASCII-only: Windows PowerShell 5.1 mis-decodes UTF-8 scripts without BOM.
$ErrorActionPreference = 'Stop'
$repo = 'E:\DSH\market\repo'
$node = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$log = Join-Path $repo 'refresh.log'

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
}

try {
    Set-Location $repo
    $before = (Get-FileHash 'index.json' -Algorithm SHA256).Hash
    & $node build.mjs | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "build.mjs exited $LASTEXITCODE" }
    $after = (Get-FileHash 'index.json' -Algorithm SHA256).Hash

    if ($before -ne $after) {
        $token = gh auth token
        if (-not $token) { throw 'gh auth token is empty' }
        $remote = gh api repos/AAAMECHANIC/dsh-plugin-market/contents/index.json | ConvertFrom-Json
        $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $repo 'index.json')))
        $payload = @{ message = "chore: refresh index $(Get-Date -Format 'yyyy-MM-dd')"; content = $b64; sha = $remote.sha; branch = 'main' } | ConvertTo-Json -Compress
        $tmp = [IO.Path]::GetTempFileName()
        [IO.File]::WriteAllText($tmp, $payload, (New-Object Text.UTF8Encoding($false)))
        gh api -X PUT repos/AAAMECHANIC/dsh-plugin-market/contents/index.json --input $tmp | Out-Null
        Remove-Item $tmp -Force
        Write-Log 'index.json changed and was committed to GitHub'
    }
    else {
        Write-Log 'index.json unchanged'
    }

    # Self-heal: restore the market index source in the desktop profile when another
    # settings write drops it (takes effect after the next DSH restart).
    $profile = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\cordis.patch.yml'
    if (Test-Path $profile) {
        $text = [IO.File]::ReadAllText($profile)
        if ($text -notmatch 'aaamechanic\.github\.io/dsh-plugin-market/index\.json') {
            $entry = "`n# --- community plugin market index (auto-healed by refresh.ps1) ---`n- id: plugin-market`n  name: '@deepseek-ai/dsh-plugin-market'`n  config:`n    indexes:`n    - https://aaamechanic.github.io/dsh-plugin-market/index.json`n"
            [IO.File]::AppendAllText($profile, $entry, (New-Object Text.UTF8Encoding($false)))
            Write-Log 'profile index source was missing and has been restored (restart DSH to apply)'
        }
    }
}
catch {
    Write-Log "FAILED: $($_.Exception.Message)"
    exit 1
}
