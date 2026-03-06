#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.join(process.cwd(), 'data', 'v1', 'calendar_2d.json');

if (!fs.existsSync(filePath)) {
  console.error(`Missing file: ${filePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(filePath, 'utf8');
const cal = JSON.parse(raw);

const metaToday = cal?.meta?.today || null;
const metaTomorrow = cal?.meta?.tomorrow || null;
const todayMatches = Array.isArray(cal?.today) ? cal.today : [];

const apiDateCounts = {};
const mismatches = [];

for (const m of todayMatches) {
  const apiDate = String(m?.api_date || '');
  apiDateCounts[apiDate || '(missing)'] = (apiDateCounts[apiDate || '(missing)'] || 0) + 1;
  if (!metaToday || apiDate !== metaToday) {
    mismatches.push({
      fixture_id: m?.fixture_id ?? null,
      competition_id: m?.competition_id ?? m?.league_id ?? null,
      competition: m?.competition ?? null,
      country: m?.country ?? null,
      api_date: apiDate || null,
      kickoff_utc: m?.kickoff_utc ?? null
    });
  }
}

console.log(`meta.today=${metaToday}`);
console.log(`meta.tomorrow=${metaTomorrow}`);
console.log(`today_count=${todayMatches.length}`);
console.log(`today_api_date_counts=${JSON.stringify(apiDateCounts)}`);
console.log(`today_api_date_mismatch_count=${mismatches.length}`);
console.log(`today_api_date_mismatches=${JSON.stringify(mismatches)}`);
