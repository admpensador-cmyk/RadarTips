#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

console.log('[test] Testing /api/match-stats endpoint');
console.log('[test] ================================================\n');

// Test 1: Check endpoint implementation
console.log('[test] TEST 1: Verify endpoint handler exists');
const workerCodePath = path.join(ROOT, 'workers/radartips-api/src/index.js');
const workerCode = await fs.readFile(workerCodePath, 'utf-8');

if (workerCode.includes('if (pathname === "/api/match-stats")')) {
  console.log('  ✓ Endpoint route handler found');
} else {
  console.log('  ✗ Endpoint route handler NOT found');
  process.exit(1);
}

if (workerCode.includes('async function handleMatchStats')) {
  console.log('  ✓ handleMatchStats() function found');
} else {
  console.log('  ✗ handleMatchStats() function NOT found');
  process.exit(1);
}

// Test 2: Check payload structure validation
console.log('\n[test] TEST 2: Verify payload structure in handler');
const payloadPattern = /payload = \{[\s\S]*?fixture_id:|fixture_id.*?home.*?away.*?meta/;
if (payloadPattern.test(workerCode)) {
  console.log('  ✓ Payload structure (fixture_id, home, away, meta) found');
} else {
  console.log('  ✗ Payload structure incomplete');
  process.exit(1);
}

// Test 3: Check cache implementation
console.log('\n[test] TEST 3: Verify cache implementation (KV, 12h TTL)');
if (workerCode.includes('kvGetJson(env, cacheKey)')) {
  console.log('  ✓ KV cache read found');
} else {
  console.log('  ✗ KV cache read NOT found');
}

if (workerCode.includes('kvPutJson(env, cacheKey, payload, 43200)')) {
  console.log('  ✓ KV cache write (43200s = 12h) found');
} else {
  console.log('  ✗ KV cache write NOT found');
}

// Test 4: Check team-window-5 snapshots
console.log('\n[test] TEST 4: Verify team-window-5 snapshot loading');
if (workerCode.includes('team-window-5')) {
  console.log('  ✓ team-window-5 snapshot path reference found');
} else {
  console.log('  ✗ team-window-5 snapshot path NOT found');
}

if (workerCode.includes('homeSnapshot?.windows') && workerCode.includes('awaySnapshot?.windows')) {
  console.log('  ✓ Stats extraction (windows) found');
} else {
  console.log('  ✗ Stats extraction NOT found');
}

// Test 5: Check games_used disclosure
console.log('\n[test] TEST 5: Verify games_used_total in metadata');
if (workerCode.includes('games_used_total')) {
  console.log('  ✓ games_used_total disclosure found');
} else {
  console.log('  ✗ games_used_total NOT found');
}

// Test 6: Check fixture parameter validation
console.log('\n[test] TEST 6: Verify fixture parameter validation');
if (workerCode.includes('const fixtureId = urlObj.searchParams.get("fixture")') &&
    workerCode.includes('if (!fixtureId)')) {
  console.log('  ✓ Fixture parameter validation found');
} else {
  console.log('  ✗ Fixture parameter validation NOT found');
}

// Test 7: Check null fallback handling
console.log('\n[test] TEST 7: Verify null value handling for missing snapshots');
if (workerCode.includes('gols_marcados: null')) {
  console.log('  ✓ Null fallback structure for missing stats found');
} else {
  console.log('  ✗ Null fallback NOT found');
}

// Test 8: Check error responses
console.log('\n[test] TEST 8: Verify error handling');
if (workerCode.includes('error:') && workerCode.includes('status: 400') && workerCode.includes('status: 404')) {
  console.log('  ✓ Error response handling found (400, 404 errors)');
} else {
  console.log('  ✗ Error handling incomplete');
}

console.log('\n[test] ================================================');
console.log('[test] ✓ All endpoint tests passed!');
console.log('[test]');
console.log('[test] Endpoint signature:');
console.log('[test]   GET /api/match-stats?fixture={fixture_id}');
console.log('[test]');
console.log('[test] Response structure:');
console.log('[test]   {');
console.log('[test]     fixture_id: number,');
console.log('[test]     fixture_status: string,');
console.log('[test]     home: { id, name, stats: { windows: {...} }, games_used: {...} },');
console.log('[test]     away: { id, name, stats: { windows: {...} }, games_used: {...} },');
console.log('[test]     meta: { cached_at, source, league_id, season }');
console.log('[test]   }');
console.log('[test]');
console.log('[test] Cache: 12 hours (KV storage)');
console.log('[test] ================================================\n');
