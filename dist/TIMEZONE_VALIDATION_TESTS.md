# Timezone Validation Tests

## Endpoint: `/api/v1/calendar_2d.json`

The calendar endpoint now includes strict timezone parameter validation to prevent silent errors and ensure correct date classification across different timezones.

---

## Test Cases

### 1. Missing Timezone Parameter

**Request:**
```bash
curl https://radartips.com/api/v1/calendar_2d.json
```

**Expected Response (400):**
```json
{
  "error": "missing_tz",
  "message": "Required query parameter 'tz' not provided",
  "ok": false
}
```

**Purpose:** Validates that the `tz` parameter is required. No silent fallback to UTC occurs.

---

### 2. Invalid Timezone Parameter

**Request:**
```bash
curl "https://radartips.com/api/v1/calendar_2d.json?tz=Invalid/Timezone"
```

**Expected Response (400):**
```json
{
  "error": "invalid_tz",
  "message": "Invalid timezone: Invalid/Timezone",
  "tz": "Invalid/Timezone",
  "ok": false
}
```

**Purpose:** Validates timezone against IANA Timezone Database using `Intl.DateTimeFormat`. Returns both error type and submitted value for debugging.

---

### 3. Valid Timezone Parameter (Americas)

**Request:**
```bash
curl "https://radartips.com/api/v1/calendar_2d.json?tz=America/Sao_Paulo"
```

**Expected Response (200):**
```json
{
  "meta": {
    "tz": "America/Sao_Paulo",
    "today": "2026-02-19",
    "tomorrow": "2026-02-20",
    "generated_at_utc": "2026-02-19T20:42:15Z",
    "form_window": 5,
    "goals_window": 5
  },
  "today": [
    {
      "fixture_id": 123456,
      "kickoff_utc": "2026-02-20T01:30:00Z",
      "country": "Brazil",
      "competition": "Brasileirão",
      "home": "São Paulo",
      "away": "Flamengo",
      ...
    }
  ],
  "tomorrow": [
    ...
  ]
}
```

**Purpose:** Returns correctly classified matches for the user's timezone.

---

### 4. Valid Timezone Parameter (Europe)

**Request:**
```bash
curl "https://radartips.com/api/v1/calendar_2d.json?tz=Europe/Berlin"
```

**Expected Response (200):**
```json
{
  "meta": {
    "tz": "Europe/Berlin",
    "today": "2026-02-20",
    "tomorrow": "2026-02-21",
    ...
  },
  "today": [
    ...
  ],
  "tomorrow": [
    ...
  ]
}
```

**Key Difference:** Berlin is UTC+1, while São Paulo is UTC-3. A match classified as "tomorrow" in São Paulo may be classified as "today" in Berlin (expected behavior).

---

### 5. Valid Timezone Parameter (Asia/Pacific)

**Request:**
```bash
curl "https://radartips.com/api/v1/calendar_2d.json?tz=Asia/Tokyo"
```

**Expected Response (200):**
Similar structure; Tokyo is UTC+9, so date classifications will differ significantly from the Americas.

---

## Supported Timezone Format

All IANA Timezone Database identifiers are supported:

**Americas:**
- `America/New_York`
- `America/Chicago`
- `America/Denver`
- `America/Los_Angeles`
- `America/Sao_Paulo`
- `America/Argentina/Buenos_Aires`
- `America/Mexico_City`

**Europe:**
- `Europe/London`
- `Europe/Berlin`
- `Europe/Paris`
- `Europe/Madrid`
- `Europe/Rome`
- `Europe/Amsterdam`
- `Europe/Vienna`

**Africa:**
- `Africa/Johannesburg`
- `Africa/Lagos`
- `Africa/Cairo`
- `Africa/Nairobi`

**Asia:**
- `Asia/Tokyo`
- `Asia/Hong_Kong`
- `Asia/Shanghai`
- `Asia/Singapore`
- `Asia/Bangkok`
- `Asia/Dubai`
- `Asia/Kolkata`
- `Asia/Jakarta`

**Oceania:**
- `Australia/Sydney`
- `Australia/Melbourne`
- `Australia/Perth`
- `Pacific/Auckland`

---

## Validation Implementation

**Server-Side (Worker):**

```javascript
function validateTimezone(tz) {
  // Check for missing/empty string
  if (!tz || typeof tz !== "string" || tz.trim().length === 0) {
    return { valid: false, error: "missing_tz" };
  }
  
  // Validate against Intl.DateTimeFormat
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return { valid: true };
  } catch (e) {
    // RangeError thrown for invalid timezone
    return { valid: false, error: "invalid_tz", tz };
  }
}

// In endpoint handler
const tzValidation = validateTimezone(tzParam);
if (!tzValidation.valid) {
  return jsonResponse({
    error: tzValidation.error,
    message: tzValidation.error === "missing_tz" 
      ? "Required query parameter 'tz' not provided"
      : `Invalid timezone: ${tzValidation.tz}`,
    tz: tzValidation.tz,
    ok: false
  }, 400);
}
```

**Client-Side (Frontend):**

```javascript
async function loadCalendar2D() {
  const cache = window.__CALENDAR_2D_CACHE;
  const now = Date.now();
  const ttl = 60000; // 60 seconds
  if (cache.data && (now - cache.loadedAt) < ttl) return cache.data;

  try {
    // Get user's timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    
    const url = `/api/v1/calendar_2d.json?tz=${encodeURIComponent(tz)}`;
    const response = await fetch(url);
    
    // Handle validation errors (400)
    if (response.status === 400) {
      const errorData = await response.json();
      console.warn('Timezone validation error:', errorData);
      
      // Fallback to default timezone
      const fallbackUrl = `/api/v1/calendar_2d.json?tz=America/Sao_Paulo`;
      const fallbackResponse = await fetch(fallbackUrl);
      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        cache.data = data;
        cache.loadedAt = now;
        return data;
      }
    }
    
    if (!response.ok) {
      console.warn('Calendar load failed:', response.status);
      return { meta: { tz }, today: [], tomorrow: [] };
    }
    
    const data = await response.json();
    cache.data = data;
    cache.loadedAt = now;
    return data;
  } catch (e) {
    console.error('loadCalendar2D error:', e.message);
    return { meta: { tz: 'America/Sao_Paulo' }, today: [], tomorrow: [] };
  }
}
```

---

## Error Handling Philosophy

**No Silent Fallback:**
- Invalid timezone **will not** silently fall back to UTC
- Error responses are explicit with 400 status code
- Client can handle the error appropriately (retry, log, inform user)

**Debugging:**
- Error response includes the submitted timezone value for context
- Console warnings log full error details for developer inspection
- Structured error format enables programmatic error handling

---

## Testing in Browser Console

```javascript
// Test missing tz
fetch('/api/v1/calendar_2d.json').then(r => r.json()).then(d => console.log(d))

// Test invalid tz
fetch('/api/v1/calendar_2d.json?tz=Invalid/Zone').then(r => r.json()).then(d => console.log(d))

// Test valid tz
fetch('/api/v1/calendar_2d.json?tz=America/New_York').then(r => r.json()).then(d => console.log(d))
```

---

## Production Deployment

**Worker Version:** 36d85c39-6656-42aa-953b-c3538a058771

**Deployed to:**
- `radartips.com/api/v1/calendar_2d.json`
- `www.radartips.com/api/v1/calendar_2d.json`

**Status:** ✅ Live and validated
