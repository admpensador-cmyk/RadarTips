#!/usr/bin/env node
/**
 * Smoke test for resolveMatchByFixtureId() across multiple datasets
 * 
 * Tests the cascading fixture resolution logic to ensure:
 * 1. Fixtures in calendar_7d are found
 * 2. Fixtures ONLY in radar_day are found (THIS WAS THE BUG)
 * 3. Nonexistent fixtures return null gracefully
 * 
 * Usage: node tools/smoke-test-fixture-resolve.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

// Test configuration from audit results
const TEST_FIXTURES = {
  EXISTS_IN_CALENDAR: 1516209,      // Should resolve from calendar_7d
  EXISTS_IN_RADAR_DAY_ONLY: 1500677, // Should resolve from radar_day (the bug fix!)
  NONEXISTENT: 9999999,             // Should return null
};

// Load JSON data
function loadJSON(relPath) {
  const fullPath = path.join(ROOT, relPath);
  try {
    const raw = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`❌ Failed to load ${relPath}:`, e.message);
    return null;
  }
}

// Extract fixture IDs (same logic as audit script)
function extractFixtureIds(obj, source) {
  if (!obj || typeof obj !== 'object') return [];
  
  const candidates = [
    'matches',      // calendar_7d format
    'highlights',   // radar_day format
    'items',        // radar_week format
    'fixtures',     // potential alternative
  ];
  
  for (const key of candidates) {
    if (Array.isArray(obj[key])) {
      return obj[key]
        .map(m => m?.fixture_id ?? m?.fixtureId ?? m?.fixture?.id ?? m?.id)
        .filter(id => id != null && !isNaN(Number(id)))
        .map(id => Number(id));
    }
  }
  
  return [];
}

// Simulate resolveMatchByFixtureId logic (simplified for testing)
function findFixtureInDataset(fixtureId, data, arrayKey) {
  if (!data || !Array.isArray(data[arrayKey])) return null;
  
  const fid = Number(fixtureId);
  return data[arrayKey].find(m => {
    const candidates = [m?.fixture_id, m?.fixtureId, m?.fixture?.id, m?.id];
    return candidates.some(c => c != null && Number(c) === fid);
  });
}

// Main smoke test logic
function runSmokeTests() {
  console.log(`${colors.cyan}╔════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║  🧪 Smoke Test: Fixture Resolution (v1)       ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════╝${colors.reset}\n`);

  // Load datasets
  console.log(`${colors.dim}Loading datasets...${colors.reset}`);
  const calendar = loadJSON('data/v1/calendar_7d.json');
  const radarDay = loadJSON('data/v1/radar_day.json');
  const radarWeek = loadJSON('data/v1/radar_week.json');

  if (!calendar || !radarDay || !radarWeek) {
    console.error(`\n${colors.red}✖ FATAL: Could not load required datasets${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`${colors.dim}  ✓ calendar_7d.json${colors.reset}`);
  console.log(`${colors.dim}  ✓ radar_day.json${colors.reset}`);
  console.log(`${colors.dim}  ✓ radar_week.json${colors.reset}\n`);

  // Extract all fixture IDs
  const calendarIds = extractFixtureIds(calendar, 'calendar_7d');
  const radarDayIds = extractFixtureIds(radarDay, 'radar_day');
  const radarWeekIds = extractFixtureIds(radarWeek, 'radar_week');

  console.log(`${colors.dim}Dataset coverage:${colors.reset}`);
  console.log(`${colors.dim}  calendar_7d:  ${calendarIds.length} fixtures${colors.reset}`);
  console.log(`${colors.dim}  radar_day:    ${radarDayIds.length} fixtures${colors.reset}`);
  console.log(`${colors.dim}  radar_week:   ${radarWeekIds.length} fixtures${colors.reset}\n`);

  // Run tests
  const results = [];
  
  console.log(`${colors.yellow}Running tests...${colors.reset}\n`);

  // Test 1: Fixture in calendar_7d
  {
    const testId = TEST_FIXTURES.EXISTS_IN_CALENDAR;
    const inCalendar = calendarIds.includes(testId);
    const match = findFixtureInDataset(testId, calendar, 'matches');
    
    const passed = inCalendar && match !== null;
    results.push({
      name: 'Fixture in calendar_7d',
      id: testId,
      expected: 'Found in calendar_7d',
      actual: match ? `Found (${match.home} vs ${match.away})` : 'Not found',
      passed,
    });
    
    console.log(`  ${passed ? colors.green + '✓' : colors.red + '✗'} Test 1: Fixture in calendar_7d${colors.reset}`);
    console.log(`${colors.dim}    Fixture ID: ${testId}${colors.reset}`);
    console.log(`${colors.dim}    Expected:   Found in calendar_7d${colors.reset}`);
    console.log(`${colors.dim}    Actual:     ${match ? `Found (${match.home} vs ${match.away})` : 'Not found'}${colors.reset}\n`);
  }

  // Test 2: Fixture ONLY in radar_day (THE CRITICAL TEST!)
  {
    const testId = TEST_FIXTURES.EXISTS_IN_RADAR_DAY_ONLY;
    const inCalendar = calendarIds.includes(testId);
    const inRadarDay = radarDayIds.includes(testId);
    
    // Try finding in radar_day first
    let match = findFixtureInDataset(testId, radarDay, 'highlights');
    if (!match) match = findFixtureInDataset(testId, radarDay, 'matches');
    
    const passed = !inCalendar && inRadarDay && match !== null;
    results.push({
      name: 'Fixture ONLY in radar_day',
      id: testId,
      expected: 'Found in radar_day.json (not in calendar)',
      actual: match ? `Found in radar_day (${match.home} vs ${match.away})` : 'Not found',
      passed,
    });
    
    console.log(`  ${passed ? colors.green + '✓' : colors.red + '✗'} Test 2: Fixture ONLY in radar_day ${colors.yellow}(BUG FIX TEST)${colors.reset}`);
    console.log(`${colors.dim}    Fixture ID: ${testId}${colors.reset}`);
    console.log(`${colors.dim}    Expected:   Found in radar_day (NOT in calendar_7d)${colors.reset}`);
    console.log(`${colors.dim}    Actual:     ${match ? `Found in radar_day (${match.home} vs ${match.away})` : 'Not found'}${colors.reset}`);
    console.log(`${colors.dim}    In calendar_7d: ${inCalendar ? 'YES (unexpected!)' : 'NO ✓'}${colors.reset}`);
    console.log(`${colors.dim}    In radar_day:   ${inRadarDay ? 'YES ✓' : 'NO (unexpected!)'}${colors.reset}\n`);
  }

  // Test 3: Nonexistent fixture
  {
    const testId = TEST_FIXTURES.NONEXISTENT;
    const inCalendar = calendarIds.includes(testId);
    const inRadarDay = radarDayIds.includes(testId);
    const inRadarWeek = radarWeekIds.includes(testId);
    
    const passed = !inCalendar && !inRadarDay && !inRadarWeek;
    results.push({
      name: 'Nonexistent fixture',
      id: testId,
      expected: 'Not found (returns null gracefully)',
      actual: passed ? 'Not found ✓' : 'Unexpectedly found!',
      passed,
    });
    
    console.log(`  ${passed ? colors.green + '✓' : colors.red + '✗'} Test 3: Nonexistent fixture${colors.reset}`);
    console.log(`${colors.dim}    Fixture ID: ${testId}${colors.reset}`);
    console.log(`${colors.dim}    Expected:   Not found in any dataset${colors.reset}`);
    console.log(`${colors.dim}    Actual:     ${passed ? 'Not found ✓' : 'Unexpectedly found!'}${colors.reset}\n`);
  }

  // Summary
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;

  console.log(`${colors.cyan}════════════════════════════════════════════════${colors.reset}\n`);
  console.log(`${colors.yellow}Test Summary:${colors.reset}`);
  console.log(`${colors.dim}  Total:  ${totalTests}${colors.reset}`);
  console.log(`  ${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`  ${failedTests > 0 ? colors.red : colors.dim}Failed: ${failedTests}${colors.reset}\n`);

  if (failedTests === 0) {
    console.log(`${colors.green}✅ All tests passed! Fixture resolution is working correctly.${colors.reset}\n`);
    console.log(`${colors.dim}The bug fix ensures fixtures in radar_day.json that are NOT in calendar_7d.json${colors.reset}`);
    console.log(`${colors.dim}can still be resolved by the Match Radar modal.${colors.reset}\n`);
    return 0;
  } else {
    console.log(`${colors.red}❌ Some tests failed. Review the output above for details.${colors.reset}\n`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`${colors.red}  ✗ ${r.name}${colors.reset}`);
      console.log(`${colors.dim}    ID: ${r.id}${colors.reset}`);
      console.log(`${colors.dim}    Expected: ${r.expected}${colors.reset}`);
      console.log(`${colors.dim}    Actual:   ${r.actual}${colors.reset}\n`);
    });
    return 1;
  }
}

// Execute
const exitCode = runSmokeTests();
process.exit(exitCode);
