# Optional: Worker-Level Tab Endpoints

## Current Architecture (Frontend-Only)
✅ **Status**: Fully Functional
- Frontend loads full calendar_day.json (22 matches)
- Client-side filtering via classifyMatchByLocalDate()
- Tabs switch without refetching data
- **Bandwidth**: 1 request (22 items)

## Proposed Enhancement (Worker Optimization)
❓ **Optional**: Server-side filtering

### Benefits
- Smaller payload: Send only today's matches (8 items vs 22)
- Reduced bandwidth: ~30-40% smaller JSON download
- Parallel tab loading: Load both tabs simultaneously
- SEO hints: Can cache by date (cache busting on page load)

### Implementation

#### Option A: Split Endpoints
```javascript
// In workers/radartips-api/src/index.js

async function handleCalendarToday(env) {
  const calendar = await fetchCalendarBase(env);
  const today = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", {year:"numeric", month:"2-digit", day:"2-digit"}).format(today);
  const filtered = calendar.filter(m => localDateKey(m.kickoff_utc) === todayStr);
  return Response.json({ matches: filtered });
}

async function handleCalendarTomorrow(env) {
  const calendar = await fetchCalendarBase(env);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = new Intl.DateTimeFormat("en-CA", {year:"numeric", month:"2-digit", day:"2-digit"}).format(tomorrow);
  const filtered = calendar.filter(m => localDateKey(m.kickoff_utc) === tomorrowStr);
  return Response.json({ matches: filtered });
}

// Router
if (pathname === '/v1/calendar_today.json') return handleCalendarToday(env);
if (pathname === '/v1/calendar_tomorrow.json') return handleCalendarTomorrow(env);
```

#### Option B: Query Parameter
```javascript
// Single endpoint, parameter-based filtering
if (pathname === '/v1/calendar_day.json') {
  const url = new URL(request.url);
  const dateType = url.searchParams.get('type'); // "today" | "tomorrow"
  
  const calendar = await fetchCalendarBase(env);
  
  if (dateType === 'today') {
    // filter for today
  } else if (dateType === 'tomorrow') {
    // filter for tomorrow
  } else {
    // return full calendar (default)
  }
}
```

#### Option C: Hybrid (Recommended)
Keep frontend implementation as-is, but Worker can serve optimized payloads:
- `/api/v1/calendar_day.json` → Full calendar (22 items, current behavior)
- `/api/v1/calendar_today.json` → Today only (8 items, new)
- `/api/v1/calendar_tomorrow.json` → Tomorrow only (12 items, new)

Frontend can choose:
```javascript
// Current (load everything)
const resp = await fetch('/api/v1/calendar_day.json');

// or Optimized (parallel load)
const [today, tomorrow] = await Promise.all([
  fetch('/api/v1/calendar_today.json').then(r => r.json()),
  fetch('/api/v1/calendar_tomorrow.json').then(r => r.json())
]);
```

## Timezone Handling Challenge

⚠️ **Critical Issue**: Worker runs in UTC, not user's local timezone

```javascript
// This WRONG (worker's UTC):
const today = new Date(); // Gets Cloudflare's server time (UTC)

// This CORRECT (user's timezone):
// Can't determine user's timezone in Worker without client info
```

### Solutions

#### 1. Send Timezone to Worker
```javascript
// Frontend
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const resp = await fetch(`/api/v1/calendar_today.json?tz=${tz}`);

// Worker
const timeZone = url.searchParams.get('tz') || 'UTC';
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year:"numeric",
  month:"2-digit",
  day:"2-digit"
});
```

#### 2. Accept Date Override
```javascript
// Frontend sends explicit date
const today = new Date();
const dateStr = new Intl.DateTimeFormat("en-CA").format(today);
const resp = await fetch(`/api/v1/calendar?date=${dateStr}`);

// Worker uses provided date
const filterDate = url.searchParams.get('date') || dateStrUTC;
```

#### 3. Pre-generate Snapshots (Simplest)
Keep calendar_day.json, calendar_today.json, calendar_tomorrow.json as static snapshots:
- Generated daily via cron job
- Uploaded to R2
- No timezone logic needed in Worker
- Fastest response (static files)

## Recommendation

❌ **Skip Worker optimization for now** because:
1. Frontend implementation is cleaner (user's actual timezone)
2. 22 items payload is negligible (≤50KB JSON)
3. Frontend filtering is instant (no network delay)
4. Architecture is simpler and more maintainable
5. No worker cost increase

✅ **If bandwidth becomes concern**:
- Implement Option C (Hybrid) with timezone query param
- Use pre-generated snapshots for reliability
- A/B test user impact before full rollout

## Status

**Current**: ✅ Frontend-only (recommended)
**Optional Enhancement**: Deferred until needed
**Effort**: 2-3 hours if decided
**Risk**: Low (backward compatible)
