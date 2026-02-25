#!/usr/bin/env node
/**
 * Quick upload calendar_2d.json to R2 snapshots
 * Converts calendar_2d.json to snapshot format and uploads as calendar_7d.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

const CALENDAR_2D_PATH = path.join(ROOT, 'data', 'v1', 'calendar_2d.json');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'v1', 'snapshots');
const SNAPSHOT_PATH = path.join(SNAPSHOTS_DIR, 'calendar_7d.json');

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  console.log(`✓ Created snapshots directory: ${SNAPSHOTS_DIR}`);
}

// Read calendar_2d.json
const calendar = JSON.parse(fs.readFileSync(CALENDAR_2D_PATH, 'utf8'));

// Write as calendar_7d.json snapshot
fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(calendar, null, 2), 'utf8');
console.log(`✓ Wrote snapshot to: ${SNAPSHOT_PATH}`);

// Show stats
const today = calendar.matches.filter(m => m.kickoff_utc.substring(0, 10) === '2026-02-25');
console.log(`  Total matches: ${calendar.matches.length}`);
console.log(`  Today (2026-02-25): ${today.length}`);
console.log(`  First match: ${today[0]?.home} vs ${today[0]?.away} (${today[0]?.kickoff_utc})`);

// Now upload to R2 using wrangler
console.log(`\n📤 Uploading to R2 using wrangler...`);

const wranglerArgs = [
  'r2',
  'object',
  'upload',
  'radartips-data/snapshots/calendar_7d.json',
  SNAPSHOT_PATH,
  '--account-id=' + (process.env.CLOUDFLARE_ACCOUNT_ID || 'SET_ME'),
];

const proc = spawn('wrangler', wranglerArgs, {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

proc.on('close', (code) => {
  if (code === 0) {
    console.log(`\n✅ Calendar snapshot uploaded to R2!`);
    console.log(`   Path: snapshots/calendar_7d.json`);
    console.log(`   Should be live at: https://radartips-data.m2otta-music.workers.dev/v1/calendar_7d.json`);
    console.log(`   (may take 10-30 seconds to propagate via CDN)`);
  } else {
    console.error(`\n❌ Upload failed with code ${code}`);
    console.error(`Make sure you have:`);
    console.error(`   - wrangler installed: npm install -g wrangler`);
    console.error(`   - CLOUDFLARE_ACCOUNT_ID environment variable set`);
    console.error(`   - Proper R2 perms with API token (via .env.local or env var)`);
  }
  process.exit(code);
});
