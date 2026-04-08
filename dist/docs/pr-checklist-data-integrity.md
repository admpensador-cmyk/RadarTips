# PR checklist — data integrity

Use this when changing **data pipelines**, **snapshots**, or **product surfaces** that show interpreted football content.

## Policy (summary)

- **OK in frontend:** filtering, navigation, tabs, expand/collapse, formatting snapshot-ready fields.
- **Not OK in frontend:** computing metrics, trends, picks, confidence, risk, or ranks from raw fixture/API rows.

## Checklist

- [ ] New or changed **interpretive** fields are produced in **pipeline** and stored on the snapshot object (not derived in `assets/js`).
- [ ] Frontend reads **contract fields** (`match_radar_ui`, `home_page_ui`, `team_page_ui`, …) and does not reimplement risk→confidence mappings or pick localization from raw `suggestion_free`.
- [ ] If a snapshot field is absent, the UI **hides** or shows a neutral placeholder — no client-side “best guess” analytics.
- [ ] League/day/calendar **counts** for nav either come from **`home_page_ui`** (or equivalent snapshot) or are clearly non-interpretive list filtering only; prefer snapshot for product-visible counts.
- [ ] **Team pages:** no deriving match counts from `rate × matches` unless both are display-only; prefer pipeline-supplied strings.
- [ ] `docs/data-architecture.md` still matches the approach if architecture changed.
- [ ] Ran **`npm run build`** (or project build) and any existing **verify** scripts touched by the change.

## References

- `docs/data-architecture.md`
- `tools/lib/match-analytics-engine.mjs`, `tools/lib/home-page-ui-build.mjs`, `tools/lib/league-analytics-engine.mjs`
