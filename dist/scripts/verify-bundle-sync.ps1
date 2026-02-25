# Validate that dist/ is always in sync with source code
# Run this before committing any changes to assets/js/app.js

Write-Host "🔍 Validating bundle synchronization..." -ForegroundColor Cyan
Write-Host ""

# Get current bundle hash
$latestBundle = Get-ChildItem dist/assets/js/app.*.js -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latestBundle) {
  Write-Host "❌ ERROR: No bundle found in dist/" -ForegroundColor Red
  Write-Host "   Run: npm run rebuild" -ForegroundColor Yellow
  exit 1
}

$currentBundleName = $latestBundle.Name
$currentBundleHash = ($currentBundleName -match 'app\.([a-f0-9]{12})') ? $Matches[1] : "unknown"

Write-Host "Current bundle: $currentBundleName"
Write-Host ""

# Regenerate to check if it would be different
Write-Host "🔄 Regenerating bundle to verify..." -ForegroundColor Cyan
$null = Remove-Item "assets/js/app.*.js" -Force -ErrorAction SilentlyContinue
$output = & node tools/build-static.mjs 2>&1
Write-Host $output

# Get new bundle
$newBundle = Get-ChildItem dist/assets/js/app.*.js -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $newBundle) {
  Write-Host "❌ ERROR: Build failed" -ForegroundColor Red
  exit 1
}

$newBundleName = $newBundle.Name
$newBundleHash = ($newBundleName -match 'app\.([a-f0-9]{12})') ? $Matches[1] : "unknown"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

if ($currentBundleHash -eq $newBundleHash) {
  Write-Host "✅ Bundle is synchronized with source code!" -ForegroundColor Green
  Write-Host "   Hash: $newBundleHash"
  exit 0
} else {
  Write-Host "⚠️  Bundle was out of date:" -ForegroundColor Yellow
  Write-Host "   Old hash: $currentBundleHash"
  Write-Host "   New hash: $newBundleHash"
  Write-Host ""
  Write-Host "✅ Bundle has been regenerated." -ForegroundColor Green
  Write-Host ""
  Write-Host "📝 Next steps:" -ForegroundColor Cyan
  Write-Host "   1. git add dist/" -ForegroundColor Yellow
  Write-Host "   2. git commit -m 'Build: update bundles'" -ForegroundColor Yellow
  Write-Host "   3. git push origin main" -ForegroundColor Yellow
  exit 0
}
