/**
 * team-window-5-generator.mjs
 * 
 * Generates last-5-games statistics for a team across 3 windows (total, home, away)
 * Returns snapshot JSON with 7 metric groups: goals, clean_sheets, failed_to_score, 
 * yellow_cards, corners, possession (avg)
 */

import fs from 'fs';
import path from 'path';

const SCHEMA_VERSION = 2;
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);
const TARGET_WINDOW_SIZE = 5;
const POOL_SIZE = Number.parseInt(process.env.TEAM_WINDOW5_POOL_SIZE || '20', 10);
const MAX_POOL_SIZE = Number.parseInt(process.env.TEAM_WINDOW5_POOL_MAX || '80', 10);

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIsoUtc(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function fixtureCacheKey(fixtureId) {
  return `fixture_stats:${fixtureId}`;
}

function getFixtureId(match) {
  return toNum(match?.fixture_id ?? match?.fixture?.id ?? match?.id);
}

function getFixtureStatus(match) {
  return String(match?.status || match?.fixture_status || match?.fixture?.status?.short || '').toUpperCase();
}

function getFixtureGoalsHome(match) {
  return toNum(match?.goals_home ?? match?.home?.score ?? match?.goals?.home);
}

function getFixtureGoalsAway(match) {
  return toNum(match?.goals_away ?? match?.away?.score ?? match?.goals?.away);
}

function isFinishedMatch(match) {
  return FINAL_STATUSES.has(getFixtureStatus(match));
}

function normalizeFixtureRefs(arr, limit = TARGET_WINDOW_SIZE) {
  const byFixture = new Map();
  for (const item of (Array.isArray(arr) ? arr : [])) {
    const fixtureId = toNum(item?.fixtureId ?? item?.fixture_id);
    const dateUtc = toIsoUtc(item?.dateUtc ?? item?.date_utc);
    if (!fixtureId || !dateUtc) continue;
    const prev = byFixture.get(fixtureId);
    if (!prev || Date.parse(dateUtc) > Date.parse(prev.dateUtc)) {
      byFixture.set(fixtureId, { fixtureId, dateUtc });
    }
  }
  const sorted = Array.from(byFixture.values())
    .sort((a, b) => Date.parse(b.dateUtc) - Date.parse(a.dateUtc));
  if (Number.isFinite(limit)) {
    return sorted.slice(0, Math.max(0, Math.trunc(limit)));
  }
  return sorted;
}

function appendFixtureRef(existingRefs, newRef) {
  return normalizeFixtureRefs([...(Array.isArray(existingRefs) ? existingRefs : []), newRef], Number.POSITIVE_INFINITY);
}

function sameFixtureRefs(a, b) {
  return JSON.stringify(normalizeFixtureRefs(a)) === JSON.stringify(normalizeFixtureRefs(b));
}

function snapshotsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function getSeasonDir(outputDir, leagueId, season) {
  return path.join(outputDir, String(leagueId), String(season));
}

function getFixtureCacheFile(outputDir, leagueId, season) {
  return path.join(getSeasonDir(outputDir, leagueId, season), 'fixture-stats-cache.json');
}

function readFixtureStatsCache(outputDir, leagueId, season) {
  const filePath = getFixtureCacheFile(outputDir, leagueId, season);
  if (!fs.existsSync(filePath)) return { path: filePath, data: {} };
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { path: filePath, data: (data && typeof data === 'object') ? data : {} };
  } catch {
    return { path: filePath, data: {} };
  }
}

function writeFixtureStatsCache(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function buildFixtureStatsRecordFromMatch(match) {
  const fixtureId = getFixtureId(match);
  const dateUtc = toIsoUtc(match?.kickoff_utc ?? match?.date_utc ?? match?.fixture?.date);
  const status = getFixtureStatus(match);
  const homeId = toNum(match?.home_id ?? match?.teams?.home?.id ?? match?.home?.id);
  const awayId = toNum(match?.away_id ?? match?.teams?.away?.id ?? match?.away?.id);
  if (!fixtureId || !dateUtc || !homeId || !awayId || !FINAL_STATUSES.has(status)) return null;

  return {
    fixtureId,
    dateUtc,
    status,
    homeId,
    awayId,
    goalsHome: getFixtureGoalsHome(match),
    goalsAway: getFixtureGoalsAway(match),
    yellowCardsHome: toNum(match?.yellow_cards_home ?? match?.yellow_cards_for_home),
    yellowCardsAway: toNum(match?.yellow_cards_away ?? match?.yellow_cards_for_away),
    cornersHome: toNum(match?.corners_home ?? match?.corners_for_home),
    cornersAway: toNum(match?.corners_away ?? match?.corners_for_away),
    possessionHome: toNum(match?.possession_home ?? match?.possession_for_home),
    possessionAway: toNum(match?.possession_away ?? match?.possession_for_away)
  };
}

function fixtureRecordToTeamPerspective(record, teamId) {
  if (!record || !teamId) return null;
  const isHome = Number(record.homeId) === Number(teamId);
  const isAway = Number(record.awayId) === Number(teamId);
  if (!isHome && !isAway) return null;

  return {
    fixture_id: record.fixtureId,
    date_utc: record.dateUtc,
    venue: isHome ? 'H' : 'A',
    status: record.status,
    goals_for: isHome ? record.goalsHome : record.goalsAway,
    goals_against: isHome ? record.goalsAway : record.goalsHome,
    yellow_cards: isHome ? record.yellowCardsHome : record.yellowCardsAway,
    corners: isHome ? record.cornersHome : record.cornersAway,
    possession: isHome ? record.possessionHome : record.possessionAway
  };
}

function refsToAggregates(refs, teamId, fixtureStatsCache) {
  const perspectiveFixtures = [];
  for (const ref of (Array.isArray(refs) ? refs : [])) {
    const key = fixtureCacheKey(ref.fixtureId);
    const record = fixtureStatsCache[key];
    const perspective = fixtureRecordToTeamPerspective(record, teamId);
    if (!perspective) continue;
    perspectiveFixtures.push(perspective);
  }
  return aggregateStats(perspectiveFixtures);
}

function sanitizePoolSize(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function collectTeamFixtureRefsFromCache(teamId, fixtureStatsCache) {
  const refs = [];
  for (const record of Object.values(fixtureStatsCache || {})) {
    if (!record) continue;
    const fixtureId = toNum(record.fixtureId);
    const dateUtc = toIsoUtc(record.dateUtc);
    const homeId = toNum(record.homeId);
    const awayId = toNum(record.awayId);
    const status = String(record.status || '').toUpperCase();
    if (!fixtureId || !dateUtc) continue;
    if (!FINAL_STATUSES.has(status)) continue;
    if (homeId !== Number(teamId) && awayId !== Number(teamId)) continue;
    refs.push({ fixtureId, dateUtc });
  }
  return normalizeFixtureRefs(refs, Number.POSITIVE_INFINITY);
}

function buildWindowRefsFromPool({ teamId, fixtureStatsCache, allTeamRefs }) {
  const target = TARGET_WINDOW_SIZE;
  const configuredPool = sanitizePoolSize(POOL_SIZE, 20);
  const configuredMaxPool = Math.max(configuredPool, sanitizePoolSize(MAX_POOL_SIZE, 80));
  const maxPool = Math.min(configuredMaxPool, Math.max(configuredPool, allTeamRefs.length));
  let currentPool = Math.min(configuredPool, allTeamRefs.length || configuredPool);

  let totalRefs = [];
  let homeRefs = [];
  let awayRefs = [];

  while (true) {
    const poolRefs = allTeamRefs.slice(0, currentPool);
    totalRefs = normalizeFixtureRefs(poolRefs, target);
    homeRefs = normalizeFixtureRefs(
      poolRefs.filter((ref) => {
        const rec = fixtureStatsCache[fixtureCacheKey(ref.fixtureId)];
        return rec && Number(rec.homeId) === Number(teamId);
      }),
      target
    );
    awayRefs = normalizeFixtureRefs(
      poolRefs.filter((ref) => {
        const rec = fixtureStatsCache[fixtureCacheKey(ref.fixtureId)];
        return rec && Number(rec.awayId) === Number(teamId);
      }),
      target
    );

    const hasEnoughHomeAway = homeRefs.length >= target && awayRefs.length >= target;
    const reachedMaxPool = currentPool >= maxPool || currentPool >= allTeamRefs.length;
    if (hasEnoughHomeAway || reachedMaxPool) break;
    currentPool = Math.min(maxPool, currentPool + configuredPool);
  }

  return { totalRefs, homeRefs, awayRefs };
}

function createEmptySnapshotV2({ teamId, teamName, leagueId, season }) {
  return {
    schema_version: SCHEMA_VERSION,
    windows: {
      total_last5: { gols_marcados: null, gols_sofridos: null, clean_sheets: null, falha_marcar: null, cartoes_amarelos: null, cantos: null, posse_pct: null },
      home_last5: { gols_marcados: null, gols_sofridos: null, clean_sheets: null, falha_marcar: null, cartoes_amarelos: null, cantos: null, posse_pct: null },
      away_last5: { gols_marcados: null, gols_sofridos: null, clean_sheets: null, falha_marcar: null, cartoes_amarelos: null, cantos: null, posse_pct: null }
    },
    meta: {
      league_id: leagueId,
      season,
      team_id: teamId,
      team_name: teamName || 'Unknown',
      games_used_total: 0,
      games_used_home: 0,
      games_used_away: 0,
      fixtures_used_total: [],
      fixtures_used_home: [],
      fixtures_used_away: [],
      partial_home: true,
      partial_away: true,
      last_updated: new Date().toISOString()
    }
  };
}

function writeSnapshotToDisk(snapshot, outputDir, leagueId, season) {
  const dirPath = path.join(outputDir, String(leagueId), String(season));
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const filePath = path.join(dirPath, `${snapshot.meta.team_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  console.log(`[team-window-5] Saved snapshot: ${filePath}`);
}

function buildSnapshotV2({ existingSnapshot, teamId, teamName, leagueId, season, newFixtureRef, fixtureStatsCache }) {
  const teamRefsFromCache = collectTeamFixtureRefsFromCache(teamId, fixtureStatsCache);
  const allTeamRefs = appendFixtureRef(teamRefsFromCache, newFixtureRef);
  const { totalRefs, homeRefs, awayRefs } = buildWindowRefsFromPool({ teamId, fixtureStatsCache, allTeamRefs });

  const refsUnchanged =
    sameFixtureRefs(existingSnapshot?.meta?.fixtures_used_total || [], totalRefs) &&
    sameFixtureRefs(existingSnapshot?.meta?.fixtures_used_home || [], homeRefs) &&
    sameFixtureRefs(existingSnapshot?.meta?.fixtures_used_away || [], awayRefs);

  return {
    schema_version: SCHEMA_VERSION,
    windows: {
      total_last5: refsToAggregates(totalRefs, teamId, fixtureStatsCache),
      home_last5: refsToAggregates(homeRefs, teamId, fixtureStatsCache),
      away_last5: refsToAggregates(awayRefs, teamId, fixtureStatsCache)
    },
    meta: {
      league_id: leagueId,
      season,
      team_id: teamId,
      team_name: teamName || existingSnapshot?.meta?.team_name || 'Unknown',
      games_used_total: totalRefs.length,
      games_used_home: homeRefs.length,
      games_used_away: awayRefs.length,
      fixtures_used_total: totalRefs,
      fixtures_used_home: homeRefs,
      fixtures_used_away: awayRefs,
      partial_home: homeRefs.length < TARGET_WINDOW_SIZE,
      partial_away: awayRefs.length < TARGET_WINDOW_SIZE,
      last_updated: refsUnchanged
        ? (existingSnapshot?.meta?.last_updated || new Date().toISOString())
        : new Date().toISOString()
    }
  };
}

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
      path.join(cacheDir, 'calendar_2d.json'),
      path.join(cacheDir, 'calendar_day.json')
    ];
    
    let allFixtures = [];
    
    for (const file of calendarFiles) {
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const matches = [
        ...(Array.isArray(data?.matches) ? data.matches : []),
        ...(Array.isArray(data?.today) ? data.today : []),
        ...(Array.isArray(data?.tomorrow) ? data.tomorrow : [])
      ];
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
      .slice(0, Math.max(maxGames, TARGET_WINDOW_SIZE));

    return teamFixtures;
  } catch (e) {
    console.error(`[team-window-5] Error loading cache for team ${teamId}:`, e.message);
    return [];
  }
}

// Organize fixtures by venue
function organizeByVenue(fixtures, teamId) {
  const total = fixtures.slice(0, TARGET_WINDOW_SIZE);
  const home = fixtures.filter(f => f.home_id === teamId).slice(0, TARGET_WINDOW_SIZE);
  const away = fixtures.filter(f => f.away_id === teamId).slice(0, TARGET_WINDOW_SIZE);

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
    const configuredPool = sanitizePoolSize(POOL_SIZE, 20);
    const configuredMaxPool = Math.max(configuredPool, sanitizePoolSize(MAX_POOL_SIZE, 80));
    let pool = configuredPool;
    let fixtures = [];

    while (pool <= configuredMaxPool) {
      fixtures = loadFixturesFromCache(teamId, leagueId, season, cacheDir, pool);
      const homeCount = fixtures.filter(f => f.home_id === teamId).length;
      const awayCount = fixtures.filter(f => f.away_id === teamId).length;
      if (homeCount >= TARGET_WINDOW_SIZE && awayCount >= TARGET_WINDOW_SIZE) break;
      if (pool >= configuredMaxPool) break;
      pool = Math.min(configuredMaxPool, pool + configuredPool);
    }
    
    if (fixtures.length === 0) {
      console.warn(`[team-window-5] No fixtures found for team ${teamId}`);
      return createEmptySnapshotV2({ teamId, teamName, leagueId, season });
    }

    // Normalize fixtures
    const normalized = fixtures.map(f => normalizeFixture(f, teamId));

    // Organize by venue
    const { total, home, away } = organizeByVenue(normalized, teamId);

    // Aggregate stats
    const totalStats = aggregateStats(total, 'total');
    const homeStats = aggregateStats(home, 'home');
    const awayStats = aggregateStats(away, 'away');

    const fixturesUsedTotal = normalizeFixtureRefs(total.map((f) => ({ fixtureId: f.fixture_id, dateUtc: toIsoUtc(f.date_utc) })), TARGET_WINDOW_SIZE);
    const fixturesUsedHome = normalizeFixtureRefs(home.map((f) => ({ fixtureId: f.fixture_id, dateUtc: toIsoUtc(f.date_utc) })), TARGET_WINDOW_SIZE);
    const fixturesUsedAway = normalizeFixtureRefs(away.map((f) => ({ fixtureId: f.fixture_id, dateUtc: toIsoUtc(f.date_utc) })), TARGET_WINDOW_SIZE);

    const snapshot = {
      schema_version: SCHEMA_VERSION,
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
        fixtures_used_total: fixturesUsedTotal,
        fixtures_used_home: fixturesUsedHome,
        fixtures_used_away: fixturesUsedAway,
        partial_home: home.length < TARGET_WINDOW_SIZE,
        partial_away: away.length < TARGET_WINDOW_SIZE,
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
    outputDir = './data/v1/team-window-5',
    fetchFixtureStats = null
  } = options;

  if (!match || !match.home_id || !match.away_id) {
    throw new Error('Invalid match object: missing home_id or away_id');
  }

  console.log(`[team-window-5] Generating for ${match.home} (${match.home_id}) vs ${match.away} (${match.away_id}), league ${leagueId}, season ${season}`);

  try {
    const homeTeamId = toNum(match.home_id);
    const awayTeamId = toNum(match.away_id);
    const fixtureId = getFixtureId(match);

    const existingHome = loadTeamWindow5Snapshot(homeTeamId, leagueId, season, outputDir);
    const existingAway = loadTeamWindow5Snapshot(awayTeamId, leagueId, season, outputDir);

    if (!isFinishedMatch(match)) {
      const homeForm = Array.isArray(match.form_home_details) ? match.form_home_details : [];
      const awayForm = Array.isArray(match.form_away_details) ? match.form_away_details : [];

      if (homeForm.length === 0 || awayForm.length === 0) {
        throw new Error(`Fixture ${fixtureId} is not finished and missing form details required for team-window-5 generation`);
      }

      const homeSnapshot = generateSnapshotFromForm({
        teamId: homeTeamId,
        teamName: match.home,
        leagueId,
        season,
        formDetails: homeForm
      });

      const awaySnapshot = generateSnapshotFromForm({
        teamId: awayTeamId,
        teamName: match.away,
        leagueId,
        season,
        formDetails: awayForm
      });

      writeSnapshotToDisk(homeSnapshot, outputDir, leagueId, season);
      writeSnapshotToDisk(awaySnapshot, outputDir, leagueId, season);

      return {
        home: homeSnapshot,
        away: awaySnapshot,
        updated: true,
        reason: 'form_details'
      };
    }

    const { path: fixtureCachePath, data: fixtureStatsCache } = readFixtureStatsCache(outputDir, leagueId, season);
    const fKey = fixtureCacheKey(fixtureId);

    let fixtureRecord = fixtureStatsCache[fKey] || null;
    let cacheHit = Boolean(fixtureRecord);
    let cacheMiss = false;

    if (!fixtureRecord) {
      cacheMiss = true;
      if (typeof fetchFixtureStats === 'function') {
        const fetched = await fetchFixtureStats(fixtureId);
        if (fetched && typeof fetched === 'object') {
          fixtureRecord = {
            fixtureId,
            dateUtc: toIsoUtc(fetched.dateUtc ?? fetched.kickoff_utc ?? match?.kickoff_utc),
            status: String(fetched.status || fetched.fixture_status || getFixtureStatus(match) || '').toUpperCase(),
            homeId: toNum(fetched.homeId ?? fetched.home_id ?? homeTeamId),
            awayId: toNum(fetched.awayId ?? fetched.away_id ?? awayTeamId),
            goalsHome: toNum(fetched.goalsHome ?? fetched.goals_home),
            goalsAway: toNum(fetched.goalsAway ?? fetched.goals_away),
            yellowCardsHome: toNum(fetched.yellowCardsHome ?? fetched.yellow_cards_home),
            yellowCardsAway: toNum(fetched.yellowCardsAway ?? fetched.yellow_cards_away),
            cornersHome: toNum(fetched.cornersHome ?? fetched.corners_home),
            cornersAway: toNum(fetched.cornersAway ?? fetched.corners_away),
            possessionHome: toNum(fetched.possessionHome ?? fetched.possession_home),
            possessionAway: toNum(fetched.possessionAway ?? fetched.possession_away)
          };
        }
      }

      if (!fixtureRecord) {
        fixtureRecord = buildFixtureStatsRecordFromMatch(match);
      }

      if (!fixtureRecord) {
        throw new Error(`Unable to build fixture stats record for fixture ${fixtureId}`);
      }

      fixtureStatsCache[fKey] = fixtureRecord;
      writeFixtureStatsCache(fixtureCachePath, fixtureStatsCache);
    }

    const newFixtureRef = { fixtureId: fixtureRecord.fixtureId, dateUtc: fixtureRecord.dateUtc };

    const homeSnapshot = buildSnapshotV2({
      existingSnapshot: existingHome,
      teamId: homeTeamId,
      teamName: match.home,
      leagueId,
      season,
      newFixtureRef,
      fixtureStatsCache
    });

    const awaySnapshot = buildSnapshotV2({
      existingSnapshot: existingAway,
      teamId: awayTeamId,
      teamName: match.away,
      leagueId,
      season,
      newFixtureRef,
      fixtureStatsCache
    });

    const homeChanged = !snapshotsEqual(existingHome, homeSnapshot);
    const awayChanged = !snapshotsEqual(existingAway, awaySnapshot);

    // Save only changed snapshots
    for (const snapshot of [homeSnapshot, awaySnapshot]) {
      const changed = Number(snapshot?.meta?.team_id) === Number(homeTeamId) ? homeChanged : awayChanged;
      if (!changed) continue;
      writeSnapshotToDisk(snapshot, outputDir, leagueId, season);
    }

    return {
      home: homeSnapshot,
      away: awaySnapshot,
      updated: homeChanged || awayChanged,
      reason: homeChanged || awayChanged ? 'updated' : 'no_change',
      cache: { hit: cacheHit, miss: cacheMiss }
    };
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
    schema_version: SCHEMA_VERSION,
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
      fixtures_used_total: [],
      fixtures_used_home: [],
      fixtures_used_away: [],
      partial_home: home.length < TARGET_WINDOW_SIZE,
      partial_away: away.length < TARGET_WINDOW_SIZE,
      last_updated: new Date().toISOString()
    }
  };
}
