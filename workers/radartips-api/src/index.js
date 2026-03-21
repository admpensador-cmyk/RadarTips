const SNAPSHOT_KEYS = ["snapshots/latest_calendar_2d.json", "snapshots/calendar_2d.json"];
const RADAR_DAY_KEYS = ["snapshots/latest_radar_day.json", "snapshots/radar_day.json"];
const ALLOWLIST_KEY = "data/coverage_allowlist.json";
const CACHE_MAX_AGE_SECONDS = 60;
const CACHE_STALE_WHILE_REVALIDATE_SECONDS = 120;
const HARD_STALE_HOURS = 24;

function workerVersion(env) {
  return String(env.WORKER_VERSION || "dev").trim() || "dev";
}

function json(env, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-radartips-worker-version": workerVersion(env),
      ...extraHeaders
    }
  });
}

function parseGeneratedAt(snapshot) {
  const raw = snapshot?.meta?.generated_at_utc || snapshot?.generated_at_utc;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function snapshotAgeHours(snapshot, nowMs = Date.now()) {
  const generatedMs = parseGeneratedAt(snapshot);
  if (!Number.isFinite(generatedMs)) return null;
  const ageMs = Math.max(0, nowMs - generatedMs);
  return Number((ageMs / 36e5).toFixed(3));
}

function pipelineStatusFromAge(ageHours, warnHours) {
  if (!Number.isFinite(ageHours)) return "critical";
  if (ageHours > HARD_STALE_HOURS) return "critical";
  if (ageHours >= warnHours) return "warning";
  return "healthy";
}

function evaluateSnapshot(snapshot, env, nowMs = Date.now()) {
  const warnHours = Number.parseFloat(env.SNAPSHOT_MAX_AGE || "12");
  const staleWarnHours = Number.isFinite(warnHours) && warnHours > 0 ? warnHours : 12;
  const ageHours = snapshotAgeHours(snapshot, nowMs);
  const hasToday = Array.isArray(snapshot?.today) && snapshot.today.length > 0;
  const hasTomorrow = Array.isArray(snapshot?.tomorrow);
  const pipelineStatus = pipelineStatusFromAge(ageHours, staleWarnHours);

  if (!Number.isFinite(ageHours)) {
    return {
      ok: false,
      httpStatus: 503,
      code: "calendar_not_generated",
      snapshot_age_hours: null,
      status: "CRITICAL",
      pipeline_status: "critical",
      stale_warn_hours: staleWarnHours
    };
  }

  if (!hasToday || !hasTomorrow) {
    return {
      ok: false,
      httpStatus: 503,
      code: "calendar_not_generated",
      snapshot_age_hours: ageHours,
      status: "CRITICAL",
      pipeline_status: pipelineStatus,
      stale_warn_hours: staleWarnHours
    };
  }

  if (ageHours > HARD_STALE_HOURS) {
    return {
      ok: false,
      httpStatus: 503,
      code: "stale_snapshot",
      snapshot_age_hours: ageHours,
      status: "CRITICAL",
      pipeline_status: "critical",
      stale_warn_hours: staleWarnHours
    };
  }

  return {
    ok: true,
    httpStatus: 200,
    code: ageHours >= staleWarnHours ? "stale" : "ok",
    snapshot_age_hours: ageHours,
    status: ageHours >= staleWarnHours ? "STALE" : "OK",
    pipeline_status: pipelineStatus,
    stale_warn_hours: staleWarnHours
  };
}

async function readCalendarSnapshot(env) {
  let parseErrorKey = null;
  let parseErrorRaw = null;
  const candidates = [];

  for (const key of SNAPSHOT_KEYS) {
    const obj = await env.RADARTIPS_DATA.get(key);
    if (!obj) continue;
    const raw = await obj.text();
    try {
      const snapshot = JSON.parse(raw);
      const generatedMs = parseGeneratedAt(snapshot);
      candidates.push({ snapshot, raw, key, generatedMs: Number.isFinite(generatedMs) ? generatedMs : -1 });
    } catch {
      if (!parseErrorKey) {
        parseErrorKey = key;
        parseErrorRaw = raw;
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.generatedMs - a.generatedMs);
    const freshest = candidates[0];
    return { snapshot: freshest.snapshot, raw: freshest.raw, key: freshest.key };
  }

  if (parseErrorKey) {
    return { snapshot: null, raw: parseErrorRaw, key: parseErrorKey, parse_error: true };
  }

  return { snapshot: null, raw: null, key: null };
}

async function readRadarDaySnapshot(env) {
  let parseErrorKey = null;
  let parseErrorRaw = null;
  const candidates = [];

  for (const key of RADAR_DAY_KEYS) {
    const obj = await env.RADARTIPS_DATA.get(key);
    if (!obj) continue;
    const raw = await obj.text();
    try {
      const snapshot = JSON.parse(raw);
      const generatedMs = parseGeneratedAt(snapshot);
      candidates.push({ snapshot, raw, key, generatedMs: Number.isFinite(generatedMs) ? generatedMs : -1 });
    } catch {
      if (!parseErrorKey) {
        parseErrorKey = key;
        parseErrorRaw = raw;
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.generatedMs - a.generatedMs);
    const freshest = candidates[0];
    return { snapshot: freshest.snapshot, raw: freshest.raw, key: freshest.key };
  }

  if (parseErrorKey) {
    return { snapshot: null, raw: parseErrorRaw, key: parseErrorKey, parse_error: true };
  }

  return { snapshot: null, raw: null, key: null };
}

function calendarPayload(snapshot, evaluation, sourceKey) {
  return {
    ...snapshot,
    calendar_status: evaluation.status,
    snapshot_age_hours: evaluation.snapshot_age_hours,
    pipeline_status: evaluation.pipeline_status,
    snapshot_source_key: sourceKey
  };
}

function extractLeagueIdFromCalendarMatch(match) {
  const raw = match?.league_id ?? match?.competition_id ?? null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function collectCalendarMatches(snapshot) {
  if (Array.isArray(snapshot?.matches)) return snapshot.matches;
  const out = [];
  if (Array.isArray(snapshot?.today)) out.push(...snapshot.today);
  if (Array.isArray(snapshot?.tomorrow)) out.push(...snapshot.tomorrow);
  return out;
}

function validateCalendarAllowlist(snapshot) {
  const allowlist = Array.isArray(snapshot?.meta?.allowlist_league_ids)
    ? snapshot.meta.allowlist_league_ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
    : [];
  if (!allowlist.length) {
    return {
      ok: false,
      code: "missing_allowlist_metadata",
      leakedLeagueIds: []
    };
  }

  const allowSet = new Set(allowlist);
  const leaked = new Set();
  const matches = collectCalendarMatches(snapshot);

  for (const m of matches) {
    const leagueId = extractLeagueIdFromCalendarMatch(m);
    if (!Number.isFinite(leagueId)) continue;
    if (!allowSet.has(leagueId)) leaked.add(leagueId);
  }

  if (leaked.size > 0) {
    return {
      ok: false,
      code: "out_of_allowlist_competitions",
      leakedLeagueIds: Array.from(leaked).sort((a, b) => a - b)
    };
  }

  return { ok: true, code: "ok", leakedLeagueIds: [] };
}

function calendarCacheKey(request) {
  const u = new URL(request.url);
  u.pathname = "/api/v1/calendar_2d";
  u.search = "";
  return new Request(u.toString(), { method: "GET" });
}

function cacheAgeSeconds(resp, nowMs = Date.now()) {
  const storedAt = Number(resp.headers.get("x-radartips-cache-stored-at") || "0");
  if (!Number.isFinite(storedAt) || storedAt <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - storedAt) / 1000);
}

async function dispatchGeneration(env, ctx) {
  const repo = env.GITHUB_REPOSITORY;
  const workflowFile = env.GITHUB_WORKFLOW_FILE || "radartips_update_data_api_football.yml";
  const ref = env.GITHUB_WORKFLOW_REF || "main";
  const token = env.GITHUB_TOKEN;

  if (!repo || !token) {
    return { dispatched: false, reason: "missing_github_config" };
  }

  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`;
  const body = JSON.stringify({ ref });

  const p = fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "radartips-worker-cron"
    },
    body
  }).then(async (res) => {
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`workflow_dispatch_failed status=${res.status} body=${txt}`);
    }
  });

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(p);
  } else {
    await p;
  }

  return { dispatched: true, reason: "workflow_dispatch" };
}

async function refreshSnapshotIfStale(env, ctx) {
  const { snapshot, key } = await readCalendarSnapshot(env);
  if (!snapshot) {
    const dispatch = await dispatchGeneration(env, ctx);
    return {
      refreshed: false,
      reason: "snapshot_not_found",
      snapshot_source_key: key,
      ...dispatch
    };
  }

  const evaluation = evaluateSnapshot(snapshot, env, Date.now());
  if (evaluation.code === "ok") {
    return {
      refreshed: false,
      reason: "fresh_snapshot",
      snapshot_age_hours: evaluation.snapshot_age_hours,
      snapshot_source_key: key,
      pipeline_status: evaluation.pipeline_status,
      status: evaluation.status
    };
  }

  const dispatch = await dispatchGeneration(env, ctx);
  return {
    refreshed: false,
    reason: evaluation.code,
    snapshot_age_hours: evaluation.snapshot_age_hours,
    snapshot_source_key: key,
    pipeline_status: evaluation.pipeline_status,
    status: evaluation.status,
    ...dispatch
  };
}

async function buildCalendarResponse(env) {
  const { snapshot, key, parse_error } = await readCalendarSnapshot(env);
  if (!snapshot) {
    const code = parse_error ? "snapshot_invalid_json" : "snapshot_not_found";
    const status = parse_error ? 500 : 404;
    return {
      status,
      body: {
        error: code,
        key,
        pipeline_status: "critical"
      },
      cacheable: false
    };
  }

  const allowlistValidation = validateCalendarAllowlist(snapshot);
  if (!allowlistValidation.ok) {
    return {
      status: 503,
      body: {
        error: allowlistValidation.code,
        leaked_league_ids: allowlistValidation.leakedLeagueIds,
        key,
        pipeline_status: "critical"
      },
      cacheable: false
    };
  }

  const evaluation = evaluateSnapshot(snapshot, env, Date.now());
  if (!evaluation.ok) {
    return {
      status: evaluation.httpStatus,
      body: {
        error: evaluation.code,
        snapshot_date: snapshot?.meta?.generated_at_utc || null,
        snapshot_age_hours: evaluation.snapshot_age_hours,
        calendar_status: evaluation.status,
        pipeline_status: evaluation.pipeline_status,
        key,
        stale_warn_hours: evaluation.stale_warn_hours
      },
      cacheable: false
    };
  }

  return {
    status: 200,
    body: calendarPayload(snapshot, evaluation, key),
    cacheable: true
  };
}

async function serveRadarDay(env) {
  const { snapshot, key, parse_error } = await readRadarDaySnapshot(env);
  if (!snapshot) {
    const code = parse_error ? "snapshot_invalid_json" : "snapshot_not_found";
    const status = parse_error ? 500 : 404;
    return json(env, { error: code, key, pipeline_status: "critical" }, status);
  }

  return json(env, {
    ...snapshot,
    snapshot_source_key: key,
    pipeline_status: "healthy"
  }, 200, {
    "cache-control": `public, max-age=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_SECONDS}`
  });
}

async function serveCalendar(request, env, ctx) {
  const cache = caches.default;
  const key = calendarCacheKey(request);
  const nowMs = Date.now();

  const cached = await cache.match(key);
  if (cached) {
    const age = cacheAgeSeconds(cached, nowMs);
    if (age <= CACHE_MAX_AGE_SECONDS + CACHE_STALE_WHILE_REVALIDATE_SECONDS) {
      const out = new Response(cached.body, cached);
      out.headers.set("x-radartips-cache", age <= CACHE_MAX_AGE_SECONDS ? "HIT" : "STALE");
      out.headers.set("x-radartips-cache-age-seconds", String(Math.floor(age)));
      out.headers.set("x-radartips-worker-version", workerVersion(env));

      if (age > CACHE_MAX_AGE_SECONDS) {
        ctx.waitUntil(revalidateCalendarCache(key, env));
      }
      return out;
    }
  }

  const built = await buildCalendarResponse(env);
  const response = json(env, built.body, built.status, {
    "x-radartips-cache": "MISS"
  });

  if (built.cacheable) {
    response.headers.set(
      "cache-control",
      `public, max-age=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_SECONDS}`
    );
    response.headers.set("x-radartips-cache-stored-at", String(nowMs));
    ctx.waitUntil(cache.put(key, response.clone()));
  }

  return response;
}

async function serveAllowlist(env) {
  const obj = await env.RADARTIPS_DATA.get(ALLOWLIST_KEY);
  if (!obj) {
    return json(env, { error: "allowlist_not_found", key: ALLOWLIST_KEY }, 404);
  }
  const raw = await obj.text();
  return new Response(raw, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=300, stale-while-revalidate=600`,
      "x-radartips-worker-version": workerVersion(env)
    }
  });
}

async function revalidateCalendarCache(key, env) {
  const built = await buildCalendarResponse(env);
  if (!built.cacheable) return;
  const response = json(env, built.body, 200, {
    "cache-control": `public, max-age=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_SECONDS}`,
    "x-radartips-cache": "REVALIDATED",
    "x-radartips-cache-stored-at": String(Date.now())
  });
  await caches.default.put(key, response);
}

async function healthPayload(env) {
  const { snapshot, key, parse_error } = await readCalendarSnapshot(env);
  if (!snapshot) {
    return {
      httpStatus: parse_error ? 500 : 404,
      body: {
        status: "CRITICAL",
        pipeline_status: "critical",
        snapshot_date: null,
        snapshot_age_hours: null,
        error: parse_error ? "snapshot_invalid_json" : "snapshot_not_found",
        snapshot_source_key: key
      }
    };
  }

  const evaluation = evaluateSnapshot(snapshot, env, Date.now());
  return {
    httpStatus: evaluation.httpStatus,
    body: {
      status: evaluation.status,
      pipeline_status: evaluation.pipeline_status,
      snapshot_date: snapshot?.meta?.generated_at_utc || null,
      snapshot_age_hours: evaluation.snapshot_age_hours,
      stale_warn_hours: evaluation.stale_warn_hours,
      stale_hard_hours: HARD_STALE_HOURS,
      snapshot_source_key: key,
      error: evaluation.ok ? null : evaluation.code
    }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/v1/calendar_7d" || p === "/api/v1/calendar_7d.json") {
      return json(env, {
        error: "endpoint_removed",
        migration: "/api/v1/calendar_2d"
      }, 410);
    }

    if (p === "/api/v1/calendar_2d" || p === "/api/v1/calendar_2d.json") {
      return serveCalendar(request, env, ctx);
    }

    if (p === "/api/v1/radar_day" || p === "/api/v1/radar_day.json") {
      return serveRadarDay(env);
    }

    if (p === "/api/v1/calendar_health" || p === "/api/v1/health") {
      const health = await healthPayload(env);
      return json(env, health.body, health.httpStatus);
    }

    if (p === "/api/v1/version") {
      return json(env, {
        worker_version: workerVersion(env),
        cache_max_age_seconds: CACHE_MAX_AGE_SECONDS,
        cache_swr_seconds: CACHE_STALE_WHILE_REVALIDATE_SECONDS,
        stale_hard_hours: HARD_STALE_HOURS
      }, 200);
    }

    if (p === "/api/v1/debug") {
      const health = await healthPayload(env);
      return json(env, {
        ...health.body,
        snapshot_keys: SNAPSHOT_KEYS,
        cache_policy: {
          max_age_seconds: CACHE_MAX_AGE_SECONDS,
          stale_while_revalidate_seconds: CACHE_STALE_WHILE_REVALIDATE_SECONDS
        }
      }, health.httpStatus);
    }

    if (p === "/api/v1/cron_refresh") {
      const result = await refreshSnapshotIfStale(env, ctx);
      return json(env, result, 200);
    }

    if (p === "/data/coverage_allowlist.json") {
      return serveAllowlist(env);
    }

    return json(env, { error: "not_found", path: p }, 404);
  },

  async scheduled(controller, env, ctx) {
    await refreshSnapshotIfStale(env, ctx);
  }
};
