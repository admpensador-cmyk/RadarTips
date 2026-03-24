# ✅ Próximas Ações - Checklist

## 1️⃣ Verificar Repository Secrets

**URL**: https://github.com/admpensador-cmyk/RadarTips/settings/secrets/actions

**Secrets que devem estar configuradas**:

- [ ] **APIFOOTBALL_KEY** 
  - Tipo: Repository secret
  - Valor: `sk_live_...` (70 chars aproximadamente)
  - Obtenha em: https://dashboard.api-football.com

- [ ] **CLOUDFLARE_API_TOKEN** (se precisar upload em R2)
  - Tipo: Repository secret  
  - Valor: Token da Cloudflare

- [ ] **CLOUDFLARE_ACCOUNT_ID** (se precisar upload em R2)
  - Tipo: Repository secret
  - Valor: Account ID da Cloudflare

---

## 2️⃣ Rodar Workflow Manualmente

### Opção A: Web UI (Recomendado - Mais Visual)

1. Acesse: https://github.com/admpensador-cmyk/RadarTips/actions
2. Menu esquerdo → Click em **"Generate Snapshots"**
3. Lado direito: Clique no botão cinza **"Run workflow"**
4. Dropdown: Selecione **branch: main**
5. Click em **"Run workflow"**
6. Acompanhe o progresso em tempo real

**Tempo esperado**: 2-5 minutos

### Opção B: gh CLI (Linha de Comando)

Primeira vez:
```powershell
gh auth login
# Selecione HTTPS, autentique com seu GitHub account ou PAT
```

Depois:
```powershell
cd c:\Users\marce\Documents\Ecossistema\Radartips
gh workflow run generate-snapshots.yml --ref main

# Para acompanhar:
gh run watch
```

---

## 3️⃣ Verificar Output do Workflow

Após rodar, procure por estes outputs nos logs:

### ✅ Output Esperado #1: API Key Verification
```
Step: "Verify API Key (safe check)"
✅ API Key present: true length: 70
```
✔️ Se ver isso = Secrets está funcionando

### ✅ Output Esperado #2: League 40 Data  
```
Step: "Verify League 40 Data"
League 40: Present (season 2025, standings: true)
  SeasonSource: current, DataStatus: ok
```
✔️ Se ver isso = Dados reais foram gerados para Championship

### ✅ Output Esperado #3: Smoke Test
```
Step: "Smoke test (local)"
✅ Smoke test passed: 54/54 files verified
```
✔️ Se ver isso = Todos os arquivos validados

---

## 4️⃣ Se Algo Falhar

### ❌ "API Key present: false"
- Verifique se APIFOOTBALL_KEY está configurada em Repository Secrets
- Confirm que a chave é válida (começa com `sk_live_`)
- Re-run o workflow

### ❌ "League 40: MISSING"
- Verifique log de "Generate snapshots" 
- Procure por: `[40] Championship` nos logs
- Se não aparecer, API-Football pode estar indisponível
- Tente novamente em alguns minutos

### ❌ "Smoke test: FAILED"
- Verifique se manifest.json é válido JSON
- Rode localmente: `node tools/smoke-test-snapshots.mjs`
- Verifique permissões de arquivo

### ❌ "Timeout" ou "Network error"
- API-Football pode estar lento
- Tente novamente em 5 minutos
- Verifique rate limits em dashboard.api-football.com

---

## 5️⃣ Informações para Coletar do Log

Após o workflow rodar com sucesso, colete:

```
📋 LEAGUE 40 DATA:
  Season: _________________ (esperado: 2025)
  SeasonSource: __________ (esperado: current, range, ou max)
  DataStatus: ____________ (esperado: ok)
  Teams: _________________ (esperado: >0)

📊 MANIFEST:
  Total Entries: _________ (esperado: 39)
  Standings Count: _______ (esperado: 39)
  Compstats Count: _______ (esperado: 15)
  Cups Count: ____________ (esperado: 0)

✅ SMOKE TEST:
  Files Verified: ________ (esperado: 54/54)
```

---

## 6️⃣ Comando para Monitorar (Opcional)

Se quiser ver logs em tempo real:

```powershell
# Com gh CLI
gh run watch

# Ou visualizar último run
gh run view --log

# Ou listar todos os runs
gh run list
```

---

## 📖 Documentação de Referência

Caso precise, consulte:

- **RUN_WORKFLOW_GUIDE.md** - Guia completo de execução
- **WORKFLOW_CHANGES.md** - Detalhes das mudanças implementadas
- **SEASON_RESOLUTION_SETUP.md** - Arquitetura do pipeline
- **COMPLETION_REPORT.md** - Status final da implementação

---

## 🚀 Timeline Esperado

```
T+0 min:  Você dispara o workflow
T+0-1:    Checkout, setup Node
T+1-2:    npm install
T+2:      API Key verification (rápido)
T+2-3:    Generate snapshots (Liga com API-Football)
T+3:      Build manifest
T+3:      Verify League 40
T+3-4:    Smoke test
T+4-5:    Workflow completa ✅
```

---

## ✨ Resumo

| Item | Status | Ação |
|------|--------|------|
| Workflow corrigido | ✅ | Nenhuma (já feito) |
| Commit push | ✅ | Nenhuma (já feito) |
| Repository Secrets | ⏳ | Verifique se APIFOOTBALL_KEY está lá |
| Rodar workflow | ⏳ | Acesse: https://github.com/admpensador-cmyk/RadarTips/actions |
| Coletar logs | ⏳ | Após workflow completar |

---

**Status Atual**: ✅ Código pronto, aguardando execução do workflow

**Próximo Passo**: Rodar o workflow ("Generate Snapshots") via web UI ou gh CLI
