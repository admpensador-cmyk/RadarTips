# Padronização de Endpoints - API Canônica

**Data**: 2026-02-19  
**Status**: ✅ Implementado  
**Versão Worker**: 36d85c39-6656-42aa-953b-c3538a058771  

---

## Padrão Canônico

### Princípio

Todos os endpoints JSON da API devem usar a forma **canônica com `.json`** explícito:

```
/api/v1/<endpoint>.json
```

Variantes sem `.json` são **aliases** que funcionam, mas devem ser evitadas na documentação e frontend.

---

## Endpoints Implementados

| Endpoint | Status | Descrição |
|----------|--------|-----------|
| `/api/v1/calendar_2d.json` | ✅ Canônico | Calendário por timezone (hoje/amanhã) |
| `/api/v1/calendar_2d` | ✅ Alias | Idêntico ao acima (legacy) |
| `/api/v1/calendar_day.json` | ✅ Canônico | Matches do(s) dia(s) |
| `/api/v1/calendar_7d.json` | ✅ Canônico | Matches de 7 dias |
| `/api/v1/radar_day.json` | ✅ Canônico | Análise diária |
| `/api/v1/radar_week.json` | ✅ Canônico | Análise semanal |
| `/api/v1/live.json` | ✅ Canônico | Estados live de matches |

---

## Implementação no Worker

### Normalização de Rotas

**Arquivo**: `workers/radartips-api/src/index.js`

```javascript
// Normalizar rotas como /api/* → /v1/*
if (pathname.startsWith("/api/")) pathname = pathname.slice(4); 

// Remover .json das rotas para handler matching
// Ambas /v1/calendar_2d.json e /v1/calendar_2d mapeiam para handler /v1/calendar_2d
if (pathname.endsWith(".json")) pathname = pathname.slice(0, -5);

// Handler processa /v1/calendar_2d (sem .json)
if (pathname === "/v1/calendar_2d") {
  // Logic aqui...
  return jsonResponse(data);
}
```

**Resultado**:
- Requisição: `GET /api/v1/calendar_2d.json?tz=...`
- Normalizada: `GET /v1/calendar_2d` (interno)
- Handler: Responde com JSON válido
- Content-Type: `application/json`

---

## Frontend - Usando Forma Canônica

### Padrão Obrigatório

Sempre usar `.json` explicitamente:

```javascript
// ✅ CORRETO
const url = `/api/v1/calendar_2d.json?tz=${encodeURIComponent(tz)}`;
const response = await fetch(url);

// ❌ EVITAR
const url = `/api/v1/calendar_2d?tz=${encodeURIComponent(tz)}`;
const response = await fetch(url);
```

### Motivos

1. **Clareza**: Explícita que espera JSON
2. **Content-Type**: Worker retorna `application/json; charset=utf-8`
3. **Caching**: CDN pode cachear apenas `.json` (sem ambiguidade)
4. **Padrão**: Seguir convenção REST (recurso.tipo)
5. **Documentação**: Uma forma única para referenciar

---

## Documentação - Referenciando Endpoints

### Formato Obrigatório

Sempre mencionar a forma canônica em documentos:

```markdown
## Endpoint: GET /api/v1/calendar_2d.json

**Canonical Route**: `/api/v1/calendar_2d.json`  
**Alias (legacy)**: `/api/v1/calendar_2d` (funciona identicamente)

### Exemplo de Requisição
\`\`\`bash
curl "https://radartips.com/api/v1/calendar_2d.json?tz=America/Sao_Paulo"
\`\`\`

### Uso no Frontend
\`\`\`javascript
const response = await fetch(`/api/v1/calendar_2d.json?tz=${tz}`);
\`\`\`
```

### Documentos Atualizados

- ✅ [WORKER_CALENDAR_2D_DEPLOYMENT.md](WORKER_CALENDAR_2D_DEPLOYMENT.md) - Seção "Endpoint Details"
- ✅ [TIMEZONE_VALIDATION_TESTS.md](TIMEZONE_VALIDATION_TESTS.md) - Título e exemplos
- ✅ [TIMEZONE_VALIDATION_IMPLEMENTATION.md](TIMEZONE_VALIDATION_IMPLEMENTATION.md) - Overview e testes

---

## Checklist de Padronização

### Backend (Worker)
- [x] Handler implementado para `/v1/calendar_2d` (interno)
- [x] Normalização de `.json` → remover e processar
- [x] Normalização de `/api/` → `/v1/`
- [x] Comentário claro no código sobre forma canônica
- [x] Response sempre com `application/json` headers

### Frontend (assets/js/app.js)
- [x] `loadCalendar2D()` usa `/api/v1/calendar_2d.json` (com .json)
- [x] Fallback também usa forma canônica
- [x] Sem uso de variantes sem .json

### Documentação
- [x] `WORKER_CALENDAR_2D_DEPLOYMENT.md` - Corrigido
- [x] `TIMEZONE_VALIDATION_IMPLEMENTATION.md` - Corrigido
- [x] `TIMEZONE_VALIDATION_TESTS.md` - Referencia forma canônica
- [x] Novo arquivo: `ENDPOINT_STANDARDIZATION.md` (este arquivo)

### Testing
- [x] Alias `/api/v1/calendar_2d` funciona (sem .json)
- [x] Forma canônica `/api/v1/calendar_2d.json` funciona (com .json)
- [x] Ambas retornam idêntico JSON

---

## Exemplos de Uso Correto

### Browser Console
```javascript
// ✅ Correto
fetch('/api/v1/calendar_2d.json?tz=America/Sao_Paulo')
  .then(r => r.json())
  .then(d => console.log(d))

// ❌ Evitar (alias, não canônico)
fetch('/api/v1/calendar_2d?tz=America/Sao_Paulo')
  .then(r => r.json())
  .then(d => console.log(d))
```

### cURL Terminal
```bash
# ✅ Correto
curl "https://radartips.com/api/v1/calendar_2d.json?tz=America/Sao_Paulo"

# ❌ Evitar (alias, não canônico)  
curl "https://radartips.com/api/v1/calendar_2d?tz=America/Sao_Paulo"
```

### JavaScript Fetch
```javascript
// ✅ Correto
async function getCalendarTz(tz) {
  const response = await fetch(`/api/v1/calendar_2d.json?tz=${encodeURIComponent(tz)}`);
  return response.json();
}

// ❌ Evitar
async function getCalendarTz(tz) {
  const response = await fetch(`/api/v1/calendar_2d?tz=${encodeURIComponent(tz)}`); // Sem .json
  return response.json();
}
```

---

## Razão da Padronização

1. **Claridade API**: Uma forma única evita confusão
2. **REST Convention**: Recurso.tipo é padrão (`/resource.json`)
3. **CDN Caching**: Mais genérico cachear apenas `.json`
4. **Documentação**: Simples apontar para uma forma
5. **Compatibilidade**: Aliases funcionam para backward compatibility

---

## Diretrizes Futuras

### Novos Endpoints
Ao criar novos endpoints, sempre usar forma canônica:

```javascript
// ✅ Bom
/api/v1/matches.json
/api/v1/standings.json
/api/v1/predictions.json

// ❌ Evitar
/api/v1/matches
/api/v1/standings
/api/v1/predictions
```

### Deprecação de Aliases
No futuro, aliases sem `.json` podem ser descontinuados:
- Manter por 6+ meses para compatibility
- Documentar deprecation notice
- Guiar usuários para forma canônica

---

## Validação da Padronização

### Verificação Técnica
```bash
# Ambos funcionam (alias)
curl https://radartips.com/api/v1/calendar_2d.json   # Status 200
curl https://radartips.com/api/v1/calendar_2d        # Status 200 (alias)

# Conteúdo idêntico
curl https://radartips.com/api/v1/calendar_2d.json?tz=America/New_York | jq
curl https://radartips.com/api/v1/calendar_2d?tz=America/New_York     | jq
# Outputs devem ser idênticos ✅
```

### Verificação de Documentação
```bash
# Buscar por forma não-canônica na documentação
grep -r "/v1/[a-z_]*\"" *.md    # Deve retornar apenas aliases ou comentários
grep -r "/v1/[a-z_]*\.json" *.md # Deve ser predominante
```

---

## Resumo

| Aspecto | Padrão |
|---------|--------|
| **Forma Canônica** | `/api/v1/<endpoint>.json` |
| **Aliases** | `/api/v1/<endpoint>` (funciona, evitar) |
| **Frontend** | Sempre usar `.json` |
| **Documentação** | Referenciar apenas forma canônica |
| **Worker** | Normalizar ambas internamente |
| **Content-Type** | `application/json; charset=utf-8` |

✅ **Padronização Completa**: Todos os endpoints JSON agora seguem convenção única.

