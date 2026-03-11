#!/usr/bin/env node
/**
 * Clean old hashed bundles before build
 * 
 * Removes all app.<hash>.js files from:
 * - assets/js/
 * - dist/assets/js/
 * - legacy assets/ and dist/assets/
 * 
 * Preserves:
 * - assets/js/app.js (source file)
 * - All other non-bundle files
 */

import { readdir, unlink } from 'fs/promises';
import { join } from 'path';

const ROOT = process.cwd();

const TARGETS = [
  { dir: join(ROOT, 'assets', 'js'), label: 'assets/js/' },
  { dir: join(ROOT, 'dist', 'assets', 'js'), label: 'dist/assets/js/' },
  { dir: join(ROOT, 'assets'), label: 'assets/ (legacy)' },
  { dir: join(ROOT, 'dist', 'assets'), label: 'dist/assets/ (legacy)' }
];

async function cleanBundles() {
  console.log('🧹 Cleaning old hashed bundles...\n');
  
  let totalRemoved = 0;
  
  for (const target of TARGETS) {
    let removed = 0;
    
    try {
      const files = await readdir(target.dir).catch(() => []);
      
      for (const file of files) {
        // Match pattern: app.<hash>.js (supports short git SHA or longer hash)
        if (/^app\.[a-f0-9]{7,40}\.js$/.test(file)) {
          const fullPath = join(target.dir, file);
          await unlink(fullPath);
          removed++;
          console.log(`  ✓ Removed ${target.label}${file}`);
        }
      }
    } catch (e) {
      // Directory doesn't exist yet - ok
    }
    
    if (removed > 0) {
      console.log(`\n  ${target.label}: ${removed} bundle(s) removed\n`);
      totalRemoved += removed;
    } else {
      console.log(`  ${target.label}: no old bundles found\n`);
    }
  }
  
  if (totalRemoved > 0) {
    console.log(`✅ Total: ${totalRemoved} old bundle(s) removed\n`);
  } else {
    console.log('✅ No old bundles to clean\n');
  }
  
  return totalRemoved;
}

// Run if called directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  cleanBundles().catch(console.error);
}

export { cleanBundles };
