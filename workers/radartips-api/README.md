# RadarTips API Worker (v1)

Este Worker serve **os snapshots (radar/calendário)** a partir do **R2** e adiciona **atualização ao vivo por minuto** sem precisar rebuildar o Cloudflare Pages.

## O que ele entrega

- `/api/v1/calendar_7d.json` (R2)
- `/api/v1/radar_day.json` (R2)
- `/api/v1/radar_week.json` (R2)
- `/api/v1/live.json` (KV, atualizado a cada 1 min)

O site (front) já está ajustado para:
- carregar snapshots por `/api/v1` e fazer fallback automático para `/data/v1` caso o Worker ainda não esteja no ar;
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

## Subir snapshots no R2 (v1)

Os snapshots devem ficar em:

```
R2:  v1/calendar_7d.json
     v1/radar_day.json
     v1/radar_week.json
```

Você pode subir manualmente pelo painel do Cloudflare, ou automatizar via GitHub Actions usando `wrangler r2 object put`.

> Importante: o Worker funciona mesmo sem snapshots no R2 (ele vai responder 404 nesses endpoints), mas o front faz fallback para os arquivos estáticos (`/data/v1`).
