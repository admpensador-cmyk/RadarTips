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

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.APIFOOTBALL_KEY;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    concurrency: 5,
    limitFixtures: null,
    smoke: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];

    if (key === '--smoke') {
      config.smoke = true;
      continue;
    }

    const val = args[i + 1];
    if (key === '--concurrency') {
      config.concurrency = Number.parseInt(val, 10);
      i += 1;
      continue;
    }
    if (key === '--limitFixtures') {
      config.limitFixtures = Number.parseInt(val, 10);
      i += 1;
      continue;
    }
  }

  return config;
}

function assertApiKey() {
  if (!API_KEY) {
    console.error('❌ Error: APIFOOTBALL_KEY env var not set');
    process.exit(1);
  }
}

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
    if (leagueId && !pairs.has(String(leagueId))) {
      pairs.set(String(leagueId), { leagueId });
    }
  });

  return Array.from(pairs.values());
}

function getSeasonCandidates() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-based month
  
  // European seasons: Aug-May (e.g., "2025-2026" season = year 2025)
  // In Feb 2026, we're in 2025-2026 season (started Aug 2025)
  // In Aug 2026, we're in 2026-2027 season (starts now)
  const europeanSeason = (month >= 8) ? year : (year - 1);
  
  // Some leagues (Brazil, etc.) use calendar year, so also try current year
  const candidates = [europeanSeason];
  if (europeanSeason !== year) {
    candidates.push(year);
  }
  
  console.log(`  ℹ️  Season resolution: month=${month}, year=${year}, candidates=[${candidates.join(', ')}]`);
  return candidates;
}

function explainApiIssues(status, errors) {
  if (status === 401 || status === 403) {
    return 'Auth/plan restriction: check APIFOOTBALL_KEY and plan access.';
  }
  if (status === 429) {
    return 'Rate limit hit: slow down or wait for quota reset.';
  }

  const errorValues = (errors && typeof errors === 'object')
    ? Object.values(errors).filter(Boolean).map(String)
    : [];
  const errorText = errorValues.join(' ').toLowerCase();

  if (errorText.includes('subscription') || errorText.includes('plan') || errorText.includes('access')) {
    return 'Plan restriction: standings endpoint not allowed for this subscription.';
  }

  return '';
}

async function smokeTest(leagueId, season) {
  const endpoint = `${API_BASE}/standings?league=${leagueId}&season=${season}`;
  console.log(`
🧪 Smoke test standings: league=${leagueId}, season=${season}`);

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'x-apisports-key': API_KEY,
      'Accept': 'application/json',
    },
  });

  const status = response.status;
  let data = null;

  try {
    data = await response.json();
  } catch (e) {
    console.warn(`  ⚠️  Failed to parse JSON: ${e.message}`);
  }

  const errors = data?.errors || null;
  const responseLen = Array.isArray(data?.response) ? data.response.length : 0;

  console.log(`  status: ${status}`);
  console.log(`  errors: ${errors ? JSON.stringify(errors) : 'none'}`);
  console.log(`  response.length: ${responseLen}`);

  const hint = explainApiIssues(status, errors);
  if (hint) {
    console.log(`  hint: ${hint}`);
  }

  if (!response.ok) {
    process.exit(1);
  }
}

// Run update command for a single league
function runUpdate(leagueId, season, config) {
  return new Promise((resolve, reject) => {
    console.log(`\n${colors.cyan}→ Updating league=${leagueId}, season=${season}${colors.reset}`);

    const args = [
      path.join(__dirname, 'update-competition-extras.mjs'),
      '--leagueId', String(leagueId),
      '--season', String(season),
      '--tryNeighbors', 'true',
      '--outDir', path.join(ROOT, 'data', 'v1'),
      '--concurrency', String(config.concurrency),
    ];

    if (Number.isFinite(config.limitFixtures)) {
      args.push('--limitFixtures', String(config.limitFixtures));
    }

    const proc = spawn('node', args, {
      cwd: ROOT,
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`${colors.green}✅ Success: league=${leagueId}, season=${season}${colors.reset}`);
        resolve(true);
      } else {
        console.log(`${colors.yellow}⚠️  Failed: league=${leagueId}, season=${season} (exit code ${code})${colors.reset}`);
        // Don't reject, continue with next
        resolve(false);
      }
    });

    proc.on('error', (err) => {
      console.error(`${colors.yellow}⚠️  Error: league=${leagueId}, season=${season}: ${err.message}${colors.reset}`);
      resolve(false);
    });
  });
}

// Main
async function main() {
  const config = parseArgs();

  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 📊 Competition Extras Batch Generator         ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  assertApiKey();

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

  const seasonsToTry = getSeasonCandidates();
  const baseSeason = seasonsToTry[0];

  console.log(`\n⚙️  Config:`);
  console.log(`  concurrency: ${config.concurrency}`);
  console.log(`  limitFixtures: ${Number.isFinite(config.limitFixtures) ? config.limitFixtures : 'none'}`);
  console.log(`  seasonCandidates: ${seasonsToTry.join(', ')}\n`);

  if (config.smoke) {
    await smokeTest(pairs[0].leagueId, baseSeason);
    return;
  }

  // Run sequentially (1 per 1) to avoid rate limiting
  console.log(`\n${colors.cyan}Running updates sequentially...${colors.reset}`);

  let successCount = 0;
  let failureCount = 0;

  for (const pair of pairs) {
    const ok = await runUpdate(pair.leagueId, baseSeason, config);
    if (ok) successCount += 1;
    else failureCount += 1;
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${colors.green}╔════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║ ✅ Batch Complete!                            ║${colors.reset}`);
  console.log(`${colors.green}╚════════════════════════════════════════════════╝${colors.reset}\n`);

  if (successCount === 0 && failureCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
