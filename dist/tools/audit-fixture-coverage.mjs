#!/usr/bin/env node

import { readFile, mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);

async function loadJSON(path) {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`❌ Error loading ${path}:`, e.message);
    return null;
  }
}

function extractFixtureIds(data, source) {
  const ids = new Set();
  
  if (!data) return ids;
  
  // calendar_7d.json format: { matches: [...] }
  if (source === 'calendar_7d' && Array.isArray(data.matches)) {
    data.matches.forEach(m => {
      const id = m.fixture_id || m.fixtureId || m.id;
      if (id) ids.add(Number(id));
    });
  }
  
  // radar_day.json format: { highlights: [...] }
  if (source === 'radar_day' && Array.isArray(data.highlights)) {
    data.highlights.forEach(m => {
      const id = m.fixture_id || m.fixtureId || m.id;
      if (id) ids.add(Number(id));
    });
  }
  
  // radar_week.json format: { items: [...] }
  if (source === 'radar_week' && Array.isArray(data.items)) {
    data.items.forEach(m => {
      const id = m.fixture_id || m.fixtureId || m.id;
      if (id) ids.add(Number(id));
    });
  }
  
  return ids;
}

async function main() {
  console.log('🔍 Fixture Coverage Audit\n');
  console.log('=' .repeat(60));
  
  // Load datasets
  const calendar7d = await loadJSON(`${rootDir}/data/v1/calendar_7d.json`);
  const radarDay = await loadJSON(`${rootDir}/data/v1/radar_day.json`);
  const radarWeek = await loadJSON(`${rootDir}/data/v1/radar_week.json`);
  
  // Extract fixture IDs
  const calendarIds = extractFixtureIds(calendar7d, 'calendar_7d');
  const radarDayIds = extractFixtureIds(radarDay, 'radar_day');
  const radarWeekIds = extractFixtureIds(radarWeek, 'radar_week');
  
  // Stats
  console.log('\n📊 Total Fixtures by Source:\n');
  console.log(`  calendar_7d:  ${calendarIds.size} fixtures`);
  console.log(`  radar_day:    ${radarDayIds.size} fixtures`);
  console.log(`  radar_week:   ${radarWeekIds.size} fixtures`);
  
  // Find gaps
  const inRadarDayNotInCalendar = [...radarDayIds].filter(id => !calendarIds.has(id));
  const inRadarWeekNotInCalendar = [...radarWeekIds].filter(id => !calendarIds.has(id));
  const inCalendarNotInRadarDay = [...calendarIds].filter(id => !radarDayIds.has(id));
  
  console.log('\n⚠️  Coverage Gaps:\n');
  console.log(`  In radar_day but NOT in calendar_7d: ${inRadarDayNotInCalendar.length}`);
  if (inRadarDayNotInCalendar.length > 0 && inRadarDayNotInCalendar.length <= 10) {
    console.log(`    IDs: ${inRadarDayNotInCalendar.join(', ')}`);
  } else if (inRadarDayNotInCalendar.length > 10) {
    console.log(`    First 10 IDs: ${inRadarDayNotInCalendar.slice(0, 10).join(', ')}`);
  }
  
  console.log(`\n  In radar_week but NOT in calendar_7d: ${inRadarWeekNotInCalendar.length}`);
  if (inRadarWeekNotInCalendar.length > 0 && inRadarWeekNotInCalendar.length <= 10) {
    console.log(`    IDs: ${inRadarWeekNotInCalendar.join(', ')}`);
  } else if (inRadarWeekNotInCalendar.length > 10) {
    console.log(`    First 10 IDs: ${inRadarWeekNotInCalendar.slice(0, 10).join(', ')}`);
  }
  
  console.log(`\n  In calendar_7d but NOT in radar_day: ${inCalendarNotInRadarDay.length}`);
  
  // Summary report
  const report = {
    generated_at: new Date().toISOString(),
    sources: {
      calendar_7d: {
        path: '/data/v1/calendar_7d.json',
        count: calendarIds.size,
        ids: [...calendarIds].sort((a, b) => a - b)
      },
      radar_day: {
        path: '/data/v1/radar_day.json',
        count: radarDayIds.size,
        ids: [...radarDayIds].sort((a, b) => a - b)
      },
      radar_week: {
        path: '/data/v1/radar_week.json',
        count: radarWeekIds.size,
        ids: [...radarWeekIds].sort((a, b) => a - b)
      }
    },
    gaps: {
      in_radar_day_not_in_calendar: inRadarDayNotInCalendar.sort((a, b) => a - b),
      in_radar_week_not_in_calendar: inRadarWeekNotInCalendar.sort((a, b) => a - b),
      in_calendar_not_in_radar_day: inCalendarNotInRadarDay.sort((a, b) => a - b)
    },
    test_fixtures: {
      exists_in_calendar: calendarIds.size > 0 ? [...calendarIds][0] : null,
      exists_in_radar_day_only: inRadarDayNotInCalendar.length > 0 ? inRadarDayNotInCalendar[0] : null,
      nonexistent: 9999999
    }
  };
  
  // Save report
  const debugDir = `${rootDir}/dist/debug`;
  await mkdir(debugDir, { recursive: true });
  await writeFile(
    `${debugDir}/fixture-coverage.json`,
    JSON.stringify(report, null, 2)
  );
  
  console.log('\n✅ Report saved to: dist/debug/fixture-coverage.json');
  console.log('=' .repeat(60));
  
  // Export for smoke test
  console.log('\n🧪 Test Fixture IDs for Smoke Test:');
  console.log(`  EXISTS_IN_CALENDAR: ${report.test_fixtures.exists_in_calendar || 'NONE'}`);
  console.log(`  EXISTS_IN_RADAR_DAY_ONLY: ${report.test_fixtures.exists_in_radar_day_only || 'NONE'}`);
  console.log(`  NONEXISTENT: ${report.test_fixtures.nonexistent}`);
  
  return report;
}

main().catch(console.error);
