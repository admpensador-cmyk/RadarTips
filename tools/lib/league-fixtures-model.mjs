/**
 * tools/lib/league-fixtures-model.mjs
 *
 * Canonical 4-layer data model for League Pages (Prédio 2).
 *
 * Layer 1 — Raw Fixtures : finished fixtures from API (minimal fields)
 * Layer 2 — Team Facts   : per-fixture, per-team attributed records
 * Layer 3 — Team Aggregates: cumulative per-team stats (total / home / away)
 * Layer 4 — League Snapshot : computed from aggregates (see league-v1-snapshot.mjs)
 *
 * Design rules:
 *   - Every stat is attributed correctly to mandante / visitante.
 *   - Corners, cards and shots come from /fixtures/statistics — null if not fetched yet.
 *   - BTTS, clean_sheet, over_X are computed from goals — no API aggregate dependency.
 *   - Over_X means TOTAL match goals > X (same value for both team facts in a match).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInt(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toFloat(v, digits = 3, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : fallback;
}

function pct(count, total, digits = 2) {
  if (!Number.isFinite(Number(count)) || !Number.isFinite(Number(total)) || Number(total) <= 0) return null;
  return Number(((Number(count) / Number(total)) * 100).toFixed(digits));
}

// ---------------------------------------------------------------------------
// Layer 1 — Raw Fixtures
// ---------------------------------------------------------------------------

/**
 * Extract a numeric stat value from an API /fixtures/statistics statistics array.
 * Accepts: null, "-", "55%", "55", 55
 */
export function getFixtureStatValue(statsArray, type) {
  const entry = (Array.isArray(statsArray) ? statsArray : []).find(
    (e) => String(e?.type || "").trim() === type
  );
  if (!entry) return null;
  const raw = entry.value;
  if (raw === null || raw === undefined) return null;
  const str = String(raw).replace("%", "").trim();
  if (!str || str === "-" || str.toLowerCase() === "null") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a minimal raw fixture record from a single API fixture response item.
 * Stores only essential fields to minimize storage size.
 *
 * @param {object} apiItem   - Single item from /fixtures response array
 * @param {number} competitionId - league_id (e.g. 39)
 * @param {number} season        - season year (e.g. 2025)
 * @returns {object|null}
 */
export function buildRawFixtureRecord(apiItem, competitionId, season) {
  const fixture = apiItem?.fixture || {};
  const teams = apiItem?.teams || {};
  const goals = apiItem?.goals || {};
  const league = apiItem?.league || {};

  const ts = Number(fixture?.timestamp);
  const playedAtUtc =
    Number.isFinite(ts) && ts > 0
      ? new Date(ts * 1000).toISOString()
      : fixture?.date
      ? new Date(Date.parse(fixture.date)).toISOString()
      : null;

  const homeGoals = Number(goals?.home);
  const awayGoals = Number(goals?.away);

  const fixtureId = toInt(fixture?.id);
  if (!fixtureId) return null;

  return {
    fixture_id: fixtureId,
    played_at_utc: playedAtUtc,
    round: String(league?.round || "").trim() || null,
    status: String(fixture?.status?.short || "").trim().toUpperCase(),
    competition_id: toInt(competitionId),
    season: toInt(season),
    home_id: toInt(teams?.home?.id),
    home_name: String(teams?.home?.name || "").trim(),
    away_id: toInt(teams?.away?.id),
    away_name: String(teams?.away?.name || "").trim(),
    home_goals: Number.isFinite(homeGoals) ? homeGoals : null,
    away_goals: Number.isFinite(awayGoals) ? awayGoals : null
  };
}

/**
 * Build a fixture stats record from the API's /fixtures/statistics response.
 * Returns an object with home and away blocks containing corners, cards, shots.
 *
 * @param {number} fixtureId
 * @param {number} homeTeamId
 * @param {number} awayTeamId
 * @param {Array}  apiStatsResponse - response array from /fixtures/statistics
 * @returns {object}
 */
export function buildFixtureStatsRecord(fixtureId, homeTeamId, awayTeamId, apiStatsResponse) {
  const teamBlocks = Array.isArray(apiStatsResponse) ? apiStatsResponse : [];

  function extractForTeam(teamId) {
    const block = teamBlocks.find((b) => Number(b?.team?.id) === teamId);
    const stats = Array.isArray(block?.statistics) ? block.statistics : [];
    return {
      corners: toInt(getFixtureStatValue(stats, "Corner Kicks")),
      yellow_cards: toInt(getFixtureStatValue(stats, "Yellow Cards")),
      red_cards: toInt(getFixtureStatValue(stats, "Red Cards")),
      shots: toInt(getFixtureStatValue(stats, "Total Shots")),
      shots_on_target: toInt(getFixtureStatValue(stats, "Shots on Goal")),
      possession_pct: toFloat(getFixtureStatValue(stats, "Ball Possession"), 1),
      fouls: toInt(getFixtureStatValue(stats, "Fouls")),
      offsides: toInt(getFixtureStatValue(stats, "Offsides")),
      saves: toInt(getFixtureStatValue(stats, "Goalkeeper Saves"))
    };
  }

  return {
    fixture_id: fixtureId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home: extractForTeam(homeTeamId),
    away: extractForTeam(awayTeamId)
  };
}

// ---------------------------------------------------------------------------
// Layer 2 — Team Facts
// ---------------------------------------------------------------------------

/**
 * Build two team fact records from a raw fixture + optional fixture stats.
 * Returns [homeTeamFact, awayTeamFact].
 *
 * Attribution rule:
 *   - corners_for / yellow_cards_for / shots_for = data for THIS team in THIS match
 *   - corners_against / yellow_cards_against = opponent's data in THIS match
 *
 * @param {object}      rawFixture  - output of buildRawFixtureRecord
 * @param {object|null} fixtureStats - output of buildFixtureStatsRecord, or null
 * @returns {[object, object]}
 */
export function buildTeamFactsFromFixture(rawFixture, fixtureStats) {
  const {
    fixture_id,
    played_at_utc,
    round,
    competition_id,
    season,
    home_id,
    home_name,
    away_id,
    away_name,
    home_goals,
    away_goals
  } = rawFixture;

  if (!Number.isFinite(home_goals) || !Number.isFinite(away_goals)) {
    throw new Error(`buildTeamFactsFromFixture: missing goals for fixture_id=${fixture_id}`);
  }

  const totalGoals = home_goals + away_goals;
  const btts = home_goals > 0 && away_goals > 0;

  function buildFact(teamId, teamName, opponentId, opponentName, gf, ga, isHome) {
    const won = gf > ga;
    const drew = gf === ga;
    const lost = gf < ga;
    const cleanSheet = ga === 0;
    const failedToScore = gf === 0;

    const statsBlock = fixtureStats ? (isHome ? fixtureStats.home : fixtureStats.away) : null;
    const opponentStatsBlock = fixtureStats ? (isHome ? fixtureStats.away : fixtureStats.home) : null;

    return {
      fixture_id,
      team_id: teamId,
      team_name: teamName,
      opponent_id: opponentId,
      opponent_name: opponentName,
      competition_id,
      season,
      is_home: isHome,
      played_at_utc,
      round,
      goals_for: gf,
      goals_against: ga,
      total_goals: totalGoals,
      won,
      drew,
      lost,
      points: won ? 3 : drew ? 1 : 0,
      btts,
      clean_sheet: cleanSheet,
      failed_to_score: failedToScore,
      over_05: totalGoals > 0.5,
      over_15: totalGoals > 1.5,
      over_25: totalGoals > 2.5,
      over_35: totalGoals > 3.5,
      // Advanced stats — null if fixture stats not fetched yet
      corners_for: statsBlock?.corners ?? null,
      corners_against: opponentStatsBlock?.corners ?? null,
      yellow_cards_for: statsBlock?.yellow_cards ?? null,
      yellow_cards_against: opponentStatsBlock?.yellow_cards ?? null,
      red_cards_for: statsBlock?.red_cards ?? null,
      red_cards_against: opponentStatsBlock?.red_cards ?? null,
      shots_for: statsBlock?.shots ?? null,
      shots_on_target_for: statsBlock?.shots_on_target ?? null,
      possession_pct: statsBlock?.possession_pct ?? null,
      fouls_for: statsBlock?.fouls ?? null,
      offsides_for: statsBlock?.offsides ?? null
    };
  }

  return [
    buildFact(home_id, home_name, away_id, away_name, home_goals, away_goals, true),
    buildFact(away_id, away_name, home_id, home_name, away_goals, home_goals, false)
  ];
}

// ---------------------------------------------------------------------------
// Layer 3 — Team Aggregates
// ---------------------------------------------------------------------------

/**
 * Aggregate a set of team facts into a split stats object.
 * Used for total / home / away splits.
 */
export function buildSplitStats(facts) {
  const n = facts.length;
  if (n === 0) {
    return {
      played: 0,
      won: 0, drew: 0, lost: 0, points: 0,
      goals_for: 0, goals_against: 0, goal_diff: 0,
      goals_for_per_game: null, goals_against_per_game: null,
      btts_count: 0, btts_pct: null,
      clean_sheets_count: 0, clean_sheets_pct: null,
      failed_to_score_count: 0, failed_to_score_pct: null,
      over_05_count: 0, over_05_pct: null,
      over_15_count: 0, over_15_pct: null,
      over_25_count: 0, over_25_pct: null,
      over_35_count: 0, over_35_pct: null,
      corners_for_total: null, corners_for_avg: null,
      corners_against_total: null, corners_against_avg: null,
      yellow_cards_for_total: null, yellow_cards_for_avg: null,
      yellow_cards_against_total: null, yellow_cards_against_avg: null,
      red_cards_for_total: null, red_cards_against_total: null,
      shots_for_total: null, shots_for_avg: null,
      shots_on_target_for_total: null
    };
  }

  let won = 0, drew = 0, lost = 0, points = 0;
  let goals_for = 0, goals_against = 0;
  let btts_count = 0, clean_sheets_count = 0, failed_to_score_count = 0;
  let over_05_count = 0, over_15_count = 0, over_25_count = 0, over_35_count = 0;
  let corners_for_sum = 0, corners_against_sum = 0;
  let yellow_for_sum = 0, yellow_against_sum = 0;
  let red_for_sum = 0, red_against_sum = 0;
  let shots_for_sum = 0, shots_on_target_sum = 0;
  let corners_count = 0, yellow_count = 0, shots_count = 0, red_count = 0;

  for (const f of facts) {
    if (f.won) won++;
    if (f.drew) drew++;
    if (f.lost) lost++;
    points += f.points;
    goals_for += f.goals_for;
    goals_against += f.goals_against;
    if (f.btts) btts_count++;
    if (f.clean_sheet) clean_sheets_count++;
    if (f.failed_to_score) failed_to_score_count++;
    if (f.over_05) over_05_count++;
    if (f.over_15) over_15_count++;
    if (f.over_25) over_25_count++;
    if (f.over_35) over_35_count++;
    if (f.corners_for !== null) {
      corners_for_sum += f.corners_for;
      corners_against_sum += (f.corners_against ?? 0);
      corners_count++;
    }
    if (f.yellow_cards_for !== null) {
      yellow_for_sum += f.yellow_cards_for;
      yellow_against_sum += (f.yellow_cards_against ?? 0);
      yellow_count++;
    }
    if (f.red_cards_for !== null) {
      red_for_sum += f.red_cards_for;
      red_against_sum += (f.red_cards_against ?? 0);
      red_count++;
    }
    if (f.shots_for !== null) {
      shots_for_sum += f.shots_for;
      shots_on_target_sum += (f.shots_on_target_for ?? 0);
      shots_count++;
    }
  }

  return {
    played: n,
    won, drew, lost, points,
    goals_for, goals_against,
    goal_diff: goals_for - goals_against,
    goals_for_per_game: toFloat(goals_for / n, 3),
    goals_against_per_game: toFloat(goals_against / n, 3),
    btts_count, btts_pct: pct(btts_count, n),
    clean_sheets_count, clean_sheets_pct: pct(clean_sheets_count, n),
    failed_to_score_count, failed_to_score_pct: pct(failed_to_score_count, n),
    over_05_count, over_05_pct: pct(over_05_count, n),
    over_15_count, over_15_pct: pct(over_15_count, n),
    over_25_count, over_25_pct: pct(over_25_count, n),
    over_35_count, over_35_pct: pct(over_35_count, n),
    corners_for_total: corners_count > 0 ? corners_for_sum : null,
    corners_for_avg: corners_count > 0 ? toFloat(corners_for_sum / corners_count, 2) : null,
    corners_against_total: corners_count > 0 ? corners_against_sum : null,
    corners_against_avg: corners_count > 0 ? toFloat(corners_against_sum / corners_count, 2) : null,
    yellow_cards_for_total: yellow_count > 0 ? yellow_for_sum : null,
    yellow_cards_for_avg: yellow_count > 0 ? toFloat(yellow_for_sum / yellow_count, 2) : null,
    yellow_cards_against_total: yellow_count > 0 ? yellow_against_sum : null,
    yellow_cards_against_avg: yellow_count > 0 ? toFloat(yellow_against_sum / yellow_count, 2) : null,
    red_cards_for_total: red_count > 0 ? red_for_sum : null,
    red_cards_against_total: red_count > 0 ? red_against_sum : null,
    shots_for_total: shots_count > 0 ? shots_for_sum : null,
    shots_for_avg: shots_count > 0 ? toFloat(shots_for_sum / shots_count, 2) : null,
    shots_on_target_for_total: shots_count > 0 ? shots_on_target_sum : null
  };
}

/**
 * Build a complete team aggregate (total + home + away splits) from all facts for that team.
 *
 * @param {number} teamId
 * @param {string} teamName
 * @param {number} competitionId
 * @param {number} season
 * @param {Array}  allFacts  - all Team Facts for this competition/season
 * @returns {object}
 */
export function buildTeamAggregate(teamId, teamName, competitionId, season, allFacts) {
  const teamFacts = allFacts.filter((f) => f.team_id === teamId);
  const homeFacts = teamFacts.filter((f) => f.is_home);
  const awayFacts = teamFacts.filter((f) => !f.is_home);

  return {
    team_id: teamId,
    team_name: teamName,
    competition_id: competitionId,
    season,
    total: buildSplitStats(teamFacts),
    home: buildSplitStats(homeFacts),
    away: buildSplitStats(awayFacts)
  };
}

/**
 * Build aggregates for ALL teams from the full fact set.
 * Returns a plain object keyed by team_id (as string).
 *
 * @param {Array}  allFacts
 * @param {number} competitionId
 * @param {number} season
 * @returns {object}
 */
export function buildAllTeamAggregates(allFacts, competitionId, season) {
  const teamMap = new Map();
  for (const fact of allFacts) {
    if (!teamMap.has(fact.team_id)) {
      teamMap.set(fact.team_id, fact.team_name);
    }
  }

  const aggregates = {};
  for (const [teamId, teamName] of teamMap.entries()) {
    aggregates[String(teamId)] = buildTeamAggregate(teamId, teamName, competitionId, season, allFacts);
  }
  return aggregates;
}

/**
 * Build all team facts from a list of raw fixtures and an optional fixture stats map.
 *
 * @param {Array}  rawFixtures  - output of buildRawFixtureRecord[]
 * @param {object} fixtureStatsMap - { [fixture_id]: buildFixtureStatsRecord output }, or {}
 * @returns {Array}  flat list of team facts (2 per fixture)
 */
export function buildAllTeamFacts(rawFixtures, fixtureStatsMap) {
  const statsMap = fixtureStatsMap || {};
  const allFacts = [];

  for (const raw of rawFixtures) {
    if (raw.home_goals === null || raw.away_goals === null) continue;
    const stats = statsMap[String(raw.fixture_id)] || null;
    try {
      const [homeFact, awayFact] = buildTeamFactsFromFixture(raw, stats);
      allFacts.push(homeFact, awayFact);
    } catch {
      // skip malformed fixtures silently
    }
  }

  return allFacts;
}
