#!/usr/bin/env node
/**
 * Deploy script without npm/wrangler CLI
 * Deploys the worker by calling Cloudflare API directly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error(`❌ Missing Cloudflare credentials`);
  console.error(`   Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables`);
  console.error(`   Or create a .env.local file with these variables`);
  process.exit(1);
}

// Read the worker source code
const workerPath = path.join(__dirname, 'workers', 'radartips-api', 'src', 'index.js');
const workerCode = fs.readFileSync(workerPath, 'utf8');

console.log('📤 Deploying Cloudflare Worker...');
console.log(`   Script: ${workerPath}`);
console.log(`   Size: ${Math.ceil(workerCode.length / 1024)}KB`);

// Deploy to Cloudflare
const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/radartips`;

const data = JSON.stringify({
  main: {
    name: 'index.js',
    type: 'esmodule',
    content: workerCode
  }
});

const req = https.request(url, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  },
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      if (res.statusCode >= 200 && res.statusCode < 300 && json.success) {
        console.log(`\n✅ Worker deployed successfully!`);
        console.log(`   URL: https://radartips.com/api/match-stats?fixture=1492143`);
        process.exit(0);
      } else {
        console.error(`\n❌ Deployment failed (${res.statusCode})`);
        console.error(json.errors || json.messages || body);
        process.exit(1);
      }
    } catch (e) {
      console.error(`\n❌ Parse error:`, e.message);
      console.error(body);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error(`❌ Request failed:`, err.message);
  process.exit(1);
});

req.write(data);
req.end();
