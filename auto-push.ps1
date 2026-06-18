param(
  [int]$Interval = 30
)

Write-Host "🔁 BIOZAR Auto-Push toutes les $Interval secondes"
Write-Host "Surveille les changements dans biozar/web/ et biozar-app/"
Write-Host "Appuie sur Ctrl+C pour arrêter"
Write-Host ""

$watchDirs = @(
  (Join-Path $PSScriptRoot "biozar\web"),
  (Join-Path $PSScriptRoot "biozar-app\www"),
  (Join-Path $PSScriptRoot ".github\workflows")
)

while ($true) {
  Start-Sleep -Seconds $Interval

  # Vérifier s'il y a des changements
  $status = git -C $PSScriptRoot status --porcelain
  if (-not $status) { continue }

  Write-Host "$(Get-Date -Format 'HH:mm:ss') Changements détectés, push en cours..."

  git -C $PSScriptRoot add -A
  git -C $PSScriptRoot commit -m "auto: mise à jour $(Get-Date -Format 'yyyy-MM-dd HH:mm')" --quiet
  git -C $PSScriptRoot push --quiet

  Write-Host "$(Get-Date -Format 'HH:mm:ss') ✅ Push terminé"
}
