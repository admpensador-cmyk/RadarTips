#!/bin/bash
# BLINDAGEM DEFINITIVA - Guia Local de Execução

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🛡️  BLINDAGEM DEFINITIVA ANTI-REGRESSÃO - RUN LOCAL GUIDE     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# SEQUÊNCIA LOCAL (do desenvolvimento para produção)
# ============================================================================

echo "📋 SEQUÊNCIA RECOMENDADA:"
echo ""
echo "1️⃣  GERAR CSS HASH"
echo "   $ node tools/hash-css.mjs"
echo "   Saída: ✅ CSS: match-radar-v2.XXXXXX.css"
echo ""

echo "2️⃣  REGENERAR HTML COM VALIDAÇÃO DE ASSETS"
echo "   $ node regenerate-html.mjs"
echo "   Saída:"
echo "      ✅ Bundle JS: app.XXXXXX.js"
echo "      ✅ Stylesheet: match-radar-v2.XXXXXX.css"
echo "      ✅ Validação de Assets:"
echo "         CSS: match-radar-v2.XXXXXX.css"
echo "         JS:  app.XXXXXX.js"
echo ""

echo "3️⃣  SEED TEAM-WINDOW-5 (gerar snapshots)"
echo "   $ node tools/seed-team-window-5.mjs"
echo "   Saída: ✅ Snapshots salvos em data/v1/team-window-5/"
echo ""

echo "4️⃣  SMOKE TEST"
echo "   $ node tools/smoke-test-team-window-5.mjs"
echo "   Saída: ✅ Todos os snapshots válidos"
echo ""

echo "5️⃣  HEALTHCHECK (verificar se match-stats tem dados)"
echo "   $ node tools/healthcheck-match-stats.mjs"
echo "   Saída:"
echo "      ✅ Team-window-5 snapshots found and valid"
echo "      ✅ HEALTHCHECK PASSED"
echo ""

echo "6️⃣  BUILD COMPLETO"
echo "   $ node tools/build.mjs"
echo "   Saída:"
echo "      ✅ CSS hash generated: match-radar-v2.XXXXXX.css"
echo "      ✅ Build Complete - Ready for Deployment"
echo ""

echo "7️⃣  DEPLOY (então fazer push para produção)"
echo "   Git commit + push com dist/ para Cloudflare Pages"
echo ""

# ============================================================================
# O QUE FOI PROTEGIDO
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ PROTEÇÕES IMPLEMENTADAS                                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "🔒 A) ASSETS SEMPRE HASHED"
echo "   • HTML NUNCA pode referenciar app.js ou match-radar-v2.css sem hash"
echo "   • regenerate-html.mjs falha (exit 1) se validação não passar"
echo "   • Padrões validados: app.[a-f0-9]+.js e match-radar-v2.[a-f0-9]{12}.css"
echo ""

echo "🔒 B) DADOS SEEDADOS OBRIGATÓRIA"
echo "   • Workflow GitHub Actions falha se seed não completar"
echo "   • Smoke test valida integridade de cada snapshot"
echo "   • Healthcheck confirma que endpoints têm dados reais"
echo ""

echo "🔒 C) UI NUNCA MENTE"
echo "   • Se games_used_total = 0, mostra 'Sem dados ainda' (não 0.00)"
echo "   • Base disclosure mostra '—' quando sem dados confirmar"
echo "   • Novo accordion sempre renderizado (sem fallback velho)"
echo ""

echo "🔒 D) DEPLOY BLOQUEADO SEM DADOS"
echo "   • Se healthcheck falha, workflow falha"
echo "   • Impossível fazer push de código sem team-window-5 válido"
echo "   • R2 upload só acontece se seed passou"
echo ""

# ============================================================================
# COMO CADA BLINDAGEM FUNCIONA
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🔍 DETALHES TÉCNICOS                                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "📁 regenerate-html.mjs (VALIDAÇÃO OBRIGATÓRIA)"
echo "   Arquivo: regenerate-html.mjs, linhas 208-234"
echo "   Lógica:"
echo "     1. Carrega CSS hashed: match-radar-v2.e67294612cb3.css"
echo "     2. Detecta app.js mais recente: app.2f0a11c55c0b.js"
echo "     3. Gera HTML com ambos os assets hashed"
echo "     4. VALIDA que HTML contém os padrões corretos"
echo "     5. Se falha, process.exit(1) - BUILD FALHA"
echo ""

echo "🩺 healthcheck-match-stats.mjs"
echo "   Arquivo: tools/healthcheck-match-stats.mjs"
echo "   Lógica:"
echo "     1. Lê calendar_7d.json"
echo "     2. Procura por snapshots em data/v1/team-window-5/"
echo "     3. Valida que arquivo JSON tem campo 'windows'"
echo "     4. Se nada encontrado, falha com exit 1"
echo ""

echo "⚙️  Workflow GitHub Actions"
echo "   Arquivo: .github/workflows/radartips_update_data_api_football.yml"
echo "   Sequência:"
echo "     1. Generate calendar (já existia)"
echo "     2. Seed team-window-5 (NOVO - obrigatório)"
echo "     3. Smoke test (NOVO - obrigatório)"
echo "     4. Healthcheck (NOVO - obrigatório)"
echo "     5. Upload R2 (já existia)"
echo ""

echo "🎭 match-radar-v2.js (UI ANTI-MENTIRA)"
echo "   Arquivo: assets/js/match-radar-v2.js, linhas 424-434"
echo "   Lógica:"
echo "     const homeHasData = (homeGames.games_used_total || 0) > 0"
echo "     const awayHasData = (awayGames.games_used_total || 0) > 0"
echo "     if (!homeHasData && !awayHasData) {"
echo "       panel.innerHTML = 'Sem dados ainda'"
echo "       return"
echo "     }"
echo ""

# ============================================================================
# DEP TROUBLESHOOTING
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🆘 TROUBLESHOOTING                                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "❌ CSS hash não encontrado no HTML?"
echo "   → Rode: node tools/hash-css.mjs"
echo "   → Depois: node regenerate-html.mjs"
echo ""

echo "❌ Healthcheck falhou?"
echo "   → Rode: node tools/seed-team-window-5.mjs"
echo "   → Depois: node tools/smoke-test-team-window-5.mjs"
echo "   → Retire: node tools/healthcheck-match-stats.mjs"
echo ""

echo "❌ Build falhou com 'No app.*.js found'?"
echo "   → O arquivo hashed foi deletado"
echo "   → node tools/build.mjs já limpa antigos automaticamente"
echo "   → Rode novamente"
echo ""

echo "❌ HTML mostra '0' em dados?"
echo "   → Snapshots podem estar sem games_used_total"
echo "   → Seed deve regenerar com novo gerador"
echo "   → A UI protege mostrando '—' quando sem dados"
echo ""

echo ""
echo "✅ Tudo protegido! Nenhuma possibilidade de fazer deploy sem:"
echo "   • Assets hashed ✓"
echo "   • Team-window-5 seedado ✓"
echo "   • Dados validados ✓"
echo "   • UI mostrando verdade ✓"
echo ""
