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
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'v1', 'snapshots');
const SNAPSHOT_PATH = path.join(SNAPSHOTS_DIR, 'calendar_2d.json');

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  console.log(`✓ Created snapshots directory: ${SNAPSHOTS_DIR}`);
}

// Read calendar_2d.json
const calendar = JSON.parse(fs.readFileSync(CALENDAR_2D_PATH, 'utf8'));

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
