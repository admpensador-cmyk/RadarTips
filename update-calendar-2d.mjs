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

// const CALENDAR_URL = 'https://radartips-data.m2otta-music.workers.dev/v1/calendar_2d.json'; // Desligado
const OUTPUT_2D_PATH = path.join(ROOT, 'data', 'v1', 'calendar_2d.json');
// const OUTPUT_7D_PATH = path.join(ROOT, 'data', 'v1', 'calendar_7d.json'); // Desligado
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
    console.log(`📥 Fetching calendar from: ${CALENDAR_URL}`);
    const calendar = await fetchJSON(CALENDAR_URL);
    
    if (!calendar.matches || calendar.matches.length === 0) {
      console.error('❌ No matches in calendar data');
      process.exit(1);
    }
    
    console.log(`✓ Fetched ${calendar.matches.length} matches`);
    
    // Show first 3 matches
    console.log('\n📅 First 3 matches:');
    calendar.matches.slice(0, 3).forEach((m, i) => {
      console.log(`  ${i+1}. ${m.home} vs ${m.away} (${m.kickoff_utc})`);
    });
    
    // Count matches by date
    const dateGroups = {};
    calendar.matches.forEach(m => {
      const date = m.kickoff_utc?.substring(0, 10) || 'unknown';
      dateGroups[date] = (dateGroups[date] || 0) + 1;
    });
    console.log('\n📊 Matches by date:');
    Object.entries(dateGroups).sort().forEach(([date, count]) => {
      console.log(`  ${date}: ${count} matches`);
    });
    
    const sortedMatches = Array.isArray(calendar.matches) ? [...calendar.matches] : [];
    sortedMatches.sort((a, b) => (Date.parse(a?.kickoff_utc || '') || 0) - (Date.parse(b?.kickoff_utc || '') || 0));

    const today = isoDateOnlyInTimezone(new Date(), TIMEZONE);
    const tomorrow = addDaysToIsoDate(today, 1);

    const todayMatches = [];
    const tomorrowMatches = [];
    for (const match of sortedMatches) {
      const ymd = localDateInTimezone(match?.kickoff_utc, TIMEZONE);
      if (!ymd) continue;
      if (ymd === today) todayMatches.push(match);
      else if (ymd === tomorrow) tomorrowMatches.push(match);
    }

    const calendar2d = {
      meta: {
        tz: TIMEZONE,
        today,
        tomorrow,
        generated_at_utc: calendar.generated_at_utc || new Date().toISOString(),
        form_window: Number(calendar.form_window || 5),
        goals_window: Number(calendar.goals_window || 5),
        source: 'calendar_2d'
      },
      today: todayMatches,
      tomorrow: tomorrowMatches
    };

    fs.writeFileSync(OUTPUT_7D_PATH, JSON.stringify(calendar, null, 2), 'utf8');
    fs.writeFileSync(OUTPUT_2D_PATH, JSON.stringify(calendar2d, null, 2), 'utf8');
    console.log(`\n✅ Saved 7d snapshot to: ${OUTPUT_7D_PATH}`);
    console.log(`✅ Saved 2d snapshot to: ${OUTPUT_2D_PATH}`);

    const firstToday = todayMatches[0];
    console.log(`\n🔍 First TODAY match details (${today}):`);
    console.log(`  Home: ${firstToday?.home || '-'} (ID: ${firstToday?.home_id || '-'})`);
    console.log(`  Away: ${firstToday?.away || '-'} (ID: ${firstToday?.away_id || '-'})`);
    console.log(`  Kickoff: ${firstToday?.kickoff_utc || '-'}`);
    console.log(`  Stats: gf_home=${firstToday?.gf_home ?? '-'}, ga_home=${firstToday?.ga_home ?? '-'}, gf_away=${firstToday?.gf_away ?? '-'}, ga_away=${firstToday?.ga_away ?? '-'}`);
    console.log(`\n📌 2D counts: today=${todayMatches.length}, tomorrow=${tomorrowMatches.length}`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
