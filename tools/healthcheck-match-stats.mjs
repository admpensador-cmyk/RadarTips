#!/usr/bin/env node
/**
 * Healthcheck: Verify match-stats endpoint has data
 * 
 * Reads calendar_7d.json and tests a sample of fixtures
 * to ensure the match-stats endpoint returns non-zero data.
 * 
 * Exit code: 0 = PASS, 1 = FAIL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { loadTeamWindow5Snapshot } from './lib/team-window-5-generator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CALENDAR_PATH = path.join(ROOT, 'data', 'v1', 'calendar_2d.json');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'v1', 'team-window-5');

// Configuration
const SAMPLE_SIZE = 5; // Number of fixtures to test
const MIN_PASS_RATE = 0.8; // 80% of samples must have data

function loadCalendar() {
  try {
    const raw = fs.readFileSync(CALENDAR_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`❌ Failed to load calendar: ${e.message}`);
    return null;
  }
}

function getCalendarMatches(calendar) {
  return [
    ...(Array.isArray(calendar?.today) ? calendar.today : []),
    ...(Array.isArray(calendar?.tomorrow) ? calendar.tomorrow : [])
  ].filter((match) => match?.competition_id && match?.home_id && match?.away_id);
}

function isValidSnapshot(snapshot) {
  return Boolean(snapshot?.windows?.total_last5 && snapshot?.windows?.home_last5 && snapshot?.windows?.away_last5 && snapshot?.meta);
}

function validateSampleMatches(matches) {
  const sample = matches.slice(0, SAMPLE_SIZE);
  let passed = 0;

  for (const match of sample) {
    const season = Number(match.season) || 2026;
    const homeSnapshot = loadTeamWindow5Snapshot(match.home_id, match.competition_id, season, SNAPSHOTS_DIR);
    const awaySnapshot = loadTeamWindow5Snapshot(match.away_id, match.competition_id, season, SNAPSHOTS_DIR);

    if (isValidSnapshot(homeSnapshot) && isValidSnapshot(awaySnapshot)) {
      passed += 1;
    }
  }

  return {
    sampleSize: sample.length,
    passed,
    passRate: sample.length > 0 ? passed / sample.length : 0
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🏥 Healthcheck: Match Stats                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Load calendar
  const calendar = loadCalendar();
  const matches = getCalendarMatches(calendar);
  if (!calendar || matches.length === 0) {
    console.error('❌ Calendar is empty or invalid');
    process.exit(1);
  }

  console.log(`📊 Calendar loaded: ${matches.length} matches`);

  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    console.log(`\n⚠️  Team-window-5 snapshots directory not found`);
    console.log(`📁 Expected location: ${SNAPSHOTS_DIR}`);
    console.error('\n❌ HEALTHCHECK FAILED - No snapshot data available\n');
    process.exit(1);
  }

  const result = validateSampleMatches(matches);

  if (result.sampleSize > 0 && result.passRate >= MIN_PASS_RATE) {
    console.log(`\n✅ Team-window-5 snapshots found and valid`);
    console.log(`📁 Location: ${SNAPSHOTS_DIR}`);
    console.log(`📈 Sample pass rate: ${result.passed}/${result.sampleSize} (${Math.round(result.passRate * 100)}%)`);
    console.log('\n✅ HEALTHCHECK PASSED\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  Team-window-5 snapshots not found or invalid`);
    console.log(`📁 Expected location: ${SNAPSHOTS_DIR}`);
    console.log(`📈 Sample pass rate: ${result.passed}/${result.sampleSize} (${Math.round(result.passRate * 100)}%)`);
    console.error('\n❌ HEALTHCHECK FAILED - No snapshot data available\n');
    console.error('   Fix: Run seed-team-window-5.mjs to populate snapshot data');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
