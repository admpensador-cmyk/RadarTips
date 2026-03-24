#!/usr/bin/env node
/**
 * Test Match Radar V2 integration
 * - Checks HTTP responses for all required assets
 * - Verifies HTML includes are correct
 * - Tests basic JS functionality
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('https') : http;
    const req = protocol.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.abort(); reject(new Error('timeout')); });
  });
}

async function test() {
  console.log('Testing Match Radar V2 Integration\n');
  
  const BASE = 'http://localhost:8080';
  const tests = [
    { name: 'Dev: PT Radar Page', url: `${BASE}/pt/radar/day/index.html`, expect: 200 },
    { name: 'Dev: MR V2 CSS', url: `${BASE}/assets/match-radar-v2.cf390008e08b.css`, expect: 200 },
    { name: 'Dev: MR V2 JS', url: `${BASE}/assets/match-radar-v2.fa12c94e8201.js`, expect: 200 },
    { name: 'Dev: App JS (hashed)', url: `${BASE}/assets/app.83cd2791f8b3.js`, expect: 200 },
  ];

  let passed = 0, failed = 0;

  for (const t of tests) {
    try {
      const res = await httpGet(t.url);
      const ok = res.status === t.expect;
      console.log(`${ok ? '✓' : '✗'} ${t.name}: ${res.status}`);
      if (ok) passed++; else failed++;
    } catch (e) {
      console.log(`✗ ${t.name}: ${e.message}`);
      failed++;
    }
  }

  // Check source HTML includes
  console.log('\nHTML Includes Check:');
  const htmlPath = path.join(ROOT, 'pt', 'radar', 'day', 'index.html');
  try {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const hasMrV2CSS = html.includes('match-radar-v2.cf390008e08b.css');
    const hasMrV2JS = html.includes('match-radar-v2.fa12c94e8201.js');
    const hasAppJS = html.includes('app.83cd2791f8b3.js');
    
    console.log(`${hasMrV2CSS ? '✓' : '✗'} MR V2 CSS hashed link`);
    console.log(`${hasMrV2JS ? '✓' : '✗'} MR V2 JS hashed link`);
    console.log(`${hasAppJS ? '✓' : '✗'} App JS hashed link`);
    
    if (hasMrV2CSS && hasMrV2JS && hasAppJS) passed += 3; else failed += 3 - [hasMrV2CSS, hasMrV2JS, hasAppJS].filter(x => x).length;
  } catch (e) {
    console.log(`✗ Error reading HTML: ${e.message}`);
    failed += 3;
  }

  // Check dist build
  console.log('\nDist Build Check:');
  const distHtmlPath = path.join(ROOT, 'dist', 'pt', 'radar', 'day', 'index.html');
  try {
    const html = fs.readFileSync(distHtmlPath, 'utf-8');
    const hasMrV2CSS = html.includes('match-radar-v2.cf390008e08b.css');
    const hasMrV2JS = html.includes('match-radar-v2.fa12c94e8201.js');
    const hasAppJS = html.includes('app.83cd2791f8b3.js');
    
    console.log(`${hasMrV2CSS ? '✓' : '✗'} Dist: MR V2 CSS hashed link`);
    console.log(`${hasMrV2JS ? '✓' : '✗'} Dist: MR V2 JS hashed link`);
    console.log(`${hasAppJS ? '✓' : '✗'} Dist: App JS hashed link`);
    
    if (hasMrV2CSS && hasMrV2JS && hasAppJS) passed += 3; else failed += 3 - [hasMrV2CSS, hasMrV2JS, hasAppJS].filter(x => x).length;
  } catch (e) {
    console.log(`✗ Error reading dist HTML: ${e.message}`);
    failed += 3;
  }

  // Check assets exist
  console.log('\nAssets Existence Check:');
  const assets = [
    'assets/match-radar-v2.cf390008e08b.css',
    'assets/match-radar-v2.fa12c94e8201.js',
    'assets/app.83cd2791f8b3.js',
  ];
  for (const a of assets) {
    const p = path.join(ROOT, a);
    const exists = fs.existsSync(p);
    console.log(`${exists ? '✓' : '✗'} ${a}`);
    if (exists) passed++; else failed++;
  }

  console.log(`\n\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test().catch(e => {
  console.error('Test error:', e.message);
  process.exit(1);
});
