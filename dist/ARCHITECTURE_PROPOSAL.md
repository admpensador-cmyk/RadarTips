# Proposta de Arquitetura: Season Resolution & Data Status

## 🎯 Objetivo

Implementar resolução de season **determinística**, **baseada 100% na API-Football v3**, eliminando lógica ad-hoc e tratamento especial por liga.

---

## 📊 Estado Atual

### ✅ O que já existe (e está correto):

1. **`tools/lib/season-from-leagues.mjs`**
   - Consulta `/leagues?id=<leagueId>`
   - Retorna seasons disponíveis com coverage
   - Escolhe season por preferência: `current > range > max`

2. **`tools/lib/api-football.mjs`**
   - Cliente HTTP com retry automático
   - Rate limit detection

3. **`tools/build-cup-structure.mjs`**
   - Gera estrutura de rounds/fixtures para copas
   - Sem dependência de standings

4. **`tools/generate-all-snapshots-v2.mjs`**
   - Pipeline moderno que usa season resolution correta

### ❌ O que está quebrado:

1. **`tools/update-competition-extras.mjs`**
   - Usa `tryNeighbors` (tenta season-1, season+1 cegamente)
   - **NÃO consulta `/leagues`** para descobrir seasons
   - **NÃO verifica `coverage.standings`**
   - **NÃO distingue league vs cup**
   - **NÃO registra dataStatus** (ok/empty/not-supported/error)

2. **`tools/update-competition-extras-batch.mjs`**
   - Chama o script acima com `--tryNeighbors true`

---

## 🏗️ Solução Arquitetural

### 1. Refatorar `update-competition-extras.mjs`

#### 1.1 Importar Season Resolution
```javascript
import { resolveSeasonForLeague } from './lib/season-from-leagues.mjs';
```

#### 1.2 Substituir lógica de tentativa cega
```javascript
// ❌ ANTES (tryNeighbors):
const seasonsToTry = [season, season-1, season+1];
for (const s of seasonsToTry) {
  // tenta até funcionar
}

// ✅ DEPOIS (baseado em API):
const { year, reason, coverage, leagueMeta } = await resolveSeasonForLeague({
  leagueId,
  kickoffUTC // opcional
});
```

#### 1.3 Decidir tipo de geração baseado em `coverage` e `type`
```javascript
if (leagueMeta.type === 'cup' || coverage.standings === false) {
  console.log(`🏆 Competition type: CUP (coverage.standings=${coverage.standings})`);
  console.log(`   Generating cup structure instead of standings...`);
  
  await buildCupStructure(leagueId, year);
  dataStatus = 'not-supported'; // standings não aplicável
  
} else {
  console.log(`📊 Competition type: LEAGUE (coverage.standings=${coverage.standings})`);
  
  const standings = await fetchStandings(leagueId, year);
  
  if (!standings || standings.standings.length === 0) {
    dataStatus = 'empty';
  } else {
    dataStatus = 'ok';
  }
}
```

#### 1.4 Registrar metadata estrutural
```javascript
const meta = {
  leagueId: Number(leagueId),
  season: Number(year),
  seasonSource: reason, // 'current' | 'range' | 'max'
  type: leagueMeta.type, // 'league' | 'cup'
  dataStatus: dataStatus, // 'ok' | 'empty' | 'not-supported' | 'error'
  coverage: {
    standings: coverage.standings,
    fixtures: coverage.fixtures,
    events: coverage.events,
    statistics: coverage.statistics
  }
};
```

#### 1.5 Logs estruturados
```javascript
console.log(`\n📋 Season Resolution:`);
console.log(`   leagueId: ${leagueId}`);
console.log(`   chosenSeason: ${year}`);
console.log(`   seasonSource: ${reason}`);
console.log(`   type: ${leagueMeta.type}`);
console.log(`   coverage.standings: ${coverage.standings}`);
console.log(`   coverage.fixtures: ${coverage.fixtures}\n`);

// Ao final:
console.log(`\n✅ Generation Summary:`);
console.log(`   standingsTeamsCount: ${teamCount}`);
console.log(`   compstatsAvailable: ${compstatsAvailable}`);
console.log(`   dataStatus: ${dataStatus}\n`);
```

---

### 2. Atualizar `build-manifest.mjs`

#### 2.1 Expandir schema para incluir coverage e dataStatus
```javascript
function buildEntryFromFile(fileName) {
  // ... existing code ...
  
  return {
    leagueId,
    season,
    file: fileName,
    sha1: sha1(buffer),
    bytes: buffer.length,
    generated_at_utc: parsed?.generated_at_utc || null,
    schemaVersion: parsed?.schemaVersion ?? null,
    type: parsed?.meta?.type || 'league',
    seasonSource: parsed?.meta?.seasonSource || null,
    dataStatus: parsed?.meta?.dataStatus || 'unknown',
    coverage: parsed?.meta?.coverage || null,
  };
}
```

---

### 3. Remover Lógica Ad-Hoc

#### 3.1 Remover flag `tryNeighbors` de CLI
```javascript
// ❌ REMOVER:
config.tryNeighbors = false;
```

#### 3.2 Remover loop de tentativas
```javascript
// ❌ REMOVER:
const seasonsToTry = config.tryNeighbors
  ? [seasonNum, seasonNum - 1, seasonNum + 1]
  : [seasonNum];

for (const trySeasonNum of seasonsToTry) {
  result = await tryFetchSeason(...);
  if (result && result.teamCount > 0) break;
}
```

#### 3.3 Remover qualquer hard-code de liga específica
- Sem `if (leagueId === 40) { ... }`
- Sem tratamento especial

---

## 🔄 Fluxo Final

```
┌─────────────────────────────────────────────────┐
│ 1. Receber leagueId + season (opcional)        │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ 2. Consultar /leagues?id=<leagueId>           │
│    → Obter seasons disponíveis                 │
│    → Obter coverage (standings, fixtures, etc.)│
│    → Obter type (league, cup)                  │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ 3. Escolher season (current > range > max)     │
│    → Registrar seasonSource                    │
└─────────────────────────────────────────────────┘
                     ↓
        ┌────────────┴────────────┐
        ↓                         ↓
┌──────────────┐          ┌──────────────┐
│ Type: LEAGUE │          │  Type: CUP   │
│ coverage     │          │  coverage    │
│ .standings   │          │  .standings  │
│   = true     │          │   = false    │
└──────────────┘          └──────────────┘
        ↓                         ↓
┌──────────────┐          ┌──────────────┐
│ Fetch        │          │ Build cup    │
│ /standings   │          │ structure    │
│              │          │ from         │
│ → ok/empty   │          │ /fixtures    │
└──────────────┘          └──────────────┘
        ↓                         ↓
┌─────────────────────────────────────────────────┐
│ 4. Fetch /fixtures for compstats               │
└─────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────┐
│ 5. Save with metadata:                         │
│    - seasonSource (current|range|max)          │
│    - dataStatus (ok|empty|not-supported|error) │
│    - type (league|cup)                         │
│    - coverage {...}                            │
└─────────────────────────────────────────────────┘
```

---

## 📝 Schema de Output

### standings_<leagueId>_<season>.json
```json
{
  "schemaVersion": 1,
  "meta": {
    "leagueId": 40,
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
  "league": { "id": 40, "name": "...", "country": "...", ... },
  "generated_at_utc": "2026-02-17T...",
  "standings": []
}
```

### cup_<leagueId>_<season>.json
```json
{
  "schemaVersion": 1,
  "meta": {
    "leagueId": 40,
    "season": 2024,
    "seasonSource": "current",
    "type": "cup",
    "coverage": { "standings": false, "fixtures": true }
  },
  "league": { ... },
  "generated_at_utc": "2026-02-17T...",
  "rounds": [
    { "name": "Final", "fixtures": [...] },
    { "name": "Semi-finals", "fixtures": [...] }
  ]
}
```

---

## ✅ Benefícios

1. **Determinístico**: Sempre usa a mesma lógica para escolher season
2. **API-driven**: Baseado 100% em `/leagues`, não em tentativa/erro
3. **Type-aware**: Distingue league vs cup automaticamente
4. **Coverage-aware**: Verifica `coverage.standings` antes de decidir
5. **Logs claros**: Saída estruturada com todos os campos relevantes
6. **Manifest preciso**: Reflete estado real da geração
7. **Zero hard-code**: Sem lógica específica por liga
8. **Manutenível**: Lógica isolada em libs reutilizáveis

---

## 🚀 Implementação

1. ✅ Refatorar `update-competition-extras.mjs`
2. ✅ Atualizar `build-manifest.mjs`
3. ✅ Remover `tryNeighbors` de batch script
4. ✅ Testar com ligas problema (40, 39, etc.)
5. ✅ Validar manifest gerado
6. ✅ Deploy pipeline

---

## 📊 Casos de Teste

| Liga | Type | coverage.standings | Comportamento Esperado |
|------|------|--------------------|------------------------|
| 39 (Premier League) | league | true | Gerar standings normalmente |
| 40 (Championship) | league | true | Gerar standings normalmente |
| 2 (Champions League) | cup | false | Gerar cup structure |
| 848 (Copa do Brasil) | cup | false | Gerar cup structure |
| 71 (Serie A Brasil) | league | true | Gerar standings normalmente |

---

**Status:** Proposta completa - aguardando aprovação para implementação.
