#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const cssPath = path.join(ROOT, 'assets/css/match-radar-v2.css');

try {
  const buf = await fs.readFile(cssPath);
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  const newName = `match-radar-v2.${hash}.css`;
  const distPath = path.join(ROOT, 'assets', newName);
  
  await fs.copyFile(cssPath, distPath);
  
  console.log(`✅ New CSS hash file created:`);
  console.log(`   File: ${newName}`);
  console.log(`   Path: assets/${newName}`);
  console.log(`   Hash: ${hash}`);
  
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
