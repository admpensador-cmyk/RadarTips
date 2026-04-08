# RadarTips (Cloudflare Pages)

**Environments (development / preview / production), canonical route (`/en/radar/day/`), and deploy rules:** see [ENVIRONMENT.md](./ENVIRONMENT.md).

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

## Theme System & UI Constraints

### How Themes Work

**Default**: Dark theme (`data-theme="dark"`)  
**Override**: Users can toggle to light theme via the theme button (saved in localStorage)

The theme is applied in **two layers** to prevent flash of unstyled content:

1. **HTML Generation** (`regenerate-html.mjs`):
   - All HTML files are generated with `<body data-theme="dark" data-page="...">` by default
   - This ensures dark theme is applied immediately on page load (no flash)

2. **JavaScript Override** (`assets/app.js`):
   - On init, `getSavedTheme()` checks localStorage for user preference
   - If user saved "light", it overrides the HTML default
   - Theme toggle button allows switching and saves preference

### CSS Theme Rules

- **Dark theme** (default): `body[data-theme="dark"]` - Uses dark palette (--bg1:#0a0e18, --ink:#e6eef8, --accent:#38bdf8)
- **Light theme** (optional): `body[data-theme="light"]` - Uses light palette (--bg1:#d9e9ff, --ink:#0b1220, --accent:#2b6ff2)
- **Fallback**: `:root` variables provide baseline light colors for graceful degradation

### Icon Size Constraints

To prevent layout blowup, icons are constrained with **scoped CSS rules**:

- `.meta-chip .ico` - 18×18px icons in radar meta chips (time, trophy, etc.)
- `.meta-link .ico` - 18×18px icons in actionable links
- `.callout-label .ico` - 18×18px icons in callout labels
- `.group-title .ico` - 18×18px icons in calendar group titles

**Rationale**: SVG icons (`<svg viewBox="0 0 24 24">`) have no intrinsic size and expand to fill their container. The scoped rules (`width:18px; height:18px; flex:0 0 18px`) ensure icons stay at a fixed, readable size.

**Scope safety**: All icon rules are scoped to specific radar/calendar UI components. They do **not** apply globally, so other parts of the site (e.g., Match Radar modal, future features) are unaffected.

### Adjusting Icon Sizes

If you need to change icon sizes:
1. Edit `assets/css/style.css` - search for `.meta-chip .ico` and related selectors
2. Modify `width`, `height`, and `flex` values (keep them consistent: e.g., `20px/20px/0 0 20px`)
3. Rebuild: `npm run build`
4. Validate: `node tools/check-theme-and-icons.mjs`

### Regression Checks

Run regression checks before deploying:

```bash
npm run test:regression
# or directly:
node tools/check-theme-and-icons.mjs
```

This validates:
- All HTML files have `data-theme` attribute
- `style.css` contains `body[data-theme="dark"]` rules
- `style.css` contains `.meta-chip .ico` rules with fixed width/height

Exit code 0 = pass, 1 = fail (blocks deploy if integrated into CI).

## Pre-commit smoke (required)

Before any `git commit` / `git push`, run:

```bash
npm run smoke
```

This validates:
- `assets/js/app.js` syntax
- `workers/radartips-api/src/index.js` syntax
- `i18n/strings.json` integrity

## Data
The UI loads live data from the Worker API. **Calendar is the single source of truth:** `/api/v1/calendar_2d` embeds `radar_day.highlights` (no separate radar endpoint or static radar JSON).

Legacy endpoints return **410 Gone** where removed (e.g. `/api/v1/calendar_7d`).

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

When R2 secrets are present, the workflow uploads under `${prefix}/snapshots/` (e.g. `prod/snapshots/calendar_2d.json`), which includes embedded `radar_day`. The Worker serves `/api/v1/calendar_2d` from that object.

3) Pages deploy (`deploy_pages.yml` uses the same `CLOUDFLARE_*` secrets)
   - Optional repository **Variable** `RADARTIPS_PAGES_PROJECT_NAME` (Pages project slug) so you can run the workflow with an empty project input.
   - Local deploy: `npm run build` then `npm run pages:deploy` — put token, account id, and project slug in **`.env.production.local`** (see `ENVIRONMENT.md` / `.env.example`).

#### Commit fallback (optional)
By default, workflows do **not** commit JSON back to the repo (to avoid Cloudflare Pages rebuild/deploy limits).
If you ever want the fallback, set `COMMIT_FALLBACK=1` in the workflow env.

#### Quick smoke test
After a workflow run:
- Open Cloudflare R2 and confirm `${prefix}/snapshots/calendar_2d.json` exists.
- Hit `/api/v1/calendar_2d` (**HTTP 200**) and confirm `radar_day.highlights` is present in the JSON.


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
