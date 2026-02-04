#!/usr/bin/env node
/**
 * RadarTips data generator (API-FOOTBALL / API-SPORTS)
 *
 * Generates:
 *  - data/v1/calendar_7d.json  (matches[])
 *  - data/v1/radar_day.json    (items[])
 *  - data/v1/radar_week.json   (items[])
 *
 * Workflow runs:
 *  node tools/update-data-api-football.mjs --mode=daily
 *
 * Env:
 *  APIFOOTBALL_KEY (required)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API_BASE = "https://v3.football.api-sports.io";

const OUT_DIR = path.join(process.cwd(), "data", "v1");
const OUT_CAL = path.join(OUT_DIR, "calendar_7d.json");
const OUT_DAY = path.join(OUT_DIR, "radar_day.json");
const OUT_WEEK = path.join(OUT_DIR, "radar_week.json");

const CONFIG_PATH = path.join(process.cwd(), "tools", "api-football.config.json");

const MODE = (() => {
  const idx = process.argv.indexOf("--mode");
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]).trim();
  const kv = process.argv.find((a) => a.startsWith("--mode="));
  if (kv) return kv.split("=", 2)[1]?.trim() || "";
  return "daily";
})();

const KEY = (process.env.APIFOOTBALL_KEY || "").trim();
if (!KEY) {
  console.error("Missing APIFOOTBALL_KEY");
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function nowIso() {
  return new Date().toISOString();
}

function startOfDayUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
function addDaysUtc(d, days) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
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

function meta(extra = {}) {
  return {
    generated_at_utc: nowIso(),
    mode: MODE,
    source: "api-football",
    version: 3,
    ...extra
  };
}

function seasonFromRule(rule, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1..12

  if (rule === "calendar_year") return y;

  // Season starts around Aug (8). If Jan-Jul => previous year season.
  if (rule === "europe_split") return m >= 8 ? y : y - 1;

  return y;
}

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function apiGet(pathname, params = {}) {
  const url = new URL(API_BASE + pathname);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": KEY }
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${txt}`.slice(0, 800));
  }

  return res.json();
}

/**
 * Resolve league.id by searching /leagues and then selecting best match by country/type/name.
 * config item supports:
 *  { search, country, type, season_rule }
 * or { id, season_rule }
 */
async function resolveLeague(configItem) {
  const now = new Date();
  const season = seasonFromRule(configItem.season_rule || "calendar_year", now);

  if (configItem.id) {
    return {
      league_id: Number(configItem.id),
      season,
      label: `${configItem.search || configItem.id}`
    };
  }

  const search = String(configItem.search || "").trim();
  if (!search) return null;

  const json = await apiGet("/leagues", { search });
  const resp = Array.isArray(json?.response) ? json.response : [];

  const wantCountry = norm(configItem.country || "");
  const wantType = norm(configItem.type || "");

  const candidates = resp
    .map((x) => ({
      league_id: x?.league?.id,
      league_name: x?.league?.name,
      league_type: x?.league?.type,
      country_name: x?.country?.name || x?.league?.country || ""
    }))
    .filter((c) => Number.isFinite(Number(c.league_id)));

  if (!candidates.length) {
    console.log(`WARN resolveLeague: no candidates for "${search}"`);
    return null;
  }

  // Filter by country/type when provided
  let pool = candidates.filter((c) => {
    const okCountry = !wantCountry || norm(c.country_name) === wantCountry;
    const okType = !wantType || norm(c.league_type) === wantType;
    return okCountry && okType;
  });

  if (!pool.length) pool = candidates;

  // Prefer exact-ish name match
  const wantName = norm(search);
  pool.sort((a, b) => {
    const an = norm(a.league_name);
    const bn = norm(b.league_name);
    const as = an === wantName ? 0 : an.includes(wantName) ? 1 : 2;
    const bs = bn === wantName ? 0 : bn.includes(wantName) ? 1 : 2;
    return as - bs;
  });

  const pick = pool[0];
  return {
    league_id: Number(pick.league_id),
    season,
    label: pick.league_name
  };
}

async function fetchFixturesByLeague({ league_id, season, from, to, timezone }) {
  const out = [];
  let page = 1;

  while (true) {
    const json = await apiGet("/fixtures", {
      league: league_id,
      season,
      from,
      to,
      timezone,
      page
    });

    const resp = Array.isArray(json?.response) ? json.response : [];
    out.push(...resp);

    const paging = json?.paging || {};
    const cur = Number(paging.current || page);
    const total = Number(paging.total || cur);

    if (cur >= total) break;
    page = cur + 1;

    if (page > 60) break; // safety
  }

  return out;
}

function mapFixtureToCalendar(fx) {
  const fixture = fx?.fixture || {};
  const league = fx?.league || {};
  const teams = fx?.teams || {};
  const status = fixture?.status || {};

  return {
    fixture_id: fixture?.id ?? null,
    kickoff_utc: toIso(fixture?.date),
    country: league?.country ?? null,
    competition: league?.name ?? null,
    competition_id: league?.id ?? null,
    season: league?.season ?? null,
    round: league?.round ?? null,
    home: { id: teams?.home?.id ?? null, name: teams?.home?.name ?? null },
    away: { id: teams?.away?.id ?? null, name: teams?.away?.name ?? null },
    status_short: status?.short ?? null,
    status_long: status?.long ?? null
  };
}

function sortByKickoff(arr) {
  return [...arr].sort((a, b) => {
    const ta = Date.parse(a?.kickoff_utc || "") || 0;
    const tb = Date.parse(b?.kickoff_utc || "") || 0;
    return ta - tb;
  });
}

function chooseDayItems(matches) {
  const now = Date.now();
  const horizon = now + 36 * 60 * 60 * 1000;
  const items = [];

  for (const m of matches) {
    const t = Date.parse(m?.kickoff_utc || "");
    if (!Number.isFinite(t)) continue;
    if (t >= now - 3 * 60 * 60 * 1000 && t <= horizon) items.push(m);
  }

  return sortByKickoff(items);
}

function chooseWeekItems(matches) {
  // keep all, but cap per day to avoid massive DOM
  const by = new Map();
  for (const m of matches) {
    const d = (m?.kickoff_utc || "unknown").slice(0, 10);
    if (!by.has(d)) by.set(d, []);
    by.get(d).push(m);
  }

  const days = [...by.keys()].sort();
  const out = [];
  for (const d of days) {
    const ms = sortByKickoff(by.get(d));
    out.push(...ms.slice(0, 60)); // cap/day (ajuste se quiser)
  }
  return out;
}

async function buildCalendarFromConfig(cfg) {
  const daysAhead = Number(cfg?.days_ahead ?? 7);
  const timezone = String(cfg?.timezone || "America/Sao_Paulo");
  const leagues = Array.isArray(cfg?.leagues) ? cfg.leagues : [];

  if (!leagues.length) throw new Error("Config has no leagues[]");

  const start = startOfDayUtc(new Date());
  const end = addDaysUtc(start, daysAhead);

  const from = isoDateOnlyUTC(start);
  const to = isoDateOnlyUTC(end);

  // Resolve league IDs
  const resolved = [];
  for (const item of leagues) {
    const r = await resolveLeague(item);
    if (r?.league_id) resolved.push(r);
  }

  if (!resolved.length) throw new Error("Could not resolve any leagues from config.");

  // Fetch fixtures per league
  const allFixtures = [];
  for (const r of resolved) {
    try {
      const fx = await fetchFixturesByLeague({
        league_id: r.league_id,
        season: r.season,
        from,
        to,
        timezone
      });
      console.log(`OK league ${r.league_id} season ${r.season} :: ${fx.length} fixtures :: ${r.label}`);
      allFixtures.push(...fx);
    } catch (e) {
      console.log(`WARN league ${r.league_id} failed :: ${r.label} :: ${e?.message || String(e)}`);
    }
  }

  const mapped = allFixtures.map(mapFixtureToCalendar);

  // Dedup by fixture_id
  const byId = new Map();
  for (const m of mapped) {
    const id = m?.fixture_id;
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, m);
  }

  const matches = sortByKickoff([...byId.values()]);

  return {
    meta: meta({
      range: { from, to },
      timezone,
      leagues_resolved: resolved.length
    }),
    matches
  };
}

async function main() {
  ensureDir(OUT_DIR);

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config file: ${CONFIG_PATH}`);
  }

  const cfg = readJson(CONFIG_PATH);

  const calendar = await buildCalendarFromConfig(cfg);

  const radarDay = { meta: meta({ derived_from: "calendar_7d" }), items: chooseDayItems(calendar.matches) };
  const radarWeek = { meta: meta({ derived_from: "calendar_7d" }), items: chooseWeekItems(calendar.matches) };

  writeJsonAtomic(OUT_CAL, calendar);
  writeJsonAtomic(OUT_DAY, radarDay);
  writeJsonAtomic(OUT_WEEK, radarWeek);

  console.log(`Wrote: ${path.relative(process.cwd(), OUT_CAL)} (${calendar.matches.length})`);
  console.log(`Wrote: ${path.relative(process.cwd(), OUT_DAY)} (${radarDay.items.length})`);
  console.log(`Wrote: ${path.relative(process.cwd(), OUT_WEEK)} (${radarWeek.items.length})`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
