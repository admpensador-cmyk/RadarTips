#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'v1');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const CONFIG_PATH = path.join(ROOT, 'tools', 'snapshots-config.json');

const STANDINGS_RE = /^standings_(\d+)_(\d+)\.json$/;
const COMPSTATS_RE = /^compstats_(\d+)_(\d+)\.json$/;
const CUP_RE = /^cup_(\d+)_(\d+)\.json$/;

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function safeReadJSON(filePath, buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (e) {
    return null;
  }
}

function loadSeasonRules() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.season_rules || null;
  } catch (e) {
    return null;
  }
}

function buildEntryFromFile(fileName) {
  const standingsMatch = fileName.match(STANDINGS_RE);
  const compstatsMatch = fileName.match(COMPSTATS_RE);
  const cupMatch = fileName.match(CUP_RE);
  
  if (!standingsMatch && !compstatsMatch && !cupMatch) return null;

  const leagueId = Number((standingsMatch || compstatsMatch || cupMatch)[1]);
  const season = Number((standingsMatch || compstatsMatch || cupMatch)[2]);

  const filePath = path.join(DATA_DIR, fileName);
  const originalBuffer = fs.readFileSync(filePath);
  const parsed = safeReadJSON(filePath, originalBuffer);

  let buffer = originalBuffer;
  let type = 'league'; // default
  
  if (parsed && typeof parsed === 'object') {
    let updated = false;
    if (Number(parsed.schemaVersion) !== 1) {
      parsed.schemaVersion = 1;
      updated = true;
    }
    if (!parsed.meta || typeof parsed.meta !== 'object') {
      parsed.meta = { leagueId, season };
      updated = true;
    } else {
      if (Number(parsed.meta.leagueId) !== leagueId || Number(parsed.meta.season) !== season) {
        parsed.meta = { leagueId, season };
        updated = true;
      }
    }

    // Detect type from meta or file name
    if (parsed.meta?.type === 'cup' || cupMatch) {
      type = 'cup';
    }

    if (updated) {
      buffer = Buffer.from(JSON.stringify(parsed, null, 2), 'utf8');
      fs.writeFileSync(filePath, buffer);
    }
  }

  // Determine data status
  let dataStatus = 'ok';
  if (parsed && parsed.standings && Array.isArray(parsed.standings) && parsed.standings.length === 0) {
    dataStatus = 'empty';
  }

  return {
    leagueId,
    season,
    file: fileName,
    sha1: sha1(buffer),
    bytes: buffer.length,
    generated_at_utc: parsed?.generated_at_utc || null,
    schemaVersion: parsed?.schemaVersion ?? null,
    type,
    seasonSource: parsed?.meta?.seasonSource || null,
    dataStatus
  };
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(DATA_DIR);
  const entriesMap = new Map();
  let standingsCount = 0;
  let compstatsCount = 0;
  let cupCount = 0;

  for (const fileName of files) {
    const match = fileName.match(STANDINGS_RE) || fileName.match(COMPSTATS_RE) || fileName.match(CUP_RE);
    if (!match) continue;

    const info = buildEntryFromFile(fileName);
    if (!info) continue;

    const key = `${info.leagueId}|${info.season}`;
    if (!entriesMap.has(key)) {
      entriesMap.set(key, {
        leagueId: info.leagueId,
        season: info.season,
      });
    }

    const entry = entriesMap.get(key);
    if (fileName.startsWith('standings_')) {
      entry.standings = info;
      standingsCount++;
    } else if (fileName.startsWith('compstats_')) {
      entry.compstats = info;
      compstatsCount++;
    } else if (fileName.startsWith('cup_')) {
      entry.cup = info;
      cupCount++;
    }
  }

  const entries = Array.from(entriesMap.values())
    .sort((a, b) => (a.leagueId - b.leagueId) || (a.season - b.season));

  const manifest = {
    schemaVersion: 1,
    generated_at_utc: new Date().toISOString(),
    season_rules: loadSeasonRules(),
    totals: {
      standings: standingsCount,
      compstats: compstatsCount,
      cups: cupCount,
      entries: entries.length,
    },
    entries,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✅ Manifest generated: ${MANIFEST_PATH}`);
  console.log(`   Entries: ${entries.length} | Standings: ${standingsCount} | Compstats: ${compstatsCount} | Cups: ${cupCount}`);
}

main();

