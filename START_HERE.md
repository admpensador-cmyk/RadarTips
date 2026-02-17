# ⚡ AÇÃO IMEDIATA - 3 Passos

## 1️⃣ VERIFICAR SECRETS (30 segundos)

Abra: https://github.com/admpensador-cmyk/RadarTips/settings/secrets/actions

Procure por: `APIFOOTBALL_KEY`

✅ Se existir com valor começando por `sk_live_` → Segue pro passo 2  
❌ Se não existir → Crie novo secret com sua API key (obtém em https://dashboard.api-football.com)

---

## 2️⃣ RODAR WORKFLOW (2 cliques)

Abra: https://github.com/admpensador-cmyk/RadarTips/actions

1. Click na aba cinzenta **"Generate Snapshots"** (esquerda)
2. Click no botão **"Run workflow"** (direita, cinzento)
3. Deixa `branch: main` selecionado
4. Click **"Run workflow"** (verde)

Workflow rodando! ⏳

---

## 3️⃣ COLETAR LOGS (2-5 minutos depois)

Quando workflow terminar (verde ✅), abra o run e procure por:

```
✅ API Key present: true
```

```
League 40: Present (season 2025, standings: true)
SeasonSource: current, DataStatus: ok
```

```
✅ Smoke test passed: 54/54 files verified
```

Se viu os 3? **SUCESSO!** ✨

---

## 📊 O que vai acontecer:

1. Workflow vai rodar com sua APIFOOTBALL_KEY
2. Vai buscar dados REAIS de league 40 (Championship) na API-Football
3. Vai gerar `standings_40_2025.json` COM DADOS REAIS (não mock)
4. Vai atualizar manifest.json
5. Vai validar tudo com smoke test

Resultado final será: Dados REAIS, não mock! 🎉

---

## ❓ Dúvidas?

- **"Não sei aplicar secrets"** → Leia: RUN_WORKFLOW_GUIDE.md
- **"Workflow falhou"** → Leia: CHECKLIST_NEXT_STEPS.md > "Se Algo Falhar"
- **"Quer entender tudo"** → Leia: WORKFLOW_CHANGES.md + STATUS.md

---

**Tempo total: 5 minutos**  
**Status: PRONTO PARA EXECUTAR** 🚀
