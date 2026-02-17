#!/usr/bin/env node
/**
 * Build Cup Structure Snapshot
 * Para ligas com coverage.standings=false (copas), gera estrutura de rounds/playoffs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiGetJson } from './lib/api-football.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    leagueId: null,
    season: null,
    outDir: path.join(ROOT, 'data', 'v1'),
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!key || !val) continue;

    if (key === '--leagueId') config.leagueId = Number(val);
    else if (key === '--season') config.season = Number(val);
    else if (key === '--outDir') config.outDir = val;
  }

  return config;
}

async function fetchLeagueInfo(leagueId) {
  try {
    const response = await apiGetJson(`/leagues?id=${leagueId}`);
    if (!Array.isArray(response) || response.length === 0) return null;
    return response[0];
  } catch (e) {
    console.warn(`⚠️  Failed to fetch league info: ${e.message}`);
    return null;
  }
}

async function fetchRoundsAndFixtures(leagueId, season) {
  try {
    // Fetch all fixtures for this league/season
    const fixtures = await apiGetJson(`/fixtures?league=${leagueId}&season=${season}&status=ALL`);
    
    if (!Array.isArray(fixtures)) {
      return [];
    }

    // Group by round
    const roundsMap = new Map();
    fixtures.forEach(fix => {
      const roundName = fix.league?.round || 'Unknown';
      if (!roundsMap.has(roundName)) {
        roundsMap.set(roundName, []);
      }
      roundsMap.get(roundName).push(fix);
    });

    // Convert to array
    const rounds = Array.from(roundsMap.entries()).map(([name, fixtures]) => ({
      name,
      fixtures: fixtures.map(f => ({
        id: f.id,
        date: f.fixture?.date,
        status: f.fixture?.status,
        home: {
          id: f.teams?.home?.id,
          name: f.teams?.home?.name,
          logo: f.teams?.home?.logo,
          score: f.goals?.home
        },
        away: {
          id: f.teams?.away?.id,
          name: f.teams?.away?.name,
          logo: f.teams?.away?.logo,
          score: f.goals?.away
        }
      }))
    }));

    return rounds;
  } catch (e) {
    console.warn(`⚠️  Failed to fetch fixtures: ${e.message}`);
    return [];
  }
}

function saveJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function main() {
  const config = parseArgs();

  if (!config.leagueId || !config.season) {
    console.error('❌ Error: --leagueId and --season are required');
    process.exit(1);
  }

  try {
    console.log(`🏆 Building cup structure for league ${config.leagueId}, season ${config.season}...`);

    const league = await fetchLeagueInfo(config.leagueId);
    const rounds = await fetchRoundsAndFixtures(config.leagueId, config.season);

    if (!league) {
      console.warn('⚠️  Could not fetch league info');
    }

    const cupSnapshot = {
      schemaVersion: 1,
      meta: {
        leagueId: Number(config.leagueId),
        season: Number(config.season),
        type: 'cup',
        seasonSource: 'resolved'
      },
      league: league ? {
        id: league.id,
        name: league.name,
        country: league.country,
        logo: league.logo,
        flag: league.flag,
        type: league.type
      } : null,
      generated_at_utc: new Date().toISOString(),
      rounds
    };

    const fileName = `cup_${config.leagueId}_${config.season}.json`;
    const filePath = path.join(config.outDir, fileName);
    
    saveJSON(filePath, cupSnapshot);
    console.log(`✅ Cup structure saved: ${fileName}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
