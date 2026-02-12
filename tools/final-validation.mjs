#!/usr/bin/env node
/**
 * Final End-to-End Validation Report
 * Checks all aspects of Match Radar V2 implementation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.abort(); reject(new Error('timeout')); });
  });
}

const report = [];
const addTest = (category, name, result) => {
  report.push({ category, name, result });
  console.log(`${result ? '✓' : '✗'} [${category}] ${name}`);
};

async function validate() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Match Radar V2 - End-to-End Validation Report         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 1. File existence checks
  console.log('📁 File Existence:\n');
  const files = [
    { path: 'assets/js/match-radar-v2.js', name: 'MR V2 JS source' },
    { path: 'assets/css/match-radar-v2.css', name: 'MR V2 CSS source' },
    { path: 'assets/js/app.js', name: 'App JS source' },
    { path: 'assets/match-radar-v2.cf390008e08b.css', name: 'MR V2 CSS hashed' },
    { path: 'assets/match-radar-v2.fa12c94e8201.js', name: 'MR V2 JS hashed' },
    { path: 'assets/app.83cd2791f8b3.js', name: 'App JS hashed' },
    { path: 'dist/assets/match-radar-v2.cf390008e08b.css', name: 'Dist: MR V2 CSS' },
    { path: 'dist/assets/match-radar-v2.fa12c94e8201.js', name: 'Dist: MR V2 JS' },
    { path: 'dist/assets/app.83cd2791f8b3.js', name: 'Dist: App JS' },
  ];

  for (const f of files) {
    const exists = fs.existsSync(path.join(ROOT, f.path));
    addTest('Files', f.name, exists);
  }

  // 2. HTML Include checks
  console.log('\n🔗 HTML Includes:\n');
  const htmlFiles = [
    { path: 'pt/radar/day/index.html', name: 'PT Radar (source)' },
    { path: 'dist/pt/radar/day/index.html', name: 'PT Radar (dist)' },
    { path: 'en/radar/day/index.html', name: 'EN Radar (source)' },
    { path: 'dist/en/radar/day/index.html', name: 'EN Radar (dist)' },
  ];

  for (const f of htmlFiles) {
    try {
      const html = fs.readFileSync(path.join(ROOT, f.path), 'utf-8');
      const hasMrV2CSS = html.includes('match-radar-v2.cf390008e08b.css');
      const hasMrV2JS = html.includes('match-radar-v2.fa12c94e8201.js');
      const hasAppJS = html.includes('app.83cd2791f8b3.js');
      const allPresent = hasMrV2CSS && hasMrV2JS && hasAppJS;
      addTest('HTML Includes', `${f.name} (all hashes)`, allPresent);
    } catch (e) {
      addTest('HTML Includes', `${f.name} (read)`, false);
    }
  }

  // 3. JavaScript syntax & content
  console.log('\n🔧 JavaScript Validation:\n');
  try {
    const mrv2 = fs.readFileSync(path.join(ROOT, 'assets/js/match-radar-v2.js'), 'utf-8');
    addTest('JavaScript', 'MR V2 has openMatchRadarV2', mrv2.includes('window.openMatchRadarV2 = openMatchRadarV2'));
    addTest('JavaScript', 'MR V2 has getMatchRadarV2Data', mrv2.includes('window.getMatchRadarV2Data = getMatchRadarV2Data'));
    addTest('JavaScript', 'MR V2 has renderModal', mrv2.includes('function renderModal'));
    addTest('JavaScript', 'MR V2 has bindTabs', mrv2.includes('function bindTabs'));
    addTest('JavaScript', 'MR V2 has renderMarketsTab', mrv2.includes('function renderMarketsTab'));
    addTest('JavaScript', 'MR V2 has renderStatsTab', mrv2.includes('function renderStatsTab'));
  } catch (e) {
    addTest('JavaScript', 'MR V2 source read', false);
  }

  try {
    const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf-8');
    addTest('JavaScript', 'App has V2 routing (line 2262)', app.includes('if(window.openMatchRadarV2) return window.openMatchRadarV2'));
    addTest('JavaScript', 'App has V2 routing (line 2329)', app.match(/openMatchRadarV2.*fixtureId/g)?.length >= 2);
  } catch (e) {
    addTest('JavaScript', 'App source read', false);
  }

  // 4. CSS validation
  console.log('\n🎨 CSS Validation:\n');
  try {
    const css = fs.readFileSync(path.join(ROOT, 'assets/css/match-radar-v2.css'), 'utf-8');
    addTest('CSS', 'Has overlay styles', css.includes('.mr-v2-overlay'));
    addTest('CSS', 'Has modal box styles', css.includes('.mr-v2-box'));
    addTest('CSS', 'Has tab styles', css.includes('.mr-v2-tabs'));
    addTest('CSS', 'Has table styles', css.includes('.mr-table'));
    addTest('CSS', 'Has stats bar styles', css.includes('.mr-bar'));
  } catch (e) {
    addTest('CSS', 'source read', false);
  }

  // 5. HTTP availability (if server running)
  console.log('\n🌐 HTTP Availability:\n');
  const httpTests = [
    { url: 'http://localhost:8080/pt/radar/day/index.html', name: 'Dev: PT Radar page' },
    { url: 'http://localhost:8080/assets/match-radar-v2.cf390008e08b.css', name: 'Dev: MR V2 CSS' },
    { url: 'http://localhost:8080/assets/match-radar-v2.fa12c94e8201.js', name: 'Dev: MR V2 JS' },
    { url: 'http://localhost:8080/assets/app.83cd2791f8b3.js', name: 'Dev: App JS' },
  ];

  for (const t of httpTests) {
    try {
      const res = await httpGet(t.url);
      addTest('HTTP', t.name, res.status === 200);
    } catch (e) {
      addTest('HTTP', `${t.name} (connection)`, false);
    }
  }

  // 6. Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  const passed = report.filter(r => r.result).length;
  const total = report.length;
  const percentage = Math.round((passed / total) * 100);
  console.log(`║  Summary: ${passed}/${total} tests passed (${percentage}%)${' '.repeat(Math.max(0, 48 - `${passed}/${total} tests passed (${percentage}%)`.length))}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (passed === total) {
    console.log('✨ All validations PASSED! Match Radar V2 is ready.\n');
    return 0;
  } else {
    console.log(`⚠️  ${total - passed} validation(s) failed. Review above.\n`);
    return 1;
  }
}

validate().then(exitCode => process.exit(exitCode)).catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
