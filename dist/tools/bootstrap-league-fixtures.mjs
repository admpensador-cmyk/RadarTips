#!/usr/bin/env node
/**
 * tools/bootstrap-league-fixtures.mjs
 *
 * Prédio 2 — Bootstrap Engine for League Pages (Premier League only)
 *
 * PURPOSE:
 *   Bootstraps the 4-layer persistent storage for a fixed league by fetching
 *   all finished fixtures from API-Football, optionally enriching with
 *   per-fixture statistics (corners, cards, shots), and generating all
 *   intermediate layers up to the final serving snapshot.
 *
 * STORAGE LAYOUT:
 *   data/v1/leagues/{slug}/meta.json              — bootstrap metadata
 *   data/v1/leagues/{slug}/raw-fixtures.json      — Layer 1: finished fixtures
 *   data/v1/leagues/{slug}/fixture-stats.json     — Layer 1+: per-fixture stats (optional)
 *   data/v1/leagues/{slug}/raw-events.json        — Layer 1.5: per-fixture events fallback (optional)
 *   data/v1/leagues/{slug}/team-facts.json        — Layer 2: per-fixture team records
 *   data/v1/leagues/{slug}/team-aggregates.json   — Layer 3: per-team aggregates
 *   data/v1/leagues/{slug}.json                   — Layer 4: serving snapshot
 *
 * USAGE:
 *   node tools/bootstrap-league-fixtures.mjs [options]
 *
 * OPTIONS:
 *   --league-id=39          League ID (default: 39 = Premier League)
 *   --season=2025           Season year (default: current)
 *   --skip-fixture-stats    Skip /fixtures/statistics calls (save quota, corners/cards = null)
 *   --skip-fixture-events   Skip /fixtures/events fallback for cards when stats are missing
 *   --resume                Re-use existing raw-fixtures.json, only fetch missing stats
 *   --dry-run               Show quota estimate without hitting the API
 *   --limit=N               Only process first N finished fixtures (for testing)
 *
 * QUOTA:
 *   Without --skip-fixture-stats:  1 (leagues) + 1 (fixtures) + N (fixture/stats) + 1 (standings) req
 *   With    --skip-fixture-stats:  1 (leagues) + 1 (fixtures) + 1 (standings) = 3 req
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { ApiFootballClient } from "./api-football-client.mjs";
import { PREMIER_LEAGUE_V1, LEAGUE_PAGE_V1_DEFINITIONS } from "./lib/league-v1-snapshot.mjs";
import {
  buildRawFixtureRecord,
  buildFixtureStatsRecord,
  buildFixtureEventsRecord,
  buildAllTeamFacts,
  buildAllTeamAggregates,
  buildScopedTeamAggregates
} from "./lib/league-fixtures-model.mjs";
import { buildLeagueV1SnapshotFromTeamAggregates, assertLeaguePageSnapshotHasCoreData } from "./lib/league-v1-snapshot.mjs";

// ---------------------------------------------------------------------------
// Config & setup
// ---------------------------------------------------------------------------

const KEY =
  (process.env.APIFOOTBALL_KEY && String(process.env.APIFOOTBALL_KEY).trim()) ||
  (process.env.API_FOOTBALL_KEY && String(process.env.API_FOOTBALL_KEY).trim()) ||
  "";

const flags = parseBootstrapArgs();

if (!KEY && !flags.dryRun) {
  console.error("[FATAL] Missing API key. Set APIFOOTBALL_KEY (or API_FOOTBALL_KEY).");
  process.exit(1);
}

const MIN_INTERVAL_MS =
  Number.parseInt(process.env.APIFOOTBALL_MIN_INTERVAL_MS || "6500", 10) || 6500;

// api client created in main() to allow --dry-run without a key
let api = null;

const ROOT = process.cwd();
const LEAGUES_DIR = path.join(ROOT, "data", "v1", "leagues");

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseBootstrapArgs() {
  const args = process.argv.slice(2);
  const flags = {
    leagueId: 39,
    season: null,
    skipFixtureStats: false,
    skipFixtureEvents: false,
    resume: false,
    dryRun: false,
    limit: null
  };

  for (const arg of args) {
    if (arg.startsWith("--league-id=")) flags.leagueId = Number(arg.split("=")[1]);
    if (arg.startsWith("--season=")) flags.season = Number(arg.split("=")[1]);
    if (arg === "--skip-fixture-stats") flags.skipFixtureStats = true;
    if (arg === "--skip-fixture-events") flags.skipFixtureEvents = true;
    if (arg === "--resume") flags.resume = true;
    if (arg === "--dry-run") flags.dryRun = true;
    if (arg.startsWith("--limit=")) flags.limit = Number(arg.split("=")[1]);
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Quota instrumentation
// ---------------------------------------------------------------------------

const QUOTA = {
  startTime: Date.now(),
  stages: [],
  totalRequests: 0,
  byEndpoint: new Map(),

  // Stage timing
  stageStart: null,
  stageName: null,

  beginStage(name) {
    if (this.stageName) this.endStage();
    this.stageName = name;
    this.stageStart = Date.now();
    console.log(`\n[STAGE] ${name} starting...`);
  },

  endStage() {
    if (!this.stageName) return;
    const elapsed = Date.now() - this.stageStart;
    this.stages.push({ name: this.stageName, elapsed_ms: elapsed });
    console.log(`[STAGE] ${this.stageName} done (${(elapsed / 1000).toFixed(1)}s)`);
    this.stageName = null;
    this.stageStart = null;
  },

  trackRequest(endpoint) {
    this.totalRequests++;
    const prev = this.byEndpoint.get(endpoint) || 0;
    this.byEndpoint.set(endpoint, prev + 1);
  },

  report(fixtureCount) {
    this.endStage();
    const totalMs = Date.now() - this.startTime;
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  QUOTA & PERFORMANCE REPORT");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Total wall time      : ${(totalMs / 1000).toFixed(1)}s`);
    console.log(`  Total API requests   : ${this.totalRequests}`);
    console.log("");
    console.log("  Requests by endpoint:");
    for (const [ep, count] of Array.from(this.byEndpoint.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ep.padEnd(30)} : ${count}`);
    }
    console.log("");
    if (fixtureCount > 0) {
      const statsRequests = this.byEndpoint.get("/fixtures/statistics") || 0;
      const eventsRequests = this.byEndpoint.get("/fixtures/events") || 0;
      const fixturesRequests = this.byEndpoint.get("/fixtures") || 0;
      const standingsRequests = this.byEndpoint.get("/standings") || 0;
      console.log(`  Finished fixtures    : ${fixtureCount}`);
      if (statsRequests > 0) {
        console.log(`  Req / fixture (stats): ${(statsRequests / fixtureCount).toFixed(2)}`);
      }
      if (eventsRequests > 0) {
        console.log(`  Req / fixture (events): ${(eventsRequests / fixtureCount).toFixed(2)}`);
      }
      const totalPerFixture = (statsRequests + eventsRequests) / fixtureCount;
      console.log(`  Req / fixture (detail total): ${totalPerFixture.toFixed(2)}`);

      console.log("  Endpoint totals (measured):");
      console.log(`    /fixtures            : ${fixturesRequests}`);
      console.log(`    /fixtures/statistics : ${statsRequests}`);
      console.log(`    /fixtures/events     : ${eventsRequests}`);
      console.log(`    /standings           : ${standingsRequests}`);

      const costWithoutStats = 3; // leagues + fixtures + standings
      const costWithStats = costWithoutStats + statsRequests + eventsRequests;
      console.log(`  Bootstrap cost (no stats)   : ${costWithoutStats} requests`);
      console.log(`  Bootstrap cost (with stats)  : ${costWithStats} requests`);
      console.log(`  Incremental baseline cost    : ~2 requests (standings + fixtures)`);
      console.log(`  Incremental detailed cost    : ~1 request per new fixture (statistics) + optional events fallback`);
      console.log("");
      console.log("  Projection for 6 leagues:");
      console.log(`    No stats : ${costWithoutStats * 6} requests (one-time bootstrap)`);
      console.log(`    With stats: ~${(costWithStats + 300 * 5).toLocaleString()} requests (varies by league)`);
      console.log(`    Daily incremental: ~${2 * 6} requests total`);
    }
    for (const stage of this.stages) {
      console.log(`  Stage [${stage.name}]: ${(stage.elapsed_ms / 1000).toFixed(1)}s`);
    }
    console.log("═══════════════════════════════════════════════════\n");
  }
};

async function apiGet(endpoint, params = {}) {
  QUOTA.trackRequest(endpoint);
  return api.get(endpoint, params);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJsonAtomic(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
  console.log(`  [WRITE] ${filePath.replace(ROOT, ".")}`);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function pickSeasonFromLeagueResponse(entry) {
  const seasons = Array.isArray(entry?.seasons) ? entry.seasons : [];
  const current = seasons.find((s) => s?.current === true);
  if (Number.isFinite(Number(current?.year))) return Number(current.year);
  const years = seasons.map((s) => Number(s?.year)).filter((n) => Number.isFinite(n));
  return years.length ? Math.max(...years) : null;
}

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

function isFinished(statusShort) {
  return FINISHED_STATUSES.has(String(statusShort || "").trim().toUpperCase());
}

// ---------------------------------------------------------------------------
// Stage 1 — Resolve league and season
// ---------------------------------------------------------------------------

async function resolveLeagueAndSeason(leagueId, overrideSeason) {
  if (Number.isFinite(overrideSeason)) return overrideSeason;

  const json = await apiGet("/leagues", { id: leagueId });
  const resp = Array.isArray(json?.response) ? json.response : [];
  if (!resp.length) throw new Error(`League ${leagueId} not found via /leagues`);
  const season = pickSeasonFromLeagueResponse(resp[0]);
  if (!Number.isFinite(season)) throw new Error(`Unable to resolve season for league ${leagueId}`);
  return season;
}

// ---------------------------------------------------------------------------
// Stage 2 — Fetch finished fixtures
// ---------------------------------------------------------------------------

async function fetchFinishedFixtures(leagueId, season, competitionId) {
  console.log(`  Fetching /fixtures?league=${leagueId}&season=${season}&status=FT...`);
  const json = await apiGet("/fixtures", { league: leagueId, season, status: "FT" });
  const response = Array.isArray(json?.response) ? json.response : [];
  console.log(`  API returned ${response.length} finished-status fixtures`);

  const raw = response
    .map((item) => buildRawFixtureRecord(item, competitionId, season))
    .filter((r) => r !== null && isFinished(r.status) && r.home_goals !== null && r.away_goals !== null);

  console.log(`  Valid finished fixtures with goals: ${raw.length}`);
  return raw;
}

// ---------------------------------------------------------------------------
// Stage 3 — Fetch per-fixture statistics (corners, cards, shots)
// ---------------------------------------------------------------------------

async function fetchFixtureStats(rawFixtures, existingStatsMap, limit) {
  const statsMap = { ...existingStatsMap };
  const pending = rawFixtures.filter((r) => !statsMap[String(r.fixture_id)]);
  const toFetch = limit ? pending.slice(0, limit) : pending;
  const skipped = pending.length - toFetch.length;

  console.log(`  Fixture stats: ${Object.keys(statsMap).length} cached, ${toFetch.length} to fetch${skipped ? `, ${skipped} skipped (limit)` : ""}`);

  let fetched = 0;
  let failed = 0;

  for (const raw of toFetch) {
    try {
      const json = await apiGet("/fixtures/statistics", { fixture: raw.fixture_id });
      const response = Array.isArray(json?.response) ? json.response : [];
      if (response.length > 0) {
        const record = buildFixtureStatsRecord(raw.fixture_id, raw.home_id, raw.away_id, response);
        statsMap[String(raw.fixture_id)] = record;
        fetched++;
      } else {
        // No stats available for this fixture (some older or cup fixtures)
        statsMap[String(raw.fixture_id)] = { fixture_id: raw.fixture_id, unavailable: true };
        fetched++;
      }

      if (fetched % 50 === 0) {
        console.log(`  ... ${fetched}/${toFetch.length} fixture stats fetched`);
      }
    } catch (err) {
      console.warn(`  [WARN] fixture_stats failed for fixture_id=${raw.fixture_id}: ${err?.message}`);
      failed++;
    }
  }

  console.log(`  Fixture stats: ${fetched} fetched, ${failed} failed`);
  return statsMap;
}

async function fetchFixtureEvents(rawFixtures, existingEventsMap, fixtureStatsMap, limit) {
  const eventsMap = { ...existingEventsMap };
  const fallbackFixtures = rawFixtures.filter((raw) => {
    if (eventsMap[String(raw.fixture_id)]) return false;
    const stats = fixtureStatsMap[String(raw.fixture_id)];
    if (!stats || stats.unavailable) return true;
    const homeHasCards = stats?.home && (stats.home.yellow_cards !== null || stats.home.red_cards !== null);
    const awayHasCards = stats?.away && (stats.away.yellow_cards !== null || stats.away.red_cards !== null);
    return !(homeHasCards && awayHasCards);
  });

  const toFetch = limit ? fallbackFixtures.slice(0, limit) : fallbackFixtures;
  const skipped = fallbackFixtures.length - toFetch.length;

  console.log(`  Fixture events fallback: ${Object.keys(eventsMap).length} cached, ${toFetch.length} to fetch${skipped ? `, ${skipped} skipped (limit)` : ""}`);

  let fetched = 0;
  let failed = 0;
  for (const raw of toFetch) {
    try {
      const json = await apiGet("/fixtures/events", { fixture: raw.fixture_id });
      const response = Array.isArray(json?.response) ? json.response : [];
      const record = buildFixtureEventsRecord(raw.fixture_id, raw.home_id, raw.away_id, response);
      eventsMap[String(raw.fixture_id)] = record;
      fetched++;
      if (fetched % 50 === 0) {
        console.log(`  ... ${fetched}/${toFetch.length} fixture events fetched`);
      }
    } catch (err) {
      console.warn(`  [WARN] fixture_events failed for fixture_id=${raw.fixture_id}: ${err?.message}`);
      failed++;
    }
  }

  console.log(`  Fixture events: ${fetched} fetched, ${failed} failed`);
  return eventsMap;
}

// ---------------------------------------------------------------------------
// Stage 4 — Fetch standings
// ---------------------------------------------------------------------------

async function fetchStandings(leagueId, season) {
  console.log(`  Fetching /standings?league=${leagueId}&season=${season}...`);
  const json = await apiGet("/standings", { league: leagueId, season });
  const resp = Array.isArray(json?.response) ? json.response : [];
  if (!resp.length) throw new Error(`No standings for league_id=${leagueId} season=${season}`);
  return json;
}

// ---------------------------------------------------------------------------
// Stage 5 — Fetch all season fixtures for upcoming/recent display
// ---------------------------------------------------------------------------

async function fetchAllSeasonFixtures(leagueId, season) {
  console.log(`  Fetching /fixtures?league=${leagueId}&season=${season} (all)...`);
  const json = await apiGet("/fixtures", { league: leagueId, season });
  const response = Array.isArray(json?.response) ? json.response : [];
  console.log(`  All-season fixtures: ${response.length}`);
  return response;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // flags already parsed at module level to allow early dry-run without API key

  // Initialise API client (needed for all non-dry-run stages)
  if (!flags.dryRun) {
    api = new ApiFootballClient({ apiKey: KEY, minIntervalMs: MIN_INTERVAL_MS, retries: 2 });
  }

  const leagueDefinition = LEAGUE_PAGE_V1_DEFINITIONS.find((d) => d.leagueId === flags.leagueId);
  if (!leagueDefinition) {
    console.error(`[FATAL] League ID ${flags.leagueId} not in LEAGUE_PAGE_V1_DEFINITIONS`);
    process.exit(1);
  }

  const slug = leagueDefinition.slug;
  const leagueDataDir = path.join(LEAGUES_DIR, slug);
  const paths = {
    meta: path.join(leagueDataDir, "meta.json"),
    rawFixtures: path.join(leagueDataDir, "raw-fixtures.json"),
    fixtureStats: path.join(leagueDataDir, "fixture-stats.json"),
    rawEvents: path.join(leagueDataDir, "raw-events.json"),
    teamFacts: path.join(leagueDataDir, "team-facts.json"),
    teamAggregates: path.join(leagueDataDir, "team-aggregates.json"),
    snapshot: path.join(LEAGUES_DIR, `${slug}.json`)
  };

  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║  Prédio 2 — League Fixtures Bootstrap                 ║");
  console.log("╚═══════════════════════════════════════════════════════╝");
  console.log(`  League      : ${leagueDefinition.defaultName} (id=${flags.leagueId})`);
  console.log(`  Season      : ${flags.season || "auto-resolve"}`);
  console.log(`  Options     : skip-fixture-stats=${flags.skipFixtureStats} skip-fixture-events=${flags.skipFixtureEvents} resume=${flags.resume} dry-run=${flags.dryRun} limit=${flags.limit || "none"}`);
  console.log(`  API interval: ${MIN_INTERVAL_MS}ms`);

  if (flags.dryRun) {
    const existingRaw = readJsonIfExists(paths.rawFixtures);
    const fixtureCount = existingRaw?.fixtures?.length ?? "unknown (run without --resume first)";
    console.log("\n[DRY RUN] Quota estimate:");
    console.log(`  Stage 1 (leagues)   : 1 request`);
    console.log(`  Stage 2 (fixtures)  : 1 request`);
    console.log(`  Stage 3 (fix.stats) : ~${typeof fixtureCount === "number" ? fixtureCount : "?"} requests (skipped with --skip-fixture-stats)`);
    console.log(`  Stage 4 (standings) : 1 request`);
    console.log(`  Stage 5 (all fx)    : 1 request`);
    console.log(`  TOTAL without stats : 3-4 requests`);
    console.log(`  TOTAL with stats    : ${typeof fixtureCount === "number" ? fixtureCount + 4 : "?"} requests`);
    process.exit(0);
  }

  ensureDir(leagueDataDir);

  // ── Stage 1: Resolve season ─────────────────────────────────────────────
  QUOTA.beginStage("1-resolve-season");
  const season = await resolveLeagueAndSeason(flags.leagueId, flags.season);
  console.log(`  Resolved season: ${season}`);

  // ── Stage 2: Raw fixtures ───────────────────────────────────────────────
  QUOTA.beginStage("2-raw-fixtures");
  let rawFixtures;
  if (flags.resume && fs.existsSync(paths.rawFixtures)) {
    const stored = JSON.parse(fs.readFileSync(paths.rawFixtures, "utf-8"));
    rawFixtures = stored.fixtures;
    console.log(`  Loaded ${rawFixtures.length} raw fixtures from cache (--resume)`);
  } else {
    rawFixtures = await fetchFinishedFixtures(flags.leagueId, season, flags.leagueId);
    if (flags.limit) rawFixtures = rawFixtures.slice(0, flags.limit);

    writeJsonAtomic(paths.rawFixtures, {
      meta: {
        league_id: flags.leagueId,
        season,
        bootstrapped_at_utc: new Date().toISOString(),
        fixture_count: rawFixtures.length,
        status_filter: "FT"
      },
      fixtures: rawFixtures
    });
  }

  console.log(`  [LAYER 1] ${rawFixtures.length} finished fixtures ready`);

  // ── Stage 3: Fixture stats (optional) ──────────────────────────────────
  QUOTA.beginStage("3-fixture-stats");
  let fixtureStatsMap = {};
  let fixtureEventsMap = {};

  if (flags.skipFixtureStats) {
    console.log("  Skipped (--skip-fixture-stats). Corners/cards/shots will be null.");
  } else {
    const existingStatsFile = readJsonIfExists(paths.fixtureStats);
    const existingMap = existingStatsFile?.stats || {};

    fixtureStatsMap = await fetchFixtureStats(rawFixtures, existingMap, flags.limit);

    const validStats = Object.values(fixtureStatsMap).filter((s) => !s.unavailable).length;
    const unavailable = Object.values(fixtureStatsMap).filter((s) => s.unavailable).length;

    writeJsonAtomic(paths.fixtureStats, {
      meta: {
        league_id: flags.leagueId,
        season,
        stats_fetched_at_utc: new Date().toISOString(),
        stats_count: validStats,
        unavailable_count: unavailable,
        total_checked: Object.keys(fixtureStatsMap).length
      },
      stats: fixtureStatsMap
    });

    console.log(`  [LAYER 1+] Fixture stats: ${validStats} valid, ${unavailable} unavailable`);
  }

  if (flags.skipFixtureEvents) {
    console.log("  Skipped (--skip-fixture-events). Card fallback from events is disabled.");
  } else {
    const existingEventsFile = readJsonIfExists(paths.rawEvents);
    const existingEventsMap = existingEventsFile?.events || {};
    fixtureEventsMap = await fetchFixtureEvents(rawFixtures, existingEventsMap, fixtureStatsMap, flags.limit);

    writeJsonAtomic(paths.rawEvents, {
      meta: {
        league_id: flags.leagueId,
        season,
        events_fetched_at_utc: new Date().toISOString(),
        events_count: Object.keys(fixtureEventsMap).length,
        mode: "fallback_for_missing_cards"
      },
      events: fixtureEventsMap
    });

    console.log(`  [LAYER 1.5] Fixture events fallback: ${Object.keys(fixtureEventsMap).length} records`);
  }

  // ── Stage 4: Team facts ──────────────────────────────────────────────────
  QUOTA.beginStage("4-team-facts");

  // Strip unavailable markers from stats map before building facts
  const cleanStatsMap = {};
  for (const [fid, rec] of Object.entries(fixtureStatsMap)) {
    if (!rec.unavailable) cleanStatsMap[fid] = rec;
  }

  const allFacts = buildAllTeamFacts(rawFixtures, cleanStatsMap, fixtureEventsMap);
  const hasStats = Object.keys(cleanStatsMap).length > 0;

  writeJsonAtomic(paths.teamFacts, {
    meta: {
      league_id: flags.leagueId,
      season,
      generated_at_utc: new Date().toISOString(),
      fact_count: allFacts.length,
      fixture_count: rawFixtures.length,
      has_advanced_stats: hasStats
    },
    facts: allFacts
  });

  console.log(`  [LAYER 2] ${allFacts.length} team facts (2 per fixture)`);

  // ── Stage 5: Team aggregates ─────────────────────────────────────────────
  QUOTA.beginStage("5-team-aggregates");
  const competitionAggregates = buildAllTeamAggregates(allFacts, flags.leagueId, season);
  const scopedAggregates = buildScopedTeamAggregates(allFacts, season);
  const teamCount = Object.keys(competitionAggregates).length;

  writeJsonAtomic(paths.teamAggregates, {
    meta: {
      league_id: flags.leagueId,
      season,
      generated_at_utc: new Date().toISOString(),
      team_count: teamCount,
      fixture_count: rawFixtures.length,
      has_advanced_stats: hasStats
    },
    teams: competitionAggregates,
    scopes: scopedAggregates
  });

  console.log(`  [LAYER 3] ${teamCount} team aggregates with total/home/away splits`);

  // Quick validation sample
  const sampleTeam = Object.values(competitionAggregates)[0];
  if (sampleTeam) {
    const t = sampleTeam.total;
    console.log(`  Sample: ${sampleTeam.team_name} played=${t.played} gf=${t.goals_for} ga=${t.goals_against}`);
    console.log(`          btts_pct=${t.btts_pct} clean_sheets_pct=${t.clean_sheets_pct} over_25_pct=${t.over_25_pct}`);
    if (t.corners_for_avg !== null) {
      console.log(`          corners_for_avg=${t.corners_for_avg} yellow_cards_for_avg=${t.yellow_cards_for_avg}`);
    }
  }

  // ── Stage 6: Standings + all fixtures ────────────────────────────────────
  QUOTA.beginStage("6-standings-and-all-fixtures");
  const [standingsPayload, allSeasonFixtures] = await Promise.all([
    fetchStandings(flags.leagueId, season),
    fetchAllSeasonFixtures(flags.leagueId, season)
  ]);

  // ── Stage 7: Build league snapshot ───────────────────────────────────────
  QUOTA.beginStage("7-build-snapshot");
  const generatedAtUtc = new Date().toISOString();

  const snapshot = buildLeagueV1SnapshotFromTeamAggregates({
    leagueDefinition,
    teamAggregates: competitionAggregates,
    standingsPayload,
    allSeasonFixtures,
    generatedAtUtc
  });

  assertLeaguePageSnapshotHasCoreData(snapshot);

  writeJsonAtomic(paths.snapshot, snapshot);

  // Summary validation
  const stats = snapshot.statistics.league;
  const teams = snapshot.statistics.teams;
  console.log("\n  ── Snapshot validation ───────────────────────────────");
  console.log(`  standings       : ${snapshot.standings.length} rows`);
  console.log(`  statistics.teams: ${teams.length} teams`);
  console.log(`  matches_count   : ${stats.matches_count}`);
  console.log(`  goals_per_game  : ${stats.goals_per_game}`);
  console.log(`  btts_pct        : ${stats.btts_pct}`);
  console.log(`  over_25_pct     : ${stats.over_25_pct}`);
  console.log(`  clean_sheets_pct: ${stats.clean_sheets_pct}`);
  console.log(`  failed_to_score : ${stats.failed_to_score_pct}`);
  console.log(`  home BTTS split : ${snapshot.statistics.home_away_splits?.home?.btts_pct}`);
  console.log(`  away OV25 split : ${snapshot.statistics.home_away_splits?.away?.over_25_pct}`);

  const sampleTeamInSnap = teams[0];
  if (sampleTeamInSnap) {
    console.log(`\n  Team[0]: ${sampleTeamInSnap.team}`);
    console.log(`    btts_pct=        ${sampleTeamInSnap.btts_pct}`);
    console.log(`    over_25_pct=     ${sampleTeamInSnap.over_25_pct}`);
    console.log(`    clean_sheets_pct=${sampleTeamInSnap.clean_sheets_pct}`);
    console.log(`    home.btts_pct=   ${sampleTeamInSnap.home?.btts_pct}`);
    console.log(`    away.btts_pct=   ${sampleTeamInSnap.away?.btts_pct}`);
    if (sampleTeamInSnap.corners_for_avg != null) {
      console.log(`    corners_for_avg= ${sampleTeamInSnap.corners_for_avg}`);
    }
  }

  // ── Write meta ────────────────────────────────────────────────────────────
  writeJsonAtomic(paths.meta, {
    league_id: flags.leagueId,
    slug,
    season,
    bootstrapped_at_utc: generatedAtUtc,
    fixture_count: rawFixtures.length,
    team_count: teamCount,
    had_fixture_stats: hasStats && !flags.skipFixtureStats,
    total_api_requests: QUOTA.totalRequests
  });

  // ── Quota report ──────────────────────────────────────────────────────────
  QUOTA.report(rawFixtures.length);

  console.log(`[DONE] ${leagueDefinition.defaultName} bootstrap complete.`);
  console.log(`       Layer 4 snapshot: ${paths.snapshot.replace(ROOT, ".")}`);
}

main().catch((err) => {
  console.error("\n[FATAL] bootstrap-league-fixtures failed:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
