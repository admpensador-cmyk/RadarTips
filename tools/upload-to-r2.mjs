#!/usr/bin/env node
/**
 * Upload Compstats to R2 (Manual)
 * 
 * Requires:
 * - CLOUDFLARE_API_TOKEN
 * - CLOUDFLARE_ACCOUNT_ID  
 * - R2_BUCKET_NAME
 * 
 * Environment variables can be set via:
 *   $env:CLOUDFLARE_API_TOKEN = "..."
 *   $env:CLOUDFLARE_ACCOUNT_ID = "..."
 *   $env:R2_BUCKET_NAME = "radartips-data"
 * 
 * Usage:
 *   node tools/upload-to-r2.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'v1');

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'radartips-data';

console.log(`\n╔════════════════════════════════════════════════╗`);
console.log(`║ 📤 Upload to R2 (Manual)                      ║`);
console.log(`╚════════════════════════════════════════════════╝\n`);

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error(`❌ Missing environment variables:`);
  console.error(`   CLOUDFLARE_API_TOKEN: ${CLOUDFLARE_API_TOKEN ? '✓ set' : '❌ NOT SET'}`);
  console.error(`   CLOUDFLARE_ACCOUNT_ID: ${CLOUDFLARE_ACCOUNT_ID ? '✓ set' : '❌ NOT SET'}`);
  console.error(`\nSet them with:`);
  console.error(`   $env:CLOUDFLARE_API_TOKEN = "..."`);
  console.error(`   $env:CLOUDFLARE_ACCOUNT_ID = "..."\n`);
  process.exit(1);
}

console.log(`Bucket: ${R2_BUCKET_NAME}`);
console.log(`Account: ${CLOUDFLARE_ACCOUNT_ID.slice(0, 8)}...\n`);

// Find files to upload
const filesToUpload = [];

// Compstats files
const compstatsFiles = fs.readdirSync(DATA_DIR)
  .filter(f => f.startsWith('compstats_') && f.endsWith('.json'))
  .map(f => ({ local: path.join(DATA_DIR, f), remote: `v1/${f}`, name: f }));

filesToUpload.push(...compstatsFiles);

// Standings files
const standingsFiles = fs.readdirSync(DATA_DIR)
  .filter(f => f.startsWith('standings_') && f.endsWith('.json'))
  .map(f => ({ local: path.join(DATA_DIR, f), remote: `v1/${f}`, name: f }));

filesToUpload.push(...standingsFiles);

// Manifest
filesToUpload.push({
  local: path.join(DATA_DIR, 'manifest.json'),
  remote: 'v1/manifest.json',
  name: 'manifest.json'
});

console.log(`📦 Files to upload: ${filesToUpload.length}`);
console.log(`   - Compstats: ${compstatsFiles.length}`);
console.log(`   - Standings: ${standingsFiles.length}`);
console.log(`   - Manifest: 1\n`);

// Upload using wrangler
let uploaded = 0;
let failed = 0;

function uploadFile(index) {
  if (index >= filesToUpload.length) {
    console.log(`\n════════════════════════════════════════════════`);
    console.log(`✅ Uploaded: ${uploaded} files`);
    console.log(`❌ Failed: ${failed} files`);
    console.log(`════════════════════════════════════════════════\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const file = filesToUpload[index];
  console.log(`[${index + 1}/${filesToUpload.length}] ${file.name}...`, );

  const proc = spawn('wrangler', [
    'r2', 'object', 'put',
    `--remote`, `${R2_BUCKET_NAME}/${file.remote}`,
    '--file', file.local,
    '--content-type', 'application/json'
  ], {
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID
    },
    stdio: 'pipe'
  });

  let output = '';
  proc.stdout?.on('data', d => output += d);
  proc.stderr?.on('data', d => output += d);

  proc.on('close', code => {
    if (code === 0) {
      console.log(`✅`);
      uploaded++;
    } else {
      console.log(`❌ (exit code ${code})`);
      failed++;
    }
    uploadFile(index + 1);
  });

  proc.on('error', err => {
    console.log(`❌ ${err.message}`);
    failed++;
    uploadFile(index + 1);
  });
}

uploadFile(0);
