/**
 * Season Resolution via API-Football /leagues endpoint
 * Determina a season "oficial" para uma liga consultando /leagues
 */

import { apiGetJson } from './api-football.mjs';

/**
 * Fetch league seasons and coverage from API-Football
 * @param {number} leagueId
 * @returns {Promise<{leagueId, name, country, type, seasons: Array}>}
 */
export async function fetchLeagueSeasons(leagueId) {
  try {
    const response = await apiGetJson(`/leagues?id=${leagueId}`);
    
    if (!Array.isArray(response) || response.length === 0) {
      throw new Error(`No league found with id ${leagueId}`);
    }

    const league = response[0];
    const seasons = (league.seasons || []).map(s => ({
      year: s.year,
      start: s.start,
      end: s.end,
      current: s.current === true,
      coverage: {
        standings: s.coverage?.standings === true,
        fixtures: s.coverage?.fixtures === true,
        players: s.coverage?.players === true,
        events: s.coverage?.events === true,
        statistics: s.coverage?.statistics === true,
        predictions: s.coverage?.predictions === true,
        odds: s.coverage?.odds === true
      }
    }));

    return {
      leagueId,
      name: league.name || 'Unknown',
      country: league.country || 'Unknown',
      type: league.type || 'league',
      seasons
    };
  } catch (error) {
    throw new Error(`Failed to fetch league seasons for ${leagueId}: ${error.message}`);
  }
}

/**
 * Pick the correct season year from /leagues response
 * Preference: current > range > max
 * @param {{seasons: Array, kickoffUTC: string}} options
 * @returns {{year: number, reason: string}}
 */
export function pickSeasonFromLeagues({ seasons, kickoffUTC }) {
  if (!Array.isArray(seasons) || seasons.length === 0) {
    throw new Error('No seasons available');
  }

  // Preferência 1: current === true
  const currentSeason = seasons.find(s => s.current === true);
  if (currentSeason) {
    return {
      year: currentSeason.year,
      reason: 'current',
      season: currentSeason
    };
  }

  // Preferência 2: kickoffUTC dentro de [start, end]
  if (kickoffUTC) {
    const kickoffDate = new Date(kickoffUTC);
    const kickoffTime = kickoffDate.getTime();

    const seasonInRange = seasons.find(s => {
      if (!s.start || !s.end) return false;
      const startTime = new Date(s.start).getTime();
      const endTime = new Date(s.end).getTime();
      return kickoffTime >= startTime && kickoffTime <= endTime;
    });

    if (seasonInRange) {
      return {
        year: seasonInRange.year,
        reason: 'range',
        season: seasonInRange
      };
    }
  }

  // Preferência 3: maior year disponível
  const maxSeason = seasons.reduce((max, s) => 
    (s.year > max.year ? s : max)
  );

  return {
    year: maxSeason.year,
    reason: 'max',
    season: maxSeason
  };
}

/**
 * Resolve season for a league
 * @param {{leagueId: number, kickoffUTC?: string}} options
 * @returns {Promise<{year, reason, leagueMeta, coverage}>}
 */
export async function resolveSeasonForLeague({ leagueId, kickoffUTC }) {
  const leagueMeta = await fetchLeagueSeasons(leagueId);
  const { year, reason, season } = pickSeasonFromLeagues({
    seasons: leagueMeta.seasons,
    kickoffUTC
  });

  return {
    year,
    reason,
    leagueMeta,
    coverage: season.coverage
  };
}
