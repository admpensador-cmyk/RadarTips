#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ApiFootballClient } from "./api-football-client.mjs";
import { PREMIER_LEAGUE_V1, buildPremierLeagueV1Snapshot, enforceLeagueV1StatisticsContract } from "./lib/league-v1-snapshot.mjs";

const KEY =
  (process.env.APIFOOTBALL_KEY && String(process.env.APIFOOTBALL_KEY).trim()) ||
  (process.env.API_FOOTBALL_KEY && String(process.env.API_FOOTBALL_KEY).trim()) ||
  "";

if (!KEY) {
  console.error("Missing API key. Set APIFOOTBALL_KEY (or API_FOOTBALL_KEY).");
  process.exit(1);
}

const api = new ApiFootballClient({
  apiKey: KEY,
  minIntervalMs: Number.parseInt(process.env.APIFOOTBALL_MIN_INTERVAL_MS || "6500", 10) || 6500,
  retries: 2
});

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "v1", "leagues");
const OUT_FILE = path.join(OUT_DIR, `${PREMIER_LEAGUE_V1.slug}.json`);

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

async function resolvePremierSeason() {
  const json = await api.get("/leagues", { id: PREMIER_LEAGUE_V1.leagueId });
  const response = Array.isArray(json?.response) ? json.response : [];
  if (!response.length) {
    throw new Error(`League ${PREMIER_LEAGUE_V1.leagueId} not found via /leagues`);
  }
  const season = pickSeasonFromLeagueResponse(response[0]);
  if (!Number.isFinite(season)) {
    throw new Error(`Unable to resolve season for league ${PREMIER_LEAGUE_V1.leagueId}`);
  }
  return season;
}

async function main() {
  const season = await resolvePremierSeason();
  console.log(`Generating official ${PREMIER_LEAGUE_V1.defaultName} snapshot for season ${season}...`);

  const [standingsPayload, fixturesPayload] = await Promise.all([
    api.get("/standings", { league: PREMIER_LEAGUE_V1.leagueId, season }),
    api.get("/fixtures", { league: PREMIER_LEAGUE_V1.leagueId, season, timezone: "UTC" })
  ]);

  const snapshot = enforceLeagueV1StatisticsContract(buildPremierLeagueV1Snapshot({
    standingsPayload,
    fixturesPayload,
    generatedAtUtc: new Date().toISOString()
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`Saved: ${OUT_FILE}`);
  console.log(`Standings rows: ${snapshot.standings.length}`);
  console.log(`Fixtures upcoming: ${snapshot.fixtures.upcoming.length}`);
  console.log(`Fixtures recent: ${snapshot.fixtures.recent.length}`);
  console.log(`Matches counted in summary: ${snapshot.summary.matches_count}`);
}

main().catch((err) => {
  console.error("[FATAL] generate-league-v1-snapshot failed:", err?.message || err);
  process.exit(1);
});
