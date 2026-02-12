param([string]$OldHash = "app.cba3bb4ebed9.js", [string]$NewHash = "app.83cd2791f8b3.js")

$count = 0
Get-ChildItem -Path . -Filter *.html -Recurse -Exclude node_modules,dist -ErrorAction SilentlyContinue | ForEach-Object {
  $html = Get-Content -Path $_.FullName -Raw
  if ($html -match [regex]::Escape($OldHash)) {
    $updated = $html -replace [regex]::Escape($OldHash), $NewHash
    Set-Content -Path $_.FullName -Value $updated
    Write-Host "Updated: $($_.FullName -replace [regex]::Escape((Get-Location).Path + '\'), '')"
    $count++
  }
}
Write-Host "Total: $count files updated"
