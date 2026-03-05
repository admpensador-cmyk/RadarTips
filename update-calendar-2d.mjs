#!/usr/bin/env node
/**
 * Update calendar_2d.json from production data worker
 * Gera calendar_2d.json a partir da allowlist e dados permitidos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

const CALENDAR_URL = 'https://radartips-data.m2otta-music.workers.dev/v1/calendar_2d.json';
const OUTPUT_2D_PATH = path.join(ROOT, 'data', 'v1', 'calendar_2d.json');
const TIMEZONE = 'America/Sao_Paulo';

function isoDateOnlyInTimezone(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function addDaysToIsoDate(isoDate, days) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function localDateInTimezone(isoUtc, timezone) {
  const t = Date.parse(isoUtc || '');
  if (!Number.isFinite(t)) return null;
  return isoDateOnlyInTimezone(new Date(t), timezone);
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    console.log(`📥 Fetching calendar_2d from: ${CALENDAR_URL}`);
    const calendar2d = await fetchJSON(CALENDAR_URL);

    if (!calendar2d || !Array.isArray(calendar2d.today) || !Array.isArray(calendar2d.tomorrow)) {
      console.error('❌ Invalid calendar_2d payload (missing today/tomorrow arrays)');
      process.exit(1);
    }

    fs.writeFileSync(OUTPUT_2D_PATH, JSON.stringify(calendar2d, null, 2), 'utf8');
    console.log(`✅ Saved 2d snapshot to: ${OUTPUT_2D_PATH}`);

    const firstToday = calendar2d.today[0];
    const todayLabel = calendar2d?.meta?.today || isoDateOnlyInTimezone(new Date(), TIMEZONE);
    console.log(`\n🔍 First TODAY match details (${todayLabel}):`);
    console.log(`  Home: ${firstToday?.home || '-'} (ID: ${firstToday?.home_id || '-'})`);
    console.log(`  Away: ${firstToday?.away || '-'} (ID: ${firstToday?.away_id || '-'})`);
    console.log(`  Kickoff: ${firstToday?.kickoff_utc || '-'}`);
    console.log(`  Stats: gf_home=${firstToday?.gf_home ?? '-'}, ga_home=${firstToday?.ga_home ?? '-'}, gf_away=${firstToday?.gf_away ?? '-'}, ga_away=${firstToday?.ga_away ?? '-'}`);
    console.log(`\n📌 2D counts: today=${calendar2d.today.length}, tomorrow=${calendar2d.tomorrow.length}`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
