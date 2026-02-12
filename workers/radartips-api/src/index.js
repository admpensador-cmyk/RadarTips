var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

var BASE_FILES = [
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

async function requireBindings(env) {
  if (!env?.RADARTIPS_LIVE) {
    throw new Error("KV binding missing: RADARTIPS_LIVE");
  }
  if (!env?.R2) {
    throw new Error("R2 binding missing: R2");
  }
}
__name(requireBindings, "requireBindings");

async function kvGetJson(env, key) {
  const raw = await env.RADARTIPS_LIVE.get(key);
  if (!raw) return null;
  return safeJsonParse(raw, null);
}
__name(kvGetJson, "kvGetJson");

async function kvPutJson(env, key, value, ttlSeconds) {
  const opts = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
  await env.RADARTIPS_LIVE.put(key, JSON.stringify(value), opts);
}
__name(kvPutJson, "kvPutJson");

async function r2GetJson(env, key) {
  const obj = await env.R2.get(key);
  if (!obj) return null;
  return safeJsonParse(await obj.text(), null);
}
__name(r2GetJson, "r2GetJson");

async function r2PutJson(env, key, value) {
  await env.R2.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
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

async function handleApiV1(env, pathname) {
  await requireBindings(env);

  if (pathname === "/v1/health") {
    return ok({ ts: nowIso() });
  }

  if (pathname === "/v1/base") {
    return ok({ ts: nowIso(), data: await listBaseFiles(env) });
  }

  // LIVE endpoint used by the frontend (minute-by-minute polling)
  // Expected shape: { generatedAt, ttlSeconds, states: [...] }
  if (pathname === "/v1/live") {
    const states = await kvGetJson(env, "live_states") || [];
    return jsonResponse({ generatedAt: nowIso(), ttlSeconds: 60, states });
  }

  if (pathname === "/v1/live/state") {
    return ok({ ts: nowIso(), state: await kvGetJson(env, "live_state") || {} });
  }

  // Serve snapshot files (calendar_7d, radar_day, radar_week) from R2
  if (pathname === "/v1/calendar_7d") {
    const data = await r2GetJson(env, "snapshots/calendar_7d.json");
    if (!data) return jsonResponse({ error: "Snapshot not available", ok: false }, 404);
    return jsonResponse(data);
  }

  if (pathname === "/v1/radar_day") {
    const data = await r2GetJson(env, "snapshots/radar_day.json");
    if (!data) return jsonResponse({ error: "Snapshot not available", ok: false }, 404);
    return jsonResponse(data);
  }

  if (pathname === "/v1/radar_week") {
    const data = await r2GetJson(env, "snapshots/radar_week.json");
    if (!data) return jsonResponse({ error: "Snapshot not available", ok: false }, 404);
    return jsonResponse(data);
  }

  return null;
}
__name(handleApiV1, "handleApiV1");

async function handleTeamStats(env, url) {
  await requireBindings(env);

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

  // Try KV cache first (TTL: 6-12 hours)
  const cacheKey = `teamstats:${teamId}:${leagueId}:${season}`;
  const cached = await kvGetJson(env, cacheKey);
  if (cached) return jsonResponse(cached);

  // Fetch from API-FOOTBALL
  if (!env.APIFOOTBALL_KEY) {
    return jsonResponse(
      { error: "API key not configured", ok: false },
      500
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
    console.log("Team stats fetch error:", e.message);
    return jsonResponse(
      { error: "Internal server error", ok: false },
      500
    );
  }
}
__name(handleTeamStats, "handleTeamStats");

async function cronUpdateLive(env) {
  await requireBindings(env);

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
    console.log("cronFinalizeRecent failed:", e.message);
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
      const res = await handleApiV1(env, pathname);
      if (res) return res;
    }

    return jsonResponse({ error: "Not found", ok: false }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      cronUpdateLive(env).catch(e =>
        console.log("cron error:", e.message)
      )
    );
  }
};

export { index_default as default };
