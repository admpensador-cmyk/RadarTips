# Guia de Migração: Season Resolution V2

## 🎯 Resumo

Implementamos solução **determinística** e **API-driven** para geração de standings e compstats, eliminando lógica ad-hoc e tentativas cegas de season.

---

## 📦 Novos Arquivos

### ✅ Implementação

| Arquivo | Descrição |
|---------|-----------|
| `tools/update-competition-extras-v2.mjs` | Gerador principal (substitui versão antiga) |
| `tools/update-competition-extras-batch-v2.mjs` | Processamento em lote (substitui versão antiga) |
| `tools/test-season-resolution.mjs` | Suite de testes para validação |

### 📚 Bibliotecas (já existentes)

| Arquivo | Descrição |
|---------|-----------|
| `tools/lib/season-from-leagues.mjs` | Resolução de season via `/leagues` |
| `tools/lib/api-football.mjs` | Cliente HTTP com retry |
| `tools/build-cup-structure.mjs` | Geração de estrutura de copa |

### 📝 Atualizados

| Arquivo | Mudanças |
|---------|----------|
| `tools/build-manifest.mjs` | Suporte para `dataStatus` e `coverage` |
| `tools/generate-all-snapshots-v2.mjs` | Usa `update-competition-extras-v2.mjs` |

---

## 🔄 Mudanças Estruturais

### ❌ REMOVIDO

```bash
# Flag tryNeighbors (não existe mais)
--tryNeighbors true

# Tentativa cega de seasons
[season, season-1, season+1]

# Hard-code por liga
if (leagueId === 40) { ... }
```

### ✅ ADICIONADO

```javascript
// Season resolution via /leagues
const { year, reason, coverage, leagueMeta } = await resolveSeasonForLeague({
  leagueId,
  kickoffUTC // opcional
});

// Metadata estrutural
meta: {
  seasonSource: 'current' | 'range' | 'max' | 'explicit',
  dataStatus: 'ok' | 'empty' | 'not-supported' | 'error',
  type: 'league' | 'cup',
  coverage: {
    standings: boolean,
    fixtures: boolean,
    events: boolean,
    statistics: boolean
  }
}
```

---

## 📊 Fluxo de Decisão

```
Input: leagueId
  ↓
Consulta /leagues?id=<leagueId>
  ↓
Obtém: type, seasons, coverage
  ↓
Escolhe season (current > range > max)
  ↓
         ┌────────────┴────────────┐
         ↓                         ↓
   type='league'              type='cup'
   coverage.standings=true    OR coverage.standings=false
         ↓                         ↓
   Gera standings            Gera cup structure
   standings_*.json          cup_*.json
         ↓                         ↓
         └────────────┬────────────┘
                      ↓
              Gera compstats
              compstats_*.json
```

---

## 🚀 Como Usar

### 1️⃣ Teste de Season Resolution

```bash
# Testa resolução para ligas conhecidas
node tools/test-season-resolution.mjs
```

**Saída esperada:**
```
League 39: season=2025, source=current, type=league
League 40: season=2024, source=current, type=league
League 2: season=2024, source=current, type=cup
League 848: season=2025, source=current, type=cup
```

### 2️⃣ Gerar para Liga Específica

```bash
# Com season explícita
node tools/update-competition-extras-v2.mjs --leagueId 39 --season 2025

# Sem season (detecta automaticamente via /leagues)
node tools/update-competition-extras-v2.mjs --leagueId 39

# Com kickoffUTC para ajudar na resolução
node tools/update-competition-extras-v2.mjs \
  --leagueId 39 \
  --kickoffUTC "2025-02-15T15:00:00Z"
```

### 3️⃣ Gerar para Todas as Ligas do Calendário

```bash
# Processa todas as ligas em calendar_7d.json
node tools/update-competition-extras-batch-v2.mjs
```

### 4️⃣ Pipeline Completo (Recomendado)

```bash
# Usa generate-all-snapshots-v2.mjs (já atualizado)
node tools/generate-all-snapshots-v2.mjs --maxLeagues 27
```

---

## 📝 Schema de Output

### Standings (League)

```json
{
  "schemaVersion": 1,
  "meta": {
    "leagueId": 39,
    "season": 2025,
    "seasonSource": "current",
    "type": "league",
    "dataStatus": "ok",
    "coverage": {
      "standings": true,
      "fixtures": true,
      "events": true,
      "statistics": true
    }
  },
  "league": {
    "id": 39,
    "name": "Premier League",
    "country": "England",
    "season": 2025,
    "logo": "...",
    "flag": "..."
  },
  "generated_at_utc": "2026-02-17T12:00:00.000Z",
  "standings": [
    {
      "rank": 1,
      "team": {...},
      "points": 60,
      "all": {...}
    }
  ]
}
```

### Cup Structure (Copa)

```json
{
  "schemaVersion": 1,
  "meta": {
    "leagueId": 2,
    "season": 2024,
    "seasonSource": "current",
    "type": "cup",
    "dataStatus": "not-supported",
    "coverage": {
      "standings": false,
      "fixtures": true,
      "events": true,
      "statistics": true
    }
  },
  "league": {
    "id": 2,
    "name": "UEFA Champions League",
    "country": "World",
    "type": "cup"
  },
  "generated_at_utc": "2026-02-17T12:00:00.000Z",
  "rounds": [
    {
      "name": "Final",
      "fixtures": [...]
    },
    {
      "name": "Semi-finals",
      "fixtures": [...]
    }
  ]
}
```

---

## 🔍 Logs Estruturados

### Antes (v1)
```
📊 Fetching standings for league=40, season=2025...
⚠️  No standings data found
📊 Trying season 2024...
⚠️  No data for season 2024
📊 Trying season 2026...
✓ Found 24 teams
```

### Depois (v2)
```
🔍 Resolving season for leagueId=40...

📋 Season Resolution:
   leagueId: 40
   leagueName: Championship
   country: England
   type: league
   chosenSeason: 2024
   seasonSource: current
   coverage.standings: true
   coverage.fixtures: true
   coverage.events: true
   coverage.statistics: true

📊 Competition type: LEAGUE (coverage.standings=true)
   → Generating standings...

✅ Standings saved: standings_40_2024.json
   Teams: 24

✅ Generation Summary:
   leagueId: 40
   season: 2024
   seasonSource: current
   type: league
   dataStatus: ok
   standingsTeamsCount: 24
   compstatsAvailable: true
```

---

## 🧪 Casos de Teste

| Liga | Nome | Type | coverage.standings | Comportamento |
|------|------|------|--------------------|---------------|
| 39 | Premier League | league | ✅ true | standings_39_*.json |
| 40 | Championship | league | ✅ true | standings_40_*.json |
| 2 | Champions League | cup | ❌ false | cup_2_*.json |
| 848 | Copa do Brasil | cup | ❌ false | cup_848_*.json |
| 71 | Serie A Brasil | league | ✅ true | standings_71_*.json |

---

## 🔧 Troubleshooting

### Problema: "No seasons available"

**Causa:** Liga inexistente ou sem seasons na API

**Solução:**
```bash
# Verificar se a liga existe
curl -H "x-apisports-key: $APIFOOTBALL_KEY" \
  "https://v3.football.api-sports.io/leagues?id=<leagueId>"
```

### Problema: "Standings returned empty array"

**Causa:** Liga é tipo `cup` ou `coverage.standings=false`

**Solução:** O script v2 detecta automaticamente e gera `cup_*.json`

**dataStatus:** `not-supported`

### Problema: Rate limit exceeded

**Solução:** Use batch script que processa sequencialmente:
```bash
node tools/update-competition-extras-batch-v2.mjs
```

---

## ✅ Checklist de Migração

- [ ] Testar season resolution: `node tools/test-season-resolution.mjs`
- [ ] Gerar para liga específica: `node tools/update-competition-extras-v2.mjs --leagueId 39`
- [ ] Validar outputs: `standings_39_*.json`, `compstats_39_*.json`
- [ ] Verificar manifest: `node tools/build-manifest.mjs`
- [ ] Gerar para todas as ligas: `node tools/update-competition-extras-batch-v2.mjs`
- [ ] Upload para R2: `node tools/generate-all-snapshots-v2.mjs`
- [ ] Deprecar scripts antigos:
  - `tools/update-competition-extras.mjs` → `v2.mjs`
  - `tools/update-competition-extras-batch.mjs` → `v2.mjs`

---

## 🎉 Benefícios

| Antes | Depois |
|-------|--------|
| ❌ Tentativa cega (season±1) | ✅ Consulta `/leagues` |
| ❌ Hard-code por liga | ✅ Baseado em API |
| ❌ Ignora coverage | ✅ Verifica coverage.standings |
| ❌ Gera standings vazia para copa | ✅ Gera cup structure |
| ❌ Logs confusos | ✅ Logs estruturados |
| ❌ dataStatus inexistente | ✅ dataStatus claro |
| ❌ Não sabe se é league/cup | ✅ Detecta type automaticamente |

---

## 📚 Documentos Relacionados

- [ARCHITECTURE_PROPOSAL.md](./ARCHITECTURE_PROPOSAL.md) - Proposta completa
- [tools/lib/season-from-leagues.mjs](./tools/lib/season-from-leagues.mjs) - Implementação de resolução
- [API-Football v3 Docs](https://www.api-football.com/documentation-v3) - Documentação oficial

---

**Status:** ✅ Pronto para produção

**Próximos Passos:**
1. Testar com `test-season-resolution.mjs`
2. Validar outputs
3. Deploy pipeline v2
4. Deprecar scripts v1
