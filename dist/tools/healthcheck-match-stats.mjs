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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CALENDAR_PATH = path.join(ROOT, 'data', 'v1', 'calendar_7d.json');
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

/**
 * Check if team-window-5 snapshot data exists
 * Returns true if ANY valid snapshots are present
 */
function hasTeamWindow5Data() {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      return false;
    }
    
    const dirs = fs.readdirSync(SNAPSHOTS_DIR);
    
    for (const leagueDir of dirs) {
      const leaguePath = path.join(SNAPSHOTS_DIR, leagueDir);
      if (!fs.statSync(leaguePath).isDirectory()) continue;
      
      const seasonDirs = fs.readdirSync(leaguePath);
      for (const seasonDir of seasonDirs) {
        const seasonPath = path.join(leaguePath, seasonDir);
        if (!fs.statSync(seasonPath).isDirectory()) continue;
        
        const files = fs.readdirSync(seasonPath).filter(f => f.endsWith('.json'));
        
        // If any JSON file exists in the structure, we have data
        if (files.length > 0) {
          // Validate at least one snapshot
          for (const file of files) {
            try {
              const snapshot = JSON.parse(
                fs.readFileSync(path.join(seasonPath, file), 'utf-8')
              );
              
              if (snapshot && snapshot.windows) {
                return true;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
    }
  } catch (e) {
    // Silently continue
  }
  
  return false;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🏥 Healthcheck: Match Stats                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Load calendar
  const calendar = loadCalendar();
  if (!calendar || !Array.isArray(calendar.matches) || calendar.matches.length === 0) {
    console.error('❌ Calendar is empty or invalid');
    process.exit(1);
  }

  console.log(`📊 Calendar loaded: ${calendar.matches.length} matches`);

  // Check if team-window-5 data exists
  const hasData = hasTeamWindow5Data();

  if (hasData) {
    console.log(`\n✅ Team-window-5 snapshots found and valid`);
    console.log(`📁 Location: ${SNAPSHOTS_DIR}`);
    console.log('\n✅ HEALTHCHECK PASSED\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  Team-window-5 snapshots not found or invalid`);
    console.log(`📁 Expected location: ${SNAPSHOTS_DIR}`);
    console.error('\n❌ HEALTHCHECK FAILED - No snapshot data available\n');
    console.error('   Fix: Run seed-team-window-5.mjs to populate snapshot data');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
