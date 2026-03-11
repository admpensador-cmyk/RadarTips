#!/usr/bin/env node
/**
 * smoke-test-team-window-5.mjs
 * 
 * Validates team-window-5 generation and match-stats endpoint behavior.
 * 
 * Checks:
 * - No NaN/Infinity in stats
 * - games_used in range [0, 5]
 * - Null values properly handled (→ "—" in rendering)
 * - Fixture metadata resolves correctly
 * - Snapshot structure matches schema
 * 
 * Usage:
 *   node tools/smoke-test-team-window-5.mjs [--fixture {id}] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateFromCalendarMatch, loadTeamWindow5Snapshot } from './lib/team-window-5-generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i += 2) {
  opts[args[i].replace(/^--/, '')] = args[i + 1];
}

const verbose = process.argv.includes('--verbose');
const CACHE_DIR = path.join(rootDir, 'data', 'v1');
const OUTPUT_DIR = path.join(rootDir, 'data', 'v1', 'team-window-5');

function loadCalendarMatches() {
  const calendarFile = path.join(CACHE_DIR, 'calendar_2d.json');
  if (!fs.existsSync(calendarFile)) {
    throw new Error('calendar_2d.json not found. Cannot run smoke test.');
  }

  const calendarData = JSON.parse(fs.readFileSync(calendarFile, 'utf8'));
  const matches = [
    ...(Array.isArray(calendarData?.today) ? calendarData.today : []),
    ...(Array.isArray(calendarData?.tomorrow) ? calendarData.tomorrow : [])
  ].filter((match) => match?.fixture_id && match?.competition_id && match?.home_id && match?.away_id);

  return { calendarFile, matches };
}

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function vlog(msg) {
  if (verbose) console.log(`[smoke] ${msg}`);
}

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
    vlog(`  ✓ ${message}`);
  } else {
    testsFailed++;
    log(`  ✗ ${message}`);
  }
}

function isValidNumber(val) {
  if (val === null || val === undefined) return true; // null is valid
  const num = Number(val);
  return Number.isFinite(num);
}

function validateStats(stats, windowName) {
  assert(stats, `${windowName} exists`);
  if (!stats) return;

  const metricsToCheck = [
    'gols_marcados',
    'gols_sofridos',
    'clean_sheets',
    'falha_marcar',
    'cartoes_amarelos',
    'cantos',
    'posse_pct'
  ];

  metricsToCheck.forEach(metric => {
    const val = stats[metric];
    assert(
      val === null || isValidNumber(val),
      `${windowName}.${metric} is null or valid number (got ${typeof val}: ${val})`
    );
  });
}

function validateMeta(meta, teamName) {
  assert(meta, `${teamName} meta exists`);
  if (!meta) return;

  assert(meta.league_id && Number.isFinite(meta.league_id), `${teamName} league_id is valid`);
  assert(meta.season && Number.isFinite(meta.season), `${teamName} season is valid`);
  assert(meta.team_id && Number.isFinite(meta.team_id), `${teamName} team_id is valid`);
  assert(meta.team_name && typeof meta.team_name === 'string', `${teamName} team_name is string`);
  
  const totalGames = meta.games_used_total;
  const homeGames = meta.games_used_home;
  const awayGames = meta.games_used_away;

  assert(
    totalGames >= 0 && totalGames <= 5,
    `${teamName} games_used_total in [0,5] (got ${totalGames})`
  );
  assert(
    homeGames >= 0 && homeGames <= 5,
    `${teamName} games_used_home in [0,5] (got ${homeGames})`
  );
  assert(
    awayGames >= 0 && awayGames <= 5,
    `${teamName} games_used_away in [0,5] (got ${awayGames})`
  );

  assert(
    meta.last_updated && new Date(meta.last_updated).getTime(),
    `${teamName} last_updated is valid ISO timestamp`
  );
}

function validateSnapshot(snapshot, teamName) {
  log(`  Validating snapshot for ${teamName}...`);

  const { windows, meta } = snapshot;

  assert(windows, `${teamName} has windows object`);
  if (!windows) return;

  assert(windows.total_last5, `${teamName} windows.total_last5 exists`);
  assert(windows.home_last5, `${teamName} windows.home_last5 exists`);
  assert(windows.away_last5, `${teamName} windows.away_last5 exists`);

  validateStats(windows.total_last5, `${teamName}.total_last5`);
  validateStats(windows.home_last5, `${teamName}.home_last5`);
  validateStats(windows.away_last5, `${teamName}.away_last5`);

  validateMeta(meta, teamName);
}

function renderValue(val) {
  // Simulate UI rendering: null → "—"
  return val === null || val === undefined ? '—' : String(val);
}

async function main() {
  log('Starting smoke tests for team-window-5...\n');

  const { calendarFile, matches } = loadCalendarMatches();

  if (matches.length === 0) {
    log(`ERROR: No matches in ${path.basename(calendarFile)}. Cannot run smoke test.`);
    process.exit(1);
  }

  // Pick fixture
  let fixtureData = null;
  
  if (opts.fixture) {
    const fixtureId = parseInt(opts.fixture);
    fixtureData = matches.find(m => m.fixture_id === fixtureId);
    if (!fixtureData) {
      log(`WARNING: Fixture ${fixtureId} not found, using first match`);
    }
  }

  if (!fixtureData) {
    fixtureData = matches[0];
  }

  const season = Number(fixtureData.season) || 2026;

  log(`Testing with fixture ${fixtureData.fixture_id}: ${fixtureData.home} vs ${fixtureData.away}`);
  log(`League ${fixtureData.competition_id}, Season ${season}\n`);

  // Test 1: Generate snapshots
  log('TEST 1: Generate snapshots');
  
  let homeSnapshot = null;
  let awaySnapshot = null;

  try {
    const result = await generateFromCalendarMatch({
      match: fixtureData,
      leagueId: fixtureData.competition_id,
      season,
      outputDir: OUTPUT_DIR
    });
    homeSnapshot = result.home;
    awaySnapshot = result.away;
    testsPassed++;
    testsRun++;
    vlog(`  ✓ Generated snapshots for ${fixtureData.home} vs ${fixtureData.away}`);
  } catch (e) {
    testsFailed++;
    testsRun++;
    log(`  ✗ Failed to generate snapshots: ${e.message}`);
  }

  if (!homeSnapshot || !awaySnapshot) {
    log('\nERROR: Could not generate snapshots. Aborting.');
    process.exit(1);
  }

  // Test 2: Validate snapshot structure
  log('\nTEST 2: Validate snapshot structure');
  validateSnapshot(homeSnapshot, fixtureData.home);
  validateSnapshot(awaySnapshot, fixtureData.away);

  // Test 3: Test snapshot loading (persistence)
  log('\nTEST 3: Test snapshot loading from disk');
  
  const loadedHome = loadTeamWindow5Snapshot(
    fixtureData.home_id,
    fixtureData.competition_id,
    season,
    OUTPUT_DIR
  );
  assert(loadedHome, `${fixtureData.home} snapshot loads from disk`);

  const loadedAway = loadTeamWindow5Snapshot(
    fixtureData.away_id,
    fixtureData.competition_id,
    season,
    OUTPUT_DIR
  );
  assert(loadedAway, `${fixtureData.away} snapshot loads from disk`);

  // Test 4: Simulate match-stats endpoint payload
  log('\nTEST 4: Simulate match-stats endpoint payload');

  const matchStatsPayload = {
    fixture_id: fixtureData.fixture_id,
    fixture_status: fixtureData.status || 'NS',
    home: {
      id: fixtureData.home_id,
      name: fixtureData.home,
      stats: homeSnapshot.windows,
      games_used: homeSnapshot.meta
    },
    away: {
      id: fixtureData.away_id,
      name: fixtureData.away,
      stats: awaySnapshot.windows,
      games_used: awaySnapshot.meta
    },
    meta: {
      cached_at: new Date().toISOString(),
      source: 'snapshots',
      league_id: fixtureData.competition_id,
      season
    }
  };

  assert(matchStatsPayload.fixture_id, 'Payload has fixture_id');
  assert(matchStatsPayload.home.stats, 'Payload has home stats');
  assert(matchStatsPayload.away.stats, 'Payload has away stats');

  // Test 5: Simulate UI rendering (null → "—")
  log('\nTEST 5: Simulate UI rendering with null → "—" mapping');

  const homeTotalGols = renderValue(homeSnapshot.windows.total_last5.gols_marcados);
  const awayTotalGols = renderValue(awaySnapshot.windows.total_last5.gols_marcados);

  assert(
    homeTotalGols === '—' || /^\d+$/.test(homeTotalGols),
    `Home gols renders as '—' or number (got '${homeTotalGols}')`
  );

  assert(
    awayTotalGols === '—' || /^\d+$/.test(awayTotalGols),
    `Away gols renders as '—' or number (got '${awayTotalGols}')`
  );

  vlog(`  Home last-5 gols: ${homeTotalGols}`);
  vlog(`  Away last-5 gols: ${awayTotalGols}`);

  // Test 6: Verify "Base: N" disclosure (games_used)
  log('\nTEST 6: Verify "Base: N" disclosure fields');

  const homeBase = homeSnapshot.meta.games_used_total;
  const awayBase = awaySnapshot.meta.games_used_total;

  vlog(`  Home Base: ${homeBase}`);
  vlog(`  Away Base: ${awayBase}`);

  assert(
    homeBase >= 0 && homeBase <= 5,
    `Home Base in range [0,5]: ${homeBase}`
  );

  assert(
    awayBase >= 0 && awayBase <= 5,
    `Away Base in range [0,5]: ${awayBase}`
  );

  // Summary
  log(`\n${'='.repeat(50)}`);
  log(`SMOKE TEST SUMMARY`);
  log(`${'='.repeat(50)}`);
  log(`Tests run: ${testsRun}`);
  log(`Passed: ${testsPassed}`);
  log(`Failed: ${testsFailed}`);

  if (testsFailed === 0) {
    log(`\n✓ All smoke tests passed!`);
    process.exit(0);
  } else {
    log(`\n✗ ${testsFailed} test(s) failed`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
