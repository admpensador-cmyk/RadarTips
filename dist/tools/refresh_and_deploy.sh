#!/bin/bash
# RadarTips: Atualização e publicação automatizada do allowlist e dados
set -e

# 1. Regenerar allowlist
node tools/coverage_allowlist_refresh.mjs

# 2. Rebuild dist
node tools/build-static.mjs

# 3. Deploy para produção
npx wrangler pages deploy dist --project-name=radartips

echo "Atualização e publicação concluída."
