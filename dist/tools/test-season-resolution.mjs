#!/usr/bin/env node
/**
 * Test Season Resolution & Data Generation
 * 
 * Testa a nova arquitetura com ligas problema conhecidas:
 * - League 39 (Premier League) - league com standings
 * - League 40 (Championship) - league com standings
 * - League 2 (Champions League) - cup sem standings
 * - League 848 (Copa do Brasil) - cup sem standings
 * 
 * Usage:
 *   node tools/test-season-resolution.mjs
 * 
 * Env:
 *   APIFOOTBALL_KEY: API-Football v3 key
 */

import { fileURLToPath } from 'url';
import { resolveSeasonForLeague } from './lib/season-from-leagues.mjs';

const __filename = fileURLToPath(import.meta.url);

const TEST_LEAGUES = [
  { id: 39, name: 'Premier League', country: 'England', expectedType: 'league' },
  { id: 40, name: 'Championship', country: 'England', expectedType: 'league' },
  { id: 2, name: 'Champions League', country: 'World', expectedType: 'cup' },
  { id: 848, name: 'Copa do Brasil', country: 'Brazil', expectedType: 'cup' },
  { id: 71, name: 'Serie A', country: 'Brazil', expectedType: 'league' },
];

async function testLeague(leagueId, expectedName) {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ Testing League ${leagueId}: ${expectedName.padEnd(32, ' ')}║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  try {
    const { year, reason, coverage, leagueMeta } = await resolveSeasonForLeague({
      leagueId,
    });

    console.log(`✅ Resolution successful:`);
    console.log(`   Name: ${leagueMeta.name}`);
    console.log(`   Country: ${leagueMeta.country}`);
    console.log(`   Type: ${leagueMeta.type}`);
    console.log(`   Chosen Season: ${year}`);
    console.log(`   Season Source: ${reason}`);
    console.log(`\n📊 Coverage:`);
    console.log(`   standings: ${coverage.standings}`);
    console.log(`   fixtures: ${coverage.fixtures}`);
    console.log(`   events: ${coverage.events}`);
    console.log(`   statistics: ${coverage.statistics}`);
    console.log(`   predictions: ${coverage.predictions}`);

    console.log(`\n🎯 Recommendation:`);
    if (leagueMeta.type === 'cup' || coverage.standings === false) {
      console.log(`   → Generate CUP STRUCTURE (rounds/fixtures)`);
      console.log(`   → File: cup_${leagueId}_${year}.json`);
    } else {
      console.log(`   → Generate STANDINGS`);
      console.log(`   → File: standings_${leagueId}_${year}.json`);
    }

    console.log(`\n✅ PASS\n`);
    return { success: true, leagueId, year, reason, type: leagueMeta.type };

  } catch (error) {
    console.error(`❌ FAIL: ${error.message}\n`);
    return { success: false, leagueId, error: error.message };
  }
}

async function main() {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 🧪 Season Resolution Test Suite               ║`);
  console.log(`║    Testing /leagues API integration           ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  const results = [];

  for (const league of TEST_LEAGUES) {
    const result = await testLeague(league.id, league.name);
    results.push(result);
    
    // Delay between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║ 📊 Test Results Summary                       ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}\n`);

  if (failed > 0) {
    console.log(`Failed leagues:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - League ${r.leagueId}: ${r.error}`);
    });
    console.log('');
  }

  results.filter(r => r.success).forEach(r => {
    console.log(`League ${r.leagueId}: season=${r.year}, source=${r.reason}, type=${r.type}`);
  });

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
