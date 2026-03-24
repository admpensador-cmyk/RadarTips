# 🚀 Rodar Workflow Manualmente

## Opção 1: Via GitHub Web UI (Mais Simples)

1. Acesse: https://github.com/admpensador-cmyk/RadarTips/actions
2. Clique na abinha **"Generate Snapshots"**
3. Clique **"Run workflow"** (botão cinza no canto superior direito)
4. Selecione **branch: main**
5. Clique **"Run workflow"** novamente

**Tempo esperado**: 2-5 minutos para executar

---

## Opção 2: Via gh CLI (Com Autenticação)

Se não tiver feito login:
```powershell
gh auth login
# Selecione:
# ? What is your preferred protocol for Git operations? HTTPS
# ? How would you like to authenticate GitHub CLI? Paste an authentication token
# Gere um token em: https://github.com/settings/tokens
# Ou faça login interativo com seu GitHub account
```

Depois rode:
```powershell
cd c:\Users\marce\Documents\Ecossistema\Radartips
gh workflow run generate-snapshots.yml --ref main
```

---

## Após Rodar o Workflow

Para acompanhar em tempo real:
```powershell
gh run watch
# Ou visualizar runs:
gh run list
```

---

## Esperado no Log

**Step: "Verify API Key"**
```
✅ API Key present: true length: 70
```

**Step: "Verify League 40 Data"**
```
League 40: Present (season 2025, standings: true)
  SeasonSource: current, DataStatus: ok
```

**Step: "Smoke test"**
```
✅ Smoke test passed: 54/54 files verified
```

---

## 📋 Informações do Workflow

- **Nome**: Generate Snapshots
- **Trigger**: `workflow_dispatch` (manual) + `schedule: '0 6 * * *'` (diário 6h UTC)
- **Steps principais**:
  1. Checkout code
  2. Setup Node v20
  3. Install dependencies
  4. ✅ **Verify API Key** (safe check - NEW)
  5. Generate snapshots via API-Football
  6. Build manifest
  7. ✅ **Verify League 40 Data** (NEW)
  8. Smoke test
  9. Summary

---

## Troubleshooting

### Se API Key não estiver presente
- Verifique repository secrets em: https://github.com/admpensador-cmyk/RadarTips/settings/secrets/actions
- Confirme que `APIFOOTBALL_KEY` está configurada
- Teste localmente:
  ```powershell
  $env:APIFOOTBALL_KEY = "seu_key_aqui"
  node test-real-standings.mjs
  ```

### Se League 40 não aparecer
- Verifica se snapshots foram gerados
- Verifique log do step "Generate snapshots"
- Procure por: `[40] Championship` nos logs

### Se Smoke test falhar  
- Verifica se o manifest.json é válido JSON
- Rode localmente: `node tools/smoke-test-snapshots.mjs`
- Verifica permisos de arquivo

---

**Última atualização**: 2026-02-17  
**Commit**: d59191a (fix: workflow uses repo secret APIFOOTBALL_KEY reliably)
