/**
 * team-window-5-generator.mjs
 * 
 * Generates last-5-games statistics for a team across 3 windows (total, home, away)
 * Returns snapshot JSON with 7 metric groups: goals, clean_sheets, failed_to_score, 
 * yellow_cards, corners, possession (avg)
 */

import fs from 'fs';
import path from 'path';

/**
 * Extract window-5 stats from form_details array
 * form_details format: [{ result: 'W'|'D'|'L', venue: 'H'|'A', score: '2-1', ... }, ...]
 */
function extractStatsFromFormDetails(formDetails, isHome = false) {
  const stats = {
    total: [],
    home: [],
    away: []
  };

  // Sort by date DESC (already in order from fixture)
  formDetails.forEach(detail => {
    const [goalsFor, goalsAgainst] = detail.score?.split('-').map(Number) || [null, null];
    
    const venue = detail.venue === 'H' ? 'home' : 'away';

    const formObj = {
      result: detail.result,
      venue: detail.venue,
      score: detail.score,
      opp: detail.opp,
      date_utc: detail.date_utc,
      goals_for: goalsFor,
      goals_against: goalsAgainst,
      yellow_cards: 0, // Not in calendar form details
      corners: 0,      // Not in calendar form details
      possession: null // Not in calendar form details
    };

    stats.total.push(formObj);
    
    if (venue === 'home') {
      stats.home.push(formObj);
    } else {
      stats.away.push(formObj);
    }
  });

  return stats;
}

// Aggregate stats from fixture array
function aggregateStats(fixtures, window = 'total') {
  const stats = {
    fixtures_played: 0,
    gols_marcados: 0,
    gols_sofridos: 0,
    clean_sheets: 0,
    falha_marcar: 0,
    cartoes_amarelos: 0,
    cantos: 0,
    posse_pct: []
  };

  fixtures.forEach(fix => {
    stats.fixtures_played++;
    
    // Goals
    if (fix.goals_for !== null && fix.goals_for !== undefined) {
      stats.gols_marcados += fix.goals_for;
    }
    if (fix.goals_against !== null && fix.goals_against !== undefined) {
      stats.gols_sofridos += fix.goals_against;
    }
    
    // Clean sheets (0 goals against)
    if (fix.goals_against === 0) {
      stats.clean_sheets++;
    }
    
    // Failed to score (0 goals for)
    if (fix.goals_for === 0) {
      stats.falha_marcar++;
    }
    
    // Cards/Corners
    if (fix.yellow_cards !== null && fix.yellow_cards !== undefined) {
      stats.cartoes_amarelos += fix.yellow_cards;
    }
    if (fix.corners !== null && fix.corners !== undefined) {
      stats.cantos += fix.corners;
    }
    
    // Possession %
    if (fix.possession !== null && fix.possession !== undefined) {
      stats.posse_pct.push(fix.possession);
    }
  });

  // Calculate avg possession
  let posse_avg = null;
  if (stats.posse_pct.length > 0) {
    posse_avg = Math.round(
      stats.posse_pct.reduce((a, b) => a + b, 0) / stats.posse_pct.length
    );
  }

  return {
    gols_marcados: stats.gols_marcados || null,
    gols_sofridos: stats.gols_sofridos || null,
    clean_sheets: stats.clean_sheets || null,
    falha_marcar: stats.falha_marcar || null,
    cartoes_amarelos: stats.cartoes_amarelos || null,
    cantos: stats.cantos || null,
    posse_pct: posse_avg
  };
}

// Fetch last-N fixtures for a team from local calendar/fixture snapshots
function loadFixturesFromCache(teamId, leagueId, season, cacheDir, maxGames = 5) {
  try {
    // Try to find calendar files as source of fixture data
    const calendarFiles = [
      path.join(cacheDir, 'calendar_7d.json'),
      path.join(cacheDir, 'calendar_day.json')
    ];
    
    let allFixtures = [];
    
    for (const file of calendarFiles) {
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const matches = data.matches || [];
      allFixtures.push(...matches);
    }

    if (allFixtures.length === 0) {
      console.warn(`[team-window-5] No fixtures found in calendar for league ${leagueId} season ${season}`);
      return [];
    }

    // Filter fixtures for this team (home OR away), sorted by date DESC
    const teamFixtures = allFixtures
      .filter(f => {
        const isTeamMatch = (f.home_id === teamId || f.away_id === teamId) && 
                           (f.league_id === leagueId || f.competition_id === leagueId);
        const isFinished = f.status === 'FT' || f.status === 'AET' || f.status === 'PEN';
        return isTeamMatch && isFinished;
      })
      .sort((a, b) => new Date(b.date_utc) - new Date(a.date_utc))
      .slice(0, maxGames * 2); // Fetch more to ensure we have both H/A

    return teamFixtures;
  } catch (e) {
    console.error(`[team-window-5] Error loading cache for team ${teamId}:`, e.message);
    return [];
  }
}

// Organize fixtures by venue
function organizeByVenue(fixtures, teamId) {
  const total = fixtures.slice(0, 5); // Last 5 (any venue)
  const home = fixtures.filter(f => f.home_id === teamId).slice(0, 5);
  const away = fixtures.filter(f => f.away_id === teamId).slice(0, 5);

  return { total, home, away };
}

// Normalize fixture object to extract stats
function normalizeFixture(fixture, teamId) {
  const isHome = fixture.home_id === teamId;
  
  return {
    fixture_id: fixture.fixture_id,
    date_utc: fixture.date_utc,
    opponent: isHome ? fixture.away : fixture.home,
    opponent_id: isHome ? fixture.away_id : fixture.home_id,
    status: fixture.status,
    goals_for: isHome ? fixture.goals_home : fixture.goals_away,
    goals_against: isHome ? fixture.goals_away : fixture.goals_home,
    venue: isHome ? 'H' : 'A',
    yellow_cards: fixture.yellow_cards_for || 0,
    corners: fixture.corners_for || 0,
    possession: fixture.possession_for || null
  };
}

/**
 * Generate team-window-5 snapshot (legacy: using fixture lookup)
 * 
 * @param {Object} options
 * @param {number} options.teamId
 * @param {number} options.leagueId
 * @param {number} options.season
 * @param {string} options.teamName
 * @param {string} options.cacheDir - path to data/v1 directory (optional)
 * @param {string} options.outputDir - path to data/v1/team-window-5 directory
 * @returns {Promise<Object>} snapshot object
 */
export async function generateTeamWindow5Snapshot(options) {
  const {
    teamId,
    leagueId,
    season,
    teamName = 'Unknown',
    cacheDir = './data/v1',
    outputDir = './data/v1/team-window-5'
  } = options;

  console.log(`[team-window-5] Generating for team ${teamId} (${teamName}), league ${leagueId}, season ${season}`);

  try {
    // Load fixtures from local cache
    const fixtures = loadFixturesFromCache(teamId, leagueId, season, cacheDir, 10);
    
    if (fixtures.length === 0) {
      console.warn(`[team-window-5] No fixtures found for team ${teamId}`);
      return {
        windows: {
          total_last5: { gols_marcados: null, gols_sofridos: null, clean_sheets: null, falha_marcar: null, cartoes_amarelos: null, cantos: null, posse_pct: null },
          home_last5: { gols_marcados: null, gols_sofridos: null, clean_sheets: null, falha_marcar: null, cartoes_amarelos: null, cantos: null, posse_pct: null },
          away_last5: { gols_marcados: null, gols_sofridos: null, clean_sheets: null, falha_marcar: null, cartoes_amarelos: null, cantos: null, posse_pct: null }
        },
        meta: {
          league_id: leagueId,
          season: season,
          team_id: teamId,
          team_name: teamName,
          games_used_total: 0,
          games_used_home: 0,
          games_used_away: 0,
          last_updated: new Date().toISOString()
        }
      };
    }

    // Normalize fixtures
    const normalized = fixtures.map(f => normalizeFixture(f, teamId));

    // Organize by venue
    const { total, home, away } = organizeByVenue(normalized, teamId);

    // Aggregate stats
    const totalStats = aggregateStats(total, 'total');
    const homeStats = aggregateStats(home, 'home');
    const awayStats = aggregateStats(away, 'away');

    const snapshot = {
      windows: {
        total_last5: totalStats,
        home_last5: homeStats,
        away_last5: awayStats
      },
      meta: {
        league_id: leagueId,
        season: season,
        team_id: teamId,
        team_name: teamName,
        games_used_total: total.length,
        games_used_home: home.length,
        games_used_away: away.length,
        last_updated: new Date().toISOString(),
        fixtures_checked: fixtures.length
      }
    };

    // Ensure output directory exists
    const dirPath = path.join(outputDir, String(leagueId), String(season));
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Save snapshot
    const filePath = path.join(dirPath, `${teamId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    console.log(`[team-window-5] Saved snapshot: ${filePath}`);

    return snapshot;
  } catch (error) {
    console.error(`[team-window-5] Generation failed for team ${teamId}:`, error.message);
    throw error;
  }
}

/**
 * Load snapshot from disk
 */
export function loadTeamWindow5Snapshot(teamId, leagueId, season, outputDir = './data/v1/team-window-5') {
  try {
    const filePath = path.join(outputDir, String(leagueId), String(season), `${teamId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return snapshot;
  } catch (e) {
    console.warn(`[team-window-5] Error loading snapshot:`, e.message);
    return null;
  }
}

/**
 * Generate team-window-5 snapshot directly from calendar match data
 * More efficient than lookup-based generation
 * 
 * @param {Object} options
 * @param {Object} options.match - Calendar match object with form_home_details/form_away_details
 * @param {number} options.leagueId
 * @param {number} options.season
 * @param {string} options.outputDir
 * @returns {Promise<Object>} snapshot object
 */
export async function generateFromCalendarMatch(options) {
  const {
    match,
    leagueId,
    season,
    outputDir = './data/v1/team-window-5'
  } = options;

  if (!match || !match.home_id || !match.away_id) {
    throw new Error('Invalid match object: missing home_id or away_id');
  }

  console.log(`[team-window-5] Generating for ${match.home} (${match.home_id}) vs ${match.away} (${match.away_id}), league ${leagueId}, season ${season}`);

  try {
    // Extract form data from match
    const homeFormDetails = match.form_home_details || [];
    const awayFormDetails = match.form_away_details || [];

    // Generate snapshots for both teams
    const homeSnapshot = generateSnapshotFromForm({
      teamId: match.home_id,
      teamName: match.home,
      leagueId,
      season,
      formDetails: homeFormDetails
    });

    const awaySnapshot = generateSnapshotFromForm({
      teamId: match.away_id,
      teamName: match.away,
      leagueId,
      season,
      formDetails: awayFormDetails
    });

    // Save both snapshots
    for (const snapshot of [homeSnapshot, awaySnapshot]) {
      const dirPath = path.join(outputDir, String(leagueId), String(season));
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const filePath = path.join(dirPath, `${snapshot.meta.team_id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
      console.log(`[team-window-5] Saved snapshot: ${filePath}`);
    }

    return { home: homeSnapshot, away: awaySnapshot };
  } catch (error) {
    console.error(`[team-window-5] Generation failed:`, error.message);
    throw error;
  }
}

/**
 * Generate snapshot from form details array
 */
function generateSnapshotFromForm(options) {
  const { teamId, teamName, leagueId, season, formDetails } = options;

  // Organize form details
  const total = formDetails.slice(0, 5);
  const home = formDetails.filter(f => f.venue === 'H').slice(0, 5);
  const away = formDetails.filter(f => f.venue === 'A').slice(0, 5);

  // Aggregate stats
  const totalStats = aggregateStats(
    total.map(f => ({
      goals_for: f.score?.split('-')[0] ? parseInt(f.score.split('-')[0]) : null,
      goals_against: f.score?.split('-')[1] ? parseInt(f.score.split('-')[1]) : null,
      yellow_cards: 0,
      corners: 0,
      possession: null
    }))
  );

  const homeStats = aggregateStats(
    home.map(f => ({
      goals_for: f.score?.split('-')[0] ? parseInt(f.score.split('-')[0]) : null,
      goals_against: f.score?.split('-')[1] ? parseInt(f.score.split('-')[1]) : null,
      yellow_cards: 0,
      corners: 0,
      possession: null
    }))
  );

  const awayStats = aggregateStats(
    away.map(f => ({
      goals_for: f.score?.split('-')[0] ? parseInt(f.score.split('-')[0]) : null,
      goals_against: f.score?.split('-')[1] ? parseInt(f.score.split('-')[1]) : null,
      yellow_cards: 0,
      corners: 0,
      possession: null
    }))
  );

  return {
    windows: {
      total_last5: totalStats,
      home_last5: homeStats,
      away_last5: awayStats
    },
    meta: {
      league_id: leagueId,
      season: season,
      team_id: teamId,
      team_name: teamName,
      games_used_total: total.length,
      games_used_home: home.length,
      games_used_away: away.length,
      last_updated: new Date().toISOString()
    }
  };
}
