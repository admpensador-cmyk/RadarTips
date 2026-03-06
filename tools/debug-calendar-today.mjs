#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const TZ = 'America/Bahia';
const root = process.cwd();

const dayPath = path.join(root, 'data', 'v1', 'calendar_day.json');
const calendar2dPath = path.join(root, 'data', 'v1', 'calendar_2d.json');

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatJson(value) {
  return JSON.stringify(value);
}

function dayKeyFromIso(iso, tz = TZ) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) return null;
  return `${y}-${m}-${d}`;
}

function todayKeyBahia() {
  return dayKeyFromIso(new Date().toISOString(), TZ);
}

function groupCountsByDay(matches) {
  const counts = {};
  for (const match of matches) {
    const key = dayKeyFromIso(match?.kickoff_utc, TZ);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function buildLeagueCounter(matches) {
  const byLeague = new Map();
  for (const match of matches) {
    const id = Number(match?.competition_id);
    if (!Number.isFinite(id)) continue;

    const prev = byLeague.get(id) || {
      competition_id: id,
      competition: match?.competition || 'Unknown',
      country: match?.country || 'Unknown',
      count: 0
    };

    prev.count += 1;
    byLeague.set(id, prev);
  }

  return [...byLeague.values()].sort((a, b) => b.count - a.count || a.competition_id - b.competition_id);
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

if (!exists(calendar2dPath)) {
  console.error(`Missing required file: ${calendar2dPath}`);
  process.exit(1);
}

const cal2d = readJson(calendar2dPath);
const dayData = exists(dayPath) ? readJson(dayPath) : null;

const rawMatches = Array.isArray(dayData?.matches)
  ? dayData.matches
  : Array.isArray(dayData)
    ? dayData
    : [];

const metaToday = cal2d?.meta?.today || todayKeyBahia();
const rawToday = rawMatches.filter((m) => dayKeyFromIso(m?.kickoff_utc, TZ) === metaToday);
const bucketToday = Array.isArray(cal2d?.today) ? cal2d.today : [];

const rawTopToday = buildLeagueCounter(rawToday);
const bucketTopToday = buildLeagueCounter(bucketToday);

const bucketByLeague = new Map(bucketTopToday.map((l) => [l.competition_id, l]));
const missingLeagues = rawTopToday.filter((rawLeague) => !bucketByLeague.has(rawLeague.competition_id));

printSection('CALENDAR_DAY (raw dayMatches)');
console.log(`source=${exists(dayPath) ? dayPath : 'not-found'}`);
console.log(`total_matches=${rawMatches.length}`);
console.log(`counts_by_day_bahia=${formatJson(groupCountsByDay(rawMatches))}`);
console.log(`top_leagues_today_bahia=${formatJson(rawTopToday)}`);

printSection('CALENDAR_2D (published buckets)');
console.log(`meta.today=${cal2d?.meta?.today || ''}`);
console.log(`today_count=${bucketToday.length}`);
console.log(`today_counts_by_day_bahia=${formatJson(groupCountsByDay(bucketToday))}`);
console.log(`top_leagues_today_bucket=${formatJson(bucketTopToday)}`);

printSection('DIFF: leagues present in raw today but missing in bucket today');
console.log(`missing_leagues=${formatJson(missingLeagues)}`);
