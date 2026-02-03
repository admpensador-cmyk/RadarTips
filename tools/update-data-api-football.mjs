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
  // yyyy-mm-dd
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
    headers: {
      "x-apisports-key": KEY
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API error ${res.status} ${res.statusText}: ${txt}`.slice(0, 500));
  }
  return res.json();
}

function uniq(arr) {
  return [...new Set(arr)];
}

function safeNum(x, fallback = null) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFixture(fx) {
  // fx: API-Football fixture object
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

function pickRadarMarketsNormalized(match) {
  // Minimal and stable: we keep only what UI needs, without heavy recomputation.
  // You can extend later.
  const odds = match?.odds || {};
  const p = match?.probs || {};
  const lines = match?.lines || {};
  return {
    // 1X2
    odds_home: odds?.home ?? null,
    odds_draw: odds?.draw ?? null,
    odds_away: odds?.away ?? null,
    p_home: p?.home ?? null,
    p_draw: p?.draw ?? null,
    p_away: p?.away ?? null,
    // totals
    line_goals: lines?.goals ?? null,
    odds_over: odds?.over ?? null,
    odds_under: odds?.under ?? null,
    p_over: p?.over ?? null,
    p_under: p?.under ?? null
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

function groupByDate(matches) {
  const by = {};
  for (const m of matches) {
    const k = m?.kickoff_utc ? m.kickoff_utc.slice(0, 10) : "unknown";
    (by[k] ||= []).push(m);
  }
  return by;
}

function sortByKickoff(matches) {
  return [...matches].sort((a, b) => {
    const ta = Date.parse(a?.kickoff_utc || "") || 0;
    const tb = Date.parse(b?.kickoff_utc || "") || 0;
    return ta - tb;
  });
}

function stableMeta() {
  return {
    generated_at_utc: nowIso(),
    source: "api-football",
    version: 1
  };
}

/**
 * Strategy to reduce API usage:
 * - calendar_7d: fetch fixtures by date range once (7 days)
 * - radar_day: derive from calendar_7d + choose "today" and "tomorrow" subset (no extra calls)
 * - radar_week: derive from calendar_7d + choose key matches per day (no extra calls)
 *
 * This avoids repeated fixtures calls that would burn quota.
 */
async function fetchCalendar7d() {
  const start = startOfDayUtc(new Date());
  const end = addDaysUtc(start, 7);

  // API-Football fixtures endpoint supports date range via from/to (YYYY-MM-DD)
  const from = isoDateOnlyUTC(start);
  const to = isoDateOnlyUTC(end);

  const json = await apiGet("/fixtures", { from, to });
  const resp = json?.response || [];

  const matches = resp.map(mapFixtureToCalendarEntry);
  const sorted = sortByKickoff(matches);

  return {
    meta: { ...stableMeta(), range: { from, to } },
    matches: sorted
  };
}

function chooseDayItems(calendarMatches) {
  // "Radar do dia" uses items within next 36h, sorted.
  const now = Date.now();
  const horizon = now + 36 * 60 * 60 * 1000;

  const items = [];
  for (const m of calendarMatches || []) {
    const t = Date.parse(m?.kickoff_utc || "");
    if (!Number.isFinite(t)) continue;
    if (t >= now - 3 * 60 * 60 * 1000 && t <= horizon) {
      items.push(m);
    }
  }

  return sortByKickoff(items);
}

function chooseWeekItems(calendarMatches) {
  // Picks a compact set: up to N per day, sorted
  const byDate = groupByDate(calendarMatches || []);
  const days = Object.keys(byDate).sort();
  const out = [];

  for (const d of days) {
    const ms = byDate[d] || [];
    const sorted = sortByKickoff(ms);
    // Choose top 20 per day (simple cap to keep file light)
    out.push(...sorted.slice(0, 20));
  }

  return out;
}

async function main() {
  ensureDir(OUT_DIR);

  console.log(`Mode: ${ARG_MODE}`);
  console.log("Fetching calendar_7d...");

  const calendar = await fetchCalendar7d();
  writeJsonAtomic(OUT_CAL_7D, calendar);
  console.log(`Wrote ${OUT_CAL_7D} (${calendar.matches?.length || 0} matches)`);

  // Build radar_day/radar_week from calendar (no additional API calls)
  const calendarMatches = calendar.matches || [];

  const radarDay = {
    meta: { ...stableMeta(), derived_from: "calendar_7d" },
    items: chooseDayItems(calendarMatches)
  };
  writeJsonAtomic(OUT_RADAR_DAY, radarDay);
  console.log(`Wrote ${OUT_RADAR_DAY} (${radarDay.items?.length || 0} items)`);

  const radarWeek = {
    meta: { ...stableMeta(), derived_from: "calendar_7d" },
    items: chooseWeekItems(calendarMatches)
  };
  writeJsonAtomic(OUT_RADAR_WEEK, radarWeek);
  console.log(`Wrote ${OUT_RADAR_WEEK} (${radarWeek.items?.length || 0} items)`);

  console.log("Done. Files written to data/v1/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});