# RadarTips — environments

This repository uses an explicit **development → preview → production** model. There is **one canonical public surface**:

- **Primary (reference):** `https://radartips.com/en/radar/day/` (and `/en/radar/day/` on any host)
- **Localized equivalents:** `/pt/radar/day/`, `/es/radar/day/`, `/fr/radar/day/`, `/de/radar/day/`

Root `/` redirects to `/en/radar/day/` (same policy in static `index.html` and the local dev server).

## Definitions

| Environment | `APP_ENV` | Document root | Purpose |
|-------------|-----------|---------------|---------|
| **Development** | `development` | **Repo root (source)** | Fast iteration; never serves `dist/` unless `ALLOW_DIST_ROOT=1` |
| **Preview** | `preview` | **`dist/` only** | Built output; mirrors production static behavior; isolated from prod |
| **Production** | `production` | **`dist/` on Pages** | Only validated artifacts; deploy via GitHub Actions |

## Environment files

Optional files (loaded by `tools/load-radartips-env.mjs`):

- `.env.development` — local dev defaults (committed)
- `.env.preview` — dist preview defaults (committed)
- `.env.production` — production labels (committed; **no secrets**)
- `.env.example` — template
- **Local overrides:** `.env.local` / `.env.*.local` (gitignored; not loaded automatically unless you copy keys into the files above)

### Variables

| Variable | Meaning |
|----------|---------|
| `APP_ENV` | `development` \| `preview` \| `production` |
| `PUBLIC_SITE_URL` | Public origin for docs / tooling |
| `PUBLIC_API_BASE_URL` | API base for workers (`/api/v1`) |
| `PUBLIC_PAGES_MODE` | `source` (dev) or `dist` (preview/prod build) |
| `ALLOW_DIST_ROOT` | `1` only when intentionally serving `dist/` locally |
| `STRICT_VERIFY` | Reserved for CI strictness (build is fail-closed by default) |
| `DATA_MODE` | `static` (local JSON) vs `worker` (live API) — documentation |
| `SNAPSHOT_NAMESPACE` | Logical namespace (`development` / `preview` / `production`) |
| `RADARTIPS_SNAPSHOT_PREFIX` | **`prod`** or **`preview`** — R2 key prefix for uploads (`upload-calendar-to-r2.mjs`) |
| `WORKER_ENV` | Worker deployment label (documentation) |
| `PAGES_ENV` | Pages deployment label (documentation) |

Internal:

- `RADARTIPS_ALLOW_DIST_ROOT` — set to `1` only by `tools/preview-dist.mjs` (or `ALLOW_DIST_ROOT=1` in env).

## Commands

| Script | Behavior |
|--------|----------|
| `npm run dev` | Source root, `APP_ENV=development`, canonical check: `/en/radar/day/` |
| `npm run dev:open` | Same as above, opens `/en/radar/day/` |
| `npm run dev:dist` | Serves **`dist/`** on port **4173** (requires `npm run build` first). Fail-closed route checks. |
| `npm run dev:dist:open` | Same + open browser |
| `npm run build` | `APP_ENV=production` context, `build-static.mjs`, `verify-no-zombie-radar --dist`, `verify-dist-routes` |
| `npm run preview:build` | `APP_ENV=preview` context for the same build pipeline (use for preview-aligned builds) |
| `npm run verify` | Zombie radar checks on **source** |
| `npm run verify:dist` | Zombie radar checks on **dist** (requires build) |
| `npm run deploy:preview` | Prints **preview** deploy rules (no silent deploy) |
| `npm run deploy:prod` | Prints **production** deploy rules (single path: GitHub Actions) |

## Source vs `dist`

- **Development** always uses **source** HTML/CSS/JS at the repo root unless you explicitly opt into `dist/` via `npm run dev:dist`.
- **Production** ships **`dist/`** produced by `tools/build-static.mjs` only. Pages must publish `dist/`, not the repo root.

## Data / snapshot isolation (R2)

All calendar/radar/league JSON in R2 uses an **explicit prefix** — never shared legacy paths:

| Namespace | R2 key pattern | Writer | Reader |
|-----------|----------------|--------|--------|
| **Production** | `prod/snapshots/calendar_2d.json`, `prod/snapshots/radar_day.json`, `prod/data/coverage_allowlist.json`, `prod/snapshots/leagues/...` | `upload-calendar-to-r2.mjs` with `RADARTIPS_SNAPSHOT_PREFIX=prod` (GitHub Actions default) | Production Worker (`RADARTIPS_SNAPSHOT_PREFIX=prod` in `wrangler.toml`) |
| **Preview** | `preview/snapshots/...` (same relative paths under `preview/`) | Same uploader with `RADARTIPS_SNAPSHOT_PREFIX=preview` (workflow dispatch) + `RADARTIPS_CONFIRM_PREVIEW_UPLOAD=1` in CI | Preview Worker deployment with `RADARTIPS_SNAPSHOT_PREFIX=preview` |

- **Worker** resolves keys as `` `${RADARTIPS_SNAPSHOT_PREFIX}/${relativePath}` `` where `relativePath` is e.g. `snapshots/calendar_2d.json`. If `RADARTIPS_SNAPSHOT_PREFIX` is missing or not `prod`/`preview`, the Worker returns **503** `misconfigured_snapshot_prefix` (fail-closed).
- **Legacy** keys at `snapshots/...` (no prefix) are **not** read. Migrate once: `node tools/r2-migrate-legacy-to-prod-prefix.mjs` (requires wrangler auth), then deploy the Worker, then optionally delete legacy objects.
- **GitHub Actions** `radartips_update_data_api_football.yml`: scheduled runs use **`prod`**; `workflow_dispatch` can choose **`preview`** (isolated writes). Live checks against `radartips.com` run **only** when publishing **`prod`**.
- **Local preview upload**: set `RADARTIPS_SNAPSHOT_PREFIX=preview` and `RADARTIPS_CONFIRM_PREVIEW_UPLOAD=1` (CI sets confirm automatically for preview).

## Deploy rules

- **Production (Pages):** `.github/workflows/deploy_pages.yml` — `workflow_dispatch`, builds `dist/`, checks `dist/en/radar/day/index.html` (primary) and `dist/pt/radar/day/index.html`, deploys `dist/`, then `tools/check-production-day-runtime.mjs`.
- **Worker:** `.github/workflows/deploy-worker.yml` — separate from Pages.

## Guards

- `tools/dev-server.mjs` blocks `dist/` unless `RADARTIPS_ALLOW_DIST_ROOT=1`.
- `APP_ENV=preview` requires `--root dist` (enforced in dev-server).
- `tools/verify-dist-routes.mjs` requires `dist/en/radar/day/index.html` (primary) plus localized radar day pages.
