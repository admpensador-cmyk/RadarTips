# API Routing Fix Summary

## Problem
Production requests to `/api/v1/calendar_7d.json` were returning 404, causing the Match Radar V2 modal to display "Sem dados disponíveis" instead of match data.

## Root Cause
The Worker had handlers for `/v1/calendar_7d`, `/v1/radar_day`, and `/v1/radar_week`, but was:
1. Returning plain text "Not found" on 404 instead of JSON
2. Missing explicit health check endpoint at `/api/__health`
3. Missing route configuration in wrangler.toml to mount the Worker at `/api/*`

## Solution Implemented

### 1. Worker Path Normalization (workers/radartips-api/src/index.js)
The Worker correctly normalizes request paths:
```
/api/v1/calendar_7d.json
├─ Strip /api/ → /v1/calendar_7d.json
├─ Strip .json → /v1/calendar_7d
└─ Router matches handler ✓
```

### 2. Health Check Endpoint
Added `/api/__health` endpoint before path normalization:
```javascript
if (pathname === "/api/__health") {
  return jsonResponse({ ok: true, ts: nowIso() }, 200);
}
```
**Response:** `{ "ok": true, "ts": "2026-02-12T..." }`

### 3. Snapshot Routes with JSON Errors
Updated snapshot handlers to return proper JSON responses:
```javascript
if (pathname === "/v1/calendar_7d") {
  const data = await r2GetJson(env, "snapshots/calendar_7d.json");
  if (!data) return jsonResponse({ error: "Snapshot not available", ok: false }, 404);
  return jsonResponse(data);
}
```
**Success (200):** Returns JSON data from R2\
**Error (404):** `{ "error": "Snapshot not available", "ok": false }`

### 4. Wrangler Route Configuration
Added route configuration to mount Worker at `/api/*`:
```toml
[[routes]]
pattern = "radartips.com/api/*"
zone_name = "radartips.com"

[[routes]]
pattern = "www.radartips.com/api/*"
zone_name = "radartips.com"
```

### 5. Route Validation Script
Created `tools/validate-worker-routes.mjs` that tests path normalization logic:
- ✅ 8/8 test cases pass
- Tests all production paths: `/api/v1/calendar_7d.json`, `/api/v1/radar_day.json`, `/api/v1/radar_week.json`
- Tests `/api/__health` health check
- Tests invalid paths return 404

## Files Changed

| File | Change |
|------|--------|
| `workers/radartips-api/src/index.js` | Added `/api/__health` handler, updated snapshot routes to return JSON errors instead of plain text |
| `workers/radartips-api/wrangler.toml` | Added route configuration for `/api/*` on radartips.com and www.radartips.com |
| `tools/validate-worker-routes.mjs` | New validation script (8/8 tests passing) |

## Commit
```
c2dc7ce - fix(api): ensure Worker handles /api/v1/* paths with JSON errors and health check
```

## Production Deployment Instructions

1. Navigate to `workers/radartips-api` directory
2. Run `wrangler deploy`
3. Verify deployment with health check:
   ```bash
   curl https://radartips.com/api/__health
   # Expected: 200 { "ok": true, "ts": "..." }
   ```

4. Test snapshot endpoints:
   ```bash
   curl https://radartips.com/api/v1/calendar_7d.json
   # Expected: 200 with JSON array of matches
   
   curl https://radartips.com/api/v1/radar_day.json
   # Expected: 200 with radar data
   
   curl https://radartips.com/api/v1/radar_week.json
   # Expected: 200 with radar data
   ```

5. If R2 snapshots missing, all should return 404 with:
   ```json
   { "error": "Snapshot not available", "ok": false }
   ```

## Local Validation

Run the route testing script:
```bash
node tools/validate-worker-routes.mjs
```

Expected output:
```
✅ All routing tests passed!
```

## Frontend Impact

Match Radar V2 now has proper fallback chain:
1. Primary: `GET /api/v1/calendar_7d.json` ← **Now works** (404 returns JSON)
2. Fallback: `GET /data/v1/calendar_7d.json` ← Static file backup

With this fix, the frontend can properly log API responses and display meaningful errors if needed.
