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

Cloudflare Pages recommended settings for this repo (ensure Pages runs the static build):
- Build command: `npm run build`
- Output directory: `dist`

Note: `npm run build` runs `node tools/build-static.mjs` which generates the `dist/` folder and produces a hashed bundle under `dist/assets/` (e.g. `app.cba3bb4ebed9.js`). Pages must publish the `dist/` directory for the site to reflect the built assets.

## Data
The UI prefers live data from the Worker API:
- /api/v1/radar_day.json
- /api/v1/radar_week.json
- /api/v1/calendar_7d.json

If the Worker route is not available, it automatically falls back to static files:
- /data/v1/radar_day.json
- /data/v1/radar_week.json
- /data/v1/calendar_7d.json

### Automated updates (GitHub Actions)

This repo includes two GitHub Actions that regenerate JSON using **API-FOOTBALL**:
- Daily: `radartips_update_data_api_football.yml`
- Weekly: `radartips_update_weekly_api_football.yml`

#### Required GitHub Secrets
In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

1) `APIFOOTBALL_KEY`
   - Your API-FOOTBALL key

2) R2 upload (recommended, avoids Pages rebuilds)
   - `CLOUDFLARE_API_TOKEN` (custom token)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `R2_BUCKET_NAME`

When R2 secrets are present, the workflow uploads JSON to:
- `v1/calendar_7d.json`
- `v1/radar_day.json`
- `v1/radar_week.json`

The Worker reads these objects from R2 and serves them at `/api/v1/*.json`.

#### Commit fallback (optional)
By default, workflows do **not** commit JSON back to the repo (to avoid Cloudflare Pages rebuild/deploy limits).
If you ever want the fallback, set `COMMIT_FALLBACK=1` in the workflow env.

#### Quick smoke test
After a workflow run:
- Open Cloudflare R2 bucket and confirm `v1/` contains the JSON files.
- Hit the API routes in the browser:
  - `/api/v1/calendar_7d.json`
  - `/api/v1/radar_day.json`
  - `/api/v1/radar_week.json`
If those URLs return JSON, the UI should update automatically.


## Match markets (analysis)

Each match may include an optional analysis block with multiple suggested markets for the fixture. This powers the match modal table (Market | Suggested entry | Risk | Justification).

### `analysis.markets` (optional)
Array ordered by confidence (best first).

Fields:
- `key`: internal id (e.g. `goals_ou`, `btts`, `double_chance`, `dnb`)
- `market`: display name
- `entry`: suggested pick/line
- `risk`: `low` | `med` | `high` | `volatile`
- `confidence`: number 0..1
- `rationale`: **one short sentence** mentioning risk naturally

Example:
```json
{
  "analysis": {
    "markets": [
      {
        "key": "goals_ou",
        "market": "Goals (Over/Under)",
        "entry": "Over 2.5",
        "risk": "med",
        "confidence": 0.68,
        "rationale": "Both attacks are producing consistently, but the risk is medium due to recent variance."
      }
    ]
  }
}
```

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
