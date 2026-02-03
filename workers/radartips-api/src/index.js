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
var VOID_STATUSES  = /* @__PURE__ */ new Set(["CANC", "PST", "ABD", "SUSP"]);

function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
__name(safeJsonParse, "safeJsonParse");

function uniq(arr) {
  return [...new Set(arr)];
}
__name(uniq, "uniq");

// ✅ IMPORTANTÍSSIMO: pega KV mesmo que o binding se chame RADARTIPS_LIVE
function kv(env) {
  return env.KV || env.RADARTIPS_LIVE;
}
__name(kv, "kv");

function v1Path(env, file) {
  const p = (env.V1_PREFIX || "v1").replace(/^\/+|\/+$/g, "");
  return `${p}/${file}`;
}
__name(v1Path, "v1Path");

async function r2GetJson(env, file) {
  const obj = await env.R2.get(v1Path(env, file));
  if (!obj) return null;
  const txt = await obj.text();
  return safeJsonParse(txt);
}
__name(r2GetJson, "r2GetJson");

async function r2GetRaw(env, file) {
  const obj = await env.R2.get(v1Path(env, file));
  if (!obj) return null;
  return obj;
}
__name(r2GetRaw, "r2GetRaw");

function extractFixtureMetaFromCalendar(calendar) {
  const meta = {};
  const matches = calendar?.matches || [];
  for (const m of matches) {
    const id = m?.fixture_id ?? m?.id;
    if (!id) continue;
    meta[String(id)] = {
      kickoff_utc: m.kickoff_utc || null,
      country: m.country || null,
      competition: m.competition || null
    };
  }
  return meta;
}
__name(extractFixtureMetaFromCalendar, "extractFixtureMetaFromCalendar");

function extractFixtureIdsFromObj(obj) {
  const out = [];
  if (!obj) return out;
  const scan = /* @__PURE__ */ __name((x) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(scan);
    const id = x.fixture_id ?? x.id;
    if (id) out.push(String(id));
    for (const k2 of Object.keys(x)) scan(x[k2]);
  }, "scan");
  scan(obj);
  return uniq(out);
}
__name(extractFixtureIdsFromObj, "extractFixtureIdsFromObj");

async function getTracked(env) {
  const KV = kv(env);
  if (!KV) throw new Error("KV binding missing (expected KV or RADARTIPS_LIVE)");

  const cached = safeJsonParse(await KV.get("tracked:v1"));
  const ts = Number(cached?.updated_at_ms || 0);
  const fresh = Date.now() - ts < 10 * 60 * 1e3;
  if (cached && fresh) return cached;

  const [calendar, day, week] = await Promise.all([
    r2GetJson(env, "calendar_7d.json"),
    r2GetJson(env, "radar_day.json"),
    r2GetJson(env, "radar_week.json")
  ]);

  const ids = uniq([
    ...extractFixtureIdsFromObj(calendar),
    ...extractFixtureIdsFromObj(day),
    ...extractFixtureIdsFromObj(week)
  ]);

  const meta = extractFixtureMetaFromCalendar(calendar);

  const built = {
    updated_at_ms: Date.now(),
    updated_at_utc: nowIso(),
    fixture_ids: ids,
    meta
  };

  await KV.put("tracked:v1", JSON.stringify(built));
  return built;
}
__name(getTracked, "getTracked");

function normalizeLiveState(item) {
  const fx = item?.fixture || {};
  const teams = item?.teams || {};
  const goals = item?.goals || {};
  const status = fx?.status || {};
  return {
    fixture_id: fx?.id ?? null,
    status_short: status?.short ?? null,
    status_long: status?.long ?? null,
    elapsed: status?.elapsed ?? null,
    kickoff_utc: fx?.date ?? null,
    goals_home: goals?.home ?? null,
    goals_away: goals?.away ?? null,
    updated_at_utc: nowIso(),
    home_id: teams?.home?.id ?? null,
    away_id: teams?.away?.id ?? null
  };
}
__name(normalizeLiveState, "normalizeLiveState");

async function fetchApiFootball(env, path, params) {
  const url = new URL(`https://v3.football.api-sports.io${path}`);
  for (const [k2, v] of Object.entries(params || {})) {
    if (v === void 0 || v === null || v === "") continue;
    url.searchParams.set(k2, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": env.API_FOOTBALL_KEY }
  });
  if (!res.ok) throw new Error(`api-football ${res.status}`);
  return await res.json();
}
__name(fetchApiFootball, "fetchApiFootball");

async function loadStateMap(env) {
  const KV = kv(env);
  if (!KV) throw new Error("KV binding missing (expected KV or RADARTIPS_LIVE)");
  return safeJsonParse(await KV.get("state:map")) || { updated_at_utc: null, states: {} };
}
__name(loadStateMap, "loadStateMap");

async function saveStateMap(env, map) {
  const KV = kv(env);
  if (!KV) throw new Error("KV binding missing (expected KV or RADARTIPS_LIVE)");
  await KV.put("state:map", JSON.stringify(map));
}
__name(saveStateMap, "saveStateMap");

async function cronUpdateLive(env) {
  if (!env.API_FOOTBALL_KEY || !String(env.API_FOOTBALL_KEY).trim()) return;
  const tracked = await getTracked(env);
  const trackedSet = new Set(tracked.fixture_ids || []);
  if (trackedSet.size === 0) return;

  const json = await fetchApiFootball(env, "/fixtures", { live: "all" });
  const resp = json?.response || [];
  const updates = {};

  for (const it of resp) {
    const st = normalizeLiveState(it);
    if (!st.fixture_id) continue;
    const id = String(st.fixture_id);
    if (!trackedSet.has(id)) continue;
    updates[id] = st;
  }

  const map = await loadStateMap(env);
  map.updated_at_utc = nowIso();
  map.updated_at_ms = Date.now();
  map.states = map.states || {};

  for (const [id, st] of Object.entries(updates)) {
    map.states[id] = st;
  }
  await saveStateMap(env, map);
}
__name(cronUpdateLive, "cronUpdateLive");

function parseUtc(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
__name(parseUtc, "parseUtc");

async function cronFinalizeRecent(env) {
  if (!env.API_FOOTBALL_KEY || !String(env.API_FOOTBALL_KEY).trim()) return;

  const tracked = await getTracked(env);
  const meta = tracked.meta || {};
  const map = await loadStateMap(env);
  map.states = map.states || {};

  const now = Date.now();
  const candidates = [];

  for (const id of tracked.fixture_ids || []) {
    const m = meta[id];
    const k = parseUtc(m?.kickoff_utc);
    if (!k) continue;

    const st = map.states[id];
    const short = String(st?.status_short || "").toUpperCase();
    if (FINAL_STATUSES.has(short) || VOID_STATUSES.has(short)) continue;

    if (now > k + 110 * 60 * 1e3 && now < k + 30 * 60 * 60 * 1e3) {
      candidates.push(id);
    }
  }

  const batch = candidates.slice(0, 25);
  if (batch.length === 0) return;

  for (const id of batch) {
    try {
      const json = await fetchApiFootball(env, "/fixtures", { id });
      const it = json?.response?.[0];
      if (!it) continue;

      const st = normalizeLiveState(it);
      const short = String(st.status_short || "").toUpperCase();
      if (FINAL_STATUSES.has(short) || VOID_STATUSES.has(short)) {
        map.states[String(st.fixture_id)] = st;
      }
    } catch {}
  }

  map.updated_at_utc = nowIso();
  map.updated_at_ms = Date.now();
  await saveStateMap(env, map);
}
__name(cronFinalizeRecent, "cronFinalizeRecent");

async function handleApiV1(env, pathname) {
  if (pathname === "/api/v1/live.json") {
    const map = await loadStateMap(env);
    const states = Object.values(map.states || {});
    return new Response(JSON.stringify({
      updated_at_utc: map.updated_at_utc || null,
      updated_at_ms: map.updated_at_ms || null,
      states
    }), { headers: JSON_HEADERS });
  }

  const m = pathname.match(/^\/api\/v1\/(.+\.json)$/);
  if (m) {
    const file = m[1];
    if (!BASE_FILES.includes(file)) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: JSON_HEADERS });
    }
    const obj = await r2GetRaw(env, file);
    if (!obj) return new Response(JSON.stringify({ error: "missing_snapshot" }), { status: 404, headers: JSON_HEADERS });
    return new Response(obj.body, { headers: JSON_HEADERS });
  }

  return null;
}
__name(handleApiV1, "handleApiV1");

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
    ctx.waitUntil(cronUpdateLive(env));
    return;
  }
  if (cron === "*/10 * * * *") {
    ctx.waitUntil(cronFinalizeRecent(env));
    return;
  }
}
};

export { index_default as default };
