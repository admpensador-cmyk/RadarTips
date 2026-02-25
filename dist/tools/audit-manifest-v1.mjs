#!/usr/bin/env node
/**
 * Audit Manifest V1: Verify manifest.json references actual files
 * 
 * Checks:
 * - data/v1/{standingsFile} exists when entry.standings=true
 * - data/v1/{compstatsFile} exists when entry.compstats=true
 * 
 * Outputs:
 * - Report with missing files (if any)
 * - Exit code 1 if any missing files found
 * 
 * Usage:
 *   node tools/audit-manifest-v1.mjs
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
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`❌ Failed to load manifest: ${e.message}`);
    return null;
  }
}

function main() {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 🔍 Manifest Audit V1                          ║`);
  console.log(`║    Checking file existence in data/v1         ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  const manifest = loadManifest();
  if (!manifest) {
    process.exit(1);
  }

  const entries = manifest.entries || [];
  console.log(`📋 Total entries: ${entries.length}\n`);

  const issues = {
    standingsMissing: [],
    compstatsMissing: [],
  };

  // Check each entry
  for (const entry of entries) {
    const { leagueId, season, standings, compstats } = entry;
    
    // Check standings
    if (standings?.file) {
      const filePath = path.join(DATA_DIR, standings.file);
      if (!fs.existsSync(filePath)) {
        issues.standingsMissing.push({
          leagueId,
          season,
          file: standings.file,
          path: filePath,
        });
      }
    }

    // Check compstats
    if (compstats?.file) {
      const filePath = path.join(DATA_DIR, compstats.file);
      if (!fs.existsSync(filePath)) {
        issues.compstatsMissing.push({
          leagueId,
          season,
          file: compstats.file,
          path: filePath,
        });
      }
    }
  }

  // Report
  console.log(`📊 Audit Results:\n`);
  
  if (issues.standingsMissing.length === 0) {
    console.log(`✅ Standings files: All exist (${manifest.totals?.standings || 0} files)`);
  } else {
    console.log(`❌ Standings missing: ${issues.standingsMissing.length} files`);
    issues.standingsMissing.forEach(issue => {
      console.log(`   [${issue.leagueId}/${issue.season}] ${issue.file}`);
    });
  }

  console.log('');

  if (issues.compstatsMissing.length === 0) {
    console.log(`✅ Compstats files: All exist (${manifest.totals?.compstats || 0} files)`);
  } else {
    console.log(`❌ Compstats missing: ${issues.compstatsMissing.length} files`);
    issues.compstatsMissing.forEach(issue => {
      console.log(`   [${issue.leagueId}/${issue.season}] ${issue.file}`);
    });
  }

  console.log('');

  // Summary
  const totalMissing = issues.standingsMissing.length + issues.compstatsMissing.length;
  
  if (totalMissing === 0) {
    console.log(`✅ AUDIT PASSED: All manifest entries reference existing files\n`);
    process.exit(0);
  } else {
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║ ❌ AUDIT FAILED: ${String(totalMissing).padStart(2, ' ')} missing files       ║`);
    console.log(`╚════════════════════════════════════════════════╝\n`);
    process.exit(1);
  }
}

main();
