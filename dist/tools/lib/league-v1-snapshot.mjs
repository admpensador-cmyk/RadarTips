export const LEAGUE_PAGE_V1_DEFINITIONS = Object.freeze([
  {
    slug: "premier-league",
    leagueId: 39,
    defaultName: "Premier League",
    defaultCountry: "England",
    // useFixtureModel: derive all stats from finished fixtures instead of
    // /teams/statistics API aggregates. Removes 20 API calls per run and
    // correctly computes btts/clean_sheets/over from own fixture data.
    useFixtureModel: true
  },
  {
    slug: "la-liga",
    leagueId: 140,
    defaultName: "La Liga",
    defaultCountry: "Spain"
  },
  {
    slug: "serie-a",
    leagueId: 135,
    defaultName: "Serie A",
    defaultCountry: "Italy"
  },
  {
    slug: "bundesliga",
    leagueId: 78,
    defaultName: "Bundesliga",
    defaultCountry: "Germany"
  },
  {
    slug: "ligue-1",
    leagueId: 61,
    defaultName: "Ligue 1",
    defaultCountry: "France"
  },
  {
    slug: "brasileirao",
    leagueId: 71,
    defaultName: "Brasileirao",
    defaultCountry: "Brazil"
  }
]);

export const PREMIER_LEAGUE_V1 = LEAGUE_PAGE_V1_DEFINITIONS.find((entry) => entry.slug === "premier-league");

// Standings is always required. For stats, at least one of /teams/statistics
// or /fixtures must be present (fixture-model snapshots use /fixtures).
const REQUIRED_SOURCE_RESOURCES = ["/standings"];
const REQUIRED_STAT_RESOURCES = ["/teams/statistics", "/fixtures"];
const FORBIDDEN_SOURCE_TOKENS = [
  "openfootball",
  "football.json",
  "standings_39_2025.json",
  "compstats_39_2025.json"
];

export function getLeaguePageDefinitionBySlug(slug) {
  return LEAGUE_PAGE_V1_DEFINITIONS.find((entry) => entry.slug === String(slug || "").trim()) || null;
}

export function getLeaguePageDefinitionByLeagueId(leagueId) {
  const normalizedLeagueId = Number(leagueId);
  return LEAGUE_PAGE_V1_DEFINITIONS.find((entry) => entry.leagueId === normalizedLeagueId) || null;
}

function hasForbiddenLegacyToken(value) {
  const text = String(value || "").toLowerCase();
  return FORBIDDEN_SOURCE_TOKENS.some((token) => text.includes(token));
}

function resolveLeagueDefinitionForSnapshot(snapshot, expectedDefinition = null) {
  if (expectedDefinition && typeof expectedDefinition === "object") {
    return expectedDefinition;
  }

  const competitionId = Number(snapshot?.competition?.competition_id ?? snapshot?.meta?.source?.league_id);
  if (Number.isFinite(competitionId)) {
    const byLeagueId = getLeaguePageDefinitionByLeagueId(competitionId);
    if (byLeagueId) return byLeagueId;
  }

  return getLeaguePageDefinitionBySlug(snapshot?.competition?.slug);
}

export function assertLeaguePageSnapshotUsesApiFootball(snapshot, expectedDefinition = null) {
  const leagueDefinition = resolveLeagueDefinitionForSnapshot(snapshot, expectedDefinition);
  if (!leagueDefinition) {
    throw new Error("[LEAGUE-V1] Unable to resolve fixed league definition for snapshot");
  }

  const competitionId = Number(snapshot?.competition?.competition_id);
  if (competitionId !== leagueDefinition.leagueId) {
    throw new Error(`[LEAGUE-V1] Invalid competition_id in snapshot: ${competitionId}`);
  }

  const source = snapshot?.meta?.source;
  if (!source || typeof source !== "object") {
    throw new Error("[LEAGUE-V1] Missing meta.source in Premier League snapshot");
  }

  if (String(source.provider || "").trim() !== "api-football") {
    throw new Error(`[LEAGUE-V1] Invalid source provider: ${String(source.provider || "")}`);
  }

  if (Number(source.league_id) !== leagueDefinition.leagueId) {
    throw new Error(`[LEAGUE-V1] Invalid source league_id: ${String(source.league_id || "")}`);
  }

  const resources = Array.isArray(source.resources) ? source.resources.map((entry) => String(entry || "").trim()) : [];
  for (const required of REQUIRED_SOURCE_RESOURCES) {
    if (!resources.includes(required)) {
      throw new Error(`[LEAGUE-V1] Missing required API resource: ${required}`);
    }
  }
  // Must have at least one stat resource (either API aggregates or fixture-derived)
  const hasStatResource = REQUIRED_STAT_RESOURCES.some((r) => resources.includes(r));
  if (!hasStatResource) {
    throw new Error(`[LEAGUE-V1] Snapshot must list at least one stat resource (${REQUIRED_STAT_RESOURCES.join(" or ")})`);
  }

  const raw = JSON.stringify(snapshot);
  if (hasForbiddenLegacyToken(raw)) {
    throw new Error("[LEAGUE-V1] Forbidden legacy source reference found in snapshot payload");
  }

  return snapshot;
}

export function assertLeaguePageSnapshotHasCoreData(snapshot) {
  const standingsCount = Array.isArray(snapshot?.standings) ? snapshot.standings.length : 0;
  const teamsCount = Array.isArray(snapshot?.statistics?.teams) ? snapshot.statistics.teams.length : 0;
  const matchesCount = Number(snapshot?.summary?.matches_count || snapshot?.statistics?.league?.matches_count || 0);
  const goalsPerGame = Number(snapshot?.summary?.goals_per_game || snapshot?.statistics?.league?.goals_per_game || 0);

  if (standingsCount <= 0) {
    throw new Error("[LEAGUE-V1] Snapshot has no standings rows");
  }
  if (matchesCount <= 0) {
    throw new Error(`[LEAGUE-V1] Invalid matches_count in snapshot: ${matchesCount}`);
  }
  if (!Number.isFinite(goalsPerGame) || goalsPerGame <= 0) {
    throw new Error(`[LEAGUE-V1] Invalid goals_per_game in snapshot: ${String(snapshot?.statistics?.league?.goals_per_game)}`);
  }
  if (teamsCount <= 0) {
    throw new Error("[LEAGUE-V1] Snapshot has no statistics.teams rows");
  }

  return snapshot;
}

export function assertPremierLeagueSnapshotUsesApiFootball(snapshot) {
  return assertLeaguePageSnapshotUsesApiFootball(snapshot, PREMIER_LEAGUE_V1);
}

export function assertPremierLeagueSnapshotHasFixtureCoverage(snapshot) {
  return assertLeaguePageSnapshotHasCoreData(snapshot);
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
  const parts = Array.isArray(path)
    ? path.map((part) => String(part)).filter(Boolean)
    : String(path || "").split(".").filter(Boolean);
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

  const over15Pct = firstFinitePercent(response, [
    ["goals", "for", "under_over", "1.5", "over"],
    ["goals", "for", "over", "1.5"],
    ["goals", "for", "over", "1_5"]
  ]);
  const over25Pct = firstFinitePercent(response, [
    ["goals", "for", "under_over", "2.5", "over"],
    ["goals", "for", "over", "2.5"],
    ["goals", "for", "over", "2_5"]
  ]);
  const over35Pct = firstFinitePercent(response, [
    ["goals", "for", "under_over", "3.5", "over"],
    ["goals", "for", "over", "3.5"],
    ["goals", "for", "over", "3_5"]
  ]);
  const under25Pct = firstFinitePercent(response, [
    ["goals", "for", "under_over", "2.5", "under"],
    ["goals", "for", "under", "2.5"],
    ["goals", "for", "under", "2_5"]
  ]);

  const bttsPct = firstFinitePercent(response, [
    ["both_teams_score", "percentage"],
    ["fixtures", "both_teams_score", "percentage"],
    ["fixtures", "btts", "percentage"]
  ]);

  const cleanSheetsPct = firstFinitePercent(response, [
    ["clean_sheet", "percentage"],
    ["clean_sheet", "total", "percentage"]
  ]) ?? percentFromCounts(firstFiniteNumber(response, [
    ["clean_sheet", "total"],
    ["clean_sheet", "total", "total"],
    ["fixtures", "clean_sheet", "total"]
  ]), played);

  const failedToScorePct = firstFinitePercent(response, [
    ["failed_to_score", "percentage"],
    ["failed_to_score", "total", "percentage"]
  ]) ?? percentFromCounts(firstFiniteNumber(response, [
    ["failed_to_score", "total"],
    ["failed_to_score", "total", "total"],
    ["fixtures", "failed_to_score", "total"]
  ]), played);

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
      goals_conceded: goalsAgainst,
      // Pass through extended fixture-model fields (home/away splits per team,
      // corners and cards averages). These are null when not yet bootstrapped.
      ...(row?.home && typeof row.home === "object" ? { home: row.home } : {}),
      ...(row?.away && typeof row.away === "object" ? { away: row.away } : {}),
      ...(row?.corners_for_avg != null ? { corners_for_avg: row.corners_for_avg } : {}),
      ...(row?.corners_against_avg != null ? { corners_against_avg: row.corners_against_avg } : {}),
      ...(row?.yellow_cards_for_avg != null ? { yellow_cards_for_avg: row.yellow_cards_for_avg } : {}),
      ...(row?.yellow_cards_against_avg != null ? { yellow_cards_against_avg: row.yellow_cards_against_avg } : {}),
      ...(row?.red_cards_for_total != null ? { red_cards_for_total: row.red_cards_for_total } : {}),
      ...(row?.red_cards_for_avg != null ? { red_cards_for_avg: row.red_cards_for_avg } : {}),
      ...(row?.red_cards_against_total != null ? { red_cards_against_total: row.red_cards_against_total } : {}),
      ...(row?.red_cards_against_avg != null ? { red_cards_against_avg: row.red_cards_against_avg } : {}),
      ...(row?.shots_for_avg != null ? { shots_for_avg: row.shots_for_avg } : {}),
      ...(row?.shots_against_avg != null ? { shots_against_avg: row.shots_against_avg } : {}),
      ...(row?.possession_avg != null ? { possession_avg: row.possession_avg } : {}),
      ...(row?.fouls_for_avg != null ? { fouls_for_avg: row.fouls_for_avg } : {}),
      ...(row?.fouls_against_avg != null ? { fouls_against_avg: row.fouls_against_avg } : {}),
      ...(row?.offsides_for_avg != null ? { offsides_for_avg: row.offsides_for_avg } : {}),
      ...(row?.offsides_against_avg != null ? { offsides_against_avg: row.offsides_against_avg } : {})
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

export function buildLeagueV1Snapshot({
  leagueDefinition = PREMIER_LEAGUE_V1,
  standingsPayload,
  fixturesPayload,
  teamStatisticsPayloads,
  generatedAtUtc = new Date().toISOString()
}) {
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
    slug: leagueDefinition.slug,
    competition_id: leagueDefinition.leagueId,
    name: leagueBlock?.name || leagueDefinition.defaultName,
    country: leagueBlock?.country || leagueDefinition.defaultCountry,
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
        `${competition.name} ${competition.season} shows ${formatNumber(summary.goals_per_game, 2)} goals per game with BTTS at ` +
        `${formatNumber(summary.btts_pct, 1)}%. Over 2.5 sits at ${formatNumber(summary.over_25_pct, 1)}%, while clean-sheet occurrence is ` +
        `${formatNumber(summary.clean_sheets_pct, 1)}%, indicating a mixed attack-defense profile.`
    },
    meta: {
      generated_at_utc: generatedAtUtc,
      source: {
        provider: "api-football",
        league_id: leagueDefinition.leagueId,
        season: competition.season,
        resources: ["/standings", "/fixtures", "/teams/statistics"]
      },
      version: "league_page_v1",
      schema: 1
    }
  };

  return assertLeaguePageSnapshotHasCoreData(
    assertLeaguePageSnapshotUsesApiFootball(enforceLeagueV1StatisticsContract(snapshot), leagueDefinition)
  );
}

export function buildPremierLeagueV1Snapshot(args) {
  return buildLeagueV1Snapshot({
    leagueDefinition: PREMIER_LEAGUE_V1,
    ...args
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture-based snapshot builder (Prédio 2 — Layer 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a League Page V1 snapshot entirely from team aggregates (Layer 3 data).
 *
 * Key differences vs buildLeagueV1Snapshot:
 *  - btts_pct / clean_sheets_pct / over_X_pct derived from actual finished
 *    fixtures, NOT from the /teams/statistics API aggregate (which had broken
 *    field-path mappings).
 *  - home/away splits are fully populated (previously all null).
 *  - corners_avg is populated when fixture stats have been bootstrapped.
 *  - meta.source.resources lists "/fixtures" instead of "/teams/statistics".
 *  - Saves ~20 API calls per run (no more per-team /teams/statistics requests).
 *
 * @param {object} opts
 * @param {object}   opts.leagueDefinition   - from LEAGUE_PAGE_V1_DEFINITIONS
 * @param {object}   opts.teamAggregates     - plain object {[teamId]: aggregate}
 * @param {object}   opts.standingsPayload   - raw /standings API response
 * @param {Array}    opts.allSeasonFixtures  - raw /fixtures response items (all statuses)
 * @param {string}   opts.generatedAtUtc
 */
export function buildLeagueV1SnapshotFromTeamAggregates({
  leagueDefinition = PREMIER_LEAGUE_V1,
  teamAggregates,
  standingsPayload,
  allSeasonFixtures = [],
  generatedAtUtc = new Date().toISOString()
}) {
  const aggregatesArray = Object.values(teamAggregates || {});
  if (!aggregatesArray.length) {
    throw new Error("[LEAGUE-V1] buildLeagueV1SnapshotFromTeamAggregates: teamAggregates is empty");
  }

  // ── standings & season ──────────────────────────────────────────────────
  const standingsRows = mapStandingsRows(standingsPayload);
  const leagueBlock = extractLeagueBlock(standingsPayload);
  const seasonStr = String(leagueBlock?.season || aggregatesArray[0]?.season || "");

  // ── build fixtures (upcoming/recent) from allSeasonFixtures ─────────────
  const fixturesWrapped = buildFixtures({ response: allSeasonFixtures });

  // ── map team aggregates to statistics.teams format ───────────────────────
  const teamStats = aggregatesArray.map((agg) => {
    const total = agg.total;
    const home = agg.home;
    const away = agg.away;

    return {
      team_id: agg.team_id,
      team: agg.team_name,
      played: total.played,
      matches: total.played,
      goals_for: total.goals_for,
      goals_against: total.goals_against,
      goals_for_per_game: total.goals_for_per_game,
      goals_against_per_game: total.goals_against_per_game,
      over_15_pct: total.over_15_pct,
      over_25_pct: total.over_25_pct,
      over_35_pct: total.over_35_pct,
      under_25_pct: total.over_25_pct !== null ? Number((100 - total.over_25_pct).toFixed(2)) : null,
      btts_pct: total.btts_pct,
      clean_sheets_pct: total.clean_sheets_pct,
      failed_to_score_pct: total.failed_to_score_pct,
      goals_scored: total.goals_for,
      goals_conceded: total.goals_against,
      // Extended: per-team home/away splits (fully populated from fixture data)
      home: {
        played: home.played,
        goals_for: home.goals_for,
        goals_against: home.goals_against,
        goals_for_per_game: home.goals_for_per_game,
        btts_pct: home.btts_pct,
        over_25_pct: home.over_25_pct,
        clean_sheets_pct: home.clean_sheets_pct,
        failed_to_score_pct: home.failed_to_score_pct
      },
      away: {
        played: away.played,
        goals_for: away.goals_for,
        goals_against: away.goals_against,
        goals_for_per_game: away.goals_for_per_game,
        btts_pct: away.btts_pct,
        over_25_pct: away.over_25_pct,
        clean_sheets_pct: away.clean_sheets_pct,
        failed_to_score_pct: away.failed_to_score_pct
      },
      // Advanced stats (null if fixture stats not yet bootstrapped)
      corners_for_avg: total.corners_for_avg ?? null,
      corners_against_avg: total.corners_against_avg ?? null,
      yellow_cards_for_avg: total.yellow_cards_for_avg ?? null,
      yellow_cards_against_avg: total.yellow_cards_against_avg ?? null,
      red_cards_for_total: total.red_cards_for_total ?? null,
      red_cards_for_avg: total.red_cards_for_avg ?? null,
      red_cards_against_total: total.red_cards_against_total ?? null,
      red_cards_against_avg: total.red_cards_against_avg ?? null,
      shots_for_avg: total.shots_for_avg ?? null,
      shots_against_avg: total.shots_against_avg ?? null,
      possession_avg: total.possession_avg ?? null,
      fouls_for_avg: total.fouls_for_avg ?? null,
      fouls_against_avg: total.fouls_against_avg ?? null,
      offsides_for_avg: total.offsides_for_avg ?? null,
      offsides_against_avg: total.offsides_against_avg ?? null
    };
  });

  // ── league-level statistics from aggregates ──────────────────────────────
  // Each match is represented in two team facts (home + away). We use only
  // the HOME perspective to get per-match counts (avoids double-counting).
  const homeAggs = aggregatesArray.map((a) => a.home).filter((h) => h.played > 0);
  const totalHomePlayed = homeAggs.reduce((s, h) => s + h.played, 0); // = total matches
  const matchesCount = totalHomePlayed; // each home team = one unique match

  const totalGoalsForAll = aggregatesArray.reduce((s, a) => s + a.total.goals_for, 0);
  const goalsPerGame = matchesCount > 0 ? Number((totalGoalsForAll / matchesCount).toFixed(3)) : null;

  // BTTS: from home team perspective (each match counted once)
  const totalBtts = homeAggs.reduce((s, h) => s + h.btts_count, 0);
  const leagueBttsPct = matchesCount > 0 ? Number(((totalBtts / matchesCount) * 100).toFixed(2)) : null;

  // Over X: from home team perspective
  const totalOver05 = homeAggs.reduce((s, h) => s + h.over_05_count, 0);
  const totalOver15 = homeAggs.reduce((s, h) => s + h.over_15_count, 0);
  const totalOver25 = homeAggs.reduce((s, h) => s + h.over_25_count, 0);
  const totalOver35 = homeAggs.reduce((s, h) => s + h.over_35_count, 0);
  const leagueOver05Pct = matchesCount > 0 ? Number(((totalOver05 / matchesCount) * 100).toFixed(2)) : null;
  const leagueOver15Pct = matchesCount > 0 ? Number(((totalOver15 / matchesCount) * 100).toFixed(2)) : null;
  const leagueOver25Pct = matchesCount > 0 ? Number(((totalOver25 / matchesCount) * 100).toFixed(2)) : null;
  const leagueOver35Pct = matchesCount > 0 ? Number(((totalOver35 / matchesCount) * 100).toFixed(2)) : null;
  const leagueUnder25Pct = leagueOver25Pct !== null ? Number((100 - leagueOver25Pct).toFixed(2)) : null;

  // Clean sheets / failed to score: sum across ALL team appearances (both home+away)
  // "league clean_sheets_pct" = % of team-games where the team kept a clean sheet
  const totalTeamMatches = aggregatesArray.reduce((s, a) => s + a.total.played, 0);
  const totalCleanSheets = aggregatesArray.reduce((s, a) => s + a.total.clean_sheets_count, 0);
  const totalFailed = aggregatesArray.reduce((s, a) => s + a.total.failed_to_score_count, 0);
  const leagueCleanSheetsPct = totalTeamMatches > 0
    ? Number(((totalCleanSheets / totalTeamMatches) * 100).toFixed(2))
    : null;
  const leagueFailedPct = totalTeamMatches > 0
    ? Number(((totalFailed / totalTeamMatches) * 100).toFixed(2))
    : null;

  // Home/away venue splits (league level)
  const awayAggs = aggregatesArray.map((a) => a.away).filter((a) => a.played > 0);
  const totalAwayPlayed = awayAggs.reduce((s, a) => s + a.played, 0);

  const homeGoalsTotal = homeAggs.reduce((s, h) => s + h.goals_for, 0);
  const awayGoalsTotal = awayAggs.reduce((s, a) => s + a.goals_for, 0);
  const homeGoalsAvg = totalHomePlayed > 0 ? Number((homeGoalsTotal / totalHomePlayed).toFixed(3)) : null;
  const awayGoalsAvg = totalAwayPlayed > 0 ? Number((awayGoalsTotal / totalAwayPlayed).toFixed(3)) : null;

  const homeBttsPct = matchesCount > 0 ? Number(((totalBtts / matchesCount) * 100).toFixed(2)) : null;
  const awayBttsPct = homeBttsPct; // BTTS is symmetric

  const totalHomeClean = homeAggs.reduce((s, h) => s + h.clean_sheets_count, 0);
  const totalAwayClean = awayAggs.reduce((s, a) => s + a.clean_sheets_count, 0);
  const homeCleanSheetsPct = totalHomePlayed > 0 ? Number(((totalHomeClean / totalHomePlayed) * 100).toFixed(2)) : null;
  const awayCleanSheetsPct = totalAwayPlayed > 0 ? Number(((totalAwayClean / totalAwayPlayed) * 100).toFixed(2)) : null;

  const homeOver25Pct = leagueOver25Pct; // same match, just different perspective
  const awayOver25Pct = leagueOver25Pct;

  // Corners average (only if fixture stats were bootstrapped)
  const homeCornerAggs = homeAggs.filter((h) => h.corners_for_total !== null);
  const awayCornerAggs = awayAggs.filter((a) => a.corners_for_total !== null);
  const totalCornersHome = homeCornerAggs.reduce((s, h) => s + h.corners_for_total, 0);
  const totalCornersAway = awayCornerAggs.reduce((s, a) => s + a.corners_for_total, 0);
  const cornersPlayed = homeCornerAggs.reduce((s, h) => s + h.played, 0);
  const cornersAvg = cornersPlayed > 0
    ? Number(((totalCornersHome + totalCornersAway) / cornersPlayed).toFixed(2))
    : null;

  // Yellow cards average (only if bootstrapped)
  const homeYellowAggs = homeAggs.filter((h) => h.yellow_cards_for_total !== null);
  const awayYellowAggs = awayAggs.filter((a) => a.yellow_cards_for_total !== null);
  const totalYellowHome = homeYellowAggs.reduce((s, h) => s + h.yellow_cards_for_total, 0);
  const totalYellowAway = awayYellowAggs.reduce((s, a) => s + a.yellow_cards_for_total, 0);
  const yellowPlayed = homeYellowAggs.reduce((s, h) => s + h.played, 0);
  const yellowCardsAvg = yellowPlayed > 0
    ? Number(((totalYellowHome + totalYellowAway) / yellowPlayed).toFixed(2))
    : null;

  // Red cards average (only if bootstrapped)
  const homeRedAggs = homeAggs.filter((h) => h.red_cards_for_total !== null);
  const awayRedAggs = awayAggs.filter((a) => a.red_cards_for_total !== null);
  const totalRedHome = homeRedAggs.reduce((s, h) => s + h.red_cards_for_total, 0);
  const totalRedAway = awayRedAggs.reduce((s, a) => s + a.red_cards_for_total, 0);
  const redPlayed = homeRedAggs.reduce((s, h) => s + h.played, 0);
  const redCardsAvg = redPlayed > 0
    ? Number(((totalRedHome + totalRedAway) / redPlayed).toFixed(2))
    : null;

  const homeCornersAvg = totalHomePlayed > 0
    ? Number((homeCornerAggs.reduce((s, h) => s + h.corners_for_total, 0) / totalHomePlayed).toFixed(2))
    : null;
  const awayCornersAvg = totalAwayPlayed > 0
    ? Number((awayCornerAggs.reduce((s, a) => s + a.corners_for_total, 0) / totalAwayPlayed).toFixed(2))
    : null;
  const homeYellowAvg = totalHomePlayed > 0
    ? Number((homeYellowAggs.reduce((s, h) => s + h.yellow_cards_for_total, 0) / totalHomePlayed).toFixed(2))
    : null;
  const awayYellowAvg = totalAwayPlayed > 0
    ? Number((awayYellowAggs.reduce((s, a) => s + a.yellow_cards_for_total, 0) / totalAwayPlayed).toFixed(2))
    : null;
  const homeRedAvg = totalHomePlayed > 0
    ? Number((homeRedAggs.reduce((s, h) => s + h.red_cards_for_total, 0) / totalHomePlayed).toFixed(2))
    : null;
  const awayRedAvg = totalAwayPlayed > 0
    ? Number((awayRedAggs.reduce((s, a) => s + a.red_cards_for_total, 0) / totalAwayPlayed).toFixed(2))
    : null;

  // ── summary ─────────────────────────────────────────────────────────────
  const summary = {
    matches_count: matchesCount,
    goals_per_game: goalsPerGame,
    btts_pct: leagueBttsPct,
    over_15_pct: leagueOver15Pct,
    over_25_pct: leagueOver25Pct,
    over_35_pct: leagueOver35Pct,
    under_25_pct: leagueUnder25Pct,
    clean_sheets_pct: leagueCleanSheetsPct,
    failed_to_score_pct: leagueFailedPct
  };

  // ── team rankings ────────────────────────────────────────────────────────
  const teamRankings = buildTeamRankings(teamStats);

  // ── home/away splits for statistics.home_away_splits ────────────────────
  const splits = {
    total: {
      goals_avg: goalsPerGame,
      btts_pct: leagueBttsPct,
      over_25_pct: leagueOver25Pct,
      clean_sheets_pct: leagueCleanSheetsPct
    },
    home: {
      goals_avg: homeGoalsAvg,
      btts_pct: homeBttsPct,
      over_25_pct: homeOver25Pct,
      clean_sheets_pct: homeCleanSheetsPct
    },
    away: {
      goals_avg: awayGoalsAvg,
      btts_pct: awayBttsPct,
      over_25_pct: awayOver25Pct,
      clean_sheets_pct: awayCleanSheetsPct
    },
    home_goals_avg: homeGoalsAvg,
    away_goals_avg: awayGoalsAvg,
    home_btts_pct: homeBttsPct,
    away_btts_pct: awayBttsPct,
    home_over_25_pct: homeOver25Pct,
    away_over_25_pct: awayOver25Pct,
    home_clean_sheets_pct: homeCleanSheetsPct,
    away_clean_sheets_pct: awayCleanSheetsPct,
    goals_home: homeGoalsTotal,
    goals_away: awayGoalsTotal,
    btts_home_pct: homeBttsPct,
    btts_away_pct: awayBttsPct,
    over_25_home_pct: homeOver25Pct,
    over_25_away_pct: awayOver25Pct,
    clean_sheets_home_pct: homeCleanSheetsPct,
    clean_sheets_away_pct: awayCleanSheetsPct
  };

  // ── competition block ────────────────────────────────────────────────────
  const competition = {
    slug: leagueDefinition.slug,
    competition_id: leagueDefinition.leagueId,
    name: leagueBlock?.name || leagueDefinition.defaultName,
    country: leagueBlock?.country || leagueDefinition.defaultCountry,
    season: seasonStr,
    current_round: deriveCurrentRound(fixturesWrapped),
    generated_at_utc: generatedAtUtc
  };

  // ── assemble snapshot ────────────────────────────────────────────────────
  const league = {
    matches_count: matchesCount,
    goals_for_total: totalGoalsForAll,
    goals_against_total: totalGoalsForAll,
    goals_per_game: goalsPerGame,
    home_goals_avg: homeGoalsAvg,
    away_goals_avg: awayGoalsAvg,
    over_05_pct: leagueOver05Pct,
    over_15_pct: leagueOver15Pct,
    over_25_pct: leagueOver25Pct,
    over_35_pct: leagueOver35Pct,
    under_25_pct: leagueUnder25Pct,
    btts_pct: leagueBttsPct,
    clean_sheets_pct: leagueCleanSheetsPct,
    failed_to_score_pct: leagueFailedPct,
    home_btts_pct: homeBttsPct,
    away_btts_pct: awayBttsPct,
    home_over_25_pct: homeOver25Pct,
    away_over_25_pct: awayOver25Pct,
    home_clean_sheets_pct: homeCleanSheetsPct,
    away_clean_sheets_pct: awayCleanSheetsPct,
    corners_avg: cornersAvg,
    yellow_cards_avg: yellowCardsAvg,
    red_cards_avg: redCardsAvg,
    shots_avg: null,
    possession_avg: null
  };

  const advanced = {
    corners: {
      total_avg: cornersAvg,
      home_avg: homeCornersAvg,
      away_avg: awayCornersAvg,
      by_team: teamStats
        .filter((t) => t.corners_for_avg !== null)
        .map((t) => ({
          team_id: t.team_id,
          team: t.team,
          corners_for_avg: t.corners_for_avg,
          corners_against_avg: t.corners_against_avg
        }))
        .sort((a, b) => Number(b.corners_for_avg || 0) - Number(a.corners_for_avg || 0))
    },
    cards: {
      yellow_avg: yellowCardsAvg,
      red_avg: redCardsAvg,
      home_yellow_avg: homeYellowAvg,
      away_yellow_avg: awayYellowAvg,
      home_red_avg: homeRedAvg,
      away_red_avg: awayRedAvg,
      by_team: teamStats
        .filter((t) => t.yellow_cards_for_avg !== null || t.red_cards_for_avg !== null)
        .map((t) => ({
          team_id: t.team_id,
          team: t.team,
          yellow_cards_for_avg: t.yellow_cards_for_avg,
          yellow_cards_against_avg: t.yellow_cards_against_avg,
          red_cards_for_avg: t.red_cards_for_avg,
          red_cards_against_avg: t.red_cards_against_avg,
          red_cards_for_total: t.red_cards_for_total,
          red_cards_against_total: t.red_cards_against_total
        }))
        .sort((a, b) => Number(b.yellow_cards_for_avg || 0) - Number(a.yellow_cards_for_avg || 0))
    }
  };

  const topTeamRankingRows = teamRankings.by_goals_for.slice(0, 20).map((row) => {
    const team = teamStats.find((t) => t.team_id === row.team_id) || null;
    return {
      team_id: row.team_id,
      team: row.team,
      goals_for: row.value,
      goals_against: team?.goals_against ?? null,
      btts_pct: team?.btts_pct ?? null,
      over_25_pct: team?.over_25_pct ?? null,
      clean_sheets_pct: team?.clean_sheets_pct ?? null,
      goals_scored: row.value,
      goals_conceded: team?.goals_against ?? null
    };
  });

  const snapshot = {
    competition,
    summary,
    standings: standingsRows,
    fixtures: {
      upcoming: fixturesWrapped.upcoming,
      recent: fixturesWrapped.recent
    },
    statistics: {
      league,
      teams: teamStats,
      team_rankings: teamRankings,
      team_rankings_legacy: topTeamRankingRows,
      home_away_splits: splits
    },
    splits,
    advanced,
    rankings: teamRankings,
    trends: {
      trend_cards: buildTrendCards(summary),
      team_profiles: buildTeamProfiles(standingsRows, teamStats),
      summary_text:
        `${competition.name} ${competition.season} shows ${formatNumber(summary.goals_per_game, 2)} goals per game with BTTS at ` +
        `${formatNumber(summary.btts_pct, 1)}%. Over 2.5 sits at ${formatNumber(summary.over_25_pct, 1)}%, while clean-sheet occurrence is ` +
        `${formatNumber(summary.clean_sheets_pct, 1)}%, indicating a mixed attack-defense profile.`
    },
    meta: {
      generated_at_utc: generatedAtUtc,
      source: {
        provider: "api-football",
        league_id: leagueDefinition.leagueId,
        season: seasonStr,
        resources: ["/standings", "/fixtures"],
        model: "fixture_derived_v1"
      },
      version: "league_page_v1",
      schema: 1
    }
  };

  return assertLeaguePageSnapshotHasCoreData(
    assertLeaguePageSnapshotUsesApiFootball(enforceLeagueV1StatisticsContract(snapshot), leagueDefinition)
  );
}