<#
  Veille réglementaire, weekly: read the JORT issues published since the last run, then (with -Push)
  commit and push the sommaires read, so that every copy of the app gets them on its next pull.

  Run it by hand:
    powershell -ExecutionPolicy Bypass -File scripts\veille-hebdo.ps1 -Push

  Or every Monday at 8:45 with the Windows task scheduler (one command, from the project folder):
  (the project path must have no spaces)
    schtasks /Create /SC WEEKLY /D MON /ST 08:45 /TN "ABClassement veille" /TR "powershell -ExecutionPolicy Bypass -File $PWD\scripts\veille-hebdo.ps1 -Push"

  A log of each run is kept in data\veille\veille-hebdo.log (not in git).
#>
param([switch]$Push)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $root "data\veille\veille-hebdo.log"

function Say($text) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $text"
  Write-Output $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

try {
  Say "Début de la veille"
  git pull --quiet
  npm run --silent veille 2>&1 | ForEach-Object { Say $_ }
  if ($LASTEXITCODE -ne 0) { throw "npm run veille a échoué (code $LASTEXITCODE)" }
  if ($Push) {
    git add data/veille/sommaires
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
      git commit --quiet -m "Veille: JORT $(Get-Date -Format 'yyyy-MM-dd')"
      git push --quiet
      Say "Nouveaux numéros enregistrés et poussés."
    } else {
      Say "Aucun nouveau numéro."
    }
  }
  Say "Fin de la veille"
} catch {
  Say "ERREUR : $_"
  exit 1
}
