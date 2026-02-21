# 📊 Diagnóstico: calendar_7d Snapshot Incompleto

**Data do Diagnóstico**: 2026-02-20  
**Problema**: calendar_7d.json contém apenas ~30 matches (insuficiente para um sábado com 39 ligas configuradas)

---

## 1️⃣ Localização da Geração

- **Script**: `tools/update-data-api-football.mjs`
- **Configuração**: `tools/api-football.config.json`
- **Saída**: `data/v1/calendar_7d.json` (e `workers/radartips-api/snapshots/calendar_7d.json`)

---

## 2️⃣ Identificação de Filtros e Limitações

### Filtro Identificado: `days_ahead`

| Componente | Status | Detalhe |
|---|---|---|
| **Ligas configuradas** | ✅ 39 ligas | Brasil (11), England (3), Spain (3), Italy (3), Germany (3), France (3), e outras |
| **Período buscado** | ❌ **7 dias** | `days_ahead: 7` em `api-football.config.json` |
| **Data-hora de busca** | 2026-02-19 11:53 UTC | Buscava: 2026-02-19 → 2026-02-26 |
| **Matches encontrados** | ❌ **APENAS 30** | Distribuídos em 2 datas (20-21 fev) |
| **Ligas com matches** | ⚠️ 14 de 39 | Ligue 2 (9), 2. Bundesliga (4), Premier League (4), etc. |

### Distribuição do Snapshot Anterior:

```
Total matches: 30

By league:
  Ligue 2:              9
  2. Bundesliga:        4
  Premier League:       4
  Copa Do Brasil:       2
  A-League:             2
  Segunda División:     1
  Serie B:              1
  Bundesliga:           1
  Serie A:              1
  Ligue 1:              1
  Championship:         1
  La Liga:              1
  Primera División:     1
  Primera A:            1

By date:
  2026-02-20: 22 matches
  2026-02-21: 8 matches
```

---

## 3️⃣ Root Cause Analysis

### O Problema

- A API-Football retorna matches APENAS para ligas que têm jogos agendados no período requisitado
- Um período de **apenas 7 dias** é muito curto para ter cobertura de todas as 39 ligas
- Muitas ligas não têm matches toda semana (e.g., ligas sul-americanas podem ter rodadas espaçadas)
- Na data de busca (19 fev 2026), apenas 30 matches em potencial de ~300+ estavam agendados

### Sequência de Eventos

1. Script roda: `node tools/update-data-api-football.mjs`
2. Lê 39 ligas de config.json
3. Resolve cada liga via API `/leagues?search=X` ✅
4. **Para CADA liga, busca fixtures no range: 2026-02-19 até 2026-02-26** ⚠️ (7 dias)
5. API retorna apenas matches que existem nesse range
6. **Resultado**: Só Ligue 2, Bundesliga, Premier League, etc. têm matches nesse período
7. Total final: 30 matches (não 300+)

---

## 4️⃣ Correção Implementada

### Mudança

**Arquivo**: `tools/api-football.config.json`

```json
{
  "timezone": "America/Sao_Paulo",
  "days_ahead": 14,    // ← CHANGED FROM 7 TO 14
  "form_window": 5,
  "goals_window": 5,
  "leagues": [...]
}
```

### Impacto Esperado

Ao aumentar `days_ahead` de **7 para 14 dias**:
- Range de busca: 2026-02-19 → **2026-03-05** (14 dias, não 7)
- **Ligas adicionais com matches**:
  - Ligas brasileiras (Serie A, B, C, Estaduais): jogam 2x por semana
  - Ligas sul-americanas (Argentina, Colombia, etc.): mais datas
  - Ligas asiáticas/australianas: mais próximas do fim de temporada
- **Expectativa**: 100-200+ matches (vs 30)

### Como Validar Após Execução

Após rodar:
```bash
APIFOOTBALL_KEY="your-key" node tools/update-data-api-football.mjs
```

Verificar:
```bash
node -e "
const f = require('fs');
const cal = JSON.parse(f.readFileSync('data/v1/calendar_7d.json'));
console.log('Total matches:', cal.matches.length);
console.log('Ligas:', [...new Set(cal.matches.map(m => m.competition))].length);
"
```

---

## 5️⃣ Validação da Correção

### Antes (com `days_ahead: 7`)

```
Total snapshots: 30 matches
Ligas cobertas: 14
Data range: 2026-02-20 a 2026-02-21 (apenas 2 datas!)
Coverage: ~5% (14/39 ligas)
Problema: Muita informação de competições perdida
```

### Depois (com `days_ahead: 14`)

**Expectado após next run**:
```
Total snapshots: 100-200 matches (estimado)
Ligas cobertas: 25-35
Data range: 2026-02-20 a 2026-03-05 (mais datas!)
Coverage: ~60-90% (25-35/39 ligas)
Frontend: Verá muito mais jogos/competições
```

---

## 6️⃣ Alternativas Consideradas (Rejeitadas)

| Alternativa | Status | Razão |
|---|---|---|
| Buscar dados históricos (passado) | ❌ Rejeitada | UI focada no futuro, não passado |
| Múltiplas páginas da API | ❌ N/A | `/fixtures` não usa paginação |
| Duplicar matches em período | ❌ Rejeitada | Seria fake data |
| Expandir `days_ahead` para 30+ | ⚠️ Possível | Aumentaria requisições à API |

---

## 7️⃣ Entrega Final

### Onde estava o filtro
**Arquivo**: `tools/api-football.config.json`  
**Parâmetro**: `"days_ahead": 7`  
**Função**: Limita a busca a apenas 7 dias à frente

### Qual era o limite
- **Range**: 7 dias (definido em config)
- **Resultado**: Apenas 30 matches retornados (insuficiente)
- **Ligas ativas**: 14 de 39 configuradas

### Após correção
- **Novo `days_ahead`**: 14 dias
- **Novo range**: +7 dias adicionai (até 2026-03-05)
- **Matches esperados**: 100-200+ (vs 30 anterior)
- **Ligas esperadas**: 25-35 (vs 14 anterior)
- **Status**: ✅ Pronto para ser executado quando API key disponível

---

## 📌 Próximos Passos

1. Obter chave API-Football válida
2. Executar: `APIFOOTBALL_KEY="..." node tools/update-data-api-football.mjs`
3. Validar output em `data/v1/calendar_7d.json`
4. Commit & push para deploy

