export const PREMIER_LEAGUE_V1 = {
  slug: "premier-league",
  leagueId: 39,
  defaultName: "Premier League",
  defaultCountry: "England"
};

const REQUIRED_SOURCE_RESOURCES = ["/standings", "/fixtures", "/teams/statistics"];
const FORBIDDEN_SOURCE_TOKENS = [
  "openfootball",
  "football.json",
  "standings_39_2025.json",
  "compstats_39_2025.json"
];

function hasForbiddenLegacyToken(value) {
  const text = String(value || "").toLowerCase();
  return FORBIDDEN_SOURCE_TOKENS.some((token) => text.includes(token));
}

export function assertPremierLeagueSnapshotUsesApiFootball(snapshot) {
  const competitionId = Number(snapshot?.competition?.competition_id);
  if (competitionId !== PREMIER_LEAGUE_V1.leagueId) {
    throw new Error(`[LEAGUE-V1] Invalid competition_id in snapshot: ${competitionId}`);
  }

  const source = snapshot?.meta?.source;
  if (!source || typeof source !== "object") {
    throw new Error("[LEAGUE-V1] Missing meta.source in Premier League snapshot");
  }

  if (String(source.provider || "").trim() !== "api-football") {
    throw new Error(`[LEAGUE-V1] Invalid source provider: ${String(source.provider || "")}`);
  }

  if (Number(source.league_id) !== PREMIER_LEAGUE_V1.leagueId) {
    throw new Error(`[LEAGUE-V1] Invalid source league_id: ${String(source.league_id || "")}`);
  }

  const resources = Array.isArray(source.resources) ? source.resources.map((entry) => String(entry || "").trim()) : [];
  for (const required of REQUIRED_SOURCE_RESOURCES) {
    if (!resources.includes(required)) {
      throw new Error(`[LEAGUE-V1] Missing required API resource: ${required}`);
    }
  }

  const raw = JSON.stringify(snapshot);
  if (hasForbiddenLegacyToken(raw)) {
    throw new Error("[LEAGUE-V1] Forbidden legacy source reference found in snapshot payload");
  }

  return snapshot;
}

export function assertPremierLeagueSnapshotHasFixtureCoverage(snapshot) {
  const upcomingCount = Array.isArray(snapshot?.fixtures?.upcoming) ? snapshot.fixtures.upcoming.length : 0;
  const recentCount = Array.isArray(snapshot?.fixtures?.recent) ? snapshot.fixtures.recent.length : 0;
  const matchesCount = Number(snapshot?.summary?.matches_count || snapshot?.statistics?.league?.matches_count || 0);

  if (matchesCount <= 0) {
    throw new Error(`[LEAGUE-V1] Invalid matches_count in snapshot: ${matchesCount}`);
  }

  if ((upcomingCount + recentCount) <= 0) {
    throw new Error("[LEAGUE-V1] Snapshot has no upcoming or recent fixtures");
  }

  return snapshot;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatNumber(value, digits = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : "n/a";
}

function teamKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(fc|cf|afc|ac)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLeagueBlock(standingsPayload) {
  const response = Array.isArray(standingsPayload?.response) ? standingsPayload.response : [];
  return response[0]?.league || null;
}

function extractStandingsRows(standingsPayload) {
  const leagueBlock = extractLeagueBlock(standingsPayload);
  const groups = Array.isArray(leagueBlock?.standings) ? leagueBlock.standings : [];
  const rows = groups.find((entry) => Array.isArray(entry)) || [];
  return Array.isArray(rows) ? rows : [];
}

function mapStandingsRows(standingsPayload) {
  return extractStandingsRows(standingsPayload).map((row) => ({
    position: toNumber(row?.rank),
    team: String(row?.team?.name || "").trim(),
    team_id: toNumber(row?.team?.id, null),
    points: toNumber(row?.points),
    played: toNumber(row?.all?.played),
    wins: toNumber(row?.all?.win),
    draws: toNumber(row?.all?.draw),
    losses: toNumber(row?.all?.lose),
    goals_for: toNumber(row?.all?.goals?.for),
    goals_against: toNumber(row?.all?.goals?.against),
    goal_diff: toNumber(row?.goalsDiff),
    form_last5: String(row?.form || "").replace(/[^WDL]/g, "").slice(0, 5)
  }));
}

function fixtureIso(fixture) {
  const timestamp = Number(fixture?.fixture?.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000).toISOString();
  }
  const raw = String(fixture?.fixture?.date || "").trim();
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function fixtureRound(fixture) {
  return String(fixture?.league?.round || "").trim() || "Matchday";
}

function fixtureStatusShort(fixture) {
  return String(fixture?.fixture?.status?.short || "").trim().toUpperCase();
}

function fixtureStatusLabel(fixture) {
  return String(fixture?.fixture?.status?.long || "").trim() || "Scheduled";
}

function isFinishedFixture(fixture) {
  const status = fixtureStatusShort(fixture);
  return status === "FT" || status === "AET" || status === "PEN";
}

function buildFixtures(fixturesPayload) {
  const response = Array.isArray(fixturesPayload?.response) ? fixturesPayload.response : [];
  const normalized = response
    .map((fixture) => {
      const kickoffUtc = fixtureIso(fixture);
      const homeGoals = fixture?.goals?.home;
      const awayGoals = fixture?.goals?.away;
      const hasResult = isFinishedFixture(fixture) && Number.isFinite(Number(homeGoals)) && Number.isFinite(Number(awayGoals));

      return {
        fixture_id: toNumber(fixture?.fixture?.id, null),
        round: fixtureRound(fixture),
        kickoff_utc: kickoffUtc,
        home: String(fixture?.teams?.home?.name || "").trim(),
        away: String(fixture?.teams?.away?.name || "").trim(),
        home_id: toNumber(fixture?.teams?.home?.id, null),
        away_id: toNumber(fixture?.teams?.away?.id, null),
        home_goals: hasResult ? toNumber(homeGoals, null) : null,
        away_goals: hasResult ? toNumber(awayGoals, null) : null,
        status: fixtureStatusLabel(fixture),
        status_short: fixtureStatusShort(fixture),
        hasResult
      };
    })
    .filter((fixture) => fixture.fixture_id && fixture.kickoff_utc && fixture.home && fixture.away)
    .sort((a, b) => Date.parse(a.kickoff_utc) - Date.parse(b.kickoff_utc));

  const now = Date.now();
  const recent = normalized
    .filter((fixture) => fixture.hasResult && Date.parse(fixture.kickoff_utc) <= now)
    .sort((a, b) => Date.parse(b.kickoff_utc) - Date.parse(a.kickoff_utc))
    .slice(0, 8)
    .map((fixture) => ({
      fixture_id: fixture.fixture_id,
      round: fixture.round,
      kickoff_utc: fixture.kickoff_utc,
      status: fixture.status,
      home: fixture.home,
      away: fixture.away,
      score: `${fixture.home_goals}-${fixture.away_goals}`
    }));

  const upcoming = normalized
    .filter((fixture) => !fixture.hasResult || Date.parse(fixture.kickoff_utc) > now)
    .slice(0, 8)
    .map((fixture) => ({
      fixture_id: fixture.fixture_id,
      round: fixture.round,
      kickoff_utc: fixture.kickoff_utc,
      status: fixture.status,
      home: fixture.home,
      away: fixture.away
    }));

  return { normalized, recent, upcoming };
}

function valueAtPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = current[part];
  }
  return current;
}

function toPercentNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "").replace("%", "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstFiniteNumber(obj, paths) {
  for (const path of Array.isArray(paths) ? paths : []) {
    const value = valueAtPath(obj, path);
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function firstFinitePercent(obj, paths) {
  for (const path of Array.isArray(paths) ? paths : []) {
    const value = valueAtPath(obj, path);
    const pct = toPercentNumber(value);
    if (pct !== null) return pct;
  }
  return null;
}

function percentFromCounts(count, total) {
  const safeCount = Number(count);
  const safeTotal = Number(total);
  if (!Number.isFinite(safeCount) || !Number.isFinite(safeTotal) || safeTotal <= 0) return null;
  return Number(((safeCount / safeTotal) * 100).toFixed(2));
}

function normalizeOfficialTeamStatistics(payload) {
  const response = payload?.response;
  const played = firstFiniteNumber(response, ["fixtures.played.total"]);
  const teamId = firstFiniteNumber(response, ["team.id"]);
  const teamName = String(valueAtPath(response, "team.name") || "").trim();
  const goalsFor = firstFiniteNumber(response, ["goals.for.total.total"]);
  const goalsAgainst = firstFiniteNumber(response, ["goals.against.total.total"]);
  const goalsForPerGame = firstFiniteNumber(response, ["goals.for.average.total"]);
  const goalsAgainstPerGame = firstFiniteNumber(response, ["goals.against.average.total"]);

  const over15Pct = firstFinitePercent(response, ["goals.for.over.1.5", "goals.for.over.1_5"]);
  const over25Pct = firstFinitePercent(response, ["goals.for.over.2.5", "goals.for.over.2_5"]);
  const over35Pct = firstFinitePercent(response, ["goals.for.over.3.5", "goals.for.over.3_5"]);
  const under25Pct = firstFinitePercent(response, ["goals.for.under.2.5", "goals.for.under.2_5"]);

  const bttsPct = firstFinitePercent(response, [
    "fixtures.both_teams_score.percentage",
    "fixtures.btts.percentage",
    "fixtures.btts"
  ]);

  const cleanSheetsPct = firstFinitePercent(response, ["clean_sheet.percentage"])
    ?? percentFromCounts(firstFiniteNumber(response, ["clean_sheet.total"]), played);

  const failedToScorePct = firstFinitePercent(response, ["failed_to_score.percentage"])
    ?? percentFromCounts(firstFiniteNumber(response, ["failed_to_score.total"]), played);

  if (!Number.isFinite(played) || played <= 0) {
    throw new Error(`[LEAGUE-V1] Invalid official played count for team=${teamName || teamId}`);
  }
  if (!teamName) {
    throw new Error(`[LEAGUE-V1] Missing team name in /teams/statistics payload for team_id=${teamId}`);
  }
  if (!Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) {
    throw new Error(`[LEAGUE-V1] Missing goals totals in /teams/statistics payload for team=${teamName}`);
  }

  return {
    team_id: Number.isFinite(teamId) ? Number(teamId) : null,
    team: teamName,
    played: Number(played),
    matches: Number(played),
    goals_for: Number(goalsFor),
    goals_against: Number(goalsAgainst),
    goals_for_per_game: Number.isFinite(goalsForPerGame) ? Number(goalsForPerGame) : Number((goalsFor / played).toFixed(3)),
    goals_against_per_game: Number.isFinite(goalsAgainstPerGame) ? Number(goalsAgainstPerGame) : Number((goalsAgainst / played).toFixed(3)),
    over_15_pct: over15Pct,
    over_25_pct: over25Pct,
    over_35_pct: over35Pct,
    under_25_pct: under25Pct,
    btts_pct: bttsPct,
    clean_sheets_pct: cleanSheetsPct,
    failed_to_score_pct: failedToScorePct,
    goals_scored: Number(goalsFor),
    goals_conceded: Number(goalsAgainst),
    official_response: response
  };
}

function weightedAverage(rows, selector) {
  let weighted = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const value = Number(selector(row));
    const weight = Number(row?.played || row?.matches || 0);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weighted += value * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return null;
  return Number((weighted / totalWeight).toFixed(2));
}

function buildSummaryFromOfficialTeamStatistics(teams) {
  const source = Array.isArray(teams) ? teams : [];
  const totalTeamMatches = source.reduce((acc, row) => acc + Number(row?.played || row?.matches || 0), 0);
  const matchesCount = Number((totalTeamMatches / 2).toFixed(0));
  if (!Number.isFinite(matchesCount) || matchesCount <= 0) {
    throw new Error("[LEAGUE-V1] Invalid matches_count computed from official /teams/statistics payloads");
  }

  const goalsForTotal = source.reduce((acc, row) => acc + Number(row?.goals_for || 0), 0);
  const goalsPerGame = matchesCount > 0 ? Number((goalsForTotal / matchesCount).toFixed(3)) : null;

  return {
    matches_count: matchesCount,
    goals_per_game: goalsPerGame,
    btts_pct: weightedAverage(source, (row) => row?.btts_pct),
    over_15_pct: weightedAverage(source, (row) => row?.over_15_pct),
    over_25_pct: weightedAverage(source, (row) => row?.over_25_pct),
    over_35_pct: weightedAverage(source, (row) => row?.over_35_pct),
    under_25_pct: weightedAverage(source, (row) => row?.under_25_pct),
    clean_sheets_pct: weightedAverage(source, (row) => row?.clean_sheets_pct),
    failed_to_score_pct: weightedAverage(source, (row) => row?.failed_to_score_pct)
  };
}

function buildSplitsFromOfficialTeamStatistics(teams) {
  const source = Array.isArray(teams) ? teams : [];
  let homeGoalsWeighted = 0;
  let awayGoalsWeighted = 0;
  let homeWeight = 0;
  let awayWeight = 0;

  for (const row of source) {
    const response = row?.official_response;
    const playedHome = firstFiniteNumber(response, ["fixtures.played.home"]);
    const playedAway = firstFiniteNumber(response, ["fixtures.played.away"]);
    const goalsAvgHome = firstFiniteNumber(response, ["goals.for.average.home"]);
    const goalsAvgAway = firstFiniteNumber(response, ["goals.for.average.away"]);

    if (Number.isFinite(playedHome) && Number.isFinite(goalsAvgHome) && playedHome > 0) {
      homeGoalsWeighted += playedHome * goalsAvgHome;
      homeWeight += playedHome;
    }
    if (Number.isFinite(playedAway) && Number.isFinite(goalsAvgAway) && playedAway > 0) {
      awayGoalsWeighted += playedAway * goalsAvgAway;
      awayWeight += playedAway;
    }
  }

  const homeGoalsAvg = homeWeight > 0 ? Number((homeGoalsWeighted / homeWeight).toFixed(3)) : null;
  const awayGoalsAvg = awayWeight > 0 ? Number((awayGoalsWeighted / awayWeight).toFixed(3)) : null;

  return {
    home: {
      goals_avg: homeGoalsAvg,
      btts_pct: null,
      over_25_pct: null,
      clean_sheets_pct: null
    },
    away: {
      goals_avg: awayGoalsAvg,
      btts_pct: null,
      over_25_pct: null,
      clean_sheets_pct: null
    },
    home_goals_avg: homeGoalsAvg,
    away_goals_avg: awayGoalsAvg,
    home_btts_pct: null,
    away_btts_pct: null,
    home_over_25_pct: null,
    away_over_25_pct: null,
    home_clean_sheets_pct: null,
    away_clean_sheets_pct: null,
    goals_home: null,
    goals_away: null,
    btts_home_pct: null,
    btts_away_pct: null,
    over_25_home_pct: null,
    over_25_away_pct: null,
    clean_sheets_home_pct: null,
    clean_sheets_away_pct: null
  };
}

function buildTeamRankings(teams) {
  const source = Array.isArray(teams) ? teams : [];

  function mapRankingRows(rows, valueSelector) {
    return rows
      .map((row) => {
        const value = Number(valueSelector(row));
        if (!Number.isFinite(value)) return null;
        return {
      team_id: Number.isFinite(Number(row?.team_id)) ? Number(row.team_id) : null,
      team: row?.team || "",
      value,
      matches: Number(row?.played || row?.matches || 0)
        };
      })
      .filter(Boolean);
  }

  return {
    by_goals_for: mapRankingRows(
      source.slice().sort((a, b) => Number(b.goals_for) - Number(a.goals_for)),
      (row) => row.goals_for
    ),
    by_goals_against: mapRankingRows(
      source.slice().sort((a, b) => Number(a.goals_against) - Number(b.goals_against)),
      (row) => row.goals_against
    ),
    by_btts_pct: mapRankingRows(
      source.slice().sort((a, b) => Number(b.btts_pct) - Number(a.btts_pct)),
      (row) => row.btts_pct
    ),
    by_over_25_pct: mapRankingRows(
      source.slice().sort((a, b) => Number(b.over_25_pct) - Number(a.over_25_pct)),
      (row) => row.over_25_pct
    ),
    by_clean_sheets_pct: mapRankingRows(
      source.slice().sort((a, b) => Number(b.clean_sheets_pct) - Number(a.clean_sheets_pct)),
      (row) => row.clean_sheets_pct
    )
  };
}

function buildSplits(playedMatches) {
  const total = playedMatches.length;
  if (!total) {
    return {
      home_goals_avg: 0,
      away_goals_avg: 0,
      home_btts_pct: 0,
      away_btts_pct: 0,
      home_over_25_pct: 0,
      away_over_25_pct: 0,
      home_clean_sheets_pct: 0,
      away_clean_sheets_pct: 0,
      goals_home: 0,
      goals_away: 0,
      btts_home_pct: 0,
      btts_away_pct: 0,
      over_25_home_pct: 0,
      over_25_away_pct: 0,
      clean_sheets_home_pct: 0,
      clean_sheets_away_pct: 0
    };
  }

  let homeGoals = 0;
  let awayGoals = 0;
  let btts = 0;
  let over25 = 0;
  let cleanSheetHome = 0;
  let cleanSheetAway = 0;

  for (const match of playedMatches) {
    const homeGoalsValue = toNumber(match.home_goals);
    const awayGoalsValue = toNumber(match.away_goals);
    homeGoals += homeGoalsValue;
    awayGoals += awayGoalsValue;
    if (homeGoalsValue > 0 && awayGoalsValue > 0) btts += 1;
    if (homeGoalsValue + awayGoalsValue > 2.5) over25 += 1;
    if (awayGoalsValue === 0) cleanSheetHome += 1;
    if (homeGoalsValue === 0) cleanSheetAway += 1;
  }

  const home = {
    goals_avg: Number((homeGoals / total).toFixed(3)),
    btts_pct: Number(((btts / total) * 100).toFixed(2)),
    over_25_pct: Number(((over25 / total) * 100).toFixed(2)),
    clean_sheets_pct: Number(((cleanSheetHome / total) * 100).toFixed(2))
  };

  const away = {
    goals_avg: Number((awayGoals / total).toFixed(3)),
    btts_pct: Number(((btts / total) * 100).toFixed(2)),
    over_25_pct: Number(((over25 / total) * 100).toFixed(2)),
    clean_sheets_pct: Number(((cleanSheetAway / total) * 100).toFixed(2))
  };

  return {
    home,
    away,

    home_goals_avg: home.goals_avg,
    away_goals_avg: away.goals_avg,
    home_btts_pct: home.btts_pct,
    away_btts_pct: away.btts_pct,
    home_over_25_pct: home.over_25_pct,
    away_over_25_pct: away.over_25_pct,
    home_clean_sheets_pct: home.clean_sheets_pct,
    away_clean_sheets_pct: away.clean_sheets_pct,

    // Backward-compatible aliases kept for existing consumers.
    goals_home: homeGoals,
    goals_away: awayGoals,
    btts_home_pct: Number(((btts / total) * 100).toFixed(2)),
    btts_away_pct: Number(((btts / total) * 100).toFixed(2)),
    over_25_home_pct: Number(((over25 / total) * 100).toFixed(2)),
    over_25_away_pct: Number(((over25 / total) * 100).toFixed(2)),
    clean_sheets_home_pct: Number(((cleanSheetHome / total) * 100).toFixed(2)),
    clean_sheets_away_pct: Number(((cleanSheetAway / total) * 100).toFixed(2))
  };
}

function buildTrendCards(summary) {
  return [
    {
      title: "Goal pressure",
      value: `${formatNumber(summary.goals_per_game, 2)} goals/game`,
      note: summary.over_25_pct >= 50 ? "Over profile above neutral line" : "Balanced totals profile"
    },
    {
      title: "BTTS cadence",
      value: `${formatNumber(summary.btts_pct, 1)}%`,
      note: summary.btts_pct >= 50 ? "Frequent bilateral scoring" : "Moderate bilateral scoring"
    },
    {
      title: "Clean sheet footprint",
      value: `${formatNumber(summary.clean_sheets_pct, 1)}%`,
      note: summary.clean_sheets_pct >= 45 ? "Defensive consistency elevated" : "Defenses concede often"
    },
    {
      title: "Failed to score",
      value: `${formatNumber(summary.failed_to_score_pct, 1)}%`,
      note: summary.failed_to_score_pct <= 22 ? "Attacks maintain stable floor" : "Higher blank-match incidence"
    }
  ];
}

function buildTeamProfiles(standingsRows, teamRankings) {
  const byTeam = new Map(teamRankings.map((row) => [teamKey(row.team), row]));
  return standingsRows.slice(0, 12).map((row) => {
    const stats = byTeam.get(teamKey(row.team)) || null;
    const tags = [];

    if (stats) {
      if (stats.goals_for >= 45) tags.push("offensive strong");
      if (stats.clean_sheets_pct >= 35) tags.push("defensive stable");
      if (stats.btts_pct >= 55) tags.push("BTTS profile");
      if (stats.over_25_pct >= 55) tags.push("over profile");
    }
    if (row.position <= 6) tags.push("top-zone pressure");
    if (row.position >= 16) tags.push("relegation stress");
    if (!tags.length) tags.push("balanced profile");

    return {
      team: row.team,
      position: row.position,
      profile: tags[0],
      tags
    };
  });
}

function deriveCurrentRound(fixtures) {
  const upcomingRound = fixtures.upcoming[0]?.round;
  if (upcomingRound) return upcomingRound;
  return fixtures.recent[0]?.round || "Matchday";
}

function rankingRowsFromTeams(teams, selector, descending = true) {
  const source = (Array.isArray(teams) ? teams : []).filter((row) => {
    const value = Number(selector(row));
    return Number.isFinite(value);
  });
  source.sort((a, b) => {
    const av = Number(selector(a));
    const bv = Number(selector(b));
    return descending ? bv - av : av - bv;
  });
  return source.map((row) => ({
    team_id: Number.isFinite(Number(row?.team_id)) ? Number(row.team_id) : null,
    team: String(row?.team || "").trim(),
    value: Number(selector(row)),
    matches: Number(row?.played || row?.matches || 0)
  }));
}

export function enforceLeagueV1StatisticsContract(snapshot) {
  const out = snapshot && typeof snapshot === "object" ? snapshot : {};
  const statistics = out.statistics && typeof out.statistics === "object" ? out.statistics : {};
  const standings = Array.isArray(out.standings) ? out.standings : [];

  const standingsByTeam = new Map();
  for (const row of standings) {
    const key = teamKey(row?.team);
    if (!key) continue;
    standingsByTeam.set(key, row);
  }

  let teams = Array.isArray(statistics.teams) ? statistics.teams.slice() : [];
  if (!teams.length) {
    throw new Error("[LEAGUE-V1] Missing official statistics.teams payload");
  }

  teams = teams.map((row) => {
    const played = Number(row?.played ?? row?.matches);
    const goalsFor = Number(row?.goals_for ?? row?.goals_scored);
    const goalsAgainst = Number(row?.goals_against ?? row?.goals_conceded);
    const over15 = toPercentNumber(row?.over_15_pct);
    const over25 = toPercentNumber(row?.over_25_pct);
    const over35 = toPercentNumber(row?.over_35_pct);
    const btts = toPercentNumber(row?.btts_pct);
    const cleanSheets = toPercentNumber(row?.clean_sheets_pct);
    const failedToScore = toPercentNumber(row?.failed_to_score_pct);

    if (!Number.isFinite(played) || played <= 0) {
      throw new Error(`[LEAGUE-V1] Invalid played for team=${String(row?.team || "unknown")}`);
    }
    if (!Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) {
      throw new Error(`[LEAGUE-V1] Invalid goals totals for team=${String(row?.team || "unknown")}`);
    }

    return {
      team_id: Number.isFinite(Number(row?.team_id)) ? Number(row.team_id) : null,
      team: String(row?.team || "").trim(),
      played,
      matches: played,
      goals_for: goalsFor,
      goals_against: goalsAgainst,
      goals_for_per_game: Number.isFinite(Number(row?.goals_for_per_game)) ? Number(row.goals_for_per_game) : Number((goalsFor / played).toFixed(3)),
      goals_against_per_game: Number.isFinite(Number(row?.goals_against_per_game)) ? Number(row.goals_against_per_game) : Number((goalsAgainst / played).toFixed(3)),
      over_15_pct: over15,
      over_25_pct: over25,
      over_35_pct: over35,
      btts_pct: btts,
      clean_sheets_pct: cleanSheets,
      failed_to_score_pct: failedToScore,
      goals_scored: goalsFor,
      goals_conceded: goalsAgainst
    };
  });

  const teamRankings = statistics.team_rankings && !Array.isArray(statistics.team_rankings)
    ? statistics.team_rankings
    : {
        by_goals_for: rankingRowsFromTeams(teams, (row) => row?.goals_for ?? row?.goals_scored ?? 0, true),
        by_goals_against: rankingRowsFromTeams(teams, (row) => row?.goals_against ?? row?.goals_conceded ?? 0, false),
        by_btts_pct: rankingRowsFromTeams(teams, (row) => row?.btts_pct ?? 0, true),
        by_over_25_pct: rankingRowsFromTeams(teams, (row) => row?.over_25_pct ?? 0, true),
        by_clean_sheets_pct: rankingRowsFromTeams(teams, (row) => row?.clean_sheets_pct ?? 0, true)
      };

  const splitsIn = statistics.home_away_splits && typeof statistics.home_away_splits === "object"
    ? statistics.home_away_splits
    : {};
  const home = splitsIn.home && typeof splitsIn.home === "object" ? splitsIn.home : null;
  const away = splitsIn.away && typeof splitsIn.away === "object" ? splitsIn.away : null;

  if (!home || !away) {
    throw new Error("[LEAGUE-V1] Missing official home_away_splits.home/away payload");
  }

  const league = statistics.league && typeof statistics.league === "object" ? statistics.league : null;
  if (!league) {
    throw new Error("[LEAGUE-V1] Missing official statistics.league payload");
  }

  const matchesCount = Number(league?.matches_count);
  const goalsPerGame = Number(league?.goals_per_game);
  if (!Number.isFinite(matchesCount) || matchesCount <= 0) {
    throw new Error(`[LEAGUE-V1] Invalid league matches_count=${String(league?.matches_count)}`);
  }
  if (!Number.isFinite(goalsPerGame) || goalsPerGame <= 0) {
    throw new Error(`[LEAGUE-V1] Invalid league goals_per_game=${String(league?.goals_per_game)}`);
  }

  out.statistics = {
    ...statistics,
    league,
    teams,
    team_rankings: {
      by_goals_for: Array.isArray(teamRankings.by_goals_for) ? teamRankings.by_goals_for : [],
      by_goals_against: Array.isArray(teamRankings.by_goals_against) ? teamRankings.by_goals_against : [],
      by_btts_pct: Array.isArray(teamRankings.by_btts_pct) ? teamRankings.by_btts_pct : [],
      by_over_25_pct: Array.isArray(teamRankings.by_over_25_pct) ? teamRankings.by_over_25_pct : [],
      by_clean_sheets_pct: Array.isArray(teamRankings.by_clean_sheets_pct) ? teamRankings.by_clean_sheets_pct : []
    },
    home_away_splits: {
      ...splitsIn,
      home,
      away
    }
  };

  return out;
}

export function buildPremierLeagueV1Snapshot({ standingsPayload, fixturesPayload, teamStatisticsPayloads, generatedAtUtc = new Date().toISOString() }) {
  const standingsRows = mapStandingsRows(standingsPayload);
  const fixtures = buildFixtures(fixturesPayload);
  const teamStatsWithSource = (Array.isArray(teamStatisticsPayloads) ? teamStatisticsPayloads : []).map((payload) =>
    normalizeOfficialTeamStatistics(payload)
  );
  const teamStats = teamStatsWithSource.map(({ official_response, ...row }) => row);
  const summary = buildSummaryFromOfficialTeamStatistics(teamStats);
  const teamRankings = buildTeamRankings(teamStats);
  const teamStatsById = new Map(teamStats.map((team) => [Number(team.team_id), team]));
  const topTeamRankingRows = teamRankings.by_goals_for.slice(0, 20).map((row) => {
    const team = teamStatsById.get(Number(row.team_id)) || null;
    return {
      team_id: row.team_id,
      team: row.team,
      goals_for: row.value,
      goals_against: Number.isFinite(Number(team?.goals_against)) ? Number(team.goals_against) : null,
      btts_pct: toPercentNumber(team?.btts_pct),
      over_25_pct: toPercentNumber(team?.over_25_pct),
      clean_sheets_pct: toPercentNumber(team?.clean_sheets_pct),
      goals_scored: row.value,
      goals_conceded: Number.isFinite(Number(team?.goals_against)) ? Number(team.goals_against) : null
    };
  });
  const splits = buildSplitsFromOfficialTeamStatistics(teamStatsWithSource);
  const totalGoals = teamStats.reduce((acc, team) => acc + toNumber(team.goals_for), 0);

  const leagueBlock = extractLeagueBlock(standingsPayload);
  const competition = {
    slug: PREMIER_LEAGUE_V1.slug,
    competition_id: PREMIER_LEAGUE_V1.leagueId,
    name: leagueBlock?.name || PREMIER_LEAGUE_V1.defaultName,
    country: leagueBlock?.country || PREMIER_LEAGUE_V1.defaultCountry,
    season: String(leagueBlock?.season || ""),
    current_round: deriveCurrentRound(fixtures),
    generated_at_utc: generatedAtUtc
  };

  const snapshot = {
    competition,
    summary,
    standings: standingsRows,
    fixtures: {
      upcoming: fixtures.upcoming,
      recent: fixtures.recent
    },
    statistics: {
      league: {
        matches_count: summary.matches_count,
        goals_for_total: totalGoals,
        goals_against_total: totalGoals,
        goals_per_game: summary.goals_per_game,
        home_goals_avg: splits.home_goals_avg,
        away_goals_avg: splits.away_goals_avg,
        over_15_pct: summary.over_15_pct,
        over_25_pct: summary.over_25_pct,
        over_35_pct: summary.over_35_pct,
        btts_pct: summary.btts_pct,
        clean_sheets_pct: summary.clean_sheets_pct,
        failed_to_score_pct: summary.failed_to_score_pct,
        home_btts_pct: splits.home_btts_pct,
        away_btts_pct: splits.away_btts_pct,
        home_over_25_pct: splits.home_over_25_pct,
        away_over_25_pct: splits.away_over_25_pct,
        home_clean_sheets_pct: splits.home_clean_sheets_pct,
        away_clean_sheets_pct: splits.away_clean_sheets_pct,

        // Backward-compatible field retained
        under_25_pct: summary.under_25_pct,
        corners_avg: null,
        shots_avg: null,
        possession_avg: null
      },
      teams: teamStats,
      team_rankings: teamRankings,
      team_rankings_legacy: topTeamRankingRows,
      home_away_splits: {
        home: splits.home,
        away: splits.away,

        // Backward-compatible aliases kept for existing consumers.
        ...splits
      }
    },
    trends: {
      trend_cards: buildTrendCards(summary),
      team_profiles: buildTeamProfiles(standingsRows, teamStats),
      summary_text:
        `Premier League ${competition.season} shows ${formatNumber(summary.goals_per_game, 2)} goals per game with BTTS at ` +
        `${formatNumber(summary.btts_pct, 1)}%. Over 2.5 sits at ${formatNumber(summary.over_25_pct, 1)}%, while clean-sheet occurrence is ` +
        `${formatNumber(summary.clean_sheets_pct, 1)}%, indicating a mixed attack-defense profile.`
    },
    meta: {
      generated_at_utc: generatedAtUtc,
      source: {
        provider: "api-football",
        league_id: PREMIER_LEAGUE_V1.leagueId,
        season: competition.season,
        resources: ["/standings", "/fixtures", "/teams/statistics"]
      },
      version: "league_page_v1",
      schema: 1
    }
  };

  return assertPremierLeagueSnapshotHasFixtureCoverage(
    assertPremierLeagueSnapshotUsesApiFootball(enforceLeagueV1StatisticsContract(snapshot))
  );
}