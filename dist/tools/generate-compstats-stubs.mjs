#!/usr/bin/env node
/**
 * Generate Compstats Stubs
 * 
 * Creates minimal compstats files for all leagues that have standings
 * but are missing compstats. This ensures manifest consistency.
 * 
 * Used when API key is unavailable or rate-limited.
 * 
 * Usage:
 *   node tools/generate-compstats-stubs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'v1');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

const STANDINGS_RE = /^standings_(\d+)_(\d+)\.json$/;

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.error(`Error loading manifest: ${e.message}`);
    return null;
  }
}

function findExistingStandingsFiles() {
  const files = fs.readdirSync(DATA_DIR);
  const standingsFiles = new Map();
  
  files.forEach(file => {
    const match = file.match(STANDINGS_RE);
    if (match) {
      const leagueId = Number(match[1]);
      const season = Number(match[2]);
      const key = `${leagueId}_${season}`;
      standingsFiles.set(key, { leagueId, season, file });
    }
  });
  
  return standingsFiles;
}

function createCompStatsStub(leagueId, season, leagueInfo) {
  return {
    schemaVersion: 1,
    meta: {
      leagueId,
      season,
      seasonSource: null,
      type: leagueInfo?.type || 'league',
      dataStatus: 'empty',
      coverage: {
        standings: true,
        fixtures: false,
        events: false,
        statistics: false,
      },
    },
    league: leagueInfo || {
      id: leagueId,
      name: `League ${leagueId}`,
      country: 'Unknown',
      type: 'league',
    },
    generated_at_utc: new Date().toISOString(),
    sample: {
      fixtures_total: 0,
      fixtures_finished: 0,
      fixtures_used: 0,
      fixtures_with_stats: 0,
    },
    metrics: {
      goals_avg: null,
      btts_pct: null,
      over25_pct: null,
      shots_avg: null,
      sot_avg: null,
      corners_avg: null,
      cards_avg: null,
      possession_avg: null,
      xg_avg: null,
    },
  };
}

function main() {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 📊 Generate Compstats Stubs                    ║`);
  console.log(`║    For leagues with standings but no compstats ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  const manifest = loadManifest();
  if (!manifest) {
    process.exit(1);
  }

  const standingsFiles = findExistingStandingsFiles();
  console.log(`Found ${standingsFiles.size} standings files\n`);

  let created = 0;
  let skipped = 0;

  // For each standings file, check if compstats exists
  standingsFiles.forEach(({ leagueId, season, file }) => {
    const compstatsFile = path.join(DATA_DIR, `compstats_${leagueId}_${season}.json`);
    
    if (fs.existsSync(compstatsFile)) {
      skipped++;
      return;
    }

    // Check if standings file has league info
    try {
      const standingsBuffer = fs.readFileSync(path.join(DATA_DIR, file));
      const standingsData = JSON.parse(standingsBuffer.toString('utf8'));
      const leagueInfo = standingsData.league || null;

      // Create stub
      const stub = createCompStatsStub(leagueId, season, leagueInfo);
      fs.writeFileSync(compstatsFile, JSON.stringify(stub, null, 2));
      console.log(`✅ Created: compstats_${leagueId}_${season}.json`);
      created++;
    } catch (e) {
      console.error(`❌ Error processing L${leagueId}/${season}: ${e.message}`);
    }
  });

  console.log(`\n✅ ${created} stubs created`);
  console.log(`⏭️  ${skipped} already exist`);
  console.log('\nNote: These are empty stubs (dataStatus=empty) to ensure manifest consistency.');
  console.log('When API key becomes available, run the full V2 generation to populate with real data.\n');
}

main();
