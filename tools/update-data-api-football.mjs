#!/usr/bin/env node
/**
 * Update RadarTips snapshots using API-FOOTBALL (API-SPORTS)
 *
 * Outputs:
 *  - data/v1/calendar_7d.json
 *  - data/v1/radar_day.json
 *  - data/v1/radar_week.json
 *
 * Usage:
 *  node tools/update-data-api-football.mjs --mode=daily
 *  node tools/update-data-api-football.mjs --mode=week
 *
 * Env:
 *  APIFOOTBALL_KEY  (or API_FOOTBALL_KEY)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API_BASE = "https://v3.football.api-sports.io";

const OUT_DIR = path.join(process.cwd(), "data", "v1");
const OUT_CAL_7D = path.join(OUT_DIR, "calendar_7d.json");
const OUT_RADAR_DAY = path.join(OUT_DIR, "radar_day.json");
const OUT_RADAR_WEEK = path.join(OUT_DIR, "radar_week.json");

const CONFIG_PATH = path.join(process.cwd(), "tools", "api-football.config.json");

const ARG_MODE = (() => {
  const idx = process.argv.indexOf("--mode");
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]).trim();
  const kv = process.argv.find((a) => a.startsWith("--mode="));
  if (kv) return kv.split("=", 2)[1]?.trim() || "";
  return "daily";
})();

const KEY =
  (process.env.APIFOOTBALL_KEY && String(process.env.APIFOOTBALL_KEY).trim()) ||
  (process.env.API_FOOTBALL_KEY && String(process.env.API_FOOTBALL_KEY).trim()) ||
  "";

if (!KEY) {
  console.error("Missing API key. Set APIFOOTBALL_KEY (or API_FOOTBALL_KEY).");
  process.exit(1);
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

function toIso(dt) {
  if (!dt) return null;
  const t = Date.parse(dt);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
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

async function apiGet(pathname, params = {}) {
  const url = new URL(`${API_BASE}${pathname}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": KEY }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API error ${res.status} ${res.statusText}: ${txt}`.slice(0, 500));
  }
  return res.json();
}

function stableMeta() {
  return {
    generated_at_utc: nowIso(),
    source: "api-football",
    version: 2
  };
}

function normalizeFixture(fx) {
  const fixture = fx?.fixture || {};
  const league = fx?.league || {};
  const teams = fx?.teams || {};
  const goals = fx?.goals || {};
  const score = fx?.score || {};
  const status = fixture?.status || {};

  return {
    fixture_id: fixture?.id ?? null,
    kickoff_utc: toIso(fixture?.date) || null,
    timestamp: fixture?.timestamp ?? null,
    status_short: status?.short ?? null,
    status_long: status?.long ?? null,
    elapsed: status?.elapsed ?? null,
    league_id: league?.id ?? null,
    league_name: league?.name ?? null,
    league_round: league?.round ?? null,
    league_season: league?.season ?? null,
    country: league?.country ?? null,
    home_id: teams?.home?.id ?? null,
    home_name: teams?.home?.name ?? null,
    away_id: teams?.away?.id ?? null,
    away_name: teams?.away?.name ?? null,
    goals_home: goals?.home ?? null,
    goals_away: goals?.away ?? null,
    score_halftime_home: score?.halftime?.home ?? null,
    score_halftime_away: score?.halftime?.away ?? null,
    score_fulltime_home: score?.fulltime?.home ?? null,
    score_fulltime_away: score?.fulltime?.away ?? null
  };
}

function mapFixtureToCalendarEntry(fx) {
  const n = normalizeFixture(fx);
  return {
    fixture_id: n.fixture_id,
    kickoff_utc: n.kickoff_utc,
    country: n.country,
    competition: n.league_name,
    season: n.league_season,
    round: n.league_round,
    home: { id: n.home_id, name: n.home_name },
    away: { id: n.away_id, name: n.away_name },
    status_short: n.status_short,
    status_long: n.status_long
  };
}

function sortByKickoff(matches) {
  return [...matches].sort((a, b) => {
    const ta = Date.parse(a?.kickoff_utc || "") || 0;
    const tb = Date.parse(b?.kickoff_utc || "") || 0;
    return ta - tb;
  });
}

function groupByDate(matches) {
  const by = {};
  for (const m of matches) {
    const k = m?.kickoff_utc ? m.kickoff_utc.slice(0, 10) : "unknown";
    (by[k] ||= []).push(m);
  }
  return by;
}

function chooseDayItems(calendarMatches) {
  const now = Date.now();
  const horizon = now + 36 * 60 * 60 * 1000;

  const items = [];
  for (const m of calendarMatches || []) {
    const t = Date.parse(m?.kickoff_utc || "");
    if (!Number.isFinite(t)) continue;
    if (t >= now - 3 * 60 * 60 * 1000 && t <= horizon) items.push(m);
  }
  return sortByKickoff(items);
}

function chooseWeekItems(calendarMatches) {
  const byDate = groupByDate(calendarMatches || []);
  const days = Object.keys(byDate).sort();
  const out = [];

  for (const day of days) {
    const arr = sortByKickoff(byDate[day] || []);
    // compact: up to 30 per day (ajuste depois se quiser)
    out.push(...arr.slice(0, 30));
  }
  return sortByKickoff(out);
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

function seasonForRule(rule) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1..12

  if (rule === "calendar_year") return year;

  // europe_split: temporada 2025/26 começa no meio do ano; regra simples:
  // se estamos de julho (7) em diante, season = ano atual; senão, ano anterior.
  if (rule === "europe_split") return month >= 7 ? year : year - 1;

  // fallback
  return year;
}

function normStr(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function resolveLeagueId(entry) {
  // API: /leagues?search=&country=&type=&season=
  const season = seasonForRule(entry?.season_rule);
  const search = entry?.search || "";
  const country = entry?.country || "";
  const type = entry?.type || "";

  const json = await apiGet("/leagues", { search, country, type, season });
  const resp = json?.response || [];

  if (!resp.length) {
    console.warn(`[WARN] League not found: search="${search}" country="${country}" type="${type}" season=${season}`);
    return null;
  }

  // Tenta match "bem certeiro" pelo nome
  const target = normStr(search);
  const consider = resp
    .map((r) => ({
      id: r?.league?.id ?? null,
      name: r?.league?.name ?? "",
      country: r?.country?.name ?? r?.league?.country ?? "",
      type: r?.league?.type ?? "",
      season: r?.seasons?.[0]?.year ?? season
    }))
    .filter((x) => x.id);

  const exact = consider.find((x) => normStr(x.name) === target);
  const best = exact || consider[0] || null;

  if (!best) return null;

  return { league_id: best.id, league_name: best.name, season };
}

async function fetchFixturesForLeague({ league_id, season, from, to }) {
  // Paginação: /fixtures?page=1... e json.paging.total
  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const json = await apiGet("/fixtures", { league: league_id, season, from, to, page });
    const resp = json?.response || [];
    const paging = json?.paging || {};
    totalPages = Number(paging?.total) || totalPages;

    all.push(...resp);
    page += 1;
  }

  return all;
}

async function fetchCalendar7dFromConfig(cfg) {
  const start = startOfDayUtc(new Date());
  const end = addDaysUtc(start, Number(cfg?.days_ahead || 7));

  const from = isoDateOnlyUTC(start);
  const to = isoDateOnlyUTC(end);

  const resolved = [];
  for (const entry of cfg.leagues) {
    // ignorar qualquer "auto" (você pediu para remover)
    if (entry?.auto) continue;

    const r = await resolveLeagueId(entry);
    if (r?.league_id) resolved.push(r);
  }

  if (!resolved.length) {
    throw new Error("No leagues resolved from config. Check tools/api-football.config.json.");
  }

  const rawFixtures = [];
  for (const r of resolved) {
    try {
      const fx = await fetchFixturesForLeague({
        league_id: r.league_id,
        season: r.season,
        from,
        to
      });
      rawFixtures.push(...fx);
    } catch (e) {
      console.warn(`[WARN] fixtures failed for league_id=${r.league_id} (${r.league_name}): ${e?.message || e}`);
    }
  }

  // Dedup por fixture_id
  const seen = new Set();
  const matches = [];
  for (const fx of rawFixtures) {
    const id = fx?.fixture?.id ?? null;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    matches.push(mapFixtureToCalendarEntry(fx));
  }

  const sorted = sortByKickoff(matches);

  return {
    meta: {
      ...stableMeta(),
      range: { from, to },
      leagues_resolved: resolved.map((r) => ({ league_id: r.league_id, league_name: r.league_name, season: r.season })),
      totals: {
        leagues: resolved.length,
        fixtures: sorted.length
      }
    },
    matches: sorted
  };
}

async function main() {
  const cfg = readConfig();

  const calendar7d = await fetchCalendar7dFromConfig(cfg);
  writeJsonAtomic(OUT_CAL_7D, calendar7d);

  const dayItems = chooseDayItems(calendar7d.matches);
  writeJsonAtomic(OUT_RADAR_DAY, {
    meta: { ...stableMeta(), derived_from: "calendar_7d", mode: "day" },
    matches: dayItems
  });

  const weekItems = chooseWeekItems(calendar7d.matches);
  writeJsonAtomic(OUT_RADAR_WEEK, {
    meta: { ...stableMeta(), derived_from: "calendar_7d", mode: "week" },
    matches: weekItems
  });

  console.log(`[OK] Wrote:
 - ${OUT_CAL_7D}
 - ${OUT_RADAR_DAY}
 - ${OUT_RADAR_WEEK}
`);
}

main().catch((err) => {
  console.error("[FATAL]", err?.stack || err?.message || err);
  process.exit(1);
});
