#!/usr/bin/env node
/**
 * RadarTips - Update data via API-FOOTBALL (API-SPORTS)
 *
 * Generates:
 *  - data/v1/calendar_7d.json
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
const OUT_CAL_7D = path.join(OUT_DIR, "calendar_7d.json");
const OUT_RADAR_DAY = path.join(OUT_DIR, "radar_day.json");
const OUT_RADAR_WEEK = path.join(OUT_DIR, "radar_week.json");

const CONFIG_PATH = path.join(process.cwd(), "tools", "api-football.config.json");

const KEY =
  (process.env.APIFOOTBALL_KEY && String(process.env.APIFOOTBALL_KEY).trim()) ||
  (process.env.API_FOOTBALL_KEY && String(process.env.API_FOOTBALL_KEY).trim()) ||
  "";

if (!KEY) {
  console.error("Missing API key. Set APIFOOTBALL_KEY (or API_FOOTBALL_KEY).");
  process.exit(1);
}

const api = new ApiFootballClient({ apiKey: KEY, minIntervalMs: 250, retries: 2 });

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
  if (!cfg?.leagues || !Array.isArray(cfg.leagues) || cfg.leagues.length === 0) {
    throw new Error("Invalid config: 'leagues' must be a non-empty array.");
  }
  return cfg;
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
  const js = await api.get("/status");
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
  const json = await api.get("/leagues", { search });
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

async function fetchFixturesLeagueRange({ league_id, season, from, to, timezone }) {
  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const json = await api.get("/fixtures", {
      league: league_id,
      season,
      from,
      to,
      timezone,
      page
    });

    const resp = json?.response || [];
    const paging = json?.paging || {};
    totalPages = Number(paging?.total) || totalPages;

    all.push(...resp);
    page += 1;
  }

  return all;
}

async function fetchTeamLastFinished(teamId, lastN, timezone, cache) {
  const key = `${teamId}|${lastN}`;
  if (cache.has(key)) return cache.get(key);

  const json = await api.get("/fixtures", {
    team: teamId,
    last: lastN,
    status: "FT",
    timezone
  });

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
    const homeName = fx?.teams?.home?.name ?? "—";
    const awayName = fx?.teams?.away?.name ?? "—";
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

    const score = (gf !== null && ga !== null) ? `${gf}-${ga}` : "—";
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

  return {
    kickoff_utc: toIso(fixture?.date) || null,
    country: league?.country ?? "",
    competition: league?.name ?? "",
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
    ga_away: enrich.ga_away
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
    return (Date.parse(a.kickoff_utc) || 0) - (Date.parse(b.kickoff_utc) || 0);
  });

  return eligible.slice(0, 3);
}

async function main() {
  const cfg = readConfig();
  ensureDir(OUT_DIR);

  const timezone = String(cfg.timezone || "UTC");
  const daysAhead = Number(cfg.days_ahead || 7);
  const formWindow = Number(cfg.form_window || 5);
  const goalsWindow = Number(cfg.goals_window || 5);

  const start = startOfDayUtc(new Date());
  const end = addDaysUtc(start, daysAhead);

  const from = isoDateOnlyUTC(start);
  const to = isoDateOnlyUTC(end);

  console.log(`Timezone: ${timezone}`);
  console.log(`Range: ${from} -> ${to}`);
  console.log(`Windows: form=${formWindow} goals=${goalsWindow}`);

  // Smoke test for key/quota validity
  await smokeTestStatus();

  // Resolve leagues
  const resolved = [];
  for (const entry of cfg.leagues) {
    const r = await resolveLeague(entry);
    if (r?.league_id) resolved.push(r);
  }
  if (!resolved.length) {
    throw new Error("No leagues resolved from config. Check tools/api-football.config.json.");
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
    console.log(`[OK] Fixtures: league_id=${r.league_id} season=${r.season} count=${fx.length}`);
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

  // Enrich: form + goals
  const teamCache = new Map();
  const matches = [];

  for (const fx of fixtures) {
    const homeId = fx?.teams?.home?.id ?? null;
    const awayId = fx?.teams?.away?.id ?? null;
    if (!homeId || !awayId) continue;

    const homeLast = await fetchTeamLastFinished(homeId, Math.max(formWindow, goalsWindow), timezone, teamCache);
    const awayLast = await fetchTeamLastFinished(awayId, Math.max(formWindow, goalsWindow), timezone, teamCache);

    const formHomeDetails = buildFormDetails(homeId, homeLast, formWindow);
    const formAwayDetails = buildFormDetails(awayId, awayLast, formWindow);

    const homeAgg = sumGoalsForAgainst(homeId, homeLast, goalsWindow);
    const awayAgg = sumGoalsForAgainst(awayId, awayLast, goalsWindow);

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
        ga_away: awayAgg.ga
      })
    );
  }

  const sorted = sortByKickoff(matches);

  // Write calendar_7d.json
  const calendarOut = {
    generated_at_utc: nowIso(),
    form_window: formWindow,
    goals_window: goalsWindow,
    matches: sorted
  };
  writeJsonAtomic(OUT_CAL_7D, calendarOut);
  console.log(`[OK] Wrote ${OUT_CAL_7D} matches=${sorted.length}`);

  // Write radar_day.json
  const radarDayOut = {
    generated_at_utc: calendarOut.generated_at_utc,
    highlights: pickRadarHighlights(sorted)
  };
  writeJsonAtomic(OUT_RADAR_DAY, radarDayOut);
  console.log(`[OK] Wrote ${OUT_RADAR_DAY} highlights=${radarDayOut.highlights.length}`);

  // Write radar_week.json (safe placeholder)
  writeJsonAtomic(OUT_RADAR_WEEK, { generated_at_utc: calendarOut.generated_at_utc, highlights: [] });
  console.log(`[OK] Wrote ${OUT_RADAR_WEEK}`);
}

main().catch((err) => {
  console.error("[FATAL]", err?.stack || err?.message || err);
  process.exit(1);
});
