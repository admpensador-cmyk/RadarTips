# Fix: Stats Tab Returning Data

## Problem Identified
The `/api/match-stats` endpoint was returning `"source":"fallback"` with all stats values as `null`, causing the frontend to display "Estatísticas indisponíveis para este jogo" instead of actual match statistics.

### Root Cause
The Cloudflare Worker (`workers/radartips-api/src/index.js`) attempts to load team-window-5 snapshots from Cloudflare R2, but these files don't exist in the R2 bucket. Without the data, the endpoint returns empty fallback values.

## Solution Implemented

### 1. Added GitHub Fallback to Worker ✅
Modified `workers/radartips-api/src/index.js` to:
- Create a new function `fetchFromGitHub()` that fetches snapshots from the GitHub repository
- Update `handleMatchStats()` to first try R2, then fallback to GitHub if R2 fails
- This allows the API to fetch `data/v1/team-window-5/{league}/{season}/{team}.json` directly from GitHub

**Changed files:**
- `workers/radartips-api/src/index.js` (lines 260-271, 667-715)
- Commit: 2234ecd3

### 2. Created GitHub Action for Automatic Deployment ✅
Added `.github/workflows/deploy-worker.yml` to automatically deploy the worker when:
- Changes are pushed to `workers/radartips-api/src/**`
- The workflow runs `wrangler publish` to deploy to Cloudflare

**Commit:** 4075f12b

## What Still Needs To Be Done

### Manual Configuration Required
The GitHub Action needs Cloudflare credentials to deploy. These must be configured as GitHub Repository Secrets:

1. **CLOUDFLARE_API_TOKEN**
   - Get this from: Cloudflare Dashboard → My Profile → API Tokens
   - Create a token with `Worker Scripts` and `Workers R2 Storage` permissions
   - Set in: GitHub Repo Settings → Secrets → New repository secret

2. **CLOUDFLARE_ACCOUNT_ID**
   - Get this from: Cloudflare Dashboard → Workers → Your Worker → Account ID
   - Or: Account Overview → Account ID (right side)
   - Set in: GitHub Repo Settings → Secrets → New repository secret

### Next Steps After Credentials Are Set
Once the secrets are configured:
1. The GitHub Action will automatically run and deploy the worker
2. The endpoint will start fetching team stats from GitHub fallback
3. Frontend will receive proper stats data and render the accordion view
4. Browser cache should be cleared (Ctrl+F5) to see updates

## Testing the Fix

### Before Deployment
Endpoint returns:
```json
{
  "fixture_id": 1492143,
  "home": {
    "games_used": {"games_used_total": 0},
    "stats": {"total_last5": {"gols_marcados": null}}
  },
  "meta": {"source": "fallback"}
}
```

### After Deployment (Expected)
```json
{
  "fixture_id": 1492143,
  "home": {
    "games_used": {"games_used_total": 5},
    "stats": {"total_last5": {"gols_marcados": 3, "gols_sofridos": 3}}
  },
  "meta": {"source": "snapshots"}
}
```

### Verify Deployment
Run this in the terminal:
```bash
$ node check-stats-endpoint.mjs
```

Or test manually:
```bash
$ curl "https://radartips.com/api/match-stats?fixture=1492143" | jq '.home.games_used.games_used_total'
```

Should return: `5` (not `0`)

## Code Changes Summary

### File: `/workers/radartips-api/src/index.js`

**Addition 1: GitHub Fallback Function** (after r2GetJson)
```javascript
async function fetchFromGitHub(path) {
  try {
    const url = `https://github.com/admpensador-cmyk/RadarTips/raw/main/${path}`;
    const res = await fetch(url, {
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}
```

**Addition 2: Fallback Logic in handleMatchStats**
- Calendar loading: Try R2, then GitHub
- Team snapshots: Try R2, then GitHub
- If both fail: Return nulls (current behavior)

## Why This Works
1. `data/v1/team-window-5/71/2026/147.json` (Coritiba) exists locally with stats
2. GitHub hosts the raw files publicly
3. Worker can fetch via HTTPS from GitHub as a fallback
4. No need to manually sync to R2 - GitHub is the source of truth
5. Faster fix than setting up R2 sync pipeline

## Related Commits
- `2234ecd3` - Add GitHub fallback to match-stats API
- `4075f12b` - CI: Add GitHub Action for worker deployment

## Next Phase (Optional)
Consider also setting up automatic R2 sync for these snapshots to:
- Reduce dependency on GitHub fetches
- Improve performance with R2 caching  
- Use: `tools/upload-to-r2.mjs` or create a cron workflow

---

**Status:** Awaiting Cloudflare credentials configuration to complete deployment
**ETA to Fix:** 5 minutes after credentials are added
**Impact:** Stats tab will show actual match data instead of "unavailable" message
