#!/usr/bin/env node
/**
 * PO Build Pipeline Audit
 * Verifies that the entire build is robust and requires no manual steps
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function httpGet(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, size: data.length }));
    }).on('error', () => resolve({ status: 0, size: 0 })).on('timeout', function() {
      this.abort();
      resolve({ status: 0, size: 0 });
    });
  });
}

const tests = [];
const addTest = (section, name, pass, detail = '') => {
  tests.push({ section, name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} [${section}] ${name}${detail ? ' - ' + detail : ''}`);
};

async function audit() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   PO Build Pipeline Audit - Match Radar V2                ║');
  console.log('║   Verifying: no manual steps, full consistency             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 1. VERIFY BUILD PIPELINE CONFIG
  console.log('📋 1. Build Pipeline Configuration\n');
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf-8'));
    const buildScript = pkgJson.scripts?.build;
    const hasBuildAll = buildScript?.includes('build.mjs') || buildScript?.includes('hash-js');
    addTest('Pipeline', 'package.json has "build" script', !!buildScript, buildScript || 'NOT FOUND');
    addTest('Pipeline', 'build script is integrated (hash + static)', hasBuildAll);
  } catch (e) {
    addTest('Pipeline', 'package.json readable', false, e.message);
  }

  // 2. VERIFY SOURCE HTML CONSISTENCY
  console.log('\n📄 2. Source HTML Hash Consistency\n');
  const sourcePages = ['pt/radar/day/index.html', 'en/radar/day/index.html', 'es/radar/day/index.html'];
  let sourceAppHash = null;
  let sourceMrV2Js = null;
  let sourceMrV2Css = null;

  for (const page of sourcePages) {
    try {
      const html = await fs.readFile(path.join(ROOT, page), 'utf-8');
      const appMatch = html.match(/app\.([a-f0-9]{12})\.js/);
      const mrV2JsMatch = html.match(/match-radar-v2\.([a-f0-9]{12})\.js/);
      const mrV2CssMatch = html.match(/match-radar-v2\.([a-f0-9]{12})\.css/);

      if (appMatch?.[1]) {
        sourceAppHash = sourceAppHash || appMatch[1];
        addTest('Source HTML', `${page} has app hash`, appMatch[1] === sourceAppHash);
      }
      if (mrV2JsMatch?.[1]) {
        sourceMrV2Js = sourceMrV2Js || mrV2JsMatch[1];
        addTest('Source HTML', `${page} has MR V2 JS hash`, mrV2JsMatch[1] === sourceMrV2Js);
      }
      if (mrV2CssMatch?.[1]) {
        sourceMrV2Css = sourceMrV2Css || mrV2CssMatch[1];
        addTest('Source HTML', `${page} has MR V2 CSS hash`, mrV2CssMatch[1] === sourceMrV2Css);
      }
    } catch (e) {
      addTest('Source HTML', `${page} readable`, false, e.message);
    }
  }

  // 3. VERIFY DIST/ HTML CONSISTENCY
  console.log('\n🏗️  3. Dist/ HTML Hash Consistency\n');
  let distAppHash = null;
  let distMrV2Js = null;
  let distMrV2Css = null;

  for (const page of sourcePages) {
    try {
      const distPath = path.join(ROOT, 'dist', page);
      const html = await fs.readFile(distPath, 'utf-8');
      const appMatch = html.match(/app\.([a-f0-9]{12})\.js/);
      const mrV2JsMatch = html.match(/match-radar-v2\.([a-f0-9]{12})\.js/);
      const mrV2CssMatch = html.match(/match-radar-v2\.([a-f0-9]{12})\.css/);

      if (appMatch?.[1]) {
        distAppHash = distAppHash || appMatch[1];
        addTest('Dist HTML', `${page} has app hash (dist)`, appMatch[1] === distAppHash);
      }
      if (mrV2JsMatch?.[1]) {
        distMrV2Js = distMrV2Js || mrV2JsMatch[1];
        addTest('Dist HTML', `${page} has MR V2 JS hash (dist)`, mrV2JsMatch[1] === distMrV2Js);
      }
      if (mrV2CssMatch?.[1]) {
        distMrV2Css = distMrV2Css || mrV2CssMatch[1];
        addTest('Dist HTML', `${page} has MR V2 CSS hash (dist)`, mrV2CssMatch[1] === distMrV2Css);
      }
    } catch (e) {
      addTest('Dist HTML', `${page} readable (dist)`, false, e.message);
    }
  }

  // 4. VERIFY SOURCE == DIST CONSISTENCY
  console.log('\n🔗 4. Source ↔ Dist Consistency\n');
  addTest('Consistency', 'App hash source == dist', sourceAppHash === distAppHash, 
    sourceAppHash ? `${sourceAppHash.slice(0,8)}...` : 'MISMATCH');
  addTest('Consistency', 'MR V2 JS hash source == dist', sourceMrV2Js === distMrV2Js,
    sourceMrV2Js ? `${sourceMrV2Js.slice(0,8)}...` : 'MISMATCH');
  addTest('Consistency', 'MR V2 CSS hash source == dist', sourceMrV2Css === distMrV2Css,
    sourceMrV2Css ? `${sourceMrV2Css.slice(0,8)}...` : 'MISMATCH');

  // 5. VERIFY ASSETS EXIST
  console.log('\n📦 5. Production Assets Existence\n');
  const assets = [
    `assets/app.${sourceAppHash}.js`,
    `assets/match-radar-v2.${sourceMrV2Js}.js`,
    `assets/match-radar-v2.${sourceMrV2Css}.css`,
    `dist/assets/app.${sourceAppHash}.js`,
    `dist/assets/match-radar-v2.${sourceMrV2Js}.js`,
    `dist/assets/match-radar-v2.${sourceMrV2Css}.css`,
  ];

  for (const asset of assets) {
    try {
      await fs.stat(path.join(ROOT, asset));
      addTest('Assets', asset, true, 'present');
    } catch (e) {
      addTest('Assets', asset, false, 'NOT FOUND');
    }
  }

  // 6. VERIFY RUNTIME PATHS
  console.log('\n⚙️  6. Runtime Path Correctness\n');
  try {
    const mrV2Js = await fs.readFile(path.join(ROOT, 'assets/js/match-radar-v2.js'), 'utf-8');
    addTest('Runtime', 'MR V2 exports openMatchRadarV2', mrV2Js.includes('window.openMatchRadarV2 ='));
    addTest('Runtime', 'MR V2 has fallback CSS path', mrV2Js.includes('/assets/css/match-radar-v2.css'));
    addTest('Runtime', 'MR V2 prefers linked CSS', mrV2Js.includes('querySelector') && mrV2Js.includes('match-radar-v2'));
  } catch (e) {
    addTest('Runtime', 'MR V2 JS readable', false, e.message);
  }

  // 7. VERIFY HTTP AVAILABILITY (if dev server running)
  console.log('\n🌐 7. HTTP Asset Availability (dev server)\n');
  const httpTests = [
    { url: 'http://localhost:8080/pt/radar/day/index.html', name: 'PT Radar page' },
    { url: `http://localhost:8080/assets/app.${sourceAppHash}.js`, name: 'App JS (hashed)' },
    { url: `http://localhost:8080/assets/match-radar-v2.${sourceMrV2Js}.js`, name: 'MR V2 JS (hashed)' },
    { url: `http://localhost:8080/assets/match-radar-v2.${sourceMrV2Css}.css`, name: 'MR V2 CSS (hashed)' },
  ];

  for (const test of httpTests) {
    const res = await httpGet(test.url);
    addTest('HTTP', test.name, res.status === 200, `${res.status || 'no server'}`);
  }

  // SUMMARY
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  const passed = tests.filter(t => t.pass).length;
  const total = tests.length;
  const pct = Math.round((passed / total) * 100);
  console.log(`║  Result: ${passed}/${total} checks passed (${pct}%)${' '.repeat(Math.max(0, 38 - `${passed}/${total}`.length))}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (passed === total) {
    console.log('✅ BUILD PIPELINE IS PRODUCTION READY\n');
    console.log('📋 Summary:');
    console.log('  • Build pipeline is fully integrated (no manual steps)');
    console.log('  • Source and dist/ HTML are consistent');
    console.log(`  • App hash: ${sourceAppHash}`);
    console.log(`  • MR V2 JS hash: ${sourceMrV2Js}`);
    console.log(`  • MR V2 CSS hash: ${sourceMrV2Css}`);
    console.log('\n🚀 To build: node tools/build.mjs (or npm run build)');
    console.log('🧪 To test: node tools/final-validation.mjs (or npm run test)\n');
  } else {
    console.log('⚠️  ISSUES FOUND - Review above\n');
  }

  return passed === total ? 0 : 1;
}

audit().then(code => process.exit(code)).catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
