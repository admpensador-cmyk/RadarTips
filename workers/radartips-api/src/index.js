// src/index.js

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const BASE_FILES = ["calendar_7d.json", "radar_day.json", "radar_week.json"];

const FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);
const VOID_STATUSES = new Set(["CANC", "PST", "ABD", "SUSP"]);

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function uniq(arr) {
  return [...new Set(arr)];
}

function getKV(env) {
  // Seu binding no painel está como RADARTIPS_LIVE
  return env.RADARTIPS_LIVE;
}

function getApiKey(env) {
  // Você tem 2 secrets listados: API_FOOTBALL_KEY e APIFOOTBALL_KEY
  return (env.API_FOOTBALL_KEY || env.APIFOOTBALL_KEY || "").toString().trim();
}

function v1Path(env, file) {
  const p = (env.V1_PREFIX || "v1").replace(/^\/+|\/+$/g, "");
  return `${p}/${file}`;
}

async function r2GetJson(env, file) {
  const obj = await env.R2.get(v1Path(env, file));
  if (!obj) return null;
  const txt = await obj.text();
  return safeJsonParse(txt);
}

async function r2GetRaw(env, file) {
  const obj = await env.R2.get(v1Path(env, file));
  if (!obj) return null;
  return obj;
}

function extractFixtureMetaFromCalendar(calendar) {
  const meta = {};
  const matches = calendar?.matches || [];
  for (const m of matches) {
    const id = m?.fixture_id ?? m?.id;
    if (!id) continue;
    meta[String(id)] = {
      kickoff_utc: m.kickoff_utc || null,
      country: m.country || null,
      competition: m.competition || null,
    };
  }
  return meta;
}

function extractFixtureIdsFromObj(obj) {
  const out = [];
  if (!obj) return out;

  const scan = (x) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(scan);

    const id = x.fixture_id ?? x.id;
    if (id) out.push(String(id));

    for (const k of Object.keys(x)) scan(x[k]);
  };

  scan(obj);
  return uniq(out);
}

async function getTracked(env) {
  const KV = getKV(env);
  if (!KV) throw new Error("KV binding missing: RADARTIPS_LIVE");

  const cached = safeJsonParse(await KV.get("tracked:v1"));
  const ts = Number(cached?.updated_at_ms || 0);
  const fresh = Date.now() - ts < 10 * 60 * 1000;
  if (cached && fresh) return cached;

  const [calendar, day, week] = await Promise.all([
    r2GetJson(env, "calendar_7d.json"),
    r2GetJson(env, "radar_day.json"),
    r2GetJson(env, "radar_week.json"),
  ]);

  const ids = uniq([
    ...extractFixtureIdsFromObj(calendar),
    ...extractFixtureIdsFromObj(day),
    ...extractFixtureIdsFromObj(week),
  ]);

  const meta = extractFixtureMetaFromCalendar(calendar);

  const built = {
    updated_at_ms: Date.now(),
    updated_at_utc: nowIso(),
    fixture_ids: ids,
    meta,
  };

  await KV.put("tracked:v1", JSON.stringify(built));
  return built;
}

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
    away_id: teams?.away?.id ?? null,
  };
}

async function fetchApiFootball(env, path, params) {
  const key = getApiKey(env);
  if (!key) throw new Error("API key missing (API_FOOTBALL_KEY / APIFOOTBALL_KEY)");

  const url = new URL(`https://v3.football.api-sports.io${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": key,
    },
  });

  if (!res.ok) throw new Error(`api-football ${res.status}`);
  return await res.json();
}

async function loadStateMap(env) {
  const KV = getKV(env);
  if (!KV) throw new Error("KV binding missing: RADARTIPS_LIVE");

  return (
    safeJsonParse(await KV.get("state:map")) || {
      updated_at_utc: null,
      updated_at_ms: null,
      states: {},
    }
  );
}

async function saveStateMap(env, map) {
  const KV = getKV(env);
  if (!KV) throw new Error("KV binding missing: RADARTIPS_LIVE");

  await KV.put("state:map", JSON.stringify(map));
}

async function cronUpdateLive(env) {
  const key = getApiKey(env);
  if (!key) return;

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

function parseUtc(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

async function cronFinalizeRecent(env) {
  const key = getApiKey(env);
  if (!key) return;

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

    // 110 min após kickoff até 30h: tenta “fechar” placar final sem martelar API toda hora
    if (now > k + 110 * 60 * 1000 && now < k + 30 * 60 * 60 * 1000) {
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
    } catch {
      // ignora erros pontuais
    }
  }

  map.updated_at_utc = nowIso();
  map.updated_at_ms = Date.now();
  await saveStateMap(env, map);
}

async function handleApiV1(env, pathname) {
  if (pathname === "/api/v1/live.json") {
    const map = await loadStateMap(env);
    const states = Object.values(map.states || {});
    return new Response(
      JSON.stringify({
        updated_at_utc: map.updated_at_utc || null,
        updated_at_ms: map.updated_at_ms || null,
        states,
      }),
      { headers: JSON_HEADERS }
    );
  }

  const m = pathname.match(/^\/api\/v1\/(.+\.json)$/);
  if (m) {
    const file = m[1];

    if (!BASE_FILES.includes(file)) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const obj = await r2GetRaw(env, file);
    if (!obj) {
      return new Response(JSON.stringify({ error: "missing_snapshot" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    return new Response(obj.body, { headers: JSON_HEADERS });
  }

  return null;
}

export default {
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

    // A cada minuto: atualiza estados ao vivo (só para fixtures que você está rastreando)
    if (cron === "* * * * *") {
      ctx.waitUntil(cronUpdateLive(env));
      return;
    }

    // A cada 10 min: tenta finalizar jogos recentes
    if (cron === "*/10 * * * *") {
      ctx.waitUntil(cronFinalizeRecent(env));
      return;
    }
  },
};
