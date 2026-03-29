#!/usr/bin/env node
/**
 * Quick upload calendar_2d.json to R2 snapshots
 * Upload calendar_2d.json como fonte única
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import {
  LEAGUE_PAGE_V1_DEFINITIONS,
  assertLeaguePageSnapshotHasCoreData,
  assertLeaguePageSnapshotUsesApiFootball
} from './tools/lib/league-v1-snapshot.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'radartips-data';

const CALENDAR_2D_PATH = path.join(ROOT, 'data', 'v1', 'calendar_2d.json');
const RADAR_DAY_PATH = path.join(ROOT, 'data', 'v1', 'radar_day.json');
const COVERAGE_ALLOWLIST_PATH = path.join(ROOT, 'data', 'coverage_allowlist.json');
const LEAGUES_DIR = path.join(ROOT, 'data', 'v1', 'leagues');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'v1', 'snapshots');
const SNAPSHOT_PATH = path.join(SNAPSHOTS_DIR, 'calendar_2d.json');
const SNAPSHOT_LATEST_PATH = path.join(SNAPSHOTS_DIR, 'latest_calendar_2d.json');
const RADAR_DAY_SNAPSHOT_PATH = path.join(SNAPSHOTS_DIR, 'radar_day.json');
const RADAR_DAY_SNAPSHOT_LATEST_PATH = path.join(SNAPSHOTS_DIR, 'latest_radar_day.json');
const BLOCKED_7D_PATTERN = /calendar_7d/i;
const LEAGUE_SNAPSHOT_TARGETS = LEAGUE_PAGE_V1_DEFINITIONS.map((entry) => ({
  slug: entry.slug,
  local: path.join(LEAGUES_DIR, `${entry.slug}.json`),
  remote: `snapshots/leagues/${entry.slug}.json`,
  definition: entry
}));
const FIXTURE_MODEL_LAYER_FILES = [
  'meta.json',
  'raw-fixtures.json',
  'fixture-stats.json',
  'team-facts.json',
  'team-aggregates.json'
];

const args = new Set(process.argv.slice(2));
const uploadCalendarArtifacts = !args.has('--leagues-only');
const uploadLeagueArtifacts = !args.has('--calendar-only');

if (!uploadCalendarArtifacts && !uploadLeagueArtifacts) {
  throw new Error('[FAIL-CLOSED] Nothing selected for upload. Use default mode, --calendar-only, or --leagues-only.');
}

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

let calendar = null;
let radarDay = null;
let allowlistIds = null;
let generatedAtUtc = new Date().toISOString();
let baseDate = '';
let versionedKey = null;
let versionedPath = null;

if (uploadCalendarArtifacts) {
  calendar = JSON.parse(fs.readFileSync(CALENDAR_2D_PATH, 'utf8'));
  radarDay = JSON.parse(fs.readFileSync(RADAR_DAY_PATH, 'utf8'));
  allowlistIds = readAllowlistLeagueIds();

  if (!Array.isArray(calendar?.today) || !Array.isArray(calendar?.tomorrow)) {
    throw new Error('[FAIL-CLOSED] Invalid calendar_2d shape: expected today/tomorrow arrays');
  }

  if (!Array.isArray(radarDay?.highlights)) {
    throw new Error('[FAIL-CLOSED] Invalid radar_day shape: expected highlights array');
  }

  assertAllowed(calendar, allowlistIds);
  console.log(`✓ Fail-closed allowlist check passed (${allowlistIds.size} leagues in allowlist)`);

  generatedAtUtc = String(calendar?.meta?.generated_at_utc || new Date().toISOString());
  baseDate = String(calendar?.meta?.base_date || '').trim();
  const safeGenerated = generatedAtUtc.replace(/[:.]/g, '-');
  const versionSuffix = `${baseDate || 'unknown'}_${safeGenerated}`;
  versionedKey = `snapshots/calendar_2d_${versionSuffix}.json`;
  versionedPath = path.join(SNAPSHOTS_DIR, `calendar_2d_${versionSuffix}.json`);

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(calendar, null, 2), 'utf8');
  fs.writeFileSync(SNAPSHOT_LATEST_PATH, JSON.stringify(calendar, null, 2), 'utf8');
  fs.writeFileSync(versionedPath, JSON.stringify(calendar, null, 2), 'utf8');
  fs.writeFileSync(RADAR_DAY_SNAPSHOT_PATH, JSON.stringify(radarDay, null, 2), 'utf8');
  fs.writeFileSync(RADAR_DAY_SNAPSHOT_LATEST_PATH, JSON.stringify(radarDay, null, 2), 'utf8');
  console.log(`✓ Wrote snapshot to: ${SNAPSHOT_PATH}`);
  console.log(`✓ Wrote latest pointer to: ${SNAPSHOT_LATEST_PATH}`);
  console.log(`✓ Wrote versioned snapshot to: ${versionedPath}`);
  console.log(`✓ Wrote radar snapshot to: ${RADAR_DAY_SNAPSHOT_PATH}`);
  console.log(`✓ Wrote radar latest pointer to: ${RADAR_DAY_SNAPSHOT_LATEST_PATH}`);

  const today = calendar.today || [];
  console.log(`  Total matches today: ${today.length}`);
  if (today.length > 0) {
    console.log(`  First match: ${today[0].home} vs ${today[0].away} (${today[0].kickoff_utc})`);
  } else {
    console.log('  No matches today.');
  }
}

function loadValidLeagueSnapshots() {
  const validSnapshots = [];
  const failures = [];

  for (const target of LEAGUE_SNAPSHOT_TARGETS) {
    if (!fs.existsSync(target.local)) {
      failures.push({ slug: target.slug, reason: 'missing_local_snapshot' });
      continue;
    }

    try {
      const snapshot = JSON.parse(fs.readFileSync(target.local, 'utf8'));
      if (!Array.isArray(snapshot?.standings) || !snapshot?.competition?.slug) {
        throw new Error('invalid_snapshot_shape');
      }
      assertLeaguePageSnapshotUsesApiFootball(snapshot, target.definition);
      assertLeaguePageSnapshotHasCoreData(snapshot);
      validSnapshots.push({ ...target, snapshot });
    } catch (err) {
      failures.push({ slug: target.slug, reason: err?.message || String(err) });
    }
  }

  return { validSnapshots, failures };
}

function loadFixtureModelAuxiliaryTargets(validSnapshots) {
  const targets = [];

  for (const snapshotTarget of validSnapshots) {
    if (!snapshotTarget?.definition?.useFixtureModel) continue;

    const leagueLayerDir = path.join(LEAGUES_DIR, snapshotTarget.slug);
    for (const fileName of FIXTURE_MODEL_LAYER_FILES) {
      const local = path.join(leagueLayerDir, fileName);
      if (!fs.existsSync(local)) continue;
      targets.push({
        slug: snapshotTarget.slug,
        local,
        remote: `snapshots/leagues/${snapshotTarget.slug}/${fileName}`,
        auxiliary: true
      });
    }
  }

  return targets;
}

const { validSnapshots: leagueSnapshots, failures: leagueSnapshotFailures } = uploadLeagueArtifacts
  ? loadValidLeagueSnapshots()
  : { validSnapshots: [], failures: [] };
const leagueAuxiliaryTargets = uploadLeagueArtifacts
  ? loadFixtureModelAuxiliaryTargets(leagueSnapshots)
  : [];

if (uploadLeagueArtifacts) {
  if (leagueSnapshots.length > 0) {
    console.log(`✓ Valid league snapshots ready for upload: ${leagueSnapshots.map((entry) => entry.slug).join(', ')}`);
  }
  if (leagueSnapshotFailures.length > 0) {
    console.warn(`[LEAGUE-UPLOAD] skipped snapshots: ${leagueSnapshotFailures.map((entry) => `${entry.slug}:${entry.reason}`).join(' | ')}`);
  }
  if (leagueSnapshots.length <= 0) {
    throw new Error('[FAIL-CLOSED] No valid league snapshots available for upload.');
  }
}

// Now upload to R2 using wrangler
console.log(`\n📤 Uploading to R2 using wrangler...`);

const uploadTargets = [];
if (uploadCalendarArtifacts) {
  uploadTargets.push(
    { local: SNAPSHOT_PATH, remote: 'snapshots/calendar_2d.json' },
    { local: SNAPSHOT_LATEST_PATH, remote: 'snapshots/latest_calendar_2d.json' },
    { local: versionedPath, remote: versionedKey },
    { local: RADAR_DAY_SNAPSHOT_PATH, remote: 'snapshots/radar_day.json' },
    { local: RADAR_DAY_SNAPSHOT_LATEST_PATH, remote: 'snapshots/latest_radar_day.json' },
    { local: COVERAGE_ALLOWLIST_PATH, remote: 'data/coverage_allowlist.json' }
  );
}
if (uploadLeagueArtifacts) {
  uploadTargets.push(...leagueSnapshots.map((entry) => ({ local: entry.local, remote: entry.remote, slug: entry.slug })));
  uploadTargets.push(...leagueAuxiliaryTargets);
}

async function uploadTarget(target) {
  const wranglerArgs = [
    'wrangler',
    'r2',
    'object',
    'put',
    '--remote',
    `${R2_BUCKET}/${target.remote}`,
    '--file',
    target.local,
    '--content-type',
    'application/json'
  ];

  assertNotBlocked7D(target.local, 'snapshot_file');
  assertNotBlocked7D(`${R2_BUCKET}/${target.remote}`, 'remote_key');
  for (const arg of wranglerArgs) {
    assertNotBlocked7D(arg, 'wrangler_arg');
  }

  await new Promise((resolve, reject) => {
    const proc = spawn('npx', wranglerArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`upload_failed remote=${target.remote} code=${code}`));
      }
    });
  });
}

async function verifyMainSnapshot() {
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

  await new Promise((resolve, reject) => {
    const verify = spawn('npx', verifyArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    verify.on('close', (verifyCode) => {
      if (verifyCode === 0) resolve();
      else reject(new Error(`verify_failed code=${verifyCode}`));
    });
  });
}

async function verifyUploadedLeagueSnapshot(target) {
  const localTmp = `tmp_verify_${target.slug}.json`;
  const verifyArgs = [
    'wrangler',
    'r2',
    'object',
    'get',
    '--remote',
    `${R2_BUCKET}/${target.remote}`,
    '--file',
    localTmp
  ];

  for (const arg of verifyArgs) {
    assertNotBlocked7D(arg, 'verify_arg');
  }

  await new Promise((resolve, reject) => {
    const verify = spawn('npx', verifyArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    verify.on('close', (verifyCode) => {
      if (verifyCode === 0) resolve();
      else reject(new Error(`verify_failed remote=${target.remote} code=${verifyCode}`));
    });
  });

  const downloaded = JSON.parse(fs.readFileSync(path.join(ROOT, localTmp), 'utf8'));
  assertLeaguePageSnapshotUsesApiFootball(downloaded, target.definition);
  assertLeaguePageSnapshotHasCoreData(downloaded);
}

async function verifyUploadedJsonArtifact(target) {
  const localTmp = `tmp_verify_${target.slug}_${path.basename(target.remote).replace(/[^a-z0-9.-]/gi, '_')}`;
  const verifyArgs = [
    'wrangler',
    'r2',
    'object',
    'get',
    '--remote',
    `${R2_BUCKET}/${target.remote}`,
    '--file',
    localTmp
  ];

  for (const arg of verifyArgs) {
    assertNotBlocked7D(arg, 'verify_arg');
  }

  await new Promise((resolve, reject) => {
    const verify = spawn('npx', verifyArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    verify.on('close', (verifyCode) => {
      if (verifyCode === 0) resolve();
      else reject(new Error(`verify_failed remote=${target.remote} code=${verifyCode}`));
    });
  });

  JSON.parse(fs.readFileSync(path.join(ROOT, localTmp), 'utf8'));
}

(async () => {
  try {
    for (const target of uploadTargets) {
      await uploadTarget(target);
    }

    if (uploadCalendarArtifacts) {
      await verifyMainSnapshot();
      const downloaded = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp_r2_calendar_2d_verify.json'), 'utf8'));
      const size = fs.statSync(path.join(ROOT, 'tmp_r2_calendar_2d_verify.json')).size;
      console.log(`\n✅ Calendar snapshots uploaded to R2!`);
      console.log(`   Bucket: ${R2_BUCKET}`);
      console.log(`   Keys:`);
      console.log(`   - snapshots/calendar_2d.json`);
      console.log(`   - snapshots/latest_calendar_2d.json`);
      console.log(`   - ${versionedKey}`);
      console.log(`   - snapshots/radar_day.json`);
      console.log(`   - snapshots/latest_radar_day.json`);
      console.log(`   - data/coverage_allowlist.json`);
      console.log(`   Size(main): ${size} bytes`);
      console.log(`   meta.generated_at_utc: ${downloaded?.meta?.generated_at_utc || 'n/a'}`);
      console.log(`   radar_day.generated_at_utc: ${radarDay?.generated_at_utc || 'n/a'}`);
    }

    if (uploadLeagueArtifacts) {
      for (const target of leagueSnapshots) {
        await verifyUploadedLeagueSnapshot(target);
      }
      for (const target of leagueAuxiliaryTargets) {
        await verifyUploadedJsonArtifact(target);
      }
      console.log(`\n✅ League snapshots uploaded to R2!`);
      for (const target of leagueSnapshots) {
        console.log(`   - ${target.remote}`);
      }
      for (const target of leagueAuxiliaryTargets) {
        console.log(`   - ${target.remote}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Upload failed: ${err.message}`);
    console.error('Make sure you have:');
    console.error('   - npx/wrangler available');
    console.error('   - CLOUDFLARE_ACCOUNT_ID environment variable set');
    console.error('   - Proper R2 perms with API token (via .env.local or env var)');
    process.exit(1);
  }
})();
