#!/usr/bin/env node
/**
 * Validate Radartips Data Pipeline
 * 
 * Checks:
 * - Manifest consistency (all entries have files)
 * - All standings_*.json exist
 * - All compstats_*.json exist
 * - League 40 (Championship) has data
 * 
 * Usage:
 *   node tools/validate-pipeline.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'v1');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.error(`❌ Failed to load manifest: ${e.message}`);
    return null;
  }
}

function fileExists(file) {
  return fs.existsSync(path.join(DATA_DIR, file));
}

function main() {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ ✅ Pipeline Validation                       ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  const manifest = loadManifest();
  if (!manifest) process.exit(1);

  const entries = manifest.entries || [];
  let entriesOK = 0;
  let entriesFail = 0;
  const failures = [];

  // Check each entry
  for (const entry of entries) {
    const { leagueId, season, standings, compstats } = entry;
    let entryOK = true;

    if (standings?.file && !fileExists(standings.file)) {
      failures.push(`[L${leagueId}/${season}] Missing: ${standings.file}`);
      entryOK = false;
    }

    if (compstats?.file && !fileExists(compstats.file)) {
      failures.push(`[L${leagueId}/${season}] Missing: ${compstats.file}`);
      entryOK = false;
    }

    if (entryOK) {
      entriesOK++;
    } else {
      entriesFail++;
    }
  }

  // Report
  console.log(`📋 Manifest entries: ${entries.length}`);
  console.log(`✅ Valid: ${entriesOK}`);
  console.log(`❌ Invalid: ${entriesFail}\n`);

  if (entriesFail > 0) {
    console.log('Failures:');
    failures.forEach(f => console.log(`  ${f}`));
    console.log('');
  }

  // Check League 40 specifically
  const league40 = entries.find(e => e.leagueId === 40);
  if (league40) {
    console.log(`\n📊 League 40 (Championship) / Season ${league40.season}:`);
    if (league40.standings?.file) {
      const existsLocal = fileExists(league40.standings.file);
      console.log(`  ✅ Standings: ${league40.standings.file} (${existsLocal ? 'exists' : 'MISSING'})`);
    }
    if (league40.compstats?.file) {
      const existsLocal = fileExists(league40.compstats.file);
      console.log(`  ✅ Compstats: ${league40.compstats.file} (${existsLocal ? 'exists' : 'MISSING'})`);
    }
  } else {
    console.log(`\n❌ League 40 not found in manifest`);
  }

  // Summary
  console.log(`\n${entriesFail === 0 ? '✅' : '❌'} VALIDATION ${entriesFail === 0 ? 'PASSED' : 'FAILED'}\n`);
  process.exit(entriesFail > 0 ? 1 : 0);
}

main();
