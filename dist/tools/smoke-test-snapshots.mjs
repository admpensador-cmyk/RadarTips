#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'v1');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

const R2_BASE_URL = process.env.R2_BASE_URL || '';

function failSummary(failures) {
  console.log('\n❌ Smoke test failed');
  failures.forEach(f => {
    console.log(`- ${f}`);
  });
  process.exit(1);
}

async function checkRemote(url, failures) {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      failures.push(`R2 ${res.status} for ${url}`);
    }
  } catch (e) {
    failures.push(`R2 error for ${url}: ${e.message}`);
  }
}

async function main() {
  const failures = [];
  let okCount = 0;
  let totalChecks = 0;

  if (!fs.existsSync(MANIFEST_PATH)) {
    failures.push(`manifest.json missing at ${MANIFEST_PATH}`);
    return failSummary(failures);
  }

  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    failures.push(`manifest.json parse error: ${e.message}`);
    return failSummary(failures);
  }

  if (!manifest || !Array.isArray(manifest.entries)) {
    failures.push('manifest.json entries missing or invalid');
    return failSummary(failures);
  }

  for (const entry of manifest.entries) {
    const leagueId = Number(entry.leagueId);
    const season = Number(entry.season);
    const idLabel = `${leagueId}|${season}`;

    if (!entry.standings || !entry.standings.file) {
      failures.push(`standings missing in manifest entry ${idLabel}`);
      continue;
    }

    const standingsPath = path.join(DATA_DIR, entry.standings.file);
    totalChecks++;
    if (!fs.existsSync(standingsPath)) {
      failures.push(`missing standings file ${entry.standings.file} for ${idLabel}`);
    } else {
      try {
        const standings = JSON.parse(fs.readFileSync(standingsPath, 'utf8'));
        if (Number(standings.schemaVersion) !== 1) {
          failures.push(`schemaVersion mismatch in ${entry.standings.file}`);
        }
        if (Number(standings?.meta?.leagueId) !== leagueId || Number(standings?.meta?.season) !== season) {
          failures.push(`meta mismatch in ${entry.standings.file}`);
        }
        okCount++;
      } catch (e) {
        failures.push(`parse error in ${entry.standings.file}: ${e.message}`);
      }
    }

    if (entry.compstats && entry.compstats.file) {
      const compstatsPath = path.join(DATA_DIR, entry.compstats.file);
      totalChecks++;
      if (!fs.existsSync(compstatsPath)) {
        failures.push(`missing compstats file ${entry.compstats.file} for ${idLabel}`);
      } else {
        try {
          const compstats = JSON.parse(fs.readFileSync(compstatsPath, 'utf8'));
          if (Number(compstats.schemaVersion) !== 1) {
            failures.push(`schemaVersion mismatch in ${entry.compstats.file}`);
          }
          if (Number(compstats?.meta?.leagueId) !== leagueId || Number(compstats?.meta?.season) !== season) {
            failures.push(`meta mismatch in ${entry.compstats.file}`);
          }
          okCount++;
        } catch (e) {
          failures.push(`parse error in ${entry.compstats.file}: ${e.message}`);
        }
      }
    }
  }

  if (R2_BASE_URL) {
    const base = R2_BASE_URL.replace(/\/$/, '');
    await checkRemote(`${base}/manifest.json`, failures);

    const sampleSize = Math.min(5, manifest.entries.length);
    const sampleEntries = manifest.entries
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);

    for (const entry of sampleEntries) {
      if (entry.standings?.file) {
        await checkRemote(`${base}/${entry.standings.file}`, failures);
      }
      if (entry.compstats?.file) {
        await checkRemote(`${base}/${entry.compstats.file}`, failures);
      }
    }
  }

  if (failures.length) {
    return failSummary(failures);
  }

  console.log(`✅ Smoke test passed: ${okCount}/${totalChecks} files verified`);
  if (R2_BASE_URL) {
    console.log(`✅ R2 checks passed for base: ${R2_BASE_URL}`);
  }
}

main();
