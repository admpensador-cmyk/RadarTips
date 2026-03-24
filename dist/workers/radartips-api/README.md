# RadarTips API Worker (v1)

Este Worker serve **os snapshots (radar/calendário)** a partir do **R2** e adiciona **atualização ao vivo por minuto** sem precisar rebuildar o Cloudflare Pages.

## O que ele entrega

- `/api/v1/calendar_day.json` (R2)
- `/api/v1/calendar_7d.json` (R2)
- `/api/v1/calendar_2d.json` (R2 + classification by timezone) **← NEW**
- `/api/v1/radar_day.json` (R2)
- `/api/v1/radar_week.json` (R2)
- `/api/v1/live.json` (KV, atualizado a cada 1 min)

O site (front) já está ajustado para:
- carregar snapshots por `/api/v1` e fazer fallback automático para `/data/v1` caso o Worker ainda não esteja no ar;
- usar `/api/v1/calendar_2d.json?tz=America/Sao_Paulo` para calendar com separação por timezone (hoje/amanhã);
- atualizar placar/status/resultado (GREEN/RED) automaticamente via `/api/v1/live.json`.

## Setup (Cloudflare)

1) Crie um **R2 bucket** (ex.: `radartips-data`).
2) Crie um **KV namespace** (ex.: `radartips-kv`).
3) Em `wrangler.toml`, substitua:
   - `__PUT_KV_NAMESPACE_ID__`
   - `__PUT_R2_BUCKET_NAME__`
4) Coloque sua API key da ApiSports:
   - `API_FOOTBALL_KEY` (var no `wrangler.toml` ou via `wrangler secret put API_FOOTBALL_KEY`).

## Deploy

```bash
cd workers/radartips-api
npm i -g wrangler
wrangler deploy
```

## Subir snapshots no R2

Os snapshots devem ficar em (pasta `snapshots/`):

```
R2/snapshots/
  ├─ calendar_7d.json     (primário: universo completo)
  ├─ calendar_day.json    (fallback: apenas hoje/amanhã)
  ├─ radar_day.json
  └─ radar_week.json
```

Você pode subir manualmente pelo painel do Cloudflare, ou automatizar via GitHub Actions usando `wrangler r2 object put`.

> Importante: o Worker funciona mesmo sem snapshots no R2 (faz fallback para fetch externo), mas o front também pode fallback para arquivos estáticos (`/data/v1`).

## Prioridade de Fontes - `/api/v1/calendar_2d.json`

O endpoint `calendar_2d.json` usa a seguinte **cascata de prioridade** para obter dados:

1. **calendar_7d.json** (primário) - Universo completo de 7 dias
2. **calendar_day.json** (fallback) - Apenas hoje/amanhã
3. **External fetch** (fallback) - Requisição para worker externo

A resposta inclui `meta.source` indicando qual fonte foi usada:

```json
{
  "meta": {
    "tz": "America/Sao_Paulo",
    "today": "2026-02-19",
    "tomorrow": "2026-02-20",
    "generated_at_utc": "2026-02-19T11:53:16.924Z",
    "form_window": 5,
    "goals_window": 5,
    "source": "calendar_7d"  // "calendar_7d" | "calendar_day" | "external"
  },
  "today": [...],
  "tomorrow": [...]
}
```

### Debug Logging

Para ativar debug logging, configure a variável de ambiente `DEBUG=true`:

```bash
wrangler secret put DEBUG --binding RADARTIPS_LIVE value=true
# ou em wrangler.toml:
# [env.production]
# vars = { DEBUG = "true" }
```

Logs incluem qual fonte foi carregada e quantos matches foram classificados (aparece em CloudFlare Workers > Logs).
