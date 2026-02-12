#!/usr/bin/env node
/**
 * Integrated Build Pipeline v2
 * 
 * This is the OFFICIAL build command. It ensures:
 * 1. Hash-js runs FIRST (updates source HTML + generates hashes)
 * 2. Build-static runs AFTER (copies everything to dist with correct refs)
 * 3. No manual steps required - single command does it all
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function runCmd(cmd, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️  Running: ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

async function main() {
  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           Radartips Integrated Build Pipeline            ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    // Step 1: Hash all assets and update source HTML
    console.log('\n📦 Step 1: Update asset hashes and source HTML references');
    console.log('   (updates: assets/*.js, assets/*.css, all source .html files)');
    await runCmd('node', ['tools/hash-js.mjs']);

    // Step 2: Copy everything to dist with consistent references
    console.log('\n📁 Step 2: Build production output to dist/');
    console.log('   (copies all assets and HTML to dist/, verifies hash consistency)');
    await runCmd('node', ['tools/build-static.mjs']);

    // Success
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Build Complete - Ready for Deployment                ║');
    console.log('║  📂 Output: dist/                                        ║');
    console.log('║  🚀 Next: npm run test (or deploy dist/)                 ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Build failed:', err.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Ensure Node.js >= 20 is installed');
    console.error('  2. Check that assets/js/app.js exists');
    console.error('  3. Run: npm run build (or node tools/build.mjs)');
    process.exit(1);
  }
}

main();
