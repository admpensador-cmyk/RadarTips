#!/usr/bin/env node

/**
 * Update Competition Extras with Season Retry Logic
 * 
 * Tries to generate standings + compstats for a league:
 * 1. Try specified season
 * 2. If standings are empty, try season-1
 * 3. If standings are empty, try season+1
 * 4. For the season that works, generate compstats
 * 
 * Usage: node tools/update-competition-extras-retry.mjs --leagueId 40 --season 2025 --tryNeighbors true
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'v1');

// Parse args
const args = process.argv.slice(2);
let leagueId = '40';
let season = '2025';
let tryNeighbors = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--leagueId') leagueId = args[i + 1];
  if (args[i] === '--season') season = args[i + 1];
  if (args[i] === '--tryNeighbors') tryNeighbors = args[i + 1] === 'true';
}

const leagueIdNum = Number(leagueId);
const seasonNum = Number(season);

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║ UPDATE COMPETITION EXTRAS - RETRY LOGIC                      ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log(`League ID:       ${leagueIdNum}`);
console.log(`Initial Season:  ${seasonNum}`);
console.log(`Try Neighbors:   ${tryNeighbors}`);
console.log('');

/**
 * Run update-competition-extras.mjs for a specific league & season
 */
async function updateForSeason(leagueId, season) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [
      path.join(__dirname, 'update-competition-extras.mjs'),
      '--leagueId', String(leagueId),
      '--season', String(season)
    ], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env }
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`update-competition-extras.mjs exited with code ${code}`));
    });
  });
}

/**
 * Read standings file and count teams
 */
function countStandingsTeams(leagueId, season) {
  try {
    const file = path.join(DATA_DIR, `standings_${leagueId}_${season}.json`);
    if (!fs.existsSync(file)) return 0;
    
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const teams = data.standings?.length || 0;
    return teams;
  } catch (e) {
    return 0;
  }
}

/**
 * Check if compstats file exists and is non-empty
 */
function hasCompstats(leagueId, season) {
  try {
    const file = path.join(DATA_DIR, `compstats_${leagueId}_${season}.json`);
    if (!fs.existsSync(file)) return false;
    
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && Object.keys(data).length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * Try to upload to R2 via wrangler
 */
async function uploadToR2(filename, filePath) {
  return new Promise((resolve) => {
    const R2_BUCKET = process.env.R2_BUCKET_NAME || 'radartips-data';
    
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
      console.log(`  [SKIP] R2 upload (missing Cloudflare secrets)`);
      resolve(false);
      return;
    }

    const proc = spawn('wrangler', [
      'r2', 'object', 'put', '--remote',
      `${R2_BUCKET}/v1/${filename}`,
      '--file', filePath,
      '--content-type', 'application/json'
    ], {
      stdio: 'pipe',
      env: { ...process.env }
    });

    let output = '';
    proc.stdout?.on('data', (data) => { output += data.toString(); });
    proc.stderr?.on('data', (data) => { output += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`  [UPLOADED] ${filename}`);
        resolve(true);
      } else {
        console.log(`  [SKIP] R2 upload failed: ${output.trim()}`);
        resolve(false);
      }
    });
  });
}

/**
 * Main retry logic
 */
async function main() {
  const seasons = [seasonNum];
  
  if (tryNeighbors) {
    seasons.push(seasonNum - 1, seasonNum + 1);
  }

  let winnerSeason = null;
  let compstatsOk = false;

  for (const s of seasons) {
    console.log(`\n─────────────────────────────────────────────────────────────`);
    console.log(`Attempt: League ${leagueIdNum}, Season ${s}`);
    console.log(`─────────────────────────────────────────────────────────────`);

    try {
      // Generate standings for this season
      await updateForSeason(leagueIdNum, s);

      // Count teams in standings
      const teamCount = countStandingsTeams(leagueIdNum, s);
      console.log(`  [STANDINGS] Teams found: ${teamCount}`);

      // Upload standings to R2
      const standingsFile = `standings_${leagueIdNum}_${s}.json`;
      const standingsPath = path.join(DATA_DIR, standingsFile);
      if (fs.existsSync(standingsPath)) {
        await uploadToR2(standingsFile, standingsPath);
      }

      // If we have teams, this is our winner season
      if (teamCount > 0) {
        winnerSeason = s;
        console.log(`\n✅ WINNER SEASON: ${s} (${teamCount} teams)`);
        
        // Try to upload compstats for this season
        const compstatsFile = `compstats_${leagueIdNum}_${s}.json`;
        const compstatsPath = path.join(DATA_DIR, compstatsFile);
        
        if (fs.existsSync(compstatsPath)) {
          const hasData = hasCompstats(leagueIdNum, s);
          if (hasData) {
            console.log(`  [COMPSTATS] File exists with data`);
            await uploadToR2(compstatsFile, compstatsPath);
            compstatsOk = true;
          } else {
            console.log(`  [COMPSTATS] File is empty (not uploaded)`);
          }
        } else {
          console.log(`  [COMPSTATS] Not generated (may not be available for this league)`);
        }
        
        break; // Stop trying seasons
      } else {
        console.log(`  [STANDINGS] Empty - trying next season...`);
      }

    } catch (error) {
      console.error(`  [ERROR] ${error.message}`);
      // Continue to next season
    }
  }

  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║ FINAL RESULT                                                  ║`);
  console.log(`╠═══════════════════════════════════════════════════════════════╣`);
  
  if (winnerSeason !== null) {
    console.log(`║ ✅ Standings:  Season ${winnerSeason} (${countStandingsTeams(leagueIdNum, winnerSeason)} teams)`);
    console.log(`║ ${compstatsOk ? '✅' : '⚠️ '} Compstats: ${compstatsOk ? 'Available' : 'Not available'}`);
  } else {
    console.log(`║ ❌ Standings: No season with teams found`);
  }
  
  console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

  // Exit with error if no standings found
  if (winnerSeason === null) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
