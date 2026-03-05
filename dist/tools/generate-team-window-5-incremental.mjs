#!/usr/bin/env node
/**
 * generate-team-window-5-incremental.mjs
 * 
 * Generates team-window-5 snapshots incrementally.
 * 
 * Usage:
 *   node tools/generate-team-window-5-incremental.mjs --team 123 --league 39 --season 2025
 *   node tools/generate-team-window-5-incremental.mjs --fixture 1234567 --league 39 --season 2025
 *   node tools/generate-team-window-5-incremental.mjs --teams 123,456 --league 39 --season 2025
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateFromCalendarMatch, loadTeamWindow5Snapshot } from './lib/team-window-5-generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i += 2) {
  opts[args[i].replace(/^--/, '')] = args[i + 1];
}

// Defaults
const CACHE_DIR = opts.cacheDir || path.join(rootDir, 'data', 'v1');
const OUTPUT_DIR = opts.outputDir || path.join(rootDir, 'data', 'v1', 'team-window-5');

console.log(`[incremental] Starting team-window-5 generation...`);
console.log(`[incremental] Cache dir: ${CACHE_DIR}`);
console.log(`[incremental] Output dir: ${OUTPUT_DIR}`);

async function main() {
  const leagueId = parseInt(opts.league);
  const season = parseInt(opts.season);
  
  if (!leagueId || !season) {
    console.error('ERROR: --league and --season are required');
    process.exit(1);
  }

  // Load calendar
  const calendarCandidates = [
    path.join(CACHE_DIR, 'calendar_2d.json'),
    path.join(CACHE_DIR, 'calendar_day.json')
  ];
  const calendarFile = calendarCandidates.find(file => fs.existsSync(file));
  if (!calendarFile) {
    console.error('ERROR: calendar_2d.json/calendar_day.json not found');
    process.exit(1);
  }

  const calendarData = JSON.parse(fs.readFileSync(calendarFile, 'utf8'));
  const allMatches = Array.isArray(calendarData.matches)
    ? calendarData.matches
    : [
        ...(Array.isArray(calendarData.today) ? calendarData.today : []),
        ...(Array.isArray(calendarData.tomorrow) ? calendarData.tomorrow : [])
      ];

  // Filter matches by league and get specific fixture if requested
  let matches = allMatches;

  if (opts.fixture) {
    const fixtureId = parseInt(opts.fixture);
    const match = allMatches.find(m => m.fixture_id === fixtureId);
    if (!match) {
      console.error(`ERROR: Fixture ${fixtureId} not found`);
      process.exit(1);
    }
    if (opts.fixtureStatus) {
      match.status = String(opts.fixtureStatus).toUpperCase();
    }
    if (opts.goalsHome !== undefined) {
      match.goals_home = Number(opts.goalsHome);
    }
    if (opts.goalsAway !== undefined) {
      match.goals_away = Number(opts.goalsAway);
    }
    matches = [match];
  }

  console.log(`[incremental] Processing fixtures for league ${leagueId}, season ${season}...`);
  
  let successful = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const match of matches) {
    try {
      const result = await generateFromCalendarMatch({
        match,
        leagueId,
        season,
        outputDir: OUTPUT_DIR
      });

      if (result?.updated) {
        successful++;
        console.log(`[incremental] ✓ Updated snapshots for ${match.home} vs ${match.away}`);
      } else {
        skipped++;
        console.log(`[incremental] ↷ Skipped (not updated) for ${match.home} vs ${match.away} reason=${result?.reason || 'unknown'}`);
      }
    } catch (error) {
      failed++;
      errors.push({
        fixture: `${match.home} vs ${match.away}`,
        error: error.message
      });
      console.error(`[incremental] ✗ Failed: ${error.message}`);
    }
  }

  // Summary
  console.log(`\n[incremental] Summary:`);
  console.log(`[incremental] Total matches: ${matches.length}`);
  console.log(`[incremental] Updated: ${successful}`);
  console.log(`[incremental] Skipped: ${skipped}`);
  console.log(`[incremental] Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
