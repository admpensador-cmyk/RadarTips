#!/usr/bin/env node
/**
 * Update Competition Standings + Stats
 * Fetches standings and aggregated stats from API-Football v3
 * 
 * Usage:
 *   node tools/update-competition-extras.mjs --leagueId 39 --season 2025 --outDir data/v1 --limitFixtures 120 --concurrency 5
 * 
 * Env:
 *   APIFOOTBALL_KEY: API-Football v3 key
 * 
 * Outputs:
 *   - data/v1/standings_<leagueId>_<season>.json
 *   - data/v1/compstats_<leagueId>_<season>.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY;
const APIFOOTBALL_BASE = 'https://v3.football.api-sports.io';

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    leagueId: null,
    season: null,
    outDir: path.join(ROOT, 'data', 'v1'),
    limitFixtures: 120,
    concurrency: 5,
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];

    if (key === '--leagueId') config.leagueId = val;
    else if (key === '--season') config.season = val;
    else if (key === '--outDir') config.outDir = val;
    else if (key === '--limitFixtures') config.limitFixtures = parseInt(val, 10);
    else if (key === '--concurrency') config.concurrency = parseInt(val, 10);
  }

  return config;
}

// Simple Promise pool for concurrency control
class PromisePool {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  async run(fn) {
    while (this.running >= this.concurrency) {
      await new Promise(resolve => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}

// Fetch with retry (2 retries on 429/5xx)
async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'x-apisports-key': APIFOOTBALL_KEY,
          'Accept': 'application/json',
          ...options.headers,
        },
      });

      if (res.ok) {
        return await res.json();
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const delay = (attempt + 1) * 800;
          console.warn(`  ⚠️  Status ${res.status}, retry in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === retries) throw e;
      const delay = (attempt + 1) * 800;
      console.warn(`  ⚠️  Fetch failed: ${e.message}, retry in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Fetch standings from API-Football
async function fetchStandings(leagueId, season) {
  console.log(`📊 Fetching standings for league=${leagueId}, season=${season}...`);
  const url = `${APIFOOTBALL_BASE}/standings?league=${leagueId}&season=${season}`;
  const data = await fetchWithRetry(url);

  if (!data || !data.response || data.response.length === 0) {
    console.warn('  ⚠️  No standings data found');
    return null;
  }

  // Normalize: API returns response[0].league.standings as nested array
  const leagueData = data.response[0];
  const league = leagueData?.league || {};
  const standings = (leagueData?.league?.standings || [])[0] || [];

  return {
    league: {
      id: league.id,
      name: league.name,
      country: league.country,
      season: league.season,
      logo: league.logo,
      flag: league.flag,
    },
    generated_at_utc: new Date().toISOString(),
    standings,
  };
}

// Fetch fixtures for a league
async function fetchFixtures(leagueId, season, limit = 120) {
  console.log(`📋 Fetching fixtures for league=${leagueId}, season=${season} (limit=${limit})...`);
  const url = `${APIFOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}&status=FT`;
  let allFixtures = [];
  let page = 1;
  const pageSize = 100;

  while (allFixtures.length < limit) {
    try {
      const data = await fetchWithRetry(`${url}&page=${page}`);
      if (!data || !data.response) break;

      allFixtures.push(...data.response);
      if (data.response.length < pageSize) break;
      page++;
    } catch (e) {
      console.warn(`  ⚠️  Error fetching page ${page}:`, e.message);
      break;
    }
  }

  // Sort by date descending (most recent first) and limit
  allFixtures = allFixtures
    .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
    .slice(0, limit);

  console.log(`  ✓ Got ${allFixtures.length} fixtures`);
  return allFixtures;
}

// Fetch statistics for a specific fixture
async function fetchFixtureStats(fixtureId) {
  const url = `${APIFOOTBALL_BASE}/fixtures/statistics?fixture=${fixtureId}`;
  try {
    const data = await fetchWithRetry(url);
    return data?.response || null;
  } catch (e) {
    console.warn(`  ⚠️  Failed to fetch stats for fixture ${fixtureId}:`, e.message);
    return null;
  }
}

// Extract metric value from stats array
function extractStat(stats, teamSide, statName) {
  if (!Array.isArray(stats)) return null;
  const stat = stats.find(s => s.type === statName);
  if (!stat) return null;
  const val = stat.value;
  if (val === null || val === undefined) return null;
  // Handle percentage strings (e.g., "55%")
  if (typeof val === 'string' && val.endsWith('%')) {
    return parseFloat(val);
  }
  return typeof val === 'string' ? parseFloat(val) : val;
}

// Aggregate stats from fixtures
async function aggregateStats(fixtures, pool) {
  console.log(`📈 Aggregating stats from ${fixtures.length} fixtures...`);

  const fixtures_total = fixtures.length;
  let fixtures_with_stats = 0;
  let finals_used = 0;

  const metrics = {
    goals: [],
    btts: [],
    over25: [],
    shots: [],
    sot: [],
    corners: [],
    cards: [],
    possession: [],
    xg: [],
  };

  // Fetch stats for each fixture (with concurrency)
  let processed = 0;
  for (const fixture of fixtures) {
    await pool.run(async () => {
      const stats = await fetchFixtureStats(fixture.fixture.id);
      if (!stats || stats.length === 0) return;

      try {
        const homeStats = stats[0];
        const awayStats = stats[1];

        if (!homeStats || !awayStats) return;

        fixtures_with_stats++;

        // Goals (use goals from fixture)
        const goalsHome = fixture.goals.home;
        const goalsAway = fixture.goals.away;
        if (goalsHome !== null && goalsAway !== null) {
          metrics.goals.push(goalsHome + goalsAway);
          finals_used++;

          // BTTS
          if (goalsHome > 0 && goalsAway > 0) metrics.btts.push(1);
          else metrics.btts.push(0);

          // Over 2.5
          if (goalsHome + goalsAway > 2.5) metrics.over25.push(1);
          else metrics.over25.push(0);
        }

        // Shots (search for "Total Shots" or sum on-target stats)
        const shotsHome = extractStat(homeStats.statistics, 'home', 'Shots on Goal');
        const shotsAway = extractStat(awayStats.statistics, 'away', 'Shots on Goal');
        if (shotsHome !== null && shotsAway !== null) {
          metrics.shots.push((shotsHome || 0) + (shotsAway || 0));
        }

        // Shots on Target (SOT)
        const sotHome = extractStat(homeStats.statistics, 'home', 'Shots on Goal');
        const sotAway = extractStat(awayStats.statistics, 'away', 'Shots on Goal');
        if (sotHome !== null && sotAway !== null) {
          metrics.sot.push((sotHome || 0) + (sotAway || 0));
        }

        // Corners
        const cornHome = extractStat(homeStats.statistics, 'home', 'Corner Kicks');
        const cornAway = extractStat(awayStats.statistics, 'away', 'Corner Kicks');
        if (cornHome !== null && cornAway !== null) {
          metrics.corners.push((cornHome || 0) + (cornAway || 0));
        }

        // Cards (Yellow + Red)
        const yCards = (extractStat(homeStats.statistics, 'home', 'Yellow Cards') || 0) +
                      (extractStat(awayStats.statistics, 'away', 'Yellow Cards') || 0);
        const rCards = (extractStat(homeStats.statistics, 'home', 'Red Cards') || 0) +
                      (extractStat(awayStats.statistics, 'away', 'Red Cards') || 0);
        metrics.cards.push(yCards + rCards);

        // Possession (convert "55%" to 55)
        const posHome = extractStat(homeStats.statistics, 'home', 'Ball Possession');
        const posAway = extractStat(awayStats.statistics, 'away', 'Ball Possession');
        if (posHome !== null && posAway !== null) {
          metrics.possession.push((posHome + posAway) / 2);
        }

        // xG (Expected Goals)
        const xgHome = extractStat(homeStats.statistics, 'home', 'Expected Goals (xG)');
        const xgAway = extractStat(awayStats.statistics, 'away', 'Expected Goals (xG)');
        if (xgHome !== null && xgAway !== null) {
          metrics.xg.push(xgHome + xgAway);
        }
      } catch (e) {
        console.warn(`  ⚠️  Error processing fixture ${fixture.fixture.id}:`, e.message);
      }

      processed++;
      if (processed % 10 === 0) {
        console.log(`  ... processed ${processed}/${fixtures.length}`);
      }
    });
  }

  console.log(`  ✓ Processed ${processed} fixtures, got stats from ${fixtures_with_stats}`);

  // Calculate averages
  const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const pct = (arr) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) : null;

  return {
    sample: {
      fixtures_total,
      fixtures_used: fixtures.length,
      fixtures_with_stats,
      finals_used,
    },
    metrics: {
      goals_avg: avg(metrics.goals),
      btts_pct: pct(metrics.btts),
      over25_pct: pct(metrics.over25),
      shots_avg: avg(metrics.shots),
      sot_avg: avg(metrics.sot),
      corners_avg: avg(metrics.corners),
      cards_avg: avg(metrics.cards),
      possession_avg: avg(metrics.possession),
      xg_avg: avg(metrics.xg),
    },
  };
}

// Save JSON file
function saveJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Main
async function main() {
  const config = parseArgs();

  if (!config.leagueId || !config.season) {
    console.error('❌ Usage: node update-competition-extras.mjs --leagueId <id> --season <year>');
    process.exit(1);
  }

  if (!APIFOOTBALL_KEY) {
    console.error('❌ Error: APIFOOTBALL_KEY env var not set');
    process.exit(1);
  }

  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 📊 Competition Standings + Stats Generator   ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  console.log(`⚙️  Config:`);
  console.log(`  leagueId: ${config.leagueId}`);
  console.log(`  season: ${config.season}`);
  console.log(`  outDir: ${config.outDir}`);
  console.log(`  limitFixtures: ${config.limitFixtures}`);
  console.log(`  concurrency: ${config.concurrency}\n`);

  try {
    // Fetch standings
    const standings = await fetchStandings(config.leagueId, config.season);
    if (!standings) {
      console.error('❌ Failed to fetch standings');
      process.exit(1);
    }

    // Save standings
    const standingsFile = path.join(config.outDir, `standings_${config.leagueId}_${config.season}.json`);
    saveJSON(standingsFile, standings);
    console.log(`✅ Standings saved: ${standingsFile}\n`);

    // Fetch fixtures
    const fixtures = await fetchFixtures(config.leagueId, config.season, config.limitFixtures);
    if (fixtures.length === 0) {
      console.error('❌ No fixtures found');
      process.exit(1);
    }

    // Aggregate stats
    const pool = new PromisePool(config.concurrency);
    const aggStats = await aggregateStats(fixtures, pool);

    // Prepare compstats output
    const leagueInfo = standings.league;
    const compStats = {
      league: leagueInfo,
      generated_at_utc: new Date().toISOString(),
      ...aggStats,
    };

    // Save compstats
    const compStatsFile = path.join(config.outDir, `compstats_${config.leagueId}_${config.season}.json`);
    saveJSON(compStatsFile, compStats);
    console.log(`✅ Competition stats saved: ${compStatsFile}\n`);

    console.log(`✅ Done!\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
