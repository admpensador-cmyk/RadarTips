#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const OLD_HASH = 'app.cba3bb4ebed9.js';
const NEW_HASH = 'app.83cd2791f8b3.js';

async function listHtmlFiles(dir) {
  const out = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...(await listHtmlFiles(p)));
      } else if (e.isFile() && e.name.endsWith('.html')) {
        out.push(p);
      }
    }
  } catch (e) {
    // ignore
  }
  return out;
}

async function updateHtml() {
  const files = await listHtmlFiles(ROOT);
  console.log(`Found ${files.length} HTML files to scan\n`);

  let updated = 0;
  for (const file of files) {
    try {
      let html = await fs.readFile(file, 'utf-8');
      if (html.includes(OLD_HASH)) {
        html = html.replaceAll(OLD_HASH, NEW_HASH);
        await fs.writeFile(file, html, 'utf-8');
        updated++;
        const rel = path.relative(ROOT, file);
        console.log(`✓ ${rel}`);
      }
    } catch (e) {
      console.log(`✗ Error reading ${file}: ${e.message}`);
    }
  }

  console.log(`\nUpdated ${updated} files`);
  return updated > 0 ? 0 : 1;
}

updateHtml().then(code => process.exit(code)).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
