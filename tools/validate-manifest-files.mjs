#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const V1_DIR = path.join(ROOT, 'data', 'v1');
const MANIFEST_PATH = path.join(V1_DIR, 'manifest.json');

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ Manifest not found: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const missing = [];

  for (const entry of entries) {
    if (entry?.standings?.file) {
      const target = path.join(V1_DIR, entry.standings.file);
      if (!fs.existsSync(target)) {
        missing.push(`[${entry.leagueId}/${entry.season}] standings -> ${entry.standings.file}`);
      }
    }

    if (entry?.compstats?.file) {
      const target = path.join(V1_DIR, entry.compstats.file);
      if (!fs.existsSync(target)) {
        missing.push(`[${entry.leagueId}/${entry.season}] compstats -> ${entry.compstats.file}`);
      }
    }
  }

  if (missing.length > 0) {
    console.error('❌ Manifest references missing files:');
    for (const issue of missing) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`✅ Manifest validation passed (${entries.length} entries)`);
}

main();
