#!/usr/bin/env node
/**
 * Preview-only end-to-end pilot: Brasileirão Série A (API-Football league id 71).
 * - Fetches: /leagues, /standings, /fixtures (UTC), /fixtures/statistics + /fixtures/events per finished match — NO /teams/statistics
 * - Statistics: ONLY from finished fixtures (FT, AET, PEN) via league-fixtures-model
 * - Snapshot: buildLeagueV1SnapshotFromTeamAggregates (fixture_derived_v1)
 * - Writes:
 *   - data/preview/brasileirao/competition.json
 *   - data/preview/brasileirao/team-stats.json
 *   - data/preview/brasileirao/profile-finished-matches.json (real fixtures only; Team Profile)
 *   - data/v1/leagues/brasileirao.json
 *
 * Does NOT upload to R2 (use tools/upload-preview-brasileirao.mjs with preview prefix + confirm).
 * Does NOT touch production buckets or prod/ keys.
 *
 * API key resolution (first match wins; shell always wins):
 *   1) process.env.APIFOOTBALL_KEY or process.env.API_FOOTBALL_KEY (already set in shell)
 *   2) merge repo-root .env.local (gitignored; optional shared secrets)
 *   3) merge .env.preview + .env.preview.local (preview app env)
 *   4) merge .env.development + .env.development.local (common local dev key)
 * Never loads .env.production* from this script.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ApiFootballClient } from "./api-football-client.mjs";
import { mergeRadartipsEnvLayer, mergeRadartipsEnvFile, repoRoot } from "./load-radartips-env.mjs";
import {
  buildAllTeamAggregates,
  buildAllTeamFacts,
  buildFixtureEventsRecord,
  buildFixtureStatsRecord,
  ensureAggregatesCoverStandings,
  filterFinishedFixturesWithScores
} from "./lib/league-fixtures-model.mjs";
import {
  assertProfileFinishedMatchesVsStandings,
  buildProfileFinishedMatchesDocument
} from "./lib/profile-finished-matches-build.mjs";
import {
  getLeaguePageDefinitionBySlug,
  buildLeagueV1SnapshotFromTeamAggregates
} from "./lib/league-v1-snapshot.mjs";
import { mapTeamsToPreviewContract } from "./lib/preview-brasileirao-team-stats-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PILOT_SLUG = "brasileirao";
const PILOT_LEAGUE_ID = 71;
const MIN_STANDINGS_ROWS = 15;
const MIN_TEAM_STATS_RATIO = 0.75;

function resolveApiKey() {
  return (
    (process.env.APIFOOTBALL_KEY && String(process.env.APIFOOTBALL_KEY).trim()) ||
    (process.env.API_FOOTBALL_KEY && String(process.env.API_FOOTBALL_KEY).trim()) ||
    ""
  );
}

function pickSeasonFromLeagueResponse(entry) {
  const seasons = Array.isArray(entry?.seasons) ? entry.seasons : [];
  const current = seasons.find((season) => season?.current === true);
  if (Number.isFinite(Number(current?.year))) return Number(current.year);
  const latest = seasons
    .map((season) => Number(season?.year))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a)[0];
  return Number.isFinite(latest) ? latest : null;
}

async function fetchAllFixturesForLeagueSeason(api, { league_id, season }) {
  const json = await api.get("/fixtures", {
    league: league_id,
    season,
    timezone: "UTC"
  });
  const response = Array.isArray(json?.response) ? json.response : [];
  if (response.length > 0) return response;

  const fallbackRequests = [
    { league: league_id, season, last: 380, timezone: "UTC" },
    { league: league_id, season, next: 50, timezone: "UTC" }
  ];
  const merged = [];
  const seen = new Set();
  for (const params of fallbackRequests) {
    const j = await api.get("/fixtures", params);
    const entries = Array.isArray(j?.response) ? j.response : [];
    for (const entry of entries) {
      const id = Number(entry?.fixture?.id);
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      merged.push(entry);
    }
  }
  return merged;
}

/**
 * Per-finished-fixture /fixtures/statistics (Corner Kicks; both sides required per fact in model).
 */
async function fetchFixtureStatsMapStrict(api, rawFixtures) {
  const map = {};
  const list = Array.isArray(rawFixtures) ? rawFixtures : [];
  let n = 0;
  for (const raw of list) {
    n += 1;
    const json = await api.get("/fixtures/statistics", { fixture: raw.fixture_id });
    if (!json || typeof json !== "object") {
      throw new Error(`[PREVIEW-BR] Invalid /fixtures/statistics payload for fixture_id=${raw.fixture_id}`);
    }
    const response = Array.isArray(json?.response) ? json.response : [];
    map[String(raw.fixture_id)] = buildFixtureStatsRecord(
      raw.fixture_id,
      raw.home_id,
      raw.away_id,
      response
    );
    if (n % 25 === 0 || n === list.length) {
      console.log(`[PREVIEW-BR] /fixtures/statistics progress ${n}/${list.length}`);
    }
  }
  return map;
}

/**
 * Per-finished-fixture /fixtures/events (not /teams/statistics). Fail-closed on HTTP/parse errors.
 * Returns card aggregates for league-fixtures-model + raw event arrays for Team Profile control flags.
 */
async function fetchFixtureEventsDataStrict(api, rawFixtures) {
  const cardsMap = {};
  const rawByFixtureId = {};
  const list = Array.isArray(rawFixtures) ? rawFixtures : [];
  let n = 0;
  for (const raw of list) {
    n += 1;
    const json = await api.get("/fixtures/events", { fixture: raw.fixture_id });
    if (!json || typeof json !== "object") {
      throw new Error(`[PREVIEW-BR] Invalid /fixtures/events payload for fixture_id=${raw.fixture_id}`);
    }
    const response = Array.isArray(json?.response) ? json.response : [];
    const key = String(raw.fixture_id);
    rawByFixtureId[key] = response;
    cardsMap[key] = buildFixtureEventsRecord(raw.fixture_id, raw.home_id, raw.away_id, response);
    if (n % 25 === 0 || n === list.length) {
      console.log(`[PREVIEW-BR] /fixtures/events progress ${n}/${list.length}`);
    }
  }
  return { cardsMap, rawByFixtureId };
}

function assertIsoUtc(s) {
  const t = Date.parse(String(s || ""));
  if (!Number.isFinite(t)) throw new Error(`[PREVIEW-BR] Invalid ISO datetime: ${String(s)}`);
}

/** Fail-closed: never allow corners_for set without corners_against (or vice versa). */
function assertCornerFactsStrict(allFacts) {
  for (const f of Array.isArray(allFacts) ? allFacts : []) {
    const a = f?.corners_for;
    const b = f?.corners_against;
    const na = a == null;
    const nb = b == null;
    if (na !== nb) {
      throw new Error(
        `[PREVIEW-BR] FAIL-CLOSED: partial corners on fact team_id=${f?.team_id} fixture_id=${f?.fixture_id}`
      );
    }
  }
}

/** Fail-closed: goalkeeper_saves and opponent SoG faced must both be set or both null. */
function assertGoalkeeperFactsStrict(allFacts) {
  for (const f of Array.isArray(allFacts) ? allFacts : []) {
    const s = f?.goalkeeper_saves;
    const sog = f?.goalkeeper_shots_on_goal_faced;
    const ns = s == null;
    const nsog = sog == null;
    if (ns !== nsog) {
      throw new Error(
        `[PREVIEW-BR] FAIL-CLOSED: partial goalkeeper stats on fact team_id=${f?.team_id} fixture_id=${f?.fixture_id}`
      );
    }
  }
}

function validatePilotSnapshot(snapshot, season) {
  const compId = Number(snapshot?.competition?.competition_id);
  if (compId !== PILOT_LEAGUE_ID) {
    throw new Error(`[PREVIEW-BR] Wrong competition_id (expected ${PILOT_LEAGUE_ID}, got ${compId})`);
  }
  const seasonStr = String(snapshot?.competition?.season || snapshot?.meta?.source?.season || "").trim();
  if (!seasonStr || String(season) !== seasonStr) {
    throw new Error(`[PREVIEW-BR] Season mismatch (resolved=${season} snapshot=${seasonStr})`);
  }
  const gen = String(snapshot?.meta?.generated_at_utc || "").trim();
  if (!gen) throw new Error("[PREVIEW-BR] Missing meta.generated_at_utc");
  assertIsoUtc(gen);

  const model = String(snapshot?.meta?.source?.model || "").trim();
  if (model !== "fixture_derived_v1") {
    throw new Error(`[PREVIEW-BR] Expected meta.source.model fixture_derived_v1, got ${model || "(empty)"}`);
  }
  const resources = Array.isArray(snapshot?.meta?.source?.resources)
    ? snapshot.meta.source.resources.map((r) => String(r || "").trim())
    : [];
  if (resources.includes("/teams/statistics")) {
    throw new Error("[PREVIEW-BR] FAIL-CLOSED: snapshot lists /teams/statistics — not allowed for Brasileirão pilot");
  }

  const standings = Array.isArray(snapshot?.standings) ? snapshot.standings : [];
  if (standings.length < MIN_STANDINGS_ROWS) {
    throw new Error(`[PREVIEW-BR] Standings too small (${standings.length} < ${MIN_STANDINGS_ROWS})`);
  }

  const teams = Array.isArray(snapshot?.statistics?.teams) ? snapshot.statistics.teams : [];
  if (resources.includes("/fixtures/events")) {
    for (const t of teams) {
      const pl = Number(t?.played);
      if (pl > 0 && (t?.discipline == null || t.discipline?.total == null)) {
        throw new Error(
          `[PREVIEW-BR] FAIL-CLOSED: /fixtures/events used but team "${String(t?.team || "")}" (played=${pl}) lacks discipline.total`
        );
      }
    }
  }
  const withPlayed = teams.filter((t) => Number(t?.played) > 0);
  const ratio = teams.length ? withPlayed.length / teams.length : 0;
  if (ratio < MIN_TEAM_STATS_RATIO) {
    throw new Error(
      `[PREVIEW-BR] Too few teams with finished-fixture data (${(ratio * 100).toFixed(0)}% < ${MIN_TEAM_STATS_RATIO * 100}%)`
    );
  }

  const allFx = [
    ...(Array.isArray(snapshot?.fixtures?.finished) ? snapshot.fixtures.finished : []),
    ...(Array.isArray(snapshot?.fixtures?.upcoming) ? snapshot.fixtures.upcoming : [])
  ];
  const ids = new Set();
  for (const fx of allFx) {
    const id = Number(fx?.fixture_id ?? fx?.id);
    if (!Number.isFinite(id)) throw new Error("[PREVIEW-BR] Fixture missing id");
    if (ids.has(id)) throw new Error(`[PREVIEW-BR] Duplicate fixture_id=${id}`);
    ids.add(id);
    const ko = fx?.kickoff_utc || fx?.date_utc;
    if (ko) assertIsoUtc(ko);
  }
}

function loadEnvForPreviewPilot() {
  mergeRadartipsEnvFile(path.join(repoRoot, ".env.local"));
  mergeRadartipsEnvLayer("preview");
  mergeRadartipsEnvLayer("development");
}

async function main() {
  loadEnvForPreviewPilot();
  const key = resolveApiKey();
  if (!key) {
    console.error(
      "[PREVIEW-BR] Missing APIFOOTBALL_KEY (or API_FOOTBALL_KEY).\n" +
        "  Tried: shell env, then .env.local, then .env.preview / .env.preview.local, then .env.development / .env.development.local.\n" +
        "  This script does not load .env.production*."
    );
    process.exit(1);
  }

  const leagueDefinition = getLeaguePageDefinitionBySlug(PILOT_SLUG);
  if (!leagueDefinition || leagueDefinition.leagueId !== PILOT_LEAGUE_ID) {
    throw new Error("[PREVIEW-BR] brasileirao definition missing or wrong leagueId");
  }

  const api = new ApiFootballClient({
    apiKey: key,
    minIntervalMs: Number.parseInt(process.env.APIFOOTBALL_MIN_INTERVAL_MS || "6500", 10) || 6500,
    retries: 2
  });

  const leaguesJson = await api.get("/leagues", { id: PILOT_LEAGUE_ID });
  const response = Array.isArray(leaguesJson?.response) ? leaguesJson.response : [];
  if (!response.length) throw new Error(`[PREVIEW-BR] /leagues returned empty for id=${PILOT_LEAGUE_ID}`);
  const season = pickSeasonFromLeagueResponse(response[0]);
  if (!Number.isFinite(season)) throw new Error("[PREVIEW-BR] Could not resolve current season");

  console.log(`[PREVIEW-BR] Pilot league_id=${PILOT_LEAGUE_ID} season=${season} (Brasileirão Série A)`);

  const standingsPayload = await api.get("/standings", { league: PILOT_LEAGUE_ID, season });
  if (!Array.isArray(standingsPayload?.response) || !standingsPayload.response.length) {
    throw new Error("[PREVIEW-BR] Empty /standings");
  }

  const allSeasonFixturesRaw = await fetchAllFixturesForLeagueSeason(api, {
    league_id: PILOT_LEAGUE_ID,
    season
  });

  const rawFinished = filterFinishedFixturesWithScores(allSeasonFixturesRaw, PILOT_LEAGUE_ID, season);
  if (rawFinished.length === 0) {
    throw new Error("[PREVIEW-BR] No finished fixtures (FT/AET/PEN) with scores — cannot build fixture-derived stats");
  }

  console.log(`[PREVIEW-BR] Fetching /fixtures/statistics for ${rawFinished.length} finished fixtures…`);
  const statsMap = await fetchFixtureStatsMapStrict(api, rawFinished);
  console.log(`[PREVIEW-BR] Fetching /fixtures/events for ${rawFinished.length} finished fixtures…`);
  const eventsData = await fetchFixtureEventsDataStrict(api, rawFinished);
  const allFacts = buildAllTeamFacts(rawFinished, statsMap, eventsData.cardsMap);
  assertCornerFactsStrict(allFacts);
  let teamAggregates = buildAllTeamAggregates(allFacts, PILOT_LEAGUE_ID, season);
  teamAggregates = ensureAggregatesCoverStandings(teamAggregates, standingsPayload, PILOT_LEAGUE_ID, season);

  const generatedAtUtc = new Date().toISOString();
  const snapshot = buildLeagueV1SnapshotFromTeamAggregates({
    leagueDefinition,
    teamAggregates,
    standingsPayload,
    allSeasonFixtures: allSeasonFixturesRaw,
    generatedAtUtc,
    apiFootballResources: ["/standings", "/fixtures", "/fixtures/statistics", "/fixtures/events"]
  });

  validatePilotSnapshot(snapshot, season);

  const profileFinishedDoc = buildProfileFinishedMatchesDocument({
    leagueId: PILOT_LEAGUE_ID,
    season,
    generatedAtUtc: snapshot.meta.generated_at_utc,
    allFacts,
    rawFixtures: rawFinished,
    rawEventsByFixtureId: eventsData.rawByFixtureId,
    standingsRows: snapshot.standings
  });
  assertProfileFinishedMatchesVsStandings(profileFinishedDoc, snapshot.standings);

  const outDir = path.join(ROOT, "data", "preview", "brasileirao");
  fs.mkdirSync(outDir, { recursive: true });

  const competitionDoc = {
    meta: {
      generated_at_utc: snapshot.meta.generated_at_utc,
      schema: "preview_brasileirao_competition_v1",
      league_id: PILOT_LEAGUE_ID,
      season: String(season),
      pipeline: "preview-only",
      source: snapshot.meta.source
    },
    competition: snapshot.competition,
    teams: snapshot.standings.map((r) => ({
      team_id: r.team_id,
      team: r.team,
      position: r.position
    })),
    standings: snapshot.standings,
    fixtures: snapshot.fixtures
  };

  const teamStatsDoc = {
    meta: {
      generated_at_utc: snapshot.meta.generated_at_utc,
      schema: "preview_brasileirao_team_stats_v6",
      league_id: PILOT_LEAGUE_ID,
      season: String(season),
      pipeline: "preview-only",
      source: snapshot.meta.source
    },
    league_summary: snapshot.statistics.league,
    summary: snapshot.summary,
    teams: mapTeamsToPreviewContract(snapshot.statistics.teams),
    home_away_splits: snapshot.statistics.home_away_splits,
    team_rankings: snapshot.statistics.team_rankings
  };

  fs.writeFileSync(path.join(outDir, "competition.json"), JSON.stringify(competitionDoc, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "team-stats.json"), JSON.stringify(teamStatsDoc, null, 2), "utf8");
  fs.writeFileSync(
    path.join(outDir, "profile-finished-matches.json"),
    JSON.stringify(profileFinishedDoc, null, 2) + "\n",
    "utf8"
  );

  const leagueCanonical = path.join(ROOT, "data", "v1", "leagues");
  fs.mkdirSync(leagueCanonical, { recursive: true });
  fs.writeFileSync(path.join(leagueCanonical, "brasileirao.json"), JSON.stringify(snapshot, null, 2), "utf8");

  const teamsCount = snapshot.standings.length;
  const statsTeams = snapshot.statistics.teams.length;
  const fxUp = snapshot.fixtures.upcoming.length;
  const fxRec = snapshot.fixtures.recent.length;

  console.log("\n[PREVIEW-BR] OK (fixture-derived stats only)");
  console.log(`  finished fixtures used: ${rawFinished.length}`);
  console.log(`  generated_at_utc: ${snapshot.meta.generated_at_utc}`);
  console.log(`  standings (teams): ${teamsCount}`);
  console.log(`  statistics.teams: ${statsTeams}`);
  const fxFin = Array.isArray(snapshot.fixtures.finished) ? snapshot.fixtures.finished.length : 0;
  console.log(`  fixtures finished (analytics): ${fxFin} upcoming: ${fxUp} recent (display): ${fxRec}`);
  console.log(`  wrote: data/preview/brasileirao/competition.json`);
  console.log(`  wrote: data/preview/brasileirao/team-stats.json`);
  console.log(`  wrote: data/preview/brasileirao/profile-finished-matches.json`);
  console.log(`  wrote: data/v1/leagues/brasileirao.json`);
}

main().catch((err) => {
  console.error("[PREVIEW-BR] FATAL:", err?.message || err);
  process.exit(1);
});
