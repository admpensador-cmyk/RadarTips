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

## Calendar schema (data/v1/calendar_7d.json)

Top-level:
- `schema_version`: `"v2"`
- `generated_at_utc`: ISO string
- `form_window`: number (default 5)
- `goals_window`: number (default 5)
- `matches`: array

Each match (minimum required fields used by the UI):
- `kickoff_utc` (ISO)
- `country`, `competition`
- `home`, `away`
- `risk` (`low` | `med` | `high`)
- `suggestion_free` (e.g. `"1X"`)
- Goals totals per team (for the same `goals_window`):
  - `gf_home`, `ga_home`
  - `gf_away`, `ga_away`
- Form details (STRICT for tooltips per square):
  - `form_home_details`: array of length `form_window`
  - `form_away_details`: array of length `form_window`
  - each item: `{ "venue": "H"|"A", "opp": "Team", "score": "2-1", "date_utc": "YYYY-MM-DDT00:00:00Z", "result": "W"|"D"|"L" }`

Notes:
- If `form_*_details` are missing/empty, the UI renders neutral squares with a tooltip telling that details are missing (no placeholders).
