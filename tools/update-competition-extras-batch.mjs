#!/usr/bin/env node
/**
 * Batch Update Competition Extras
 * Reads calendar_7d.json and generates standings + stats for all unique leagues/seasons
 * 
 * Usage:
 *   node tools/update-competition-extras-batch.mjs [--concurrency 1]
 * 
 * Env:
 *   APIFOOTBALL_KEY: API-Football v3 key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

// Load calendar_7d.json
function loadCalendar() {
  const calendarPath = path.join(ROOT, 'data', 'v1', 'calendar_7d.json');
  try {
    const raw = fs.readFileSync(calendarPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`❌ Failed to load ${calendarPath}:`, e.message);
    return null;
  }
}

// Extract unique league/season pairs from calendar
function extractLeaguePairs(calendar) {
  if (!calendar || !Array.isArray(calendar.matches)) {
    return [];
  }

  const pairs = new Map();

  calendar.matches.forEach(m => {
    const leagueId = m.competition_id || m.league_id || m.leagueId;
    const season = m.season || (m.kickoff_utc ? new Date(m.kickoff_utc).getUTCFullYear() : null);

    if (leagueId && season) {
      const key = `${leagueId}|${season}`;
      if (!pairs.has(key)) {
        pairs.set(key, { leagueId, season });
      }
    }
  });

  return Array.from(pairs.values());
}

// Run update command for a single league
function runUpdate(leagueId, season) {
  return new Promise((resolve, reject) => {
    console.log(`\n${colors.cyan}→ Updating league=${leagueId}, season=${season}${colors.reset}`);

    const proc = spawn('node', [
      path.join(__dirname, 'update-competition-extras.mjs'),
      '--leagueId', String(leagueId),
      '--season', String(season),
      '--outDir', path.join(ROOT, 'data', 'v1'),
      '--limitFixtures', '120',
      '--concurrency', '5',
    ], {
      cwd: ROOT,
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`${colors.green}✅ Success: league=${leagueId}, season=${season}${colors.reset}`);
        resolve();
      } else {
        console.log(`${colors.yellow}⚠️  Failed: league=${leagueId}, season=${season} (exit code ${code})${colors.reset}`);
        // Don't reject, continue with next
        resolve();
      }
    });

    proc.on('error', (err) => {
      console.error(`${colors.yellow}⚠️  Error: league=${leagueId}, season=${season}: ${err.message}${colors.reset}`);
      resolve();
    });
  });
}

// Main
async function main() {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 📊 Competition Extras Batch Generator         ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  const calendar = loadCalendar();
  if (!calendar) {
    process.exit(1);
  }

  const pairs = extractLeaguePairs(calendar);
  if (pairs.length === 0) {
    console.log(`${colors.yellow}⚠️  No league/season pairs found in calendar_7d.json${colors.reset}\n`);
    process.exit(0);
  }

  console.log(`${colors.cyan}Found ${pairs.length} unique league/season pairs:${colors.reset}`);
  pairs.forEach(p => {
    console.log(`  ${colors.dim}• leagueId=${p.leagueId}, season=${p.season}${colors.reset}`);
  });

  // Run sequentially (1 per 1) to avoid rate limiting
  console.log(`\n${colors.cyan}Running updates sequentially...${colors.reset}`);

  for (const pair of pairs) {
    await runUpdate(pair.leagueId, pair.season);
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${colors.green}╔════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║ ✅ Batch Complete!                            ║${colors.reset}`);
  console.log(`${colors.green}╚════════════════════════════════════════════════╝${colors.reset}\n`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
