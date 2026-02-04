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

// Files are stored in R2 under: v1/<file>
function r2KeyV1(file) {
  return `v1/${file}`;
}
__name(r2KeyV1, "r2KeyV1");

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

function rawJsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}
__name(rawJsonResponse, "rawJsonResponse");

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

async function listBaseFiles(env) {
  const out = {};
  for (const file of BASE_FILES) {
    out[file] = await r2GetJson(env, r2KeyV1(file));
  }
  return out;
}
__name(listBaseFiles, "listBaseFiles");

async function serveSnapshotFile(env, file) {
  const json = await r2GetJson(env, r2KeyV1(file));
  if (!json) return null;
  // IMPORTANT: front expects the raw JSON (not wrapped in {ok:true,...})
  return rawJsonResponse(json);
}
__name(serveSnapshotFile, "serveSnapshotFile");

async function handleApiV1(env, pathname) {
  await requireBindings(env);

  // Snapshots (R2)
  // - /api/v1/calendar_7d.json
  // - /api/v1/radar_day.json
  // - /api/v1/radar_week.json
  if (pathname === "/v1/calendar_7d.json") {
    return await serveSnapshotFile(env, "calendar_7d.json");
  }
  if (pathname === "/v1/radar_day.json") {
    return await serveSnapshotFile(env, "radar_day.json");
  }
  if (pathname === "/v1/radar_week.json") {
    return await serveSnapshotFile(env, "radar_week.json");
  }

  if (pathname === "/v1/health") {
    return ok({ ts: nowIso() });
  }

  if (pathname === "/v1/base") {
    return ok({ ts: nowIso(), data: await listBaseFiles(env) });
  }

  // Live states (KV)
  // Front expects: { states: [...] }
  if (pathname === "/v1/live.json") {
    const states = await kvGetJson(env, "live_states");
    return rawJsonResponse({ states: Array.isArray(states) ? states : [] });
  }

  return null;
}
__name(handleApiV1, "handleApiV1");

// Cron: prepara base do LIVE (a gente vai evoluir isso na próxima fase)
async function cronUpdateLive(env) {
  await requireBindings(env);

  // Estrutura de estado (a gente melhora depois)
  const state = await kvGetJson(env, "live_state") || {};
  const liveIds = state.liveIds || [];

  if (liveIds.length === 0) {
    await kvPutJson(env, "live_states", [], 120);
    return;
  }

  const states = [];
  for (const id of liveIds) {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${id}`, {
      headers: { "x-apisports-key": env.APIFOOTBALL_KEY }
    });
    if (!res.ok) continue;

    const json = await res.json();
    const fx = json?.response?.[0];
    if (!fx) continue;

    const fixture_id = fx?.fixture?.id ?? id;
    const status_short = fx?.fixture?.status?.short ?? null;
    const elapsed = fx?.fixture?.status?.elapsed ?? null;
    const goals_home = fx?.goals?.home ?? null;
    const goals_away = fx?.goals?.away ?? null;

    states.push({ fixture_id, status_short, elapsed, goals_home, goals_away });
  }

  await kvPutJson(env, "live_states", states, 120);
}
__name(cronUpdateLive, "cronUpdateLive");

var index_default = {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;

    // Support both:
    // - workers.dev direct: /v1/...
    // - routed under the site: /api/v1/...
    const v1Path = pathname.startsWith("/api/v1/") ? pathname.replace(/^\/api/, "") : pathname;

    if (v1Path.startsWith("/v1/")) {
      const res = await handleApiV1(env, v1Path);
      if (res) return res;
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      cronUpdateLive(env).catch(e => console.log("cron error:", e.message))
    );
  }
};

export { index_default as default };
