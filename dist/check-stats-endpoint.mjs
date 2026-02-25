#!/usr/bin/env node
/**
 * Monitor the match-stats endpoint until it returns real data
 */

async function checkEndpoint() {
  const url = 'https://radartips.com/api/match-stats?fixture=1492143';
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    const homeStats = data.home.stats?.total_last5?.gols_marcados;
    const awayStats = data.away.stats?.total_last5?.gols_marcados;
    const source = data.meta.source;
    const homeGames = data.home.games_used.games_used_total;
    const awayGames = data.away.games_used.games_used_total;
    
    console.log(`\n📊 Match Stats Status:`);
    console.log(`   Fixture: ${data.fixture_id}`);
    console.log(`   Source: ${source} ${source === 'snapshots' ? '✅' : '⏳'}`);
    console.log(`   Home (${data.home.name}): ${homeGames} games, stats: ${homeStats !== null ? '✅' : '❌'}`);
    console.log(`   Away (${data.away.name}): ${awayGames} games, stats: ${awayStats !== null ? '✅' : '❌'}`);
    
    if (homeStats !== null && awayStats !== null && homeGames > 0) {
      console.log(`\n✅ SUCCESS! Data is now being fetched correctly`);
      process.exit(0);
    } else {
      console.log(`\n⏳ Still waiting for data...`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

checkEndpoint();
