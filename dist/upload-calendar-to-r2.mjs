#!/usr/bin/env node
/**
 * Publish calendar_2d to R2 at exactly `${prefix}/snapshots/calendar_2d.json` (Worker read path).
 * Radar Day is embedded as `radar_day` inside that JSON — no separate radar R2 objects.
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
/** Pinned; do not override with latest wrangler (CI + local must match). */
const WRANGLER_PKG = 'wrangler@4.62.0';
const UPLOAD_MAX_ATTEMPTS = Math.max(
  1,
  Math.min(10, Number.parseInt(String(process.env.RADARTIPS_R2_UPLOAD_RETRIES || '3'), 10) || 3)
);

const PREFIX = String(process.env.RADARTIPS_SNAPSHOT_PREFIX || '')
  .trim()
  .replace(/^\/+|\/+$/g, '');
if (PREFIX !== 'prod' && PREFIX !== 'preview') {
  throw new Error(
    '[FAIL-CLOSED] RADARTIPS_SNAPSHOT_PREFIX must be set to prod or preview (isolated R2 namespaces).'
  );
}

if (PREFIX === 'preview' && !process.env.CI && process.env.RADARTIPS_CONFIRM_PREVIEW_UPLOAD !== '1') {
  throw new Error(
    '[FAIL-CLOSED] Preview uploads require RADARTIPS_CONFIRM_PREVIEW_UPLOAD=1 when not running in CI (prevents accidental preview publish).'
  );
}

if (PREFIX === 'prod' && process.env.RADARTIPS_DENY_PROD_UPLOAD === '1') {
  throw new Error('[FAIL-CLOSED] RADARTIPS_DENY_PROD_UPLOAD=1 blocks production namespace writes');
}

// Wrangler and the Cloudflare REST API expect these names; map common aliases before any R2 calls.
(function normalizeWranglerAuthAliases() {
  const tok = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const cfTok = String(process.env.CF_API_TOKEN || '').trim();
  if (!tok && cfTok) process.env.CLOUDFLARE_API_TOKEN = cfTok;
  const acct = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const cfAcct = String(process.env.CF_ACCOUNT_ID || '').trim();
  if (!acct && cfAcct) process.env.CLOUDFLARE_ACCOUNT_ID = cfAcct;
})();

/** @param {string} rel e.g. snapshots/calendar_2d.json */
function remote(rel) {
  const r = String(rel || '').replace(/^\/+/, '');
  return `${PREFIX}/${r}`;
}

/** Worker + CI always read `${prefix}/snapshots/calendar_2d.json`. Unprefixed keys break validation and prod API. */
function assertPrefixedR2Key(remoteKey, context) {
  const key = String(remoteKey || '');
  const expected = `${PREFIX}/`;
  if (!key.startsWith(expected)) {
    throw new Error(
      `[FAIL-CLOSED] R2 object key must start with ${JSON.stringify(expected)} (${context}, got ${JSON.stringify(key)}).`
    );
  }
}

const CALENDAR_2D_PATH = path.join(ROOT, 'data', 'v1', 'calendar_2d.json');
const COVERAGE_ALLOWLIST_PATH = path.join(ROOT, 'data', 'coverage_allowlist.json');
const LEAGUES_DIR = path.join(ROOT, 'data', 'v1', 'leagues');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'v1', 'snapshots');
const SNAPSHOT_PATH = path.join(SNAPSHOTS_DIR, 'calendar_2d.json');
const BLOCKED_7D_PATTERN = /calendar_7d/i;
const LEAGUE_SNAPSHOT_TARGETS = LEAGUE_PAGE_V1_DEFINITIONS.map((entry) => ({
  slug: entry.slug,
  local: path.join(LEAGUES_DIR, `${entry.slug}.json`),
  remote: remote(`snapshots/leagues/${entry.slug}.json`),
  definition: entry
}));
const FIXTURE_MODEL_LAYER_FILES = [
  'meta.json',
  'raw-fixtures.json',
  'fixture-stats.json',
  'raw-events.json',
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
let allowlistIds = null;
let generatedAtUtc = new Date().toISOString();
let baseDate = '';
let versionedKey = null;
let versionedPath = null;

if (uploadCalendarArtifacts) {
  calendar = JSON.parse(fs.readFileSync(CALENDAR_2D_PATH, 'utf8'));
  allowlistIds = readAllowlistLeagueIds();

  if (!calendar.meta || typeof calendar.meta !== 'object') {
    throw new Error('[FAIL-CLOSED] calendar_2d.meta must be an object');
  }
  /** Worker validateCalendarAllowlist requires non-empty meta.allowlist_league_ids (same scope as coverage_allowlist.json). */
  const allowlistSorted = Array.from(allowlistIds).sort((a, b) => a - b);
  if (!allowlistSorted.length) {
    throw new Error('[FAIL-CLOSED] coverage allowlist yielded no league ids');
  }
  calendar.meta.allowlist_league_ids = allowlistSorted;

  if (!Array.isArray(calendar?.today) || !Array.isArray(calendar?.tomorrow)) {
    throw new Error('[FAIL-CLOSED] Invalid calendar_2d shape: expected today/tomorrow arrays');
  }

  if (!calendar?.radar_day || typeof calendar.radar_day !== 'object') {
    throw new Error(
      '[FAIL-CLOSED] calendar_2d must embed radar_day (derive highlights in the calendar pipeline only; no separate radar_day.json)'
    );
  }
  if (!Array.isArray(calendar.radar_day.highlights)) {
    throw new Error('[FAIL-CLOSED] calendar_2d.radar_day.highlights must be an array');
  }

  assertAllowed(calendar, allowlistIds);
  console.log(`✓ Fail-closed allowlist check passed (${allowlistIds.size} leagues in allowlist)`);

  generatedAtUtc = String(calendar?.meta?.generated_at_utc || new Date().toISOString());
  baseDate = String(calendar?.meta?.base_date || '').trim();
  const safeGenerated = generatedAtUtc.replace(/[:.]/g, '-');
  const versionSuffix = `${baseDate || 'unknown'}_${safeGenerated}`;
  versionedKey = remote(`snapshots/calendar_2d_${versionSuffix}.json`);
  versionedPath = path.join(SNAPSHOTS_DIR, `calendar_2d_${versionSuffix}.json`);

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(calendar, null, 2), 'utf8');
  fs.writeFileSync(versionedPath, JSON.stringify(calendar, null, 2), 'utf8');
  console.log(`✓ Wrote snapshot to: ${SNAPSHOT_PATH}`);
  console.log(`✓ Wrote versioned snapshot to: ${versionedPath}`);

  const today = calendar.today || [];
  const hl = calendar.radar_day.highlights.length;
  console.log(`  Total matches today: ${today.length}; radar_day highlights: ${hl}`);
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
        remote: remote(`snapshots/leagues/${snapshotTarget.slug}/${fileName}`),
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
console.log(`\n📤 Uploading to R2 using wrangler (${WRANGLER_PKG}, max ${UPLOAD_MAX_ATTEMPTS} attempts/object)...`);

/** Canonical object path; must match workers reading `${prefix}/snapshots/calendar_2d.json` and CI `r2 object get`. */
const CANONICAL_CALENDAR_REMOTE = remote('snapshots/calendar_2d.json');

const uploadTargets = [];
if (uploadCalendarArtifacts) {
  uploadTargets.push(
    { local: SNAPSHOT_PATH, remote: CANONICAL_CALENDAR_REMOTE },
    { local: versionedPath, remote: versionedKey },
    { local: COVERAGE_ALLOWLIST_PATH, remote: remote('data/coverage_allowlist.json') }
  );
}
if (uploadLeagueArtifacts) {
  uploadTargets.push(...leagueSnapshots.map((entry) => ({ local: entry.local, remote: entry.remote, slug: entry.slug })));
  uploadTargets.push(...leagueAuxiliaryTargets);
}

for (const target of uploadTargets) {
  assertPrefixedR2Key(target.remote, `upload target ${path.basename(target.local) || target.local}`);
}

function spawnWrangler(args) {
  const wranglerArgs = ['--yes', WRANGLER_PKG, ...args];
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', wranglerArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    proc.on('error', (err) => {
      reject(new Error(`wrangler_spawn_failed: ${err?.message || err}`));
    });
    proc.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const sig = signal ? ` signal=${signal}` : '';
        reject(new Error(`wrangler_exit code=${code}${sig}`));
      }
    });
  });
}

function maskAccountId(id) {
  const s = String(id || '').trim();
  if (s.length <= 8) return s ? '(set)' : '(missing)';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Cheap R2 permission check before multi-object upload. Set RADARTIPS_SKIP_R2_PREFLIGHT=1 to skip. */
async function preflightR2ApiAccess() {
  if (String(process.env.RADARTIPS_SKIP_R2_PREFLIGHT || '').trim() === '1') {
    return;
  }
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!token) {
    throw new Error(
      '[R2-PREFLIGHT] Missing CLOUDFLARE_API_TOKEN (or CF_API_TOKEN). Add to .env.production.local or export in the shell.'
    );
  }
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!accountId) {
    throw new Error(
      '[R2-PREFLIGHT] Missing CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID). Required for R2 API calls.'
    );
  }
  console.log(
    `[R2-PREFLIGHT] account_id=${maskAccountId(accountId)} bucket=${R2_BUCKET} prefix=${PREFIX}/ (Workers R2 Storage: Edit required)`
  );
  try {
    // wrangler 4.x: `r2 bucket list` has no --remote (unlike `r2 object put/get`).
    await spawnWrangler(['r2', 'bucket', 'list']);
  } catch (e) {
    console.error('\n[R2-PREFLIGHT] wrangler r2 bucket list failed.');
    console.error(
      'HTTP 403 or API error 10000 here usually means the token cannot use R2 (e.g. Pages-only token).'
    );
    console.error('Dashboard → My Profile → API Tokens → Edit token → Permissions:');
    console.error('  • Account → Workers R2 Storage → Edit');
    console.error(`  • Scope includes bucket "${R2_BUCKET}" (or all buckets in this account)`);
    console.error('  • Account ID on the token must match CLOUDFLARE_ACCOUNT_ID for that bucket.\n');
    throw e;
  }
}

async function uploadTargetOnce(target) {
  const fullKey = `${R2_BUCKET}/${target.remote}`;
  /** Wrangler 4.x: objectPath is positional `{bucket}/{key}`; `--remote` is a boolean flag (not a prefix to the path). */
  const wranglerArgs = [
    'r2',
    'object',
    'put',
    fullKey,
    '--file',
    target.local,
    '--content-type',
    'application/json',
    '--remote',
  ];

  assertNotBlocked7D(target.local, 'snapshot_file');
  assertNotBlocked7D(fullKey, 'remote_key');
  for (const arg of wranglerArgs) {
    assertNotBlocked7D(arg, 'wrangler_arg');
  }

  await spawnWrangler(wranglerArgs);
}

async function uploadTarget(target) {
  const fullKey = `${R2_BUCKET}/${target.remote}`;
  const label = target.slug ? `${fullKey} (league=${target.slug})` : fullKey;
  let lastErr = null;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    console.log(
      `[R2-UPLOAD] ${attempt}/${UPLOAD_MAX_ATTEMPTS} PUT ${label} local=${path.relative(ROOT, target.local) || target.local}`
    );
    try {
      await uploadTargetOnce(target);
      console.log(`[R2-UPLOAD] OK ${fullKey}`);
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[R2-UPLOAD] FAIL ${fullKey}: ${err?.message || err}`);
      if (attempt < UPLOAD_MAX_ATTEMPTS) {
        const delayMs = 2000 * attempt;
        console.log(`[R2-UPLOAD] retry in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error(`upload_failed after ${UPLOAD_MAX_ATTEMPTS} attempts remote=${target.remote} last=${lastErr?.message || lastErr}`);
}

async function verifyMainSnapshot() {
  const fullKey = `${R2_BUCKET}/${CANONICAL_CALENDAR_REMOTE}`;
  const verifyArgs = [
    'r2',
    'object',
    'get',
    fullKey,
    '--file',
    'tmp_r2_calendar_2d_verify.json',
    '--remote',
  ];

  for (const arg of verifyArgs) {
    assertNotBlocked7D(arg, 'verify_arg');
  }

  console.log(`[R2-VERIFY] GET ${fullKey} -> tmp_r2_calendar_2d_verify.json`);
  await spawnWrangler(verifyArgs);
  console.log(`[R2-VERIFY] OK ${fullKey}`);
}

async function verifyUploadedLeagueSnapshot(target) {
  const localTmp = `tmp_verify_${target.slug}.json`;
  const fullKey = `${R2_BUCKET}/${target.remote}`;
  const verifyArgs = ['r2', 'object', 'get', fullKey, '--file', localTmp, '--remote'];

  for (const arg of verifyArgs) {
    assertNotBlocked7D(arg, 'verify_arg');
  }

  console.log(`[R2-VERIFY] GET ${fullKey} -> ${localTmp}`);
  await spawnWrangler(verifyArgs);
  console.log(`[R2-VERIFY] OK ${fullKey}`);

  const downloaded = JSON.parse(fs.readFileSync(path.join(ROOT, localTmp), 'utf8'));
  assertLeaguePageSnapshotUsesApiFootball(downloaded, target.definition);
  assertLeaguePageSnapshotHasCoreData(downloaded);
}

async function verifyUploadedJsonArtifact(target) {
  const localTmp = `tmp_verify_${target.slug}_${path.basename(target.remote).replace(/[^a-z0-9.-]/gi, '_')}`;
  const fullKey = `${R2_BUCKET}/${target.remote}`;
  const verifyArgs = ['r2', 'object', 'get', fullKey, '--file', localTmp, '--remote'];

  for (const arg of verifyArgs) {
    assertNotBlocked7D(arg, 'verify_arg');
  }

  console.log(`[R2-VERIFY] GET ${fullKey} -> ${localTmp}`);
  await spawnWrangler(verifyArgs);
  console.log(`[R2-VERIFY] OK ${fullKey}`);

  JSON.parse(fs.readFileSync(path.join(ROOT, localTmp), 'utf8'));
}

(async () => {
  try {
    await preflightR2ApiAccess();
    console.log(`[R2-UPLOAD] queue=${uploadTargets.length} object(s) bucket=${R2_BUCKET} prefix=${PREFIX}/`);
    for (const target of uploadTargets) {
      await uploadTarget(target);
    }

    if (uploadCalendarArtifacts) {
      await verifyMainSnapshot();
      const downloaded = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp_r2_calendar_2d_verify.json'), 'utf8'));
      const size = fs.statSync(path.join(ROOT, 'tmp_r2_calendar_2d_verify.json')).size;
      console.log(`\n✅ Calendar snapshots uploaded to R2!`);
      console.log(`   Bucket: ${R2_BUCKET}`);
      console.log(`   Prefix: ${PREFIX}`);
      console.log(`   Keys:`);
      console.log(`   - ${CANONICAL_CALENDAR_REMOTE} (canonical)`);
      console.log(`   - ${versionedKey}`);
      console.log(`   - ${remote('data/coverage_allowlist.json')}`);
      console.log(`   Size(main): ${size} bytes`);
      console.log(`   meta.generated_at_utc: ${downloaded?.meta?.generated_at_utc || 'n/a'}`);
      const dh = downloaded?.radar_day?.highlights;
      console.log(`   radar_day.highlights: ${Array.isArray(dh) ? dh.length : 'missing'}`);
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
    console.error('   - CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (.env.production.local or shell)');
    console.error('   - Token permission: Account → Workers R2 Storage → Edit (Pages-only tokens get 403 on R2)');
    console.error('   - R2_BUCKET_NAME=radartips-data if your bucket name differs');
    process.exit(1);
  }
})();
