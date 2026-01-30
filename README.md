# RadarTips (Cloudflare Pages)

Static multi-language site (EN/PT/ES/FR/DE) designed for:
- Daily Radar (Top 3)
- Weekly Radar
- 7-day Calendar (by time / by country)
- Free view shows: fixture + suggestion + risk + basic stats
- PRO fields are shown as locked (probability/EV/odds)

## Deploy (Cloudflare Pages)
- Framework preset: None
- Build command: (empty)
- Output directory: /

## Data
Currently reads JSON from:
- /data/v1/radar_day.json
- /data/v1/radar_week.json
- /data/v1/calendar_7d.json

Next step: replace JSON generation with Cloudflare Worker Cron + KV/D1 (automation).
