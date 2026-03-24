#!/usr/bin/env node

/**
 * Real Data Validation Script
 * Testa API-Football v3 com dados REAIS para league 40 (Championship)
 * 
 * Usage: APIFOOTBALL_KEY=sk_live_xxx node test-real-standings.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiGetJson } from './tools/lib/api-football.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data', 'v1');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');

async function validateRealStandings() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           REAL DATA VALIDATION - League 40 Championship        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check API key
  if (!process.env.APIFOOTBALL_KEY) {
    console.error('❌ APIFOOTBALL_KEY environment variable not set');
    console.error('\nUsage: APIFOOTBALL_KEY=sk_live_xxx node test-real-standings.mjs');
    process.exit(1);
  }

  console.log('✅ APIFOOTBALL_KEY found\n');

  try {
    // Step 1: Fetch league info to get available seasons
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: Fetch /leagues?id=40');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const leagueResponse = await apiGetJson('/leagues?id=40');
    
    if (!leagueResponse.data || !leagueResponse.data.response || !leagueResponse.data.response[0]) {
      throw new Error('Invalid /leagues response structure');
    }

    const leagueData = leagueResponse.data.response[0];
    console.log(`League: ${leagueData.league.name} (ID: ${leagueData.league.id})`);
    console.log(`Country: ${leagueData.league.country}\n`);

    console.log('Available Seasons:');
    console.log('──────────────────────────────────────────────────────────────');

    let chosenSeason = null;
    let chosenReason = null;

    for (const season of leagueData.seasons) {
      const isCurrent = season.current ? '✅ CURRENT' : '  ';
      console.log(`  Year: ${season.year} | Start: ${season.start} | End: ${season.end} | ${isCurrent}`);
      
      // Algorithm: prefer current season
      if (season.current && !chosenSeason) {
        chosenSeason = season.year;
        chosenReason = 'current';
      }
    }

    if (!chosenSeason) {
      // Fallback: use latest season
      chosenSeason = leagueData.seasons[0].year;
      chosenReason = 'latest';
    }

    console.log(`\n✅ CHOSEN SEASON: ${chosenSeason} (reason: ${chosenReason})`);
    console.log(`   Coverage: standings=${leagueData.seasons[0].coverage.standings}\n`);

    // Step 2: Fetch standings for chosen season
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`STEP 2: Fetch /standings?league=40&season=${chosenSeason}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const standingsResponse = await apiGetJson(`/standings?league=40&season=${chosenSeason}`);

    if (!standingsResponse.data || !standingsResponse.data.response) {
      throw new Error('Invalid /standings response structure');
    }

    const standingsData = standingsResponse.data.response[0];
    if (!standingsData || !standingsData.league) {
      throw new Error('No standings data found for league 40');
    }

    // Count teams
    const teamCount = standingsData.standings[0]?.table?.length || 0;
    console.log(`League: ${standingsData.league.name}`);
    console.log(`Season: ${standingsData.league.season}`);
    console.log(`Teams Found: ${teamCount}\n`);

    if (teamCount === 0) {
      throw new Error('❌ No teams returned - standings are empty!');
    }

    console.log('Sample Teams:');
    console.log('──────────────────────────────────────────────────────────────');
    standingsData.standings[0].table.slice(0, 5).forEach((team, idx) => {
      console.log(`  ${idx + 1}. ${team.team.name} - ${team.points}pts (${team.all.played}MP)`);
    });

    if (teamCount > 5) {
      console.log(`  ... and ${teamCount - 5} more teams\n`);
    }

    // Step 3: Save standings snapshot
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: Generate Real Standings Snapshot');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const snapshotFileName = `standings_40_${chosenSeason}.json`;
    const snapshotPath = path.join(DATA_DIR, snapshotFileName);

    // Prepare snapshot with schemaVersion and metadata
    const snapshot = {
      league: standingsData.league,
      generated_at_utc: new Date().toISOString(),
      schemaVersion: 1,
      meta: {
        leagueId: 40,
        season: chosenSeason,
        type: 'league',
        seasonSource: chosenReason,
        dataStatus: teamCount > 0 ? 'ok' : 'empty'
      },
      standings: standingsData.standings[0].table
    };

    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    const fileSize = fs.statSync(snapshotPath).size;

    console.log(`✅ Created: ${snapshotFileName}`);
    console.log(`   Size: ${(fileSize / 1024).toFixed(2)} KB`);
    console.log(`   Teams: ${teamCount}`);
    console.log(`   SeasonSource: ${chosenReason}\n`);

    // Step 4: Update manifest
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: Update manifest.json');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Running: node tools/build-manifest.mjs...\n');
    
    // Import and run build-manifest
    const { spawn } = await import('child_process');
    
    const manifestBuild = new Promise((resolve, reject) => {
      const proc = spawn('node', ['tools/build-manifest.mjs'], { 
        cwd: __dirname,
        stdio: 'inherit'
      });
      
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`build-manifest.mjs exited with code ${code}`));
      });
    });

    await manifestBuild;

    // Verify league 40 in updated manifest
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const entry40 = manifest.entries.find(e => e.leagueId === 40);

    console.log('✅ Manifest updated');
    console.log(`   Total entries: ${manifest.entries.length}`);
    console.log(`   League 40 entry: League 40 | Season ${entry40?.season}`);
    console.log(`   Standings file: ${entry40?.standings?.file}`);
    console.log(`   SeasonSource: ${entry40?.standings?.seasonSource}`);
    console.log(`   DataStatus: ${entry40?.standings?.dataStatus}\n`);

    // Final summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ VALIDATION COMPLETE                      ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║ League: Championship (40)                                      ║`);
    console.log(`║ Season: ${chosenSeason} (${chosenReason})                                              ║`);
    console.log(`║ Teams: ${String(teamCount).padEnd(57)}║`);
    console.log(`║ Real Data: YES (from API-Football v3)                          ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║ Next Steps:                                                    ║');
    console.log('║ 1. If old mock file exists, remove it                         ║');
    console.log('║ 2. Commit: "fix: replace mock standings with real API data"   ║');
    console.log('║ 3. Push to main                                               ║');
    console.log('║ 4. Upload to R2                                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response?.data?.errors?.length > 0) {
      console.error('API Errors:', error.response.data.errors);
    }
    process.exit(1);
  }
}

validateRealStandings();
