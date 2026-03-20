#!/usr/bin/env node
/**
 * RadarTips - Update data via API-FOOTBALL (API-SPORTS)
 *
 * Generates:
 *  - data/v1/calendar_2d.json
 *  - data/v1/radar_day.json
 *  - data/v1/radar_week.json (placeholder, safe)
 *
 * Keeps: form/gols enrichment.
 * Fixes:
 *  - API errors can come in JSON even with HTTP 200 (handled by api-football-client.mjs).
 *  - /leagues endpoint DOES NOT allow mixing `search` with `country/type/current`.
 *    So we call /leagues?search=... ONLY, then filter locally by country/type.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ApiFootballClient } from "./api-football-client.mjs";

const OUT_DIR = path.join(process.cwd(), "data", "v1");
const OUT_CAL_DAY = path.join(OUT_DIR, "calendar_day.json");
const OUT_CAL_2D = path.join(OUT_DIR, "calendar_2d.json");
const OUT_RADAR_DAY = path.join(OUT_DIR, "radar_day.json");
const OUT_RADAR_WEEK = path.join(OUT_DIR, "radar_week.json");
const OUT_STATS_SUPPORTED = path.join(OUT_DIR, "stats_supported.json");
const OUT_COVERAGE_REPORT = path.join(OUT_DIR, "calendar_coverage_report.json");

const CONFIG_PATH = path.join(process.cwd(), "tools", "api-football.config.json");
const COVERAGE_ALLOWLIST_PATH = path.join(process.cwd(), "data", "coverage_allowlist.json");

const KEY =
  (process.env.APIFOOTBALL_KEY && String(process.env.APIFOOTBALL_KEY).trim()) ||
  (process.env.API_FOOTBALL_KEY && String(process.env.API_FOOTBALL_KEY).trim()) ||
  "";

const MIN_INTERVAL_MS = Number.parseInt(process.env.APIFOOTBALL_MIN_INTERVAL_MS || "6500", 10);

if (!KEY) {
  console.error("Missing API key. Set APIFOOTBALL_KEY (or API_FOOTBALL_KEY).");
  process.exit(1);
}

const api = new ApiFootballClient({
  apiKey: KEY,
  minIntervalMs: Number.isFinite(MIN_INTERVAL_MS) && MIN_INTERVAL_MS > 0 ? MIN_INTERVAL_MS : 6500,
  retries: 2
});

const REQUEST_METRICS = {
  totalRequests: 0,
  categories: {
    fixtures: 0,
    teamLast5: 0,
    fixtureStats: 0,
    others: 0
  },
  endpoints: new Map(),
  cache: {
    teamLast5: { hits: 0, misses: 0, avoided: 0 },
    fixtureStats: { hits: 0, misses: 0, avoided: 0 }
  }
};

function bumpEndpoint(pathKey) {
  const prev = REQUEST_METRICS.endpoints.get(pathKey) || 0;
  REQUEST_METRICS.endpoints.set(pathKey, prev + 1);
}

async function trackedApiGet(pathKey, params = {}, category = "others") {
  REQUEST_METRICS.totalRequests += 1;
  if (category === "fixtures") REQUEST_METRICS.categories.fixtures += 1;
  else if (category === "teamLast5") REQUEST_METRICS.categories.teamLast5 += 1;
  else if (category === "fixtureStats") REQUEST_METRICS.categories.fixtureStats += 1;
  else REQUEST_METRICS.categories.others += 1;
  bumpEndpoint(pathKey);
  return api.get(pathKey, params);
}

function printRequestMetricsSummary() {
  const sortedEndpoints = Array.from(REQUEST_METRICS.endpoints.entries())
    .sort((a, b) => b[1] - a[1]);

  const cacheHits = REQUEST_METRICS.cache.teamLast5.hits + REQUEST_METRICS.cache.fixtureStats.hits;
  const cacheMisses = REQUEST_METRICS.cache.teamLast5.misses + REQUEST_METRICS.cache.fixtureStats.misses;
  const avoidedByCache = REQUEST_METRICS.cache.teamLast5.avoided + REQUEST_METRICS.cache.fixtureStats.avoided;

  console.log("\n[REQ-SUMMARY] API request usage");
  console.log(`[REQ-SUMMARY] TOTAL_REQUESTS=${REQUEST_METRICS.totalRequests}`);
  console.log(
    `[REQ-SUMMARY] categories fixtures=${REQUEST_METRICS.categories.fixtures} team_last5=${REQUEST_METRICS.categories.teamLast5} fixture_stats=${REQUEST_METRICS.categories.fixtureStats} others=${REQUEST_METRICS.categories.others}`
  );

  if (sortedEndpoints.length > 0) {
    for (const [endpoint, count] of sortedEndpoints) {
      console.log(`[REQ-SUMMARY] endpoint ${endpoint}=${count}`);
    }
  }

  console.log(
    `[REQ-SUMMARY] cache hit=${cacheHits} miss=${cacheMisses} avoided=${avoidedByCache}`
  );
  console.log(
    `[REQ-SUMMARY] cache.team_last5 hit=${REQUEST_METRICS.cache.teamLast5.hits} miss=${REQUEST_METRICS.cache.teamLast5.misses} avoided=${REQUEST_METRICS.cache.teamLast5.avoided}`
  );
  console.log(
    `[REQ-SUMMARY] cache.fixture_stats hit=${REQUEST_METRICS.cache.fixtureStats.hits} miss=${REQUEST_METRICS.cache.fixtureStats.misses} avoided=${REQUEST_METRICS.cache.fixtureStats.avoided}`
  );
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJsonAtomic(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function nowIso() {
  return new Date().toISOString();
}

function startOfDayUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addDaysUtc(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isoDateOnlyUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function isoDateOnlyInTimezone(date, timezone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function nowInTimezone(timezone) {
  return new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
}

function addDaysToIsoDate(isoDate, days) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoDateOnlyUTC(dt);
}

function isValidIsoDate(ymd) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""));
}

function resolveBaseDateInTimezone(timezone) {
  const override = String(process.env.CAL_BASE_DATE || "").trim();
  if (override) {
    if (!isValidIsoDate(override)) {
      throw new Error(`[CALENDAR] Invalid CAL_BASE_DATE value: ${override}. Expected YYYY-MM-DD.`);
    }
    return override;
  }

  try {
    return isoDateOnlyInTimezone(new Date(), timezone);
  } catch (err) {
    throw new Error(`[CALENDAR] Failed resolving base date for timezone=${timezone}: ${err?.message || err}`);
  }
}

function toIso(dt) {
  if (!dt) return null;
  const t = Date.parse(dt);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config file: ${CONFIG_PATH}`);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const cfg = JSON.parse(raw);
  return cfg;
}

function readCoverageAllowlist() {
  if (!fs.existsSync(COVERAGE_ALLOWLIST_PATH)) {
    throw new Error(`Missing coverage allowlist file: ${COVERAGE_ALLOWLIST_PATH}`);
  }
  const raw = fs.readFileSync(COVERAGE_ALLOWLIST_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  const leagues = Array.isArray(parsed?.leagues) ? parsed.leagues : [];
  if (!leagues.length) {
    throw new Error("Invalid coverage allowlist: 'leagues' must be a non-empty array.");
  }
  const cleaned = leagues
    .map((entry) => ({
      league_id: Number(entry?.league_id),
      country: String(entry?.country || ""),
      display_name: String(entry?.display_name || ""),
      type: String(entry?.type || "")
    }))
    .filter((entry) => Number.isFinite(entry.league_id));
  if (!cleaned.length) {
    throw new Error("Coverage allowlist has no valid numeric league_id entries.");
  }
  return cleaned;
}

function extractLeagueIdFromMatch(match) {
  const raw = match?.league_id ?? match?.competition_id ?? null;
  const leagueId = Number(raw);
  return Number.isFinite(leagueId) ? leagueId : null;
}

function splitCalendar2dByUtcDate(matches, baseDateUtc) {
  const today = baseDateUtc;
  const tomorrow = addDaysToIsoDate(baseDateUtc, 1);

  const dayMatches = [];
  const todayMatches = [];
  const tomorrowMatches = [];

  for (const m of Array.isArray(matches) ? matches : []) {
    const kickoffUtc = String(m?.kickoff_utc || "");
    const dayKey = isValidIsoDate(kickoffUtc.slice(0, 10)) ? kickoffUtc.slice(0, 10) : null;
    if (!dayKey) continue;
    if (dayKey === today) {
      todayMatches.push(m);
      dayMatches.push(m);
    } else if (dayKey === tomorrow) {
      tomorrowMatches.push(m);
      dayMatches.push(m);
    }
  }

  return { today, tomorrow, dayMatches, todayMatches, tomorrowMatches };
}

function makeCoverageReport(expectedLeagueIds, collectedFixtures, finalMatches) {
  const expected = new Set((Array.isArray(expectedLeagueIds) ? expectedLeagueIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id)));

  const collectedByLeague = new Map();
  for (const fx of Array.isArray(collectedFixtures) ? collectedFixtures : []) {
    const id = Number(fx?.league?.id);
    if (!Number.isFinite(id)) continue;
    collectedByLeague.set(id, (collectedByLeague.get(id) || 0) + 1);
  }

  const finalByLeague = new Map();
  for (const m of Array.isArray(finalMatches) ? finalMatches : []) {
    const id = extractLeagueIdFromMatch(m);
    if (!Number.isFinite(id)) continue;
    finalByLeague.set(id, (finalByLeague.get(id) || 0) + 1);
  }

  const vanished = [];
  for (const [leagueId, collectedCount] of collectedByLeague.entries()) {
    const finalCount = finalByLeague.get(leagueId) || 0;
    if (collectedCount > 0 && finalCount === 0) {
      vanished.push({ league_id: leagueId, collected_count: collectedCount, final_count: finalCount });
    }
  }

  const leaked = [];
  for (const [leagueId, finalCount] of finalByLeague.entries()) {
    if (!expected.has(leagueId)) {
      leaked.push({ league_id: leagueId, final_count: finalCount });
    }
  }

  vanished.sort((a, b) => a.league_id - b.league_id);
  leaked.sort((a, b) => a.league_id - b.league_id);

  return {
    summary: {
      expected_leagues: expected.size,
      collected_fixtures: Array.isArray(collectedFixtures) ? collectedFixtures.length : 0,
      final_matches: Array.isArray(finalMatches) ? finalMatches.length : 0,
      vanished_leagues: vanished.length,
      leaked_leagues: leaked.length
    },
    vanished,
    leaked
  };
}

function assertCoverageReportClean(report) {
  const vanished = Array.isArray(report?.vanished) ? report.vanished : [];
  const leaked = Array.isArray(report?.leaked) ? report.leaked : [];
  if (vanished.length || leaked.length) {
    throw new Error(
      `[FAIL-CLOSED] calendar coverage gate failed: vanished=${vanished.length} leaked=${leaked.length} ` +
      `vanished_sample=${JSON.stringify(vanished.slice(0, 10))} leaked_sample=${JSON.stringify(leaked.slice(0, 10))}`
    );
  }
}

function assertCalendarMatchesWithinAllowlist(matches, allowlistLeagueIds, contextLabel) {
  const invalidLeagueIds = new Set();
  const invalidFixtures = [];

  for (const match of Array.isArray(matches) ? matches : []) {
    const leagueId = extractLeagueIdFromMatch(match);
    if (!Number.isFinite(leagueId)) continue;
    if (!allowlistLeagueIds.has(leagueId)) {
      invalidLeagueIds.add(leagueId);
      if (invalidFixtures.length < 5) {
        invalidFixtures.push({
          fixture_id: match?.fixture_id ?? null,
          league_id: leagueId,
          competition: match?.competition ?? null,
          country: match?.country ?? null,
          kickoff_utc: match?.kickoff_utc ?? null
        });
      }
    }
  }

  if (invalidLeagueIds.size > 0) {
    throw new Error(
      `[FAIL-CLOSED] ${contextLabel}: found ${invalidLeagueIds.size} out-of-allowlist league_id values. ` +
      `league_ids=${JSON.stringify(Array.from(invalidLeagueIds).sort((a, b) => a - b))} ` +
      `sample_fixtures=${JSON.stringify(invalidFixtures)}`
    );
  }
}

function norm(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pickSeasonFromLeagueResponse(r) {
  const seasons = Array.isArray(r?.seasons) ? r.seasons : [];
  const current = seasons.find((s) => s?.current === true);
  if (current?.year) return Number(current.year);
  const years = seasons.map((s) => Number(s?.year)).filter((n) => Number.isFinite(n));
  if (years.length) return Math.max(...years);
  return null;
}

async function smokeTestStatus() {
  const js = await trackedApiGet("/status", {}, "others");
  const payload = js?.response ?? js;
  console.log("[OK] /status response (summary):", JSON.stringify(payload).slice(0, 300));
}

/**
 * Resolve a league by name/country/type.
 * IMPORTANT: API rule - if using `search`, you cannot combine with country/type/current.
 * So we call /leagues?search=... only, then filter locally.
 */
async function resolveLeague(entry) {
  const search = String(entry?.search || "").trim();
  const country = String(entry?.country || "").trim();
  const type = String(entry?.type || "").trim();

  if (!search) return null;

  // API rule: do NOT mix search with other filters
  const json = await trackedApiGet("/leagues", { search }, "others");
  const resp = json?.response || [];

  if (!resp.length) {
    console.warn(`[WARN] League not found: search="${search}"`);
    return null;
  }

  const target = norm(search);
  const wantedCountry = norm(country);
  const wantedType = norm(type);

  const candidates = resp
    .map((r) => {
      const leagueId = r?.league?.id ?? null;
      const leagueName = r?.league?.name ?? "";
      const leagueType = r?.league?.type ?? "";
      const leagueCountry = r?.country?.name ?? r?.league?.country ?? "";
      const season = pickSeasonFromLeagueResponse(r);
      return { league_id: leagueId, league_name: leagueName, league_type: leagueType, league_country: leagueCountry, season };
    })
    .filter((c) => c.league_id);

  function score(c) {
    let s = 0;

    const name = norm(c.league_name);
    const ctry = norm(c.league_country);
    const tp = norm(c.league_type);

    // Local filters (since API won't allow them with search)
    if (wantedCountry) s += (ctry === wantedCountry ? 6 : -3);
    if (wantedType) s += (tp === wantedType ? 3 : -1);

    // Name match
    if (name === target) s += 6;
    if (name.includes(target) || target.includes(name)) s += 3;

    // Bonus if season exists
    if (Number.isFinite(c.season)) s += 1;

    return s;
  }

  candidates.sort((a, b) => score(b) - score(a));

  const best = candidates[0];
  if (!best?.league_id) {
    console.warn(`[WARN] League not resolved after filtering: search="${search}" country="${country}" type="${type}"`);
    return null;
  }

  console.log(
    `[OK] League resolved: "${search}" -> id=${best.league_id} season=${best.season ?? "?"} name="${best.league_name}" country="${best.league_country}" type="${best.league_type}"`
  );

  return best;
}

async function resolveLeagueById(entry) {
  const leagueId = Number(entry?.league_id);
  if (!Number.isFinite(leagueId)) return null;

  const json = await trackedApiGet("/leagues", { id: leagueId }, "others");
  const resp = Array.isArray(json?.response) ? json.response : [];
  if (!resp.length) {
    console.warn(`[WARN] League not found by id: ${leagueId}`);
    return null;
  }

  const best = resp
    .map((r) => ({
      league_id: r?.league?.id ?? null,
      league_name: r?.league?.name ?? entry?.display_name ?? "",
      league_type: r?.league?.type ?? entry?.type ?? "",
      league_country: r?.country?.name ?? entry?.country ?? "",
      season: pickSeasonFromLeagueResponse(r)
    }))
    .find((r) => Number(r.league_id) === leagueId) || null;

  if (!best?.league_id) {
    console.warn(`[WARN] League unresolved after /leagues lookup for id=${leagueId}`);
    return null;
  }

  return {
    ...best,
    league_id: Number(best.league_id)
  };
}

async function fetchFixturesLeagueRange({ league_id, season, from, to, timezone }) {
  // /fixtures (api-football v3) rejeita par+�metro desconhecido `page` com:
  //   { "page": "The Page field do not exist." }
  // Portanto: 1 chamada para o range (nossa janela +� pequena: 7 dias).
  const json = await trackedApiGet("/fixtures", {
    league: league_id,
    season,
    from,
    to,
    timezone
  }, "fixtures");

  return json?.response || [];
}

async function fetchRecentFixtureIdsForLeague({ league_id, season, last = 10, timezone }) {
  const json = await trackedApiGet("/fixtures", {
    league: league_id,
    season,
    last,
    timezone
  }, "fixtures");
  const resp = Array.isArray(json?.response) ? json.response : [];
  return resp
    .map((fx) => Number(fx?.fixture?.id))
    .filter((id) => Number.isFinite(id));
}

async function fixtureHasValidStatistics(fixtureId) {
  const json = await trackedApiGet("/fixtures/statistics", { fixture: fixtureId }, "fixtureStats");
  const resp = Array.isArray(json?.response) ? json.response : [];
  if (!resp.length) return false;

  return resp.some((teamBlock) => {
    const stats = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
    return stats.some((entry) => {
      const value = entry?.value;
      if (value === null || value === undefined || value === "") return false;
      if (typeof value === "number") return Number.isFinite(value);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed.toLowerCase() === "null" || trimmed === "-") return false;
        return true;
      }
      return true;
    });
  });
}

async function detectStatsSupportByCompetition(resolved, fixtures, timezone, allowlistLeagueIds) {
  const fixtureIdsByLeague = new Map();
  const knownFixtureLeagueById = new Map();
  for (const fx of fixtures) {
    const leagueId = Number(fx?.league?.id);
    const fixtureId = Number(fx?.fixture?.id);
    if (!Number.isFinite(leagueId) || !Number.isFinite(fixtureId)) continue;
    if (allowlistLeagueIds instanceof Set && allowlistLeagueIds.size > 0 && !allowlistLeagueIds.has(leagueId)) continue;
    if (!fixtureIdsByLeague.has(leagueId)) fixtureIdsByLeague.set(leagueId, []);
    fixtureIdsByLeague.get(leagueId).push(fixtureId);
    knownFixtureLeagueById.set(fixtureId, leagueId);
  }

  const checkedFixtures = new Map();
  const statsSupportedMap = {};

  for (const league of resolved) {
    const leagueId = Number(league?.league_id);
    if (!Number.isFinite(leagueId)) continue;

    let candidateFixtureIds = (fixtureIdsByLeague.get(leagueId) || []).slice(0, 5);

    if (!candidateFixtureIds.length && Number.isFinite(league?.season)) {
      try {
        candidateFixtureIds = await fetchRecentFixtureIdsForLeague({
          league_id: leagueId,
          season: league.season,
          last: 10,
          timezone
        });
      } catch (err) {
        console.warn(`[WARN] Failed to fetch recent fixtures for league_id=${leagueId}: ${err?.message || err}`);
      }
    }

    let supported = false;
    for (const fixtureId of candidateFixtureIds) {
      if (!Number.isFinite(fixtureId)) continue;
      const knownLeagueId = knownFixtureLeagueById.get(fixtureId);
      if (!Number.isFinite(knownLeagueId) || knownLeagueId !== leagueId) continue;
      if (allowlistLeagueIds instanceof Set && allowlistLeagueIds.size > 0 && !allowlistLeagueIds.has(knownLeagueId)) continue;

      let hasStats;
      if (checkedFixtures.has(fixtureId)) {
        REQUEST_METRICS.cache.fixtureStats.hits += 1;
        REQUEST_METRICS.cache.fixtureStats.avoided += 1;
        hasStats = checkedFixtures.get(fixtureId);
      } else {
        REQUEST_METRICS.cache.fixtureStats.misses += 1;
        try {
          hasStats = await fixtureHasValidStatistics(fixtureId);
        } catch (err) {
          hasStats = false;
        }
        checkedFixtures.set(fixtureId, hasStats);
      }

      if (hasStats) {
        supported = true;
        break;
      }
    }

    statsSupportedMap[String(leagueId)] = supported;
    console.log(`[STATS-SUPPORTED] competition_id=${leagueId} supported=${supported}`);
  }

  return statsSupportedMap;
}

async function fetchTeamLastFinished(teamId, lastN, timezone, cache) {
  const key = `${teamId}|${lastN}`;
  if (cache.has(key)) {
    REQUEST_METRICS.cache.teamLast5.hits += 1;
    REQUEST_METRICS.cache.teamLast5.avoided += 1;
    return cache.get(key);
  }
  REQUEST_METRICS.cache.teamLast5.misses += 1;

  const json = await trackedApiGet("/fixtures", {
    team: teamId,
    last: lastN,
    status: "FT",
    timezone
  }, "teamLast5");

  const resp = json?.response || [];
  cache.set(key, resp);
  return resp;
}

function resultFromFixtureForTeam(fx, teamId) {
  const homeId = fx?.teams?.home?.id ?? null;
  const awayId = fx?.teams?.away?.id ?? null;
  const gH = fx?.goals?.home;
  const gA = fx?.goals?.away;

  if (!Number.isFinite(Number(gH)) || !Number.isFinite(Number(gA))) return "D";

  const isHome = homeId === teamId;
  const gf = isHome ? Number(gH) : Number(gA);
  const ga = isHome ? Number(gA) : Number(gH);

  if (gf > ga) return "W";
  if (gf < ga) return "L";
  return "D";
}

function buildFormDetails(teamId, fixtures, limitN) {
  const out = [];
  for (const fx of fixtures.slice(0, limitN)) {
    const homeId = fx?.teams?.home?.id ?? null;
    const awayId = fx?.teams?.away?.id ?? null;
    const homeName = fx?.teams?.home?.name ?? "���";
    const awayName = fx?.teams?.away?.name ?? "���";
    const gH = fx?.goals?.home;
    const gA = fx?.goals?.away;

    const isHome = homeId === teamId;
    const opp = isHome ? awayName : homeName;
    const venue = isHome ? "H" : "A";

    const gf = Number.isFinite(Number(gH)) && Number.isFinite(Number(gA))
      ? (isHome ? Number(gH) : Number(gA))
      : null;
    const ga = Number.isFinite(Number(gH)) && Number.isFinite(Number(gA))
      ? (isHome ? Number(gA) : Number(gH))
      : null;

    const score = (gf !== null && ga !== null) ? `${gf}-${ga}` : "���";
    const result = resultFromFixtureForTeam(fx, teamId);

    out.push({
      result,
      venue,
      opp,
      score,
      date_utc: toIso(fx?.fixture?.date) || null
    });
  }
  return out;
}

function sumGoalsForAgainst(teamId, fixtures, limitN) {
  let gf = 0, ga = 0, counted = 0;

  for (const fx of fixtures.slice(0, limitN)) {
    const homeId = fx?.teams?.home?.id ?? null;
    const awayId = fx?.teams?.away?.id ?? null;
    const gH = fx?.goals?.home;
    const gA = fx?.goals?.away;

    if (!Number.isFinite(Number(gH)) || !Number.isFinite(Number(gA))) continue;

    const isHome = homeId === teamId;
    const gFor = isHome ? Number(gH) : Number(gA);
    const gAg = isHome ? Number(gA) : Number(gH);

    gf += gFor;
    ga += gAg;
    counted += 1;
  }

  return { gf, ga, counted };
}


function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function goalsPerMatch(agg){
  if(!agg || !agg.counted) return { gfpm: 0, gapm: 0, tgpm: 0 };
  const gfpm = agg.gf / agg.counted;
  const gapm = agg.ga / agg.counted;
  return { gfpm, gapm, tgpm: gfpm + gapm };
}

function pointsFromForm(details){
  // details: [{result:"W"|"D"|"L"}]
  const arr = Array.isArray(details) ? details : [];
  let pts = 0, w=0, d=0, l=0;
  for(const it of arr){
    const r = String(it?.result || "").toUpperCase();
    if(r==="W"){ pts += 3; w++; }
    else if(r==="D"){ pts += 1; d++; }
    else if(r==="L"){ l++; }
  }
  return { pts, w, d, l, n: arr.length };
}

function volatilityFromFixtures(fixtures, teamId, limitN){
  // Uses last finished fixtures for the team, computes std dev of total goals
  const arr = Array.isArray(fixtures) ? fixtures.slice(0, limitN) : [];
  const totals = [];
  for(const fx of arr){
    const homeId = fx?.teams?.home?.id ?? null;
    const awayId = fx?.teams?.away?.id ?? null;
    const gH = fx?.goals?.home;
    const gA = fx?.goals?.away;
    if(!Number.isFinite(Number(gH)) || !Number.isFinite(Number(gA))) continue;
    if(homeId !== teamId && awayId !== teamId) continue;
    totals.push(Number(gH) + Number(gA));
  }
  if(totals.length < 2) return 0.0;
  const mean = totals.reduce((a,b)=>a+b,0) / totals.length;
  const varr = totals.reduce((a,b)=>a + (b-mean)*(b-mean), 0) / (totals.length - 1);
  return Math.sqrt(varr);
}

function riskLabelFrom(volScore){
  // volScore ~ 0..2+
  if(volScore >= 1.4) return "volatile";
  if(volScore >= 1.0) return "high";
  if(volScore >= 0.6) return "med";
  return "low";
}

function buildRationale(kind, risk){
  const r = (risk==="low") ? "baixo" : (risk==="med") ? "m+�dio" : (risk==="high") ? "alto" : "vol+�til";
  if(kind==="goals_over"){
    return `Tend+�ncia de gols acima da m+�dia, mas risco ${r} por varia+�+�o recente.`;
  }
  if(kind==="goals_under"){
    return `Perfil mais controlado de gols, mas risco ${r} por oscila+�+�es e contexto.`;
  }
  if(kind==="btts_yes"){
    return `Ambas costumam marcar e conceder, mas risco ${r} pela depend+�ncia de efici+�ncia.`;
  }
  if(kind==="btts_no"){
    return `Um lado tende a segurar ou o outro cria pouco, mas risco ${r} por detalhes de jogo.`;
  }
  if(kind==="double_chance"){
    return `For+�a relativa e forma favorecem prote+�+�o, mas risco ${r} por imprevisibilidade do resultado.`;
  }
  if(kind==="dnb"){
    return `Favoritismo leve com prote+�+�o do empate, mas risco ${r} por margem curta.`;
  }
  return `Cen+�rio prov+�vel com risco ${r}.`;
}

function mkMarket({key, market, entry, risk, confidence, rationale}){
  return { key, market, entry, risk, confidence: clamp01(confidence), rationale };
}

function buildMarketsForMatch({homeAgg, awayAgg, formHomeDetails, formAwayDetails, vol, baseRisk}){
  const markets = [];

  const h = goalsPerMatch(homeAgg);
  const a = goalsPerMatch(awayAgg);

  const combined = (h.tgpm + a.tgpm) / 2; // proxy of total goals environment
  // Confidence grows as we move away from 2.5-ish center
  let over25Conf = clamp01(0.50 + (combined - 2.6) * 0.18);
  let under35Conf = clamp01(0.55 + (3.3 - combined) * 0.12);

  // Primary goals suggestion
  if(combined >= 2.85){
    const r = (baseRisk==="low" && vol < 0.8) ? "med" : baseRisk;
    markets.push(mkMarket({
      key: "goals_ou",
      market: "Gols (Over/Under)",
      entry: "Over 2.5",
      risk: r,
      confidence: over25Conf,
      rationale: buildRationale("goals_over", r)
    }));
    // safer alt
    markets.push(mkMarket({
      key: "goals_ou_safe",
      market: "Gols (Over/Under)",
      entry: "Over 1.5",
      risk: "low",
      confidence: clamp01(over25Conf + 0.12),
      rationale: "Linha mais conservadora para reduzir risco."
    }));
    // protection
    markets.push(mkMarket({
      key: "goals_ou_protect",
      market: "Gols (Over/Under)",
      entry: "Under 3.5",
      risk: (vol > 1.2 ? "med" : "low"),
      confidence: clamp01(under35Conf + 0.05),
      rationale: "Prote+�+�o contra placar muito el+�stico."
    }));
  }else{
    const r = (baseRisk==="high" ? "high" : baseRisk);
    markets.push(mkMarket({
      key: "goals_ou",
      market: "Gols (Over/Under)",
      entry: "Under 3.5",
      risk: r,
      confidence: under35Conf,
      rationale: buildRationale("goals_under", r)
    }));
    markets.push(mkMarket({
      key: "goals_ou_safe",
      market: "Gols (Over/Under)",
      entry: "Over 1.5",
      risk: "med",
      confidence: clamp01(0.58 + (combined - 2.0) * 0.10),
      rationale: "Se houver gol cedo, a linha tende a ficar viva (risco m+�dio)."
    }));
  }

  // BTTS heuristic
  const bttsSignal = (h.gfpm >= 1.1 && a.gfpm >= 1.1 && h.gapm >= 0.9 && a.gapm >= 0.9);
  if(bttsSignal){
    const r = (vol >= 1.3) ? "high" : "med";
    markets.push(mkMarket({
      key: "btts",
      market: "Ambas marcam",
      entry: "Sim",
      risk: r,
      confidence: clamp01(0.56 + ((h.gfpm+a.gfpm)/2 - 1.1) * 0.10),
      rationale: buildRationale("btts_yes", r)
    }));
  }else{
    const r = (vol >= 1.2) ? "high" : "med";
    markets.push(mkMarket({
      key: "btts",
      market: "Ambas marcam",
      entry: "N+�o",
      risk: r,
      confidence: clamp01(0.54 + (1.1 - Math.min(h.gfpm, a.gfpm)) * 0.08),
      rationale: buildRationale("btts_no", r)
    }));
  }

  // Result protection (Double Chance / DNB) via form points
  const ph = pointsFromForm(formHomeDetails);
  const pa = pointsFromForm(formAwayDetails);
  const diff = (ph.pts - pa.pts);
  if(Math.abs(diff) >= 3){
    const homeFav = diff > 0;
    const r = (baseRisk==="low") ? "med" : baseRisk;
    markets.push(mkMarket({
      key: "double_chance",
      market: "Dupla chance",
      entry: homeFav ? "1X" : "X2",
      risk: r,
      confidence: clamp01(0.56 + Math.min(0.18, Math.abs(diff) * 0.03)),
      rationale: buildRationale("double_chance", r)
    }));
    markets.push(mkMarket({
      key: "dnb",
      market: "Empate anula",
      entry: homeFav ? "DNB Casa" : "DNB Fora",
      risk: (baseRisk==="high" ? "high" : "med"),
      confidence: clamp01(0.53 + Math.min(0.15, Math.abs(diff) * 0.025)),
      rationale: buildRationale("dnb", (baseRisk==="high" ? "high" : "med"))
    }));
  }

  // Sort by confidence desc and cap
  markets.sort((a,b)=> (b.confidence ?? 0) - (a.confidence ?? 0));
  return markets.slice(0, 6);
}

function pickSuggestionAndRisk(homeAgg, awayAgg) {
  const hAvg = (homeAgg.counted ? (homeAgg.gf + homeAgg.ga) / homeAgg.counted : 2.2);
  const aAvg = (awayAgg.counted ? (awayAgg.gf + awayAgg.ga) / awayAgg.counted : 2.2);
  const combined = (hAvg + aAvg) / 2;

  let suggestion = "Under 3.5";
  if (combined >= 2.9) suggestion = "Over 2.5";

  let risk = "med";
  if (combined <= 2.4) risk = "low";
  if (combined >= 3.2) risk = "high";

  return { suggestion_free: suggestion, risk };
}

function mapFixtureToMatchRow(fx, enrich) {
  const league = fx?.league || {};
  const fixture = fx?.fixture || {};
  const teams = fx?.teams || {};
  const ts = Number(fx?.fixture?.timestamp);
  const kickoffUtc = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : toIso(fx?.fixture?.date);
  const apiDateFromField = String(fixture?.date || "").slice(0, 10);
  const apiDateFromTimestamp = Number.isFinite(ts) ? new Date(ts * 1000).toISOString().slice(0, 10) : "";
  const apiDate = isValidIsoDate(apiDateFromField)
    ? apiDateFromField
    : (isValidIsoDate(apiDateFromTimestamp) ? apiDateFromTimestamp : null);

  return {
    kickoff_utc: kickoffUtc || null,
    api_date: apiDate,
    status_short: String(fx?.fixture?.status?.short || "").trim().toUpperCase() || null,
    status_long: String(fx?.fixture?.status?.long || "").trim() || null,
    season: league?.season ?? null,
    country: league?.country ?? "",
    competition: league?.name ?? "",
    league_id: league?.id ?? null,
    competition_id: league?.id ?? null,
    fixture_id: fixture?.id ?? null,

    home: teams?.home?.name ?? "",
    away: teams?.away?.name ?? "",
    home_id: teams?.home?.id ?? null,
    away_id: teams?.away?.id ?? null,

    suggestion_free: enrich.suggestion_free,
    risk: enrich.risk,
    form_home_details: enrich.form_home_details,
    form_away_details: enrich.form_away_details,
    gf_home: enrich.gf_home,
    ga_home: enrich.ga_home,
    gf_away: enrich.gf_away,
    ga_away: enrich.ga_away,

    analysis: enrich.analysis || null
  };
}

function sortByKickoff(matches) {
  return [...matches].sort((a, b) => (Date.parse(a?.kickoff_utc || "") || 0) - (Date.parse(b?.kickoff_utc || "") || 0));
}

function pickRadarHighlights(matches) {
  const now = Date.now();
  const horizon = now + 36 * 60 * 60 * 1000;

  const eligible = matches.filter((m) => {
    const t = Date.parse(m?.kickoff_utc || "");
    return Number.isFinite(t) && t >= now - 3 * 60 * 60 * 1000 && t <= horizon;
  });

  const riskRank = { low: 0, med: 1, high: 2 };
  eligible.sort((a, b) => {
    const ra = riskRank[a.risk] ?? 1;
    const rb = riskRank[b.risk] ?? 1;
    if (ra !== rb) return ra - rb;
    return (Date.parse(a.kickoff_utc) || 0) - (Date.parse(b?.kickoff_utc || "") || 0);
  });

  return eligible.slice(0, 3);
}

function localDateInTimezone(isoUtc, timezone) {
  const t = Date.parse(isoUtc || "");
  if (!Number.isFinite(t)) return null;
  return isoDateOnlyInTimezone(new Date(t), timezone);
}

function splitCalendar2dByApiDate(matches, baseDate) {
  const today = baseDate;
  const tomorrow = addDaysToIsoDate(baseDate, 1);

  const dayMatches = [];
  const todayMatches = [];
  const tomorrowMatches = [];

  for (const m of matches) {
    const ymd = String(m?.api_date || "");
    if (!ymd) continue;
    if (ymd === today) {
      todayMatches.push(m);
      dayMatches.push(m);
    } else if (ymd === tomorrow) {
      tomorrowMatches.push(m);
      dayMatches.push(m);
    }
  }

  return { today, tomorrow, dayMatches, todayMatches, tomorrowMatches };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    calendar: false,
    stats: false,
    standings: false,
    all: false,
    mode: "default" // legacy: --mode=daily | --mode=weekly
  };

  // Handle --mode=X (legacy)
  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      flags.mode = arg.split("=")[1];
    }
  }

  // Handle individual flags
  for (const arg of args) {
    if (arg === "--calendar") flags.calendar = true;
    if (arg === "--stats") flags.stats = true;
    if (arg === "--standings") flags.standings = true;
    if (arg === "--all") flags.all = true;
  }

  // Legacy mode: --mode=daily means run everything
  if (flags.mode === "daily") {
    flags.calendar = true;
    flags.stats = true;
    flags.standings = true;
  } else if (flags.mode === "weekly") {
    flags.calendar = true;
    flags.stats = false;
    flags.standings = false;
  }

  // If no explicit flags, default to calendar only
  if (!flags.calendar && !flags.stats && !flags.standings && !flags.all) {
    flags.calendar = true;
  }

  // --all means everything
  if (flags.all) {
    flags.calendar = true;
    flags.stats = true;
    flags.standings = true;
  }

  return flags;
}

async function generateCalendar(cfg, resolved, timezone, daysAhead, formWindow, goalsWindow, includeStatsInCalendar, leaguesSource, leaguesCount) {
  console.log("\n[CALENDAR] Starting calendar generation...");
  const baseDateUtc = resolveBaseDateInTimezone("UTC");
  const from = baseDateUtc;
  const to = addDaysToIsoDate(baseDateUtc, daysAhead);

  console.log("[CALENDAR] base_date_utc=", baseDateUtc, "from=", from, "to=", to, "tz(fetch)=", timezone);

  console.log(`  Range: ${from} -> ${to}`);
  console.log(`[REQ-EST] calendar.resolve_leagues=${resolved.length} calendar.fixtures=${resolved.length}`);

  if (!includeStatsInCalendar) {
    console.log("[SKIP] stats enrichment disabled for calendar run");
  }

  // Fetch fixtures per league
  const rawFixtures = [];
  for (const r of resolved) {
    if (!Number.isFinite(r.season)) {
      console.warn(`[WARN] Missing season for league_id=${r.league_id} (${r.league_name}). Skipping fixtures.`);
      continue;
    }
    const fx = await fetchFixturesLeagueRange({
      league_id: r.league_id,
      season: r.season,
      from,
      to,
      timezone
    });
    console.log(`  [OK] league_id=${r.league_id} count=${fx.length}`);
    rawFixtures.push(...fx);
  }

  // Dedup fixtures
  const seen = new Set();
  const fixtures = [];
  for (const fx of rawFixtures) {
    const id = fx?.fixture?.id ?? null;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    fixtures.push(fx);
  }

  const allowlistLeagueIds = new Set(
    (Array.isArray(resolved) ? resolved : [])
      .map((entry) => Number(entry?.league_id))
      .filter((leagueId) => Number.isFinite(leagueId))
  );
  if (!allowlistLeagueIds.size) {
    throw new Error("[FAIL-CLOSED] Allowlist is empty after league resolution. Aborting calendar publication.");
  }

  const statsSupportedMap = await detectStatsSupportByCompetition(resolved, fixtures, timezone, allowlistLeagueIds);

  // Enrich: form + goals (optional in frequent runs)
  const teamCache = new Map();
  const matches = [];

  for (const fx of fixtures) {
    const homeId = fx?.teams?.home?.id ?? null;
    const awayId = fx?.teams?.away?.id ?? null;
    if (!homeId || !awayId) continue;

    let formHomeDetails = [];
    let formAwayDetails = [];
    let homeAgg = { gf: 0, ga: 0, counted: 0 };
    let awayAgg = { gf: 0, ga: 0, counted: 0 };
    let analysis = null;

    if (includeStatsInCalendar) {
      const homeLast = await fetchTeamLastFinished(homeId, Math.max(formWindow, goalsWindow), timezone, teamCache);
      const awayLast = await fetchTeamLastFinished(awayId, Math.max(formWindow, goalsWindow), timezone, teamCache);

      formHomeDetails = buildFormDetails(homeId, homeLast, formWindow);
      formAwayDetails = buildFormDetails(awayId, awayLast, formWindow);

      homeAgg = sumGoalsForAgainst(homeId, homeLast, goalsWindow);
      awayAgg = sumGoalsForAgainst(awayId, awayLast, goalsWindow);

      const volHome = volatilityFromFixtures(homeLast, homeId, goalsWindow);
      const volAway = volatilityFromFixtures(awayLast, awayId, goalsWindow);
      const vol = (volHome + volAway) / 2;
      const baseRisk = riskLabelFrom(vol);

      const markets = buildMarketsForMatch({
        homeAgg,
        awayAgg,
        formHomeDetails,
        formAwayDetails,
        vol,
        baseRisk
      });

      analysis = { markets, volatility: vol };
    }

    const { suggestion_free, risk } = pickSuggestionAndRisk(homeAgg, awayAgg);

    matches.push(
      mapFixtureToMatchRow(fx, {
        suggestion_free,
        risk,
        form_home_details: formHomeDetails,
        form_away_details: formAwayDetails,
        gf_home: homeAgg.gf,
        ga_home: homeAgg.ga,
        gf_away: awayAgg.gf,
        ga_away: awayAgg.ga,

        analysis
      })
    );
  }

  const sorted = sortByKickoff(matches);
  assertCalendarMatchesWithinAllowlist(sorted, allowlistLeagueIds, "calendar generation");

  const generatedAtUtc = nowIso();

  const split = splitCalendar2dByUtcDate(sorted, baseDateUtc);
  assertCalendarMatchesWithinAllowlist(split.todayMatches, allowlistLeagueIds, "calendar_2d today");
  assertCalendarMatchesWithinAllowlist(split.tomorrowMatches, allowlistLeagueIds, "calendar_2d tomorrow");

  const coverageReport = makeCoverageReport(
    Array.from(allowlistLeagueIds),
    fixtures,
    sorted
  );
  assertCoverageReportClean(coverageReport);

  const calendarDayOut = {
    generated_at_utc: generatedAtUtc,
    form_window: formWindow,
    goals_window: goalsWindow,
    matches: split.dayMatches
  };
  writeJsonAtomic(OUT_CAL_DAY, calendarDayOut);
  console.log(`[CALENDAR] Wrote ${OUT_CAL_DAY.replace(process.cwd(), ".")} matches=${split.dayMatches.length}`);

  const calendar2dOut = {
    meta: {
      tz: timezone,
      base_date: baseDateUtc,
      today: split.today,
      tomorrow: split.tomorrow,
      generated_at_utc: generatedAtUtc,
      generated_for_date_basis: "utc",
      generated_for_timezone: timezone,
      generated_for_local_date: baseDateUtc,
      form_window: formWindow,
      goals_window: goalsWindow,
      source: "calendar_2d",
      leagues_source: leaguesSource,
      leagues_count: leaguesCount,
      allowlist_league_ids: Array.from(allowlistLeagueIds).sort((a, b) => a - b)
    },
    matches: sorted,
    today: split.todayMatches,
    tomorrow: split.tomorrowMatches
  };

  const forensicToday20Bahia = {};
  for (const m of (calendar2dOut.today || []).slice(0, 20)) {
    const dayKey = String(m?.api_date || "");
    if (!dayKey) continue;
    forensicToday20Bahia[dayKey] = (forensicToday20Bahia[dayKey] || 0) + 1;
  }
  console.log(
    "[CALENDAR][FORENSIC] dayKey_Bahia_today20=",
    JSON.stringify(forensicToday20Bahia),
    "meta.today=",
    calendar2dOut.meta.today
  );

  writeJsonAtomic(OUT_CAL_2D, calendar2dOut);
  console.log(`[CALENDAR] Wrote ${OUT_CAL_2D.replace(process.cwd(), ".")} today=${split.todayMatches.length} tomorrow=${split.tomorrowMatches.length}`);

  const coverageReportOut = {
    meta: {
      generated_at_utc: generatedAtUtc,
      source: "calendar_coverage_report",
      base_date_utc: baseDateUtc,
      from,
      to,
      leagues_source: leaguesSource,
      leagues_count: leaguesCount
    },
    ...coverageReport
  };
  writeJsonAtomic(OUT_COVERAGE_REPORT, coverageReportOut);
  console.log(
    `[CALENDAR] Wrote ${OUT_COVERAGE_REPORT.replace(process.cwd(), ".")} ` +
    `vanished=${coverageReport.summary.vanished_leagues} leaked=${coverageReport.summary.leaked_leagues}`
  );

  // Write radar_day.json
  const radarDayOut = {
    generated_at_utc: generatedAtUtc,
    highlights: pickRadarHighlights(sorted)
  };
  writeJsonAtomic(OUT_RADAR_DAY, radarDayOut);
  console.log(`[CALENDAR] Wrote ${OUT_RADAR_DAY.replace(process.cwd(), ".")} highlights=${radarDayOut.highlights.length}`);

  // Write radar_week.json (safe placeholder)
  writeJsonAtomic(OUT_RADAR_WEEK, { generated_at_utc: generatedAtUtc, highlights: [] });
  console.log(`[CALENDAR] Wrote ${OUT_RADAR_WEEK.replace(process.cwd(), ".")}`);

  const statsSupportedOut = {
    meta: {
      generated_at_utc: generatedAtUtc,
      source: "stats_supported",
      criteria: "at_least_one_fixture_with_valid_statistics",
      leagues_source: leaguesSource,
      leagues_count: leaguesCount
    },
    competitions: statsSupportedMap
  };
  writeJsonAtomic(OUT_STATS_SUPPORTED, statsSupportedOut);
  console.log(`[CALENDAR] Wrote ${OUT_STATS_SUPPORTED.replace(process.cwd(), ".")} competitions=${Object.keys(statsSupportedMap).length}`);
}

async function generateStats(flags) {
  const cfg = readConfig();
  const mode = String(cfg.stats_mode || "daily");
  const manual = flags.stats || flags.all;

  if (!manual) {
    console.log(`[SKIP] stats not requested (stats_mode=${mode})`);
    return;
  }

  if (mode !== "daily") {
    console.log(`[INFO] stats manual override accepted (stats_mode=${mode})`);
  }

  if (mode === "off" && !manual) {
    console.log("[SKIP] stats disabled (stats_mode=off)");
    return;
  }

  console.log("[FUTURE] stats generation placeholder (not implemented yet)");
}

async function generateStandings(flags) {
  const cfg = readConfig();
  const mode = String(cfg.standings_mode || "daily");
  const manual = flags.standings || flags.all;

  if (!manual) {
    console.log(`[SKIP] standings not requested (standings_mode=${mode})`);
    return;
  }

  if (mode !== "daily") {
    console.log(`[INFO] standings manual override accepted (standings_mode=${mode})`);
  }

  if (mode === "off" && !manual) {
    console.log("[SKIP] standings disabled (standings_mode=off)");
    return;
  }

  console.log("[FUTURE] standings generation placeholder (not implemented yet)");
}

async function main() {
  const cfg = readConfig();
  const coverageLeagues = readCoverageAllowlist();
  const flags = parseArgs();
  ensureDir(OUT_DIR);

  const timezone = "UTC";
  const daysAhead = Number(cfg.days_ahead || 7);
  const formWindow = Number(cfg.form_window || 5);
  const goalsWindow = Number(cfg.goals_window || 5);
  const includeStatsInCalendar = Boolean(flags.stats || flags.all);

  if (String(cfg.timezone || "").trim() && String(cfg.timezone).trim() !== timezone) {
    console.warn(`[WARN] Ignoring cfg.timezone=${cfg.timezone}; enforced timezone=${timezone}`);
  }

  console.log("\\n���������������������������������������������������������������������������������������������������������������������������������������������������������������������������");
  console.log("���    RadarTips API-FOOTBALL Update Pipeline              ���");
  console.log("���������������������������������������������������������������������������������������������������������������������������������������������������������������������������");
  console.log(`Timezone: ${timezone}`);
  console.log(`API min interval: ${api.minIntervalMs}ms`);
  console.log(`Windows: form=${formWindow} goals=${goalsWindow}`);
  console.log(`[RUN] calendar=${flags.calendar} stats=${flags.stats} standings=${flags.standings} all=${flags.all}`);

  // Check LIVE flag
  const liveEnabled = cfg.live_enabled !== false;
  if (!liveEnabled) {
    console.log("[SKIP] LIVE disabled (live_enabled=false) - no live score fetching");
  }

  // Smoke test for key/quota validity
  await smokeTestStatus();

  // Resolve leagues (calendar source of truth = coverage allowlist)
  let resolved = [];
  if (flags.calendar) {
    console.log("\n[LEAGUES] Resolving coverage allowlist leagues...");
    for (const entry of coverageLeagues) {
      const r = await resolveLeagueById(entry);
      if (r?.league_id) resolved.push(r);
    }
    if (!resolved.length) {
      throw new Error("No leagues resolved from data/coverage_allowlist.json.");
    }
    console.log(`[OK] Resolved ${resolved.length}/${coverageLeagues.length} leagues from coverage allowlist`);
  }

  // Execute requested tasks
  if (flags.calendar) {
    await generateCalendar(
      cfg,
      resolved,
      timezone,
      daysAhead,
      formWindow,
      goalsWindow,
      includeStatsInCalendar,
      "data/coverage_allowlist.json",
      coverageLeagues.length
    );
  } else {
    console.log("[SKIP] calendar not requested");
  }

  if (flags.stats) {
    await generateStats(flags);
  } else {
    await generateStats(flags);
  }

  if (flags.standings) {
    await generateStandings(flags);
  } else {
    await generateStandings(flags);
  }

  printRequestMetricsSummary();

  console.log("\\n[OK] Pipeline complete.\\n");
}

main().catch((err) => {
  console.error("[FATAL]", err?.stack || err?.message || err);
  process.exit(1);
});
