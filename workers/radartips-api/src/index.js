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

  if (pathname === "/v1/live") {
    return ok({ ts: nowIso(), live: await kvGetJson(env, "live") || [] });
  }

  if (pathname === "/v1/live/state") {
    return ok({ ts: nowIso(), state: await kvGetJson(env, "live_state") || {} });
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
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${id}`, {
      headers: { "x-apisports-key": env.APIFOOTBALL_KEY }
    });
    if (!res.ok) continue;
    const json = await res.json();
    if (json?.response?.[0]) fixtures.push(json.response[0]);
  }

  await kvPutJson(env, "live", fixtures, 120);
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
    const pathname = new URL(request.url).pathname;

    if (pathname.startsWith("/v1/")) {
      const res = await handleApiV1(env, pathname);
      if (res) return res;
    }

    return new Response("Not found", { status: 404 });
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
