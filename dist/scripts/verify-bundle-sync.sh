#!/usr/bin/env bash
# Safe deployment script - ensures app.js changes are reflected in production bundle

set -euo pipefail

echo "🔍 Checking for out-of-sync bundles..."

# Check if assets/js/app.js differs from what was used to generate current dist/ bundle
LATEST_BUNDLE=$(ls -t dist/assets/js/app.*.js 2>/dev/null | head -1 || echo "")

if [ -z "$LATEST_BUNDLE" ]; then
  echo "❌ ERROR: No bundle found in dist/. Run 'node tools/build-static.mjs' first."
  exit 1
fi

# Get hash of current app.js
CURRENT_APP_HASH=$(sha256sum assets/js/app.js | cut -d' ' -f1)

# Extract hash from bundle filename and get its hash
BUNDLE_HASH=$(basename "$LATEST_BUNDLE" | grep -oP '(?<=app\.)[a-f0-9]{12}(?=\.js)' || echo "unknown")
BUNDLE_FILE_HASH=$(sha256sum "$LATEST_BUNDLE" | cut -d' ' -f1)

# Regenerate bundle to check if it would be different
echo "🔄 Regenerating bundle to verify freshness..."
rm -f assets/js/app.*.js
node tools/build-static.mjs > /dev/null

# Get new bundle
NEW_BUNDLE=$(ls -t dist/assets/js/app.*.js 2>/dev/null | head -1)
NEW_BUNDLE_HASH=$(basename "$NEW_BUNDLE" | grep -oP '(?<=app\.)[a-f0-9]{12}(?=\.js)')
NEW_BUNDLE_FILE_HASH=$(sha256sum "$NEW_BUNDLE" | cut -d' ' -f1)

if [ "$BUNDLE_HASH" != "$NEW_BUNDLE_HASH" ] || [ "$BUNDLE_FILE_HASH" != "$NEW_BUNDLE_FILE_HASH" ]; then
  echo "⚠️  Bundle was out of date!"
  echo "   Old: $BUNDLE_HASH"
  echo "   New: $NEW_BUNDLE_HASH"
  echo ""
  echo "✅ Bundle regenerated. Ready to commit and deploy."
else
  echo "✅ Bundle is in sync with app.js"
fi

echo ""
echo "📝 Next steps:"
echo "   1. git add dist/"
echo "   2. git commit -m 'Build: update bundles'"
echo "   3. git push origin main"
echo ""
