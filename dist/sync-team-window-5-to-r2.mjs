#!/usr/bin/env node
/**
 * Sync team-window-5 snapshots to Cloudflare R2
 * Uses Cloudflare API directly (no wrangler CLI needed)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

const TEAM_WINDOW_DIR = path.join(ROOT, 'data', 'v1', 'team-window-5');

// Get credentials from environment
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error(`❌ Environment variables not set:`);
  console.error(`   CLOUDFLARE_API_TOKEN: ${CF_API_TOKEN ? '✓' : '✗ MISSING'}`);
  console.error(`   CLOUDFLARE_ACCOUNT_ID: ${CF_ACCOUNT_ID ? '✓' : '✗ MISSING'}`);
  console.error(`\n💡 Set these in .env.local or via environment variables`);
  console.error(`   Example: export CLOUDFLARE_API_TOKEN="your_token"`);
  process.exit(1);
}

if (!fs.existsSync(TEAM_WINDOW_DIR)) {
  console.error(`❌ Directory not found: ${TEAM_WINDOW_DIR}`);
  process.exit(1);
}

// Recursively find all .json files in team-window-5
function getAllJsonFiles(dir) {
  let files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files = files.concat(getAllJsonFiles(fullPath));
    } else if (item.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = getAllJsonFiles(TEAM_WINDOW_DIR);
console.log(`📂 Found ${files.length} team-window-5 snapshot files`);

if (files.length === 0) {
  console.error(`❌ No JSON files found in ${TEAM_WINDOW_DIR}`);
  process.exit(1);
}

// Show sample
console.log(`   Sample files:`);
files.slice(0, 3).forEach(f => {
  const rel = path.relative(TEAM_WINDOW_DIR, f);
  console.log(`   - team-window-5/${rel}`);
});
console.log(`   ... and ${files.length - 3} more`);

// Upload each file to R2 using Cloudflare API
let uploaded = 0;
let failed = [];

async function uploadFile(filePath) {
  const rel = path.relative(TEAM_WINDOW_DIR, filePath)
    .replace(/\\/g, '/'); // Convert Windows paths to forward slashes
  const r2Path = `team-window-5/${rel}`;

  return new Promise((resolve) => {
    const fileContent = fs.readFileSync(filePath);
    
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/radartips-data/objects/snapshots/${r2Path}`;

    const req = https.request(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': fileContent.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          uploaded++;
          console.log(`  ✓ ${r2Path}`);
          resolve(true);
        } else {
          failed.push(r2Path);
          console.log(`  ✗ ${r2Path} (${res.statusCode})`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      failed.push(r2Path);
      console.log(`  ✗ ${r2Path} (${err.message})`);
      resolve(false);
    });

    req.write(fileContent);
    req.end();
  });
}

async function uploadAll() {
  console.log(`\n📤 Starting upload to R2...`);
  console.log(`   Bucket: radartips-data`);
  console.log(`   Path: snapshots/team-window-5/*\n`);
  
  // Upload with concurrency limit (10 at a time)
  const batchSize = 10;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(batch.map(uploadFile));
    const progress = Math.min(i + batchSize, files.length);
    console.log(`   Progress: ${progress}/${files.length}`);
  }

  console.log(`\n✅ Upload complete!`);
  console.log(`   Uploaded: ${uploaded} files`);
  if (failed.length > 0) {
    console.log(`   Failed: ${failed.length} files`);
  }
  console.log(`\n💡 Stats will be available once R2 replicates (usually <1 minute)`);
  console.log(`   Hard refresh browser with Ctrl+F5 to force cache clear`);
  
  process.exit(failed.length > 0 ? 1 : 0);
}

uploadAll();
