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

var FINAL_STATUSES = /* @__PURE__ */ new Set(["FT", "AET", "PEN"]);
var VOID_STATUSES = /* @__PURE__ */ new Set(["CANC", "PST", "ABD", "SUSP"]);

function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
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

function err(message, status = 400, extra = {}) {
  return jsonResponse({ ok: false, error: message, ...extra }, status);
}
__name(err, "err");

async function requireBindings(env) {
  if (!env?.RADARTIPS_LIVE) {
    console.log("KV binding missing: RADARTIPS_LIVE");
    throw new Error("KV binding missing: RADARTIPS_LIVE");
  }
  if (!env?.R2) {
    console.log("R2 binding missing: R2");
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
  const opts = ttlSeconds ? { expirationTtl: ttlSeconds } : void 0;
  await env.RADARTIPS_LIVE.put(key, JSON.stringify(value), opts);
}
__name(kvPutJson, "kvPutJson");

async function r2GetJson(env, key) {
  const obj = await env.R2.get(key);
  if (!obj) return null;
  const text = await obj.text();
  return safeJsonParse(text, null);
}
__name(r2GetJson, "r2GetJson");

async function r2PutJson(env, key, value) {
  await env.R2.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
}
__name(r2PutJson, "r2PutJson");

function isFinalStatus(status) {
  return FINAL_STATUSES.has(status);
}
__name(isFinalStatus, "isFinalStatus");

function isVoidStatus(status) {
  return VOID_STATUSES.has(status);
}
__name(isVoidStatus, "isVoidStatus");

function computeLeagueKey(fixture) {
  const league = fixture?.league || {};
  return `${league.id || "0"}:${league.season || "0"}`;
}
__name(computeLeagueKey, "computeLeagueKey");

function computeFixtureKey(fixture) {
  return String(fixture?.fixture?.id || fixture?.id || "");
}
__name(computeFixtureKey, "computeFixtureKey");

function normalizeFixture(payload) {
  if (!payload) return null;
  const fixture = payload.fixture || payload;
  const league = payload.league || payload;
  const teams = payload.teams || payload;
  const goals = payload.goals || payload;
  const score = payload.score || payload;
  const status = fixture?.status || payload?.fixture?.status || payload?.status || {};
  return {
    fixture: {
      id: fixture?.id,
      referee: fixture?.referee,
      timezone: fixture?.timezone,
      date: fixture?.date,
      timestamp: fixture?.timestamp,
      periods: fixture?.periods,
      venue: fixture?.venue,
      status
    },
    league,
    teams,
    goals,
    score
  };
}
__name(normalizeFixture, "normalizeFixture");

async function apiFootballFetch(env, endpoint, qs = {}) {
  const key = env.APIFOOTBALL_KEY || env.API_FOOTBALL_KEY || env.API_FOOTBALL;
  if (!key) return null;

  const base = "https://v3.football.api-sports.io";
  const url = new URL(base + endpoint);
  for (const [k, v] of Object.entries(qs)) {
    if (v === void 0 || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": key
    }
  });

  if (!res.ok) throw new Error(`api-football ${res.status}`);
  const json = await res.json();
  return json;
}
__name(apiFootballFetch, "apiFootballFetch");

async function listBaseFiles(env) {
  const out = {};
  for (const file of BASE_FILES) {
    const data = await r2GetJson(env, `snapshots/${file}`);
    out[file] = data;
  }
  return out;
}
__name(listBaseFiles, "listBaseFiles");

async function handleApiV1(env, pathname) {
  await requireBindings(env);

  if (pathname === "/api/v1/health") {
    return ok({ ts: nowIso() });
  }

  if (pathname === "/api/v1/base") {
    const data = await listBaseFiles(env);
    return ok({ ts: nowIso(), data });
  }

  if (pathname === "/api/v1/live") {
    const live = await kvGetJson(env, "live");
    return ok({ ts: nowIso(), live: live || [] });
  }

  if (pathname === "/api/v1/live/state") {
    const state = await kvGetJson(env, "live_state");
    return ok({ ts: nowIso(), state: state || {} });
  }

  return null;
}
__name(handleApiV1, "handleApiV1");

async function cronUpdateLive(env) {
  await requireBindings(env);

  const state = await kvGetJson(env, "live_state") || {};
  const liveIds = state.liveIds || [];

  if (liveIds.length === 0) {
    await kvPutJson(env, "live", [], 120);
    return;
  }

  const fixtures = [];
  for (const id of liveIds) {
    const json = await apiFootballFetch(env, "/fixtures", { id });
    const item = json?.response?.[0];
    if (!item) continue;
    fixtures.push(normalizeFixture(item));
  }

  await kvPutJson(env, "live", fixtures, 120);
}
__name(cronUpdateLive, "cronUpdateLive");

async function cronFinalizeRecent(env) {
  await requireBindings(env);

  const state = await kvGetJson(env, "live_state") || {};
  const liveIds = state.liveIds || [];
  if (liveIds.length === 0) return;

  const stillLive = [];
  const finalized = [];

  for (const id of liveIds) {
    const json = await apiFootballFetch(env, "/fixtures", { id });
    const item = json?.response?.[0];
    if (!item) continue;

    const norm = normalizeFixture(item);
    const status = norm?.fixture?.status?.short;

    if (isVoidStatus(status) || isFinalStatus(status)) {
      finalized.push(norm);
    } else {
      stillLive.push(id);
    }
  }

  state.liveIds = stillLive;
  state.lastFinalizeAt = nowIso();
  await kvPutJson(env, "live_state", state);

  if (finalized.length > 0) {
    const key = `finalized/${Date.now()}.json`;
    await r2PutJson(env, `snapshots/${key}`, finalized);
  }
}
__name(cronFinalizeRecent, "cronFinalizeRecent");

var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/v1/")) {
      const res = await handleApiV1(env, pathname);
      if (res) return res;
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron || "";

    if (cron === "* * * * *") {
      ctx.waitUntil((async () => {
        try {
          await cronUpdateLive(env);
        } catch (e) {
          console.log("cronUpdateLive failed:", e?.message || String(e));
        }
      })());
      return;
    }

    if (cron === "*/10 * * * *") {
      ctx.waitUntil((async () => {
        try {
          await cronFinalizeRecent(env);
        } catch (e) {
          console.log("cronFinalizeRecent failed:", e?.message || String(e));
        }
      })());
      return;
    }
  }
};

export { index_default as default };
