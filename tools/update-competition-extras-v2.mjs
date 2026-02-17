#!/usr/bin/env node
/**
 * Update Competition Standings + Stats V2
 * 
 * ARQUITETURA LIMPA:
 * - Resolve season via /leagues (determinístico)
 * - Verifica coverage.standings e type
 * - Gera standings (league) ou cup structure (copa)
 * - Registra dataStatus, seasonSource, coverage
 * - Zero hard-code, zero tentativa cega
 * 
 * Usage:
 *   node tools/update-competition-extras-v2.mjs --leagueId 39 --season 2025 --outDir data/v1 --concurrency 5
 *   node tools/update-competition-extras-v2.mjs --leagueId 40 --outDir data/v1
 * 
 * Env:
 *   APIFOOTBALL_KEY: API-Football v3 key
 * 
 * Outputs:
 *   - data/v1/standings_<leagueId>_<season>.json (se league)
 *   - data/v1/cup_<leagueId>_<season>.json (se cup)
 *   - data/v1/compstats_<leagueId>_<season>.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSeasonForLeague } from './lib/season-from-leagues.mjs';
import { apiGetJson } from './lib/api-football.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY;

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    leagueId: null,
    season: null, // opcional - será resolvido via /leagues se não fornecido
    kickoffUTC: null, // opcional - ajuda na resolução de season
    outDir: path.join(ROOT, 'data', 'v1'),
    concurrency: 5,
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];

    if (key === '--leagueId') config.leagueId = val;
    else if (key === '--season') config.season = val;
    else if (key === '--kickoffUTC') config.kickoffUTC = val;
    else if (key === '--outDir') config.outDir = val;
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

// Fetch standings from API-Football
async function fetchStandings(leagueId, season) {
  console.log(`\n📊 Fetching standings for league=${leagueId}, season=${season}...`);
  
  try {
    const response = await apiGetJson(`/standings?league=${leagueId}&season=${season}`);

    if (!Array.isArray(response) || response.length === 0) {
      console.warn('  ⚠️  No standings data found');
      return null;
    }

    // Normalize: API returns response[0].league.standings as nested array
    const leagueData = response[0];
    const league = leagueData || {};
    const allStandings = leagueData?.standings || [];
    
    // Choose the most consistent group (where all teams have similar number of games)
    let bestGroup = allStandings[0] || [];
    if (allStandings.length > 1) {
      // Calculate consistency score for each group (lower variance = more consistent)
      const groupScores = allStandings.map(group => {
        if (!Array.isArray(group) || group.length === 0) return { group, variance: Infinity };
        const games = group.map(t => t.all?.played || 0);
        const avg = games.reduce((a, b) => a + b, 0) / games.length;
        const variance = games.reduce((sum, g) => sum + Math.pow(g - avg, 2), 0) / games.length;
        return { group, variance, avg };
      });
      
      // Sort by variance (ascending) then by avg games (descending)
      groupScores.sort((a, b) => (a.variance - b.variance) || (b.avg - a.avg));
      bestGroup = groupScores[0].group;
      console.log(`  ℹ️  Found ${allStandings.length} groups, using most consistent (variance: ${groupScores[0].variance.toFixed(2)}, avg games: ${groupScores[0].avg.toFixed(1)})`);
    }
    
    const standings = bestGroup;

    return {
      leagueInfo: {
        id: league.id,
        name: league.name,
        country: league.country,
        season: league.season,
        logo: league.logo,
        flag: league.flag,
      },
      standings,
    };
  } catch (error) {
    console.error(`  ❌ Error fetching standings: ${error.message}`);
    throw error;
  }
}

// Build cup structure from fixtures
async function buildCupStructure(leagueId, season, leagueInfo) {
  console.log(`\n🏆 Building cup structure for league=${leagueId}, season=${season}...`);
  
  try {
    const fixtures = await apiGetJson(`/fixtures?league=${leagueId}&season=${season}`);
    
    if (!Array.isArray(fixtures)) {
      console.warn('  ⚠️  No fixtures found');
      return { rounds: [] };
    }

    // Group by round
    const roundsMap = new Map();
    fixtures.forEach(fix => {
      const roundName = fix.league?.round || 'Unknown';
      if (!roundsMap.has(roundName)) {
        roundsMap.set(roundName, []);
      }
      roundsMap.get(roundName).push(fix);
    });

    // Convert to array
    const rounds = Array.from(roundsMap.entries()).map(([name, fixtures]) => ({
      name,
      fixtures: fixtures.map(f => ({
        id: f.fixture?.id,
        date: f.fixture?.date,
        status: f.fixture?.status,
        home: {
          id: f.teams?.home?.id,
          name: f.teams?.home?.name,
          logo: f.teams?.home?.logo,
          score: f.goals?.home
        },
        away: {
          id: f.teams?.away?.id,
          name: f.teams?.away?.name,
          logo: f.teams?.away?.logo,
          score: f.goals?.away
        }
      }))
    }));

    console.log(`  ✓ Built structure with ${rounds.length} rounds, ${fixtures.length} fixtures`);

    return { rounds };
  } catch (error) {
    console.error(`  ❌ Error building cup structure: ${error.message}`);
    throw error;
  }
}

// Fetch fixtures for a league
async function fetchFixtures(leagueId, season) {
  console.log(`\n📋 Fetching ALL fixtures for league=${leagueId}, season=${season}...`);
  
  try {
    const allFixtures = await apiGetJson(`/fixtures?league=${leagueId}&season=${season}`);

    if (!Array.isArray(allFixtures)) {
      console.warn('  ⚠️  No fixtures found');
      return [];
    }

    // Sort by date descending (most recent first)
    const sorted = allFixtures.sort((a, b) => 
      new Date(b.fixture?.date || 0) - new Date(a.fixture?.date || 0)
    );

    console.log(`  ✓ Got ${sorted.length} fixtures for entire season`);
    return sorted;
  } catch (error) {
    console.warn(`  ⚠️  Error fetching fixtures: ${error.message}`);
    return [];
  }
}

// Fetch statistics for a specific fixture
async function fetchFixtureStats(fixtureId) {
  try {
    const stats = await apiGetJson(`/fixtures/statistics?fixture=${fixtureId}`);
    return Array.isArray(stats) ? stats : null;
  } catch (e) {
    console.warn(`  ⚠️  Failed to fetch stats for fixture ${fixtureId}: ${e.message}`);
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
  console.log(`\n📈 Aggregating stats from ${fixtures.length} fixtures...`);

  const fixtures_total = fixtures.length;
  let fixtures_finished = 0;
  let fixtures_with_stats = 0;

  const finishedStatuses = new Set(['FT', 'AET', 'PEN']);

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
      const status = fixture?.fixture?.status?.short;
      const fixtureId = fixture?.fixture?.id;
      
      if (!finishedStatuses.has(status)) {
        processed++;
        return;
      }

      fixtures_finished++;
      
      let stats = null;
      try {
        stats = await fetchFixtureStats(fixtureId);
      } catch (e) {
        processed++;
        return;
      }
      
      if (!stats || stats.length === 0) {
        processed++;
        return;
      }

      try {
        const homeStats = stats[0];
        const awayStats = stats[1];

        if (!homeStats || !awayStats) return;

        fixtures_with_stats++;

        // Goals (use goals from fixture)
        const goalsHome = fixture.goals?.home;
        const goalsAway = fixture.goals?.away;
        if (goalsHome !== null && goalsAway !== null) {
          metrics.goals.push(goalsHome + goalsAway);

          // BTTS
          if (goalsHome > 0 && goalsAway > 0) metrics.btts.push(1);
          else metrics.btts.push(0);

          // Over 2.5
          if (goalsHome + goalsAway > 2.5) metrics.over25.push(1);
          else metrics.over25.push(0);
        }

        // Shots on Goal
        const shotsHome = extractStat(homeStats.statistics, 'home', 'Shots on Goal');
        const shotsAway = extractStat(awayStats.statistics, 'away', 'Shots on Goal');
        if (shotsHome !== null && shotsAway !== null) {
          metrics.shots.push((shotsHome || 0) + (shotsAway || 0));
          metrics.sot.push((shotsHome || 0) + (shotsAway || 0));
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

        // Possession
        const posHome = extractStat(homeStats.statistics, 'home', 'Ball Possession');
        const posAway = extractStat(awayStats.statistics, 'away', 'Ball Possession');
        if (posHome !== null && posAway !== null) {
          metrics.possession.push((posHome + posAway) / 2);
        }

        // xG (Expected Goals)
        const xgHome = extractStat(homeStats.statistics, 'home', 'expected_goals');
        const xgAway = extractStat(awayStats.statistics, 'away', 'expected_goals');
        if (xgHome !== null && xgAway !== null) {
          metrics.xg.push(xgHome + xgAway);
        }
      } catch (e) {
        console.warn(`  ⚠️  Error processing fixture ${fixture.fixture?.id}: ${e.message}`);
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
      fixtures_finished,
      fixtures_used: fixtures.length,
      fixtures_with_stats,
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

  if (!config.leagueId) {
    console.error('❌ Usage: node update-competition-extras-v2.mjs --leagueId <id> [--season <year>] [--kickoffUTC <iso>]');
    process.exit(1);
  }

  if (!APIFOOTBALL_KEY) {
    console.error('❌ Error: APIFOOTBALL_KEY env var not set');
    process.exit(1);
  }

  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 📊 Competition Extras Generator V2            ║`);
  console.log(`║    Season Resolution via /leagues API         ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  try {
    // ========================================================================
    // PASSO 1: RESOLVER SEASON VIA /leagues (DETERMINÍSTICO)
    // ========================================================================
    console.log(`🔍 Resolving season for leagueId=${config.leagueId}...\n`);
    
    const { year, reason, coverage, leagueMeta } = await resolveSeasonForLeague({
      leagueId: Number(config.leagueId),
      kickoffUTC: config.kickoffUTC,
    });

    const chosenSeason = config.season ? Number(config.season) : year;

    console.log(`\n📋 Season Resolution:`);
    console.log(`   leagueId: ${config.leagueId}`);
    console.log(`   leagueName: ${leagueMeta.name}`);
    console.log(`   country: ${leagueMeta.country}`);
    console.log(`   type: ${leagueMeta.type}`);
    console.log(`   chosenSeason: ${chosenSeason}`);
    console.log(`   seasonSource: ${config.season ? 'explicit' : reason}`);
    console.log(`   coverage.standings: ${coverage.standings}`);
    console.log(`   coverage.fixtures: ${coverage.fixtures}`);
    console.log(`   coverage.events: ${coverage.events}`);
    console.log(`   coverage.statistics: ${coverage.statistics}\n`);

    // ========================================================================
    // PASSO 2: DECIDIR TIPO DE GERAÇÃO (LEAGUE vs CUP)
    // ========================================================================
    let dataStatus = 'ok';
    let standingsData = null;
    let cupData = null;
    let leagueInfo = null;

    const isCup = leagueMeta.type === 'cup' || coverage.standings === false;

    if (isCup) {
      console.log(`🏆 Competition type: CUP (coverage.standings=${coverage.standings})`);
      console.log(`   → Generating cup structure instead of standings...\n`);
      
      leagueInfo = {
        id: Number(config.leagueId),
        name: leagueMeta.name,
        country: leagueMeta.country,
        type: leagueMeta.type,
      };

      cupData = await buildCupStructure(config.leagueId, chosenSeason, leagueInfo);
      dataStatus = 'not-supported'; // standings não aplicável para copa
      
    } else {
      console.log(`📊 Competition type: LEAGUE (coverage.standings=${coverage.standings})`);
      console.log(`   → Generating standings...\n`);
      
      standingsData = await fetchStandings(config.leagueId, chosenSeason);
      
      if (!standingsData || !standingsData.standings || standingsData.standings.length === 0) {
        console.warn(`⚠️  Standings returned empty array`);
        dataStatus = 'empty';
        leagueInfo = {
          id: Number(config.leagueId),
          name: leagueMeta.name,
          country: leagueMeta.country,
          type: leagueMeta.type,
        };
      } else {
        dataStatus = 'ok';
        leagueInfo = standingsData.leagueInfo;
      }
    }

    // ========================================================================
    // PASSO 3: SALVAR STANDINGS OU CUP STRUCTURE
    // ========================================================================
    const metadata = {
      leagueId: Number(config.leagueId),
      season: Number(chosenSeason),
      seasonSource: config.season ? 'explicit' : reason,
      type: leagueMeta.type,
      dataStatus,
      coverage: {
        standings: coverage.standings,
        fixtures: coverage.fixtures,
        events: coverage.events,
        statistics: coverage.statistics,
      },
    };

    if (isCup) {
      // Salvar cup structure
      const cupSnapshot = {
        schemaVersion: 1,
        meta: metadata,
        league: leagueInfo,
        generated_at_utc: new Date().toISOString(),
        rounds: cupData.rounds,
      };

      const cupFile = path.join(config.outDir, `cup_${config.leagueId}_${chosenSeason}.json`);
      saveJSON(cupFile, cupSnapshot);
      console.log(`\n✅ Cup structure saved: ${cupFile}`);
      console.log(`   Rounds: ${cupData.rounds.length}\n`);
      
    } else {
      // Salvar standings
      const standingsSnapshot = {
        schemaVersion: 1,
        meta: metadata,
        league: leagueInfo,
        generated_at_utc: new Date().toISOString(),
        standings: standingsData?.standings || [],
      };

      const standingsFile = path.join(config.outDir, `standings_${config.leagueId}_${chosenSeason}.json`);
      saveJSON(standingsFile, standingsSnapshot);
      console.log(`\n✅ Standings saved: ${standingsFile}`);
      console.log(`   Teams: ${standingsData?.standings?.length || 0}\n`);
    }

    // ========================================================================
    // PASSO 4: GERAR COMPSTATS (SEMPRE, PARA LEAGUE E CUP)
    // ========================================================================
    console.log(`📊 Generating compstats...\n`);
    
    const fixtures = await fetchFixtures(config.leagueId, chosenSeason);
    const pool = new PromisePool(config.concurrency);
    const aggStats = await aggregateStats(fixtures, pool);

    const compStats = {
      schemaVersion: 1,
      meta: metadata,
      league: leagueInfo,
      generated_at_utc: new Date().toISOString(),
      ...aggStats,
    };

    const compStatsFile = path.join(config.outDir, `compstats_${config.leagueId}_${chosenSeason}.json`);
    saveJSON(compStatsFile, compStats);
    console.log(`\n✅ Competition stats saved: ${compStatsFile}\n`);

    // ========================================================================
    // PASSO 5: SUMMARY
    // ========================================================================
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║ ✅ Generation Summary                         ║`);
    console.log(`╚════════════════════════════════════════════════╝`);
    console.log(`   leagueId: ${config.leagueId}`);
    console.log(`   season: ${chosenSeason}`);
    console.log(`   seasonSource: ${metadata.seasonSource}`);
    console.log(`   type: ${metadata.type}`);
    console.log(`   dataStatus: ${metadata.dataStatus}`);
    console.log(`   standingsTeamsCount: ${standingsData?.standings?.length || 0}`);
    console.log(`   cupRoundsCount: ${cupData?.rounds?.length || 0}`);
    console.log(`   compstatsAvailable: ${aggStats.metrics.goals_avg !== null}`);
    console.log(`\n✅ Done!\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
