#!/usr/bin/env node
/**
 * Quick upload calendar_2d.json to R2 snapshots
 * Upload calendar_2d.json como fonte única
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'radartips-data';

const CALENDAR_2D_PATH = path.join(ROOT, 'data', 'v1', 'calendar_2d.json');
const COVERAGE_ALLOWLIST_PATH = path.join(ROOT, 'data', 'coverage_allowlist.json');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'v1', 'snapshots');
const SNAPSHOT_PATH = path.join(SNAPSHOTS_DIR, 'calendar_2d.json');
const BLOCKED_7D_PATTERN = /calendar_7d/i;

function assertNotBlocked7D(value, context) {
  const text = String(value || '');
  if (BLOCKED_7D_PATTERN.test(text)) {
    throw new Error(`[BLOCKED_7D] Refusing R2 upload (${context}): ${text}`);
  }
}

function extractLeagueId(match) {
  const raw = match?.league_id ?? match?.competition_id ?? null;
  const leagueId = Number(raw);
  return Number.isFinite(leagueId) ? leagueId : null;
}

function readAllowlistLeagueIds() {
  if (!fs.existsSync(COVERAGE_ALLOWLIST_PATH)) {
    throw new Error(`[FAIL-CLOSED] Missing allowlist file: ${COVERAGE_ALLOWLIST_PATH}`);
  }

  const parsed = JSON.parse(fs.readFileSync(COVERAGE_ALLOWLIST_PATH, 'utf8'));
  const leagues = Array.isArray(parsed?.leagues) ? parsed.leagues : [];
  const ids = leagues
    .map((entry) => Number(entry?.league_id))
    .filter((leagueId) => Number.isFinite(leagueId));

  if (!ids.length) {
    throw new Error('[FAIL-CLOSED] coverage_allowlist.json has no valid league_id values');
  }

  return new Set(ids);
}

function assertAllowed(calendar, allowlistIds) {
  const buckets = [calendar?.today, calendar?.tomorrow].filter(Array.isArray);
  const outOfAllowlist = new Set();
  const samples = [];

  for (const matches of buckets) {
    for (const match of matches) {
      const leagueId = extractLeagueId(match);
      if (!Number.isFinite(leagueId)) continue;
      if (!allowlistIds.has(leagueId)) {
        outOfAllowlist.add(leagueId);
        if (samples.length < 5) {
          samples.push({
            fixture_id: match?.fixture_id ?? null,
            league_id: leagueId,
            competition: match?.competition ?? null,
            country: match?.country ?? null,
            kickoff_utc: match?.kickoff_utc ?? null
          });
        }
      }
    }
  }

  if (outOfAllowlist.size > 0) {
    throw new Error(
      `[FAIL-CLOSED] Aborting R2 upload. Found out-of-allowlist league_ids=` +
      `${JSON.stringify(Array.from(outOfAllowlist).sort((a, b) => a - b))} ` +
      `sample_fixtures=${JSON.stringify(samples)}`
    );
  }
}

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  console.log(`✓ Created snapshots directory: ${SNAPSHOTS_DIR}`);
}

// Read calendar_2d.json
const calendar = JSON.parse(fs.readFileSync(CALENDAR_2D_PATH, 'utf8'));
const allowlistIds = readAllowlistLeagueIds();

if (!Array.isArray(calendar?.today) || !Array.isArray(calendar?.tomorrow)) {
  throw new Error('[FAIL-CLOSED] Invalid calendar_2d shape: expected today/tomorrow arrays');
}

assertAllowed(calendar, allowlistIds);
console.log(`✓ Fail-closed allowlist check passed (${allowlistIds.size} leagues in allowlist)`);

// Write como calendar_2d.json snapshot
fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(calendar, null, 2), 'utf8');
console.log(`✓ Wrote snapshot to: ${SNAPSHOT_PATH}`);

// Show stats
const today = calendar.today || [];
console.log(`  Total matches today: ${today.length}`);
if (today.length > 0) {
  console.log(`  First match: ${today[0].home} vs ${today[0].away} (${today[0].kickoff_utc})`);
} else {
  console.log('  No matches today.');
}

// Now upload to R2 using wrangler
console.log(`\n📤 Uploading to R2 using wrangler...`);

const wranglerArgs = [
  'wrangler',
  'r2',
  'object',
  'put',
  '--remote',
  `${R2_BUCKET}/snapshots/calendar_2d.json`,
  '--file',
  SNAPSHOT_PATH,
  '--content-type',
  'application/json'
];

assertNotBlocked7D(SNAPSHOT_PATH, 'snapshot_file');
assertNotBlocked7D(`${R2_BUCKET}/snapshots/calendar_2d.json`, 'remote_key');
for (const arg of wranglerArgs) {
  assertNotBlocked7D(arg, 'wrangler_arg');
}

const proc = spawn('npx', wranglerArgs, {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

proc.on('close', (code) => {
  if (code === 0) {
    const verifyArgs = [
      'wrangler',
      'r2',
      'object',
      'get',
      '--remote',
      `${R2_BUCKET}/snapshots/calendar_2d.json`,
      '--file',
      'tmp_r2_calendar_2d_verify.json'
    ];

    for (const arg of verifyArgs) {
      assertNotBlocked7D(arg, 'verify_arg');
    }

    const verify = spawn('npx', verifyArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });

    verify.on('close', (verifyCode) => {
      if (verifyCode !== 0) {
        console.error(`\n❌ Upload succeeded, but verification download failed with code ${verifyCode}`);
        process.exit(verifyCode);
      }

      try {
        const downloaded = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp_r2_calendar_2d_verify.json'), 'utf8'));
        const size = fs.statSync(path.join(ROOT, 'tmp_r2_calendar_2d_verify.json')).size;
        console.log(`\n✅ Calendar snapshot uploaded to R2!`);
        console.log(`   Bucket: ${R2_BUCKET}`);
        console.log(`   Key: snapshots/calendar_2d.json`);
        console.log(`   Size: ${size} bytes`);
        console.log(`   meta.generated_at_utc: ${downloaded?.meta?.generated_at_utc || 'n/a'}`);
      } catch (err) {
        console.error(`\n❌ Verification parse failed: ${err.message}`);
        process.exit(1);
      }
      process.exit(0);
    });
  } else {
    console.error(`\n❌ Upload failed with code ${code}`);
    console.error(`Make sure you have:`);
    console.error(`   - npx/wrangler available`);
    console.error(`   - CLOUDFLARE_ACCOUNT_ID environment variable set`);
    console.error(`   - Proper R2 perms with API token (via .env.local or env var)`);
    process.exit(code);
  }
});
