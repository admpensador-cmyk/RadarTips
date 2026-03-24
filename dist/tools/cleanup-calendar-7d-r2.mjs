#!/usr/bin/env node
/**
 * Cleanup calendar_7d objects from R2 (safe, only 7d keys)
 *
 * Usage:
 *   node tools/cleanup-calendar-7d-r2.mjs --dry-run
 *   node tools/cleanup-calendar-7d-r2.mjs
 *
 * Env:
 *   R2_BUCKET_NAME (default: radartips-data)
 */

import { spawn } from 'child_process';

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'radartips-data';
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

const TARGET_KEYS = [
  'snapshots/calendar_7d.json',
  'v1/calendar_7d.json',
  'calendar_7d.json'
];

function assertSafeKey(key) {
  const text = String(key || '');
  if (!/calendar_7d/i.test(text)) {
    throw new Error(`[BLOCKED_7D] Refusing to delete non-7d key: ${text}`);
  }
  if (/calendar_2d/i.test(text)) {
    throw new Error(`[BLOCKED_7D] Refusing to touch 2d key: ${text}`);
  }
}

function runWranglerDelete(objectPath) {
  return new Promise((resolve) => {
    const proc = spawn('npx', [
      'wrangler',
      'r2',
      'object',
      'delete',
      '--remote',
      objectPath
    ], {
      stdio: 'pipe',
      env: process.env,
      shell: true
    });

    let output = '';
    proc.stdout?.on('data', (d) => {
      output += String(d);
    });
    proc.stderr?.on('data', (d) => {
      output += String(d);
    });

    proc.on('close', (code) => {
      resolve({ code, output: output.trim() });
    });

    proc.on('error', (err) => {
      resolve({ code: 1, output: err.message });
    });
  });
}

async function main() {
  console.log('\n[cleanup-7d] R2 bucket:', R2_BUCKET_NAME);
  console.log('[cleanup-7d] Mode:', isDryRun ? 'dry-run' : 'delete');

  for (const key of TARGET_KEYS) {
    assertSafeKey(key);
  }

  for (const key of TARGET_KEYS) {
    const objectPath = `${R2_BUCKET_NAME}/${key}`;

    if (isDryRun) {
      console.log(`[cleanup-7d] DRY-RUN would delete: ${objectPath}`);
      continue;
    }

    console.log(`[cleanup-7d] Deleting: ${objectPath}`);
    const result = await runWranglerDelete(objectPath);

    if (result.code === 0) {
      console.log('[cleanup-7d] ✅ ok');
    } else {
      console.log('[cleanup-7d] ⚠️ not deleted (possibly missing):', result.output || `exit=${result.code}`);
    }
  }

  console.log('\n[cleanup-7d] Done.');
}

main().catch((err) => {
  console.error('[cleanup-7d] FATAL:', err.message);
  process.exit(1);
});
