# Data architecture (RadarTips)

## Source of truth

- **Pipeline** (Node/tools) owns sports analytics: profiles, rankings, picks, confidence indices, risk bands, aggregates from fixtures, and trend text.
- **Snapshots** (`calendar_2d`, league JSON, team JSON) are the only authoritative inputs for product interpretation on the client.

## Pragmatic frontend policy

The browser **may** contain **interface logic**:

- Filter and search UI state
- Tabs, expand/collapse, navigation
- Formatting already-snapshot-safe values (e.g. ISO time → local display, number locale)
- Layout, a11y, and shell chrome

The browser **must not** contain **analytical logic**:

- Computing sports metrics from raw fixtures
- Deriving trends or insights
- Profile scores, cohort ranks, or pick/confidence/risk inference
- Reconstructing counts or rates from primitives when those should come from snapshot contracts (`match_radar_ui`, `home_page_ui`, `team_page_ui`, etc.)

## Missing values

If the UI needs a value that is not in the snapshot:

1. **Add it in the pipeline** and extend the relevant contract, or  
2. **Hide or neutralize** the control (e.g. `—`, empty block, no meter).

Do not approximate analytics in the frontend to fill gaps.

## Contracts (non-exhaustive)

- `match_radar_ui` — per-match display slice (pick, risk, confidence, goals strings, form tokens, market cards).
- `home_page_ui` — dayboard chrome, top picks, nav counts, `match_refs`.
- `team_page_ui` / `league_page_ui` — league and team surfaces driven from league snapshots.

See `docs/pr-checklist-data-integrity.md` before merging data or product changes.
