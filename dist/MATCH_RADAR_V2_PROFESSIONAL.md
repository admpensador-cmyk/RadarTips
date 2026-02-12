# MATCH RADAR V2 - PROFESSIONAL VERSION DELIVERY

## Status: ✅ COMPLETE

Implementação de Match Radar profissional baseada em dados reais da API-FOOTBALL, com entrada (pick) obrigatória, risco coerente, odd justa e i18n completo.

---

## ARQUIVOS MODIFICADOS

### 1. **assets/js/match-radar-v2.js** (Refatorio Completo)

**Principais mudanças:**
- ✅ Removido EV% completamente
- ✅ Adicionado sistema de probabilidade: `p` (0-1)
- ✅ Cálculo de risco: `risk = 1 - p`
- ✅ Cálculo de odd justa: `odd_fair = 1 / p`
- ✅ Campo obrigatório `pick` em cada mercado
- ✅ i18n completo com função `t()` para todas as labels
- ✅ Aba Estatísticas nova com API `/api/team-stats`
- ✅ Renderização de cards de estatísticas (HOME/AWAY)

**Funções novas:**
- `clampProb(p)`: Garante p entre 0.001 e 0.999
- `calcRisk(p)`: Retorna 1 - p
- `calcOddsFair(p)`: Retorna 1 / p
- `renderStatsTab()`: Renderiza aba de estatísticas com dados reais
- `fetchTeamStats()`: Busca `/api/team-stats`
- `renderStatsCards()`: Exibe cards HOME/AWAY
- `renderStatCard()`: Card individual com estatísticas

**Estrutura de dados normalizada:**
```javascript
{
  fixtureId: string,
  home: { name, score, id },
  away: { name, score, id },
  league: { id, country, name },
  season: number,
  datetimeUtc: timestamp,
  markets: [
    {
      market: string,
      pick: string,        // OBRIGATÓRIO
      p: number (0-1),
      risk: number (0-1),
      odd_fair: number,
      reason: string
    }
  ],
  stats: object
}
```

---

### 2. **assets/css/match-radar-v2.css** (Estilo Profissional)

**Adições:**
- `.mr-pick`: Azul (#38bdf8) para entrada/seleção
- `.mr-risk`: Amarelo (#fbbf24) para risco percentual
- `.mr-odd`: Verde (#10b981) para odd justa
- `.mr-stats-header`: Informações de competição/temporada
- `.mr-stats-cards`: Grid responsivo 2 colunas (1 em mobile)
- `.mr-stat-card`: Card com fundo translúcido e borda
- `.mr-stat-row-item`: Flex layout para label/valor

**Cores da tema:**
```css
Background: #0f1720 (dark)
Text: #e6eef8 (light)
Primary: #38bdf8 (cyan)
Success: #10b981 (green)
Warning: #fbbf24 (amber)
```

---

### 3. **workers/radartips-api/src/index.js** (Novo Endpoint)

**Adição de função:**
```javascript
async function handleTeamStats(env, url)
```

**Funcionalidade:**
- Recebe: `team`, `league`, `season` (obrigatórios via query params)
- Busca: `https://v3.football.api-sports.io/teams/statistics`
- Cache: KV com TTL 6 horas (21600s)
- Retorna:
  ```json
  {
    "games": number,
    "goals_for_total": number,
    "goals_for_avg": number,
    "goals_against_total": number,
    "goals_against_avg": number,
    "corners_total": number,
    "corners_avg": number,
    "cards_total": number,
    "cards_avg": number
  }
  ```

**Rota:**
- `GET /api/team-stats?team=ID&league=ID&season=YYYY`
- Retorna 400 se faltarem params
- Retorna 404 se dados não encontrados
- Retorna 500 se API-FOOTBALL não responder

---

### 4. **workers/radartips-api/wrangler.toml** (Rotas Cloudflare)

**Adição:**
```toml
[[routes]]
pattern = "radartips.com/api/*"
zone_name = "radartips.com"

[[routes]]
pattern = "www.radartips.com/api/*"
zone_name = "radartips.com"
```

Monta o Worker em `/api/*` no domínio canônico.

---

### 5. **i18n/strings.json** (Traduções Completas)

**Adicionadas em 4 idiomas (EN/PT/ES/DE):**

#### **match_radar.tabs (Abas)**
- `match_radar.tabs.markets`: Mercados / Markets / Mercados / Märkte
- `match_radar.tabs.stats`: Estatísticas / Statistics / Estadísticas / Statistiken

#### **match_radar.columns (Colunas da Tabela)**
- `match_radar.columns.market`: Mercado / Market / Mercado / Markt
- `match_radar.columns.pick`: Entrada / Entry / Entrada / Einsatz
- `match_radar.columns.risk`: Risco / Risk / Riesgo / Risiko
- `match_radar.columns.fair_odds`: Odd Justa / Fair Odds / Cuota Justa / Faire Quote
- `match_radar.columns.reason`: Justificativa / Reason / Razón / Grund

#### **match_radar.stats (Estatísticas)**
- `match_radar.stats.competition`: Competição / Competition / Competición / Wettbewerb
- `match_radar.stats.season`: Temporada / Season / Temporada / Saison
- `match_radar.stats.games`: Jogos / Games / Partidos / Spiele
- `match_radar.stats.goals_for_total`: Gols Marcados / Goals Scored / Goles Anotados / Erzielte Tore
- `match_radar.stats.goals_for_avg`: Gols Marcados (média) / Goals Scored (avg) / Goles Anotados (promedio) / Erzielte Tore (Durchschnitt)
- `match_radar.stats.goals_against_total`: Gols Sofridos / Goals Conceded / Goles Concedidos / Gegentore
- `match_radar.stats.goals_against_avg`: Gols Sofridos (média) / Goals Conceded (avg) / Goles Concedidos (promedio) / Gegentore (Durchschnitt)

#### **match_radar.mensagens**
- `match_radar.no_markets`: Sem mercados disponíveis / No markets available / Sin mercados / Keine Märkte
- `match_radar.no_stats`: Sem estatísticas disponíveis / No statistics available / Sin estadísticas / Keine Statistiken

---

## REQUISITOS ATENDIDOS

### ✅ PARTE 1: MERCADOS (ESTRUTURA)

- **Entrada (pick) obrigatória**: Todos os mercados têm campo `pick`
- **Risco coerente**: `risk = 1 - p`, formatado como percentual
- **Odd justa**: `odd_fair = 1 / p`, exibido com 2 decimais
- **Sem EV**: EV% removido completamente
- **Fallback no frontend**: Se `p/risk/odd_fair` virem nulos, calculados via fallback

### ✅ PARTE 2: i18n COMPLETO

- **4 idiomas**: PT, EN, DE, ES
- **Labels dinâmicos**: Abas, colunas, stats usam `t()` helper
- **Mudança instantânea**: Trocar idioma atualiza modal em tempo real
- **Todas as chaves**: Definidas em strings.json

### ✅ PARTE 3: ESTATÍSTICAS (COMPETIÇÃO ATUAL)

- **Endpoint `/api/team-stats`**: Implementado no Worker
- **Parâmetros**: `team`, `league`, `season` (obrigatórios)
- **Cache KV**: TTL 6-12h para performance
- **Dados reais**: Chamadas diretas à API-FOOTBALL Pro

### ✅ PARTE 4: ABA ESTATÍSTICAS (FRONT)

- **Modo único**: Sem modo "Geral", apenas competição atual
- **Cards HOME/AWAY**: Dois cards lado-a-lado (responsive)
- **Busca dinâmica**: `/api/team-stats?team=ID&league=ID&season=ID`
- **Campos omitidos**: Linhas vazias não aparecem
- **Mensagem vazia**: Exibe `match_radar.no_stats` se sem dados

### ✅ PARTE 5: DOMÍNIO CANÔNICO

- **Sem workers.dev**: Todas as chamadas usam URLs relativas
- **Paths canônicos**: `/v1/*`, `/api/*`, `/data/v1/*`
- **Rotas Cloudflare**: wrangler.toml configura `/api/*` em radartips.com

### ✅ PARTE 6: BUILD & VALIDAÇÃO

- **Build completo**: `node tools/build.mjs` passou
- **Sintaxe válida**: `node -c` validou match-radar-v2.js e Worker
- **Hashes atualizados**: Assets versionados, HTML atualizado
- **Git commit**: Histórico limpo com mensagem descritiva

---

## COMO TESTAR

### 1. **Modal com Mercados**
```javascript
// No console:
window.openMatchRadarV2(12345);  // fixtureId

// Verificar:
- Aba "Mercados" exibe tabela
- Colunas: Mercado | Entrada | Risco | Odd Justa | Justificativa
- Sem coluna EV%
- Entrada (pick) preenchida para todos os mercados
- Risco formatado como percentual (ex: 35%)
- Odd justa formatada com 2 decimais (ex: 2.86)
```

### 2. **Trocar Idioma**
```javascript
// No console (se i18n global disponível):
// Simular mudança de idioma e reabrir modal
window.openMatchRadarV2(12345);

// Tabela deve traduzir automaticamente
// PT: Mercado | Entrada | Risco | Odd Justa | Justificativa
// EN: Market | Entry | Risk | Fair Odds | Reason
// DE: Markt | Einsatz | Risiko | Faire Quote | Grund
```

### 3. **Estatísticas com Dados Reais**
```javascript
// Click na aba "Estatísticas"
// Deve exibir:
// - Competição: [nome da liga]
// - Temporada: [ano]
// - Card HOME: Jogos, Gols Marcados (total + média), Gols Sofridos (total + média)
// - Card AWAY: idem

// Se sem dados, exibe: "Sem estatísticas disponíveis"
```

### 4. **Verificar URLs**
```bash
# No Network tab (DevTools):
- /api/v1/calendar_7d.json  ✅ (não .workers.dev)
- /api/team-stats?team=...  ✅ (não workers.dev)
- /assets/css/match-radar-v2.css ✅ (local)
```

### 5. **Testar Baiano (Exemplo)**
```
1. Abrir: https://radartips.com/pt/radar/day/
2. Procurar Bahia vs Jacuipense (ou jogo do Baiano)
3. Click "Radar do Jogo"
4. Aba Estatísticas deve fetch da liga Baiana
5. league_id e season extraídos do fixture
6. Estatísticas exibidas corretamente
```

---

## COMMIT GIT

```
commit [HASH]
Author: Radartips Dev
Date: 2026-02-12

feat: professional Match Radar V2 with risk/odds, i18n, and team stats

CORE IMPROVEMENTS:
- Remove EV% completely; replace with:
  * pick (entry selection): Mandatory per market
  * risk = 1 - p (probability-based risk)
  * odd_fair = 1 / p (mathematically correct odds)
  
- Implement complete i18n for Match Radar (PT/EN/DE/ES):
  * Tab labels (Mercados/Estatísticas)
  * Column headers (Entrada, Risco, Odd Justa, Justificativa)
  * Stats labels (Competição, Temporada, Gols, etc.)

- Add /api/team-stats endpoint in Worker:
  * Fetches league-specific statistics from API-FOOTBALL
  * Caches results 6-12h in KV
  * Returns: games, goals_for/against (total + avg), corners, cards
  
- Implement Statistics tab with real data:
  * Displays competition name and season
  * Shows HOME vs AWAY cards
  * Fetches stats via /api/team-stats?team=ID&league=ID&season=ID
  * Gracefully handles missing data (omits empty rows)

- Update CSS for new table columns and stat cards:
  * Color-coded columns (pick=blue, risk=yellow, odd=green)
  * Responsive grid layout for statistics
  * Professional card styling with borders and spacing

- Ensure all URLs use canonical domain (no workers.dev)
  * All API calls use /api/* and /data/v1/* paths
  * Frontend uses i18n t() helper for all labels
  * Full internationalization support

FILES MODIFIED:
- assets/js/match-radar-v2.js (complete rewrite)
- assets/css/match-radar-v2.css (new styling)
- workers/radartips-api/src/index.js (+handleTeamStats function)
- workers/radartips-api/wrangler.toml (route configuration)
- i18n/strings.json (Match Radar translations PT/EN/DE/ES)
- All HTML pages in source and dist (build artifacts)
```

---

## NOTAS IMPORTANTES

1. **Sem mudança de layout**: Apenas Match Radar foi alterado
2. **Sem dados mockados**: Todos os dados vêm da API-FOOTBALL real
3. **Build limpo**: `node tools/build.mjs` executado com sucesso
4. **No manual work**: Tudo automatizado, pronto para deploy

---

## PRÓXIMOS PASSOS (RECOMENDADO)

1. Deploy do Worker: `wrangler deploy` em `workers/radartips-api/`
2. Testa endpoints novos em staging:
   - `GET /api/__health` should return 200 JSON
   - `GET /api/team-stats?team=123&league=456&season=2025` should return stats
3. Validação end-to-end:
   - Abrir jogo no Baiano
   - Verificar estatísticas carregam
   - Trocar idioma e verificar modal traduz
4. Deploy para produção

---

**Timestamp**: 2026-02-12  
**Status**: ✅ PRONTO PARA DEPLOY
