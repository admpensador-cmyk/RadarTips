#!/usr/bin/env node
/**
 * Batch Update Competition Extras V2
 * 
 * ARQUITETURA LIMPA:
 * - Usa update-competition-extras-v2.mjs (sem tryNeighbors)
 * - Lê calendar_7d.json e gera standings/stats para todas as ligas
 * - Season resolution automática via /leagues
 * 
 * Usage:
 *   node tools/update-competition-extras-batch-v2.mjs [--concurrency 1]
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

// Extract unique league/kickoff pairs from calendar
function extractLeaguePairs(calendar) {
  if (!calendar || !Array.isArray(calendar.matches)) {
    return [];
  }

  const pairs = new Map();

  calendar.matches.forEach(m => {
    const leagueId = m.competition_id || m.league_id || m.leagueId;
    const kickoffUTC = m.kickoff_utc;

    if (leagueId) {
      const key = String(leagueId);
      if (!pairs.has(key)) {
        pairs.set(key, { 
          leagueId, 
          kickoffUTC: kickoffUTC || new Date().toISOString()
        });
      }
    }
  });

  return Array.from(pairs.values());
}

// Run update command for a single league
function runUpdate(leagueId, kickoffUTC) {
  return new Promise((resolve, reject) => {
    console.log(`\n${colors.cyan}→ Updating league=${leagueId}${colors.reset}`);

    const proc = spawn('node', [
      path.join(__dirname, 'update-competition-extras-v2.mjs'),
      '--leagueId', String(leagueId),
      '--kickoffUTC', kickoffUTC,
      '--outDir', path.join(ROOT, 'data', 'v1'),
      '--concurrency', '5',
    ], {
      cwd: ROOT,
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`${colors.green}✅ Success: league=${leagueId}${colors.reset}`);
        resolve();
      } else {
        console.log(`${colors.yellow}⚠️  Failed: league=${leagueId} (exit code ${code})${colors.reset}`);
        // Don't reject, continue with next
        resolve();
      }
    });

    proc.on('error', (err) => {
      console.error(`${colors.yellow}⚠️  Error: league=${leagueId}: ${err.message}${colors.reset}`);
      resolve();
    });
  });
}

// Main
async function main() {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 📊 Competition Extras Batch Generator V2      ║`);
  console.log(`║    Season Resolution via /leagues API         ║`);
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

  console.log(`${colors.cyan}Found ${pairs.length} unique leagues:${colors.reset}`);
  pairs.forEach(p => {
    console.log(`  ${colors.dim}• leagueId=${p.leagueId}${colors.reset}`);
  });

  // Run sequentially (1 per 1) to avoid rate limiting
  console.log(`\n${colors.cyan}Running updates sequentially...${colors.reset}`);

  for (const pair of pairs) {
    await runUpdate(pair.leagueId, pair.kickoffUTC);
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
