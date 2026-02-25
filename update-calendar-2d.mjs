#!/usr/bin/env node
/**
 * Update calendar_2d.json from production data worker
 * Fetches latest calendar_7d snapshot and saves locally
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

const CALENDAR_URL = 'https://radartips-data.m2otta-music.workers.dev/v1/calendar_7d.json';
const OUTPUT_PATH = path.join(ROOT, 'data', 'v1', 'calendar_2d.json');

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
    
    // Save to file
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(calendar, null, 2), 'utf8');
    console.log(`\n✅ Saved to: ${OUTPUT_PATH}`);
    
    // Show first match details
    const first = calendar.matches[0];
    console.log(`\n🔍 First match details:`);
    console.log(`  Home: ${first.home} (ID: ${first.home_id})`);
    console.log(`  Away: ${first.away} (ID: ${first.away_id})`);
    console.log(`  Kickoff: ${first.kickoff_utc}`);
    console.log(`  Stats: gf_home=${first.gf_home}, ga_home=${first.ga_home}, gf_away=${first.gf_away}, ga_away=${first.ga_away}`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
