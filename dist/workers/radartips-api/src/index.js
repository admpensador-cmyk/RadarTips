var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

var BASE_FILES = [
  "calendar_day.json",
  "calendar_7d.json",
  "radar_day.json",
  "radar_week.json"
];

var FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);
var VOID_STATUSES = new Set(["CANC", "PST", "ABD", "SUSP"]);

function nowIso() {
  return new Date().toISOString();
}
__name(nowIso, "nowIso");

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
__name(safeJsonParse, "safeJsonParse");

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}
__name(jsonResponse, "jsonResponse");

function ok(data) {
  return jsonResponse({ ok: true, ...data });
}
__name(ok, "ok");

function dateKeyUtc(date) {
  return date.toISOString().slice(0, 10);
}
__name(dateKeyUtc, "dateKeyUtc");

function buildDailyCalendar(calendar) {
  if (!calendar || !Array.isArray(calendar.matches)) return null;
  const todayKey = dateKeyUtc(new Date());
  const matches = calendar.matches.filter((m) => {
    const ko = String(m?.kickoff_utc || "");
    return ko.startsWith(todayKey);
  });
  return {
    generated_at_utc: calendar.generated_at_utc || nowIso(),
    form_window: calendar.form_window || 5,
    goals_window: calendar.goals_window || 5,
    matches
  };
}
__name(buildDailyCalendar, "buildDailyCalendar");

// Validate timezone string using Intl.DateTimeFormat
function validateTimezone(tz) {
  if (!tz || typeof tz !== "string" || tz.trim().length === 0) {
    return { valid: false, error: "missing_tz" };
  }
  
  try {
    // Try to create a formatter with this timezone
    // If timezone is invalid, this throws RangeError
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz
    });
    return { valid: true };
  } catch (e) {
    // Invalid timezone
    return { valid: false, error: "invalid_tz", tz };
  }
}
__name(validateTimezone, "validateTimezone");

// Format date in local timezone to YYYY-MM-DD
function formatLocalYMD(date, tz = "UTC") {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(date);
  } catch {
    // Fallback to UTC if timezone is invalid
    const formatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(date);
  }
}
__name(formatLocalYMD, "formatLocalYMD");

// Get today and tomorrow in YYYY-MM-DD format for a given timezone
function getTodayTomorrowYMD(tz = "UTC") {
  const today = formatLocalYMD(new Date(), tz);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYMD = formatLocalYMD(tomorrow, tz);
  return { today, tomorrow: tomorrowYMD };
}
__name(getTodayTomorrowYMD, "getTodayTomorrowYMD");

// Classify match by local date (today/tomorrow)
function classifyMatchByLocalDate(kickoffUTC, tz, todayYMD, tomorrowYMD) {
  try {
    const d = new Date(kickoffUTC);
    const matchLocalYMD = formatLocalYMD(d, tz);
    
    if (matchLocalYMD === todayYMD) return "today";
    if (matchLocalYMD === tomorrowYMD) return "tomorrow";
    return null;
  } catch {
    return null;
  }
}
__name(classifyMatchByLocalDate, "classifyMatchByLocalDate");

async function fetchCalendar7dFallback() {
  try {
    const res = await fetch("https://radartips-data.m2otta-music.workers.dev/v1/calendar_7d.json", {
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
__name(fetchCalendar7dFallback, "fetchCalendar7dFallback");

// Check bindings availability without throwing
function checkBindings(env) {
  return {
    kv: !!env?.RADARTIPS_LIVE,
    r2: !!env?.R2
  };
}
__name(checkBindings, "checkBindings");

function isDebugEnabled(env) {
  return env?.DEBUG === "true" || env?.DEBUG === "1";
}
__name(isDebugEnabled, "isDebugEnabled");

function debugLog(env, message, extra) {
  if (!isDebugEnabled(env)) return;
  if (extra !== undefined) {
    console.log(`[worker] ${message}`, extra);
    return;
  }
  console.log(`[worker] ${message}`);
}
__name(debugLog, "debugLog");

function degradedCalendar2D(tz = "UTC", reason = "no_data") {
  const { today, tomorrow } = getTodayTomorrowYMD(tz);
  return {
    meta: {
      tz,
      today,
      tomorrow,
      generated_at_utc: nowIso(),
      form_window: 5,
      goals_window: 5,
      source: "degraded",
      warning: reason
    },
    today: [],
    tomorrow: []
  };
}
__name(degradedCalendar2D, "degradedCalendar2D");

function degradedRadarDay(reason = "no_data") {
  return {
    meta: {
      generated_at_utc: nowIso(),
      warning: reason
    },
    highlights: [],
    matches: []
  };
}
__name(degradedRadarDay, "degradedRadarDay");

function degradedLive(reason = "no_data") {
  return {
    generatedAt: nowIso(),
    ttlSeconds: 60,
    states: [],
    meta: {
      warning: reason
    }
  };
}
__name(degradedLive, "degradedLive");

async function kvGetJson(env, key) {
  if (!env?.RADARTIPS_LIVE) return null;
  try {
    const raw = await env.RADARTIPS_LIVE.get(key);
    if (!raw) return null;
    return safeJsonParse(raw, null);
  } catch (e) {
    debugLog(env, `kvGetJson error for ${key}`, e.message);
    return null;
  }
}
__name(kvGetJson, "kvGetJson");

async function kvPutJson(env, key, value, ttlSeconds) {
  if (!env?.RADARTIPS_LIVE) {
    debugLog(env, `KV not available, skipping cache for ${key}`);
    return;
  }
  try {
    const opts = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
    await env.RADARTIPS_LIVE.put(key, JSON.stringify(value), opts);
  } catch (e) {
    debugLog(env, `kvPutJson error for ${key}`, e.message);
  }
}
__name(kvPutJson, "kvPutJson");

async function r2GetJson(env, key) {
  if (!env?.R2) {
    debugLog(env, `R2 not available, cannot get ${key}`);
    return null;
  }
  try {
    const obj = await env.R2.get(key);
    if (!obj) return null;
    return safeJsonParse(await obj.text(), null);
  } catch (e) {
    debugLog(env, `r2GetJson error for ${key}`, e.message);
    return null;
  }
}
__name(r2GetJson, "r2GetJson");

async function r2PutJson(env, key, value) {
  if (!env?.R2) {
    debugLog(env, `R2 not available, skipping write for ${key}`);
    return;
  }
  try {
    await env.R2.put(key, JSON.stringify(value), {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    });
  } catch (e) {
    debugLog(env, `r2PutJson error for ${key}`, e.message);
  }
}
__name(r2PutJson, "r2PutJson");

async function listBaseFiles(env) {
  const out = {};
  for (const file of BASE_FILES) {
    out[file] = await r2GetJson(env, `snapshots/${file}`);
  }
  return out;
}
__name(listBaseFiles, "listBaseFiles");

function getMissingBindings(bindings, required) {
  const missing = [];
  if (required.includes("RADARTIPS_LIVE") && !bindings.kv) missing.push("RADARTIPS_LIVE");
  if (required.includes("R2") && !bindings.r2) missing.push("R2");
  return missing;
}
__name(getMissingBindings, "getMissingBindings");

function missingBindingsResponse(missing) {
  return jsonResponse({
    error: "missing_bindings",
    missing_bindings: missing,
    ok: false
  }, 503);
}
__name(missingBindingsResponse, "missingBindingsResponse");

async function handleApiV1(env, pathname, requestUrl) {
  try {
    const bindings = checkBindings(env);

    if (pathname === "/v1/health") {
      return ok({ ts: nowIso() });
    }

    if (pathname === "/v1/base") {
      const missing = getMissingBindings(bindings, ["R2"]);
      if (missing.length) return missingBindingsResponse(missing);
      return ok({ ts: nowIso(), data: await listBaseFiles(env) });
    }

  // LIVE endpoint used by the frontend (minute-by-minute polling)
  // Expected shape: { generatedAt, ttlSeconds, states: [...] }
  if (pathname === "/v1/live") {
    const missing = getMissingBindings(bindings, ["RADARTIPS_LIVE"]);
    if (missing.length) {
      const payload = degradedLive("no_data");
      payload.meta.missing_bindings = missing;
      debugLog(env, "Degraded /v1/live due to missing bindings", missing);
      return jsonResponse(payload, 200);
    }
    const states = await kvGetJson(env, "live_states") || [];
    return jsonResponse({ generatedAt: nowIso(), ttlSeconds: 60, states });
    }

    if (pathname === "/v1/live/state") {
      const missing = getMissingBindings(bindings, ["RADARTIPS_LIVE"]);
      if (missing.length) {
        debugLog(env, "Degraded /v1/live/state due to missing bindings", missing);
        return jsonResponse({
          ok: true,
          ts: nowIso(),
          state: {},
          meta: {
            warning: "no_data",
            missing_bindings: missing
          }
        }, 200);
      }
      return ok({ ts: nowIso(), state: await kvGetJson(env, "live_state") || {} });
    }

    // Serve snapshot files (calendar_7d, calendar_day, radar_day, radar_week) from R2
    if (pathname === "/v1/calendar_day") {
      let data = await r2GetJson(env, "snapshots/calendar_day.json");
      if (!data) {
        let cal7d = await r2GetJson(env, "snapshots/calendar_7d.json");
        if (!cal7d) {
          cal7d = await fetchCalendar7dFallback();
        }
        data = buildDailyCalendar(cal7d);
      }
      if (!data) {
        debugLog(env, "Degraded /v1/calendar_day response");
        return jsonResponse({
          generated_at_utc: nowIso(),
          form_window: 5,
          goals_window: 5,
          matches: [],
          warning: "no_data",
          missing_bindings: getMissingBindings(bindings, ["R2"])
        }, 200);
      }
      return jsonResponse(data);
    }

    if (pathname === "/v1/calendar_7d") {
      const missing = getMissingBindings(bindings, ["R2"]);
      if (missing.length) return missingBindingsResponse(missing);
      const data = await r2GetJson(env, "snapshots/calendar_7d.json");
      if (!data) return jsonResponse({ error: "Snapshot not available", ok: false }, 404);
      return jsonResponse(data);
    }

    // Canonical Endpoint: /v1/calendar_2d.json
    // Alias: /v1/calendar_2d (both normalized here by request router)
    // Separates calendar matches by today/tomorrow in user's local timezone
    // Requires: tz query parameter (IANA timezone identifier)
    // Returns: 400 if tz missing or invalid; 200 with { meta, today[], tomorrow[] }
    if (pathname === "/v1/calendar_2d") {
      const url = new URL(requestUrl || "http://localhost/v1/calendar_2d");
      const tzParam = url.searchParams.get("tz");
      
      // Validate timezone parameter (strict validation, no silent fallback)
      const tzValidation = validateTimezone(tzParam);
      if (!tzValidation.valid) {
        // Return 400 with error details
        const statusCode = 400;
        if (tzValidation.error === "missing_tz") {
          return jsonResponse({
            error: "missing_tz",
            message: "Required query parameter 'tz' not provided",
            ok: false
          }, statusCode);
        } else {
          // invalid_tz
          return jsonResponse({
            error: "invalid_tz",
            message: `Invalid timezone: ${tzValidation.tz}`,
            tz: tzValidation.tz,
            ok: false
          }, statusCode);
        }
      }
      
      const tz = tzParam; // Now we know it's valid
      
      // Cache key: cache by path + tz
      const cacheKey = `calendar_2d:${tz}`;
      const cached = await kvGetJson(env, cacheKey);
      if (cached) {
        return jsonResponse(cached);
      }
      
      const DEBUG = env.DEBUG === "true" || env.DEBUG === "1";
      const logCal2d = (msg) => DEBUG && console.log(`[calendar_2d] ${msg}`);
      
      // Fetch calendar data
      // Priority: calendar_7d.json (full universe) → calendar_day.json → external fetch → degraded
      let calendar = null;
      let dataSource = null;
      const sourceKeysTried = [];
      
      // 1. Try calendar_7d.json (primary: full universe)
      logCal2d("Attempting to load snapshots/calendar_7d.json...");
      sourceKeysTried.push("snapshots/calendar_7d.json");
      calendar = await r2GetJson(env, "snapshots/calendar_7d.json");
      if (calendar && Array.isArray(calendar.matches) && calendar.matches.length > 0) {
        logCal2d(`✓ Loaded calendar_7d.json (${calendar.matches.length} matches)`);
        dataSource = "R2:calendar_7d";
      } else {
        // 2. Fallback to calendar_day.json  (for backward compat, though 2d should use 7d)
        logCal2d("Attempting fallback to snapshots/calendar_day.json...");
        sourceKeysTried.push("snapshots/calendar_day.json");
        calendar = await r2GetJson(env, "snapshots/calendar_day.json");
        if (calendar && Array.isArray(calendar.matches) && calendar.matches.length > 0) {
          logCal2d(`✓ Loaded calendar_day.json (${calendar.matches.length} matches)`);
          dataSource = "R2:calendar_day";
        } else {
          // 3. Fallback to external fetch
          logCal2d("Attempting external fetch from data worker...");
          sourceKeysTried.push("external:radartips-data");
          calendar = await fetchCalendar7dFallback();
          if (calendar && Array.isArray(calendar.matches) && calendar.matches.length > 0) {
            logCal2d(`✓ Loaded from external fetch (${calendar.matches?.length || 0} matches)`);
            dataSource = "external:radartips-data";
          }
        }
      }
      
      // If still no data, return graceful empty response (not error)
      // This prevents UI breakage when data source is temporarily unavailable
      if (!calendar) {
        logCal2d("No calendar data available - returning degraded response");
        const payload = degradedCalendar2D(tz, "no_data");
        payload.meta.sourceUsed = "none";
        payload.meta.sourceKeysTried = sourceKeysTried;
        payload.meta.missing_bindings = getMissingBindings(bindings, ["R2"]);
        return jsonResponse(payload, 200);
      }
      
      // Get today/tomorrow in the specified timezone
      const { today: todayYMD, tomorrow: tomorrowYMD } = getTodayTomorrowYMD(tz);
      
      // Classify matches
      const todayMatches = [];
      const tomorrowMatches = [];
      
      if (Array.isArray(calendar.matches)) {
        calendar.matches.forEach((m) => {
          const kickoffUTC = m.kickoff_utc || m.date || "";
          const classification = classifyMatchByLocalDate(kickoffUTC, tz, todayYMD, tomorrowYMD);
          
          if (classification === "today") {
            todayMatches.push(m);
          } else if (classification === "tomorrow") {
            tomorrowMatches.push(m);
          }
        });
      }
      
      
      const response = {
        meta: {
          tz,
          today: todayYMD,
          tomorrow: tomorrowYMD,
          generated_at_utc: calendar.generated_at_utc || nowIso(),
          form_window: calendar.form_window || 5,
          goals_window: calendar.goals_window || 5,
          sourceUsed: dataSource,
          sourceKeysTried: sourceKeysTried,
          totalRead: calendar.matches?.length || 0,
          todayCount: todayMatches.length,
          tomorrowCount: tomorrowMatches.length,
          timestamp: nowIso()
        },
        today: todayMatches,
        tomorrow: tomorrowMatches
      };
      
      logCal2d(`✓ Response: ${todayMatches.length} today, ${tomorrowMatches.length} tomorrow (source: ${dataSource}, total: ${calendar.matches?.length})`);
      
      // Cache for 60 seconds
      await kvPutJson(env, cacheKey, response, 60);
      
      return jsonResponse(response);
    }

    if (pathname === "/v1/radar_day") {
      const missing = getMissingBindings(bindings, ["R2"]);
      if (missing.length) {
        const payload = degradedRadarDay("no_data");
        payload.meta.missing_bindings = missing;
        debugLog(env, "Degraded /v1/radar_day due to missing bindings", missing);
        return jsonResponse(payload, 200);
      }
      const data = await r2GetJson(env, "snapshots/radar_day.json");
      if (!data) return jsonResponse(degradedRadarDay("no_data"), 200);
      return jsonResponse(data);
    }

    if (pathname === "/v1/radar_week") {
      const missing = getMissingBindings(bindings, ["R2"]);
      if (missing.length) return missingBindingsResponse(missing);
      const data = await r2GetJson(env, "snapshots/radar_week.json");
      if (!data) return jsonResponse({ error: "Snapshot not available", ok: false }, 404);
      return jsonResponse(data);
    }

    return null;
  } catch (e) {
    debugLog(env, "handleApiV1 unexpected error", e.message);
    if (pathname === "/v1/calendar_2d") {
      const url = new URL(requestUrl || "http://localhost/v1/calendar_2d");
      const tz = url.searchParams.get("tz") || "UTC";
      return jsonResponse(degradedCalendar2D(tz, "no_data"), 200);
    }
    if (pathname === "/v1/radar_day") {
      return jsonResponse(degradedRadarDay("no_data"), 200);
    }
    if (pathname === "/v1/live") {
      return jsonResponse(degradedLive("no_data"), 200);
    }
    return jsonResponse({
      error: "Internal server error",
      message: e.message,
      ok: false
    }, 500);
  }
}
__name(handleApiV1, "handleApiV1");

async function handleTeamStats(env, url) {
  const urlObj = new URL(url);
  const teamId = urlObj.searchParams.get("team");
  const leagueId = urlObj.searchParams.get("league");
  const season = urlObj.searchParams.get("season");

  if (!teamId || !leagueId || !season) {
    return jsonResponse(
      { error: "Missing required params: team, league, season", ok: false },
      400
    );
  }

  // Try KV cache first (TTL: 6-12 hours) - optional if KV not available
  const cacheKey = `teamstats:${teamId}:${leagueId}:${season}`;
  const cached = await kvGetJson(env, cacheKey);
  if (cached) return jsonResponse(cached);

  // Fetch from API-FOOTBALL
  if (!env.APIFOOTBALL_KEY) {
    return jsonResponse(
      { error: "API key not configured", ok: false },
      503
    );
  }

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
      {
        headers: { "x-apisports-key": env.APIFOOTBALL_KEY }
      }
    );

    if (!res.ok) {
      return jsonResponse(
        { error: "Failed to fetch from API-FOOTBALL", ok: false, status: res.status },
        res.status
      );
    }

    const json = await res.json();
    const statsObj = json?.response;

    if (!statsObj) {
      return jsonResponse(
        { error: "No statistics found", ok: false },
        404
      );
    }

    // Extract relevant stats
    const stats = {
      games: statsObj.fixtures?.played || null,
      goals_for_total: statsObj.goals?.for?.total || null,
      goals_for_avg: statsObj.goals?.for?.average || null,
      goals_against_total: statsObj.goals?.against?.total || null,
      goals_against_avg: statsObj.goals?.against?.average || null,
      corners_total: statsObj.corners?.total || null,
      corners_avg: statsObj.corners?.average || null,
      cards_total: statsObj.cards?.yellow?.total || null,
      cards_avg: statsObj.cards?.yellow?.average || null
    };

    // Remove null values
    Object.keys(stats).forEach(k => stats[k] === null && delete stats[k]);

    // Cache for 6 hours (21600 seconds)
    await kvPutJson(env, cacheKey, stats, 21600);

    return jsonResponse(stats);
  } catch (e) {
    debugLog(env, "Team stats fetch error", e.message);
    return jsonResponse(
      { error: "Internal server error", ok: false },
      500
    );
  }
}
__name(handleTeamStats, "handleTeamStats");

async function cronUpdateLive(env) {
  const bindings = checkBindings(env);
  if (!bindings.kv) {
    debugLog(env, "Skipping cronUpdateLive: RADARTIPS_LIVE binding missing");
    return;
  }

  // 1 request per minute total: fetch ALL live fixtures, then filter to our leagues.
  // League allowlist comes from a comma-separated env var.
  const rawAllow = String(env.LIVE_LEAGUE_IDS || env.ALLOW_LEAGUE_IDS || "");
  const allowIds = rawAllow
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n));
  const allowSet = new Set(allowIds);

  if (!env.APIFOOTBALL_KEY) {
    // No key configured: keep LIVE empty and short-lived.
    await kvPutJson(env, "live_states", [], 120);
    return;
  }

  const res = await fetch("https://v3.football.api-sports.io/fixtures?live=all", {
    headers: { "x-apisports-key": env.APIFOOTBALL_KEY }
  });
  if (!res.ok) {
    // Temporary failure: do not corrupt the UI; keep last value if it exists.
    return;
  }

  const json = await res.json();
  const list = json?.response || [];
  const states = [];

  for (const fx of list) {
    const leagueId = Number(fx?.league?.id);
    if (allowSet.size && !allowSet.has(leagueId)) continue;

    const fixtureId = fx?.fixture?.id;
    const statusShort = String(fx?.fixture?.status?.short || "").toUpperCase();
    const elapsed = fx?.fixture?.status?.elapsed ?? null;

    states.push({
      fixture_id: fixtureId,
      status_short: statusShort,
      elapsed,
      goals_home: fx?.goals?.home ?? null,
      goals_away: fx?.goals?.away ?? null
    });
  }

  await kvPutJson(env, "live_states", states, 120);
}
__name(cronUpdateLive, "cronUpdateLive");

async function cronFinalizeRecent(env) {
  try {
    await cronUpdateLive(env);
  } catch (e) {
    debugLog(env, "cronFinalizeRecent failed", e.message);
  }
}
__name(cronFinalizeRecent, "cronFinalizeRecent");

var index_default = {
  async fetch(request, env, ctx) {
    let pathname = new URL(request.url).pathname;

    // Handle health check endpoint (no normalization needed)
    if (pathname === "/api/__health") {
      return jsonResponse({ ok: true, ts: nowIso() }, 200);
    }

    // Handle team stats endpoint (no normalization needed, parse query params)
    if (pathname === "/api/team-stats") {
      return await handleTeamStats(env, request.url);
    }

    // Support both route styles:
    // - Worker mounted at /api (e.g. https://radartips.com/api)
    // - Direct /v1 endpoints (e.g. https://<worker>.workers.dev/v1)
    // And support frontend expectation: /api/v1/live.json
    // If the Worker route is mounted at /api, the request pathname arrives as /api/...
    // We normalize it back to /v1/... for routing.
    if (pathname.startsWith("/api/")) pathname = pathname.slice(4); // drop '/api'

    // Map /v1/*.json -> /v1/*
    if (pathname.endsWith(".json")) pathname = pathname.slice(0, -5);

    if (pathname.startsWith("/v1/")) {
      const res = await handleApiV1(env, pathname, request.url);
      if (res) return res;
    }

    return jsonResponse({ error: "Not found", ok: false }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      cronUpdateLive(env).catch(e =>
        debugLog(env, "cron error", e.message)
      )
    );
  }
};

export { index_default as default };
