#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generate hash for match-radar-v2.css and create hashed copy
 * @param {string} rootDir - Project root directory (defaults to process.cwd())
 * @returns {Promise<{filename: string, hash: string, path: string}>}
 */
export async function generateMatchRadarCssHash(rootDir = process.cwd()) {
  const cssPath = path.join(rootDir, 'assets/css/match-radar-v2.css');
  const buf = await fs.readFile(cssPath);
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  const newName = `match-radar-v2.${hash}.css`;
  const distPath = path.join(rootDir, 'assets', newName);
  
  await fs.copyFile(cssPath, distPath);
  return {
    filename: newName,
    hash,
    path: `assets/${newName}`
  };
}

/**
 * Get the most recent match-radar-v2.*.css file from assets directory
 * @param {string} rootDir - Project root directory (defaults to process.cwd())
 * @returns {Promise<{filename: string, path: string} | null>}
 */
export async function getLatestMatchRadarCssFile(rootDir = process.cwd()) {
  try {
    const assetsDir = path.join(rootDir, 'assets');
    const files = await fs.readdir(assetsDir);
    const hashed = files
      .filter(f => /^match-radar-v2\.[a-f0-9]{12}\.css$/.test(f))
      .sort()
      .reverse(); // Most recent first
    
    if (hashed.length === 0) return null;
    
    return {
      filename: hashed[0],
      path: `assets/${hashed[0]}`
    };
  } catch (e) {
    return null;
  }
}

// CLI usage
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const ROOT = process.cwd();
  try {
    const result = await generateMatchRadarCssHash(ROOT);
    console.log(`✅ New CSS hash file created:`);
    console.log(`   File: ${result.filename}`);
    console.log(`   Path: ${result.path}`);
    console.log(`   Hash: ${result.hash}`);
    
    // Also list all hashed CSS files for reference
    const assetsDir = path.join(ROOT, 'assets');
    const files = await fs.readdir(assetsDir);
    const hashed = files.filter(f => /^match-radar-v2\.[a-f0-9]{12}\.css$/.test(f));
    console.log(`\nAll hashed versions in assets/:`);
    hashed.forEach(f => console.log(`   - ${f}`));
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}
