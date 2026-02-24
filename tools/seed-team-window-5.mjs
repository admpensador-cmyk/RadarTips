#!/usr/bin/env node
/**
 * seed-team-window-5.mjs
 * 
 * Economi backfill script: populate team-window-5 snapshots for all teams
 * currently in the calendar. Runs once to bootstrap the data.
 * 
 * Usage:
 *   node tools/seed-team-window-5.mjs [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateFromCalendarMatch } from './lib/team-window-5-generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const verbose = process.argv.includes('--verbose');
const CACHE_DIR = path.join(rootDir, 'data', 'v1');
const OUTPUT_DIR = path.join(rootDir, 'data', 'v1', 'team-window-5');

function log(msg) {
  console.log(`[seed] ${msg}`);
}

function vlog(msg) {
  if (verbose) console.log(`[seed] ${msg}`);
}

async function main() {
  log('Starting economi team-window-5 seed...');
  
  const startTime = Date.now();
  
  // Load calendar
  const calendarFile = path.join(CACHE_DIR, 'calendar_7d.json');
  if (!fs.existsSync(calendarFile)) {
    log('ERROR: calendar_7d.json not found');
    process.exit(1);
  }

  const calendarData = JSON.parse(fs.readFileSync(calendarFile, 'utf8'));
  const matches = calendarData.matches || [];

  log(`Loaded calendar with ${matches.length} matches`);

  // Group by league and season to process
  const byLeagueSeason = {};
  matches.forEach(m => {
    const key = `${m.competition_id}:2026`;
    if (!byLeagueSeason[key]) byLeagueSeason[key] = [];
    byLeagueSeason[key].push(m);
  });

  vlog(`\nLeague/Season breakdown:`);
  Object.entries(byLeagueSeason).forEach(([key, matchList]) => {
    vlog(`  ${key}: ${matchList.length} matches`);
  });

  // Generate snapshots for all matches
  log(`\nGenerating snapshots for all teams in ${matches.length} matches...`);
  
  let successful = 0;
  let failed = 0;
  const errors = [];
  const teamsProcessed = new Set();

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const season = 2026;
    
    try {
      await generateFromCalendarMatch({
        match,
        leagueId: match.competition_id,
        season,
        outputDir: OUTPUT_DIR
      });

      successful++;
      teamsProcessed.add(`${match.home_id}:${match.competition_id}:${season}`);
      teamsProcessed.add(`${match.away_id}:${match.competition_id}:${season}`);

      if (verbose || i % Math.max(1, Math.floor(matches.length / 10)) === 0) {
        const progress = Math.round((i + 1) / matches.length * 100);
        vlog(`[${progress}%] ${match.home} vs ${match.away}`);
      }
    } catch (error) {
      failed++;
      errors.push({
        fixture: `${match.home} vs ${match.away}`,
        error: error.message
      });
      
      if (verbose) {
        console.error(`[seed] ERROR: fixture ${match.fixture_id}: ${error.message}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // Summary
  log(`\n✓ Seed complete in ${elapsed}s`);
  log(`  Total matches processed: ${matches.length}`);
  log(`  Unique teams: ${teamsProcessed.size}`);
  log(`  Successful: ${successful}`);
  log(`  Failed: ${failed}`);

  if (failed > 0) {
    log(`\nFailed matches:`);
    errors.forEach(e => {
      log(`  ✗ ${e.fixture}: ${e.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
