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

### Automated updates (GitHub Actions)

This repo includes a daily GitHub Action that regenerates the JSON files using the **football-data.org** API.

1) Create an API token on football-data.org.
2) In GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FOOTBALL_DATA_TOKEN`
   - Value: your token
3) (Optional) Override competitions / windows via environment variables in the workflow:
   - `RADARTIPS_COMPETITIONS` (default: `PL,PD,SA,BL1,FL1,BSA`)
   - `RADARTIPS_DAYS` (default: `7`)
   - `RADARTIPS_FORM_WINDOW` (default: `5`)

After the workflow pushes updated JSON to `main`, Cloudflare Pages will deploy automatically.

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
- `risk` (`low` | `medium` | `high`)
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
