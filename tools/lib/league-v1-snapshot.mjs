export const PREMIER_LEAGUE_V1 = {
  slug: "premier-league",
  leagueId: 39,
  defaultName: "Premier League",
  defaultCountry: "England"
};

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatNumber(value, digits = 1) {
  return Number(value).toFixed(digits);
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

function buildSummary(playedMatches) {
  const total = playedMatches.length;
  if (!total) {
    return {
      matches_count: 0,
      goals_per_game: 0,
      btts_pct: 0,
      over_15_pct: 0,
      over_25_pct: 0,
      over_35_pct: 0,
      under_25_pct: 0,
      clean_sheets_pct: 0,
      failed_to_score_pct: 0
    };
  }

  let goals = 0;
  let btts = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let under25 = 0;
  let cleanSheetMatch = 0;
  let failedTeamSides = 0;

  for (const match of playedMatches) {
    const homeGoals = toNumber(match.home_goals);
    const awayGoals = toNumber(match.away_goals);
    const totalGoals = homeGoals + awayGoals;
    goals += totalGoals;
    if (homeGoals > 0 && awayGoals > 0) btts += 1;
    if (totalGoals > 1.5) over15 += 1;
    if (totalGoals > 2.5) over25 += 1;
    if (totalGoals > 3.5) over35 += 1;
    if (totalGoals < 2.5) under25 += 1;
    if (homeGoals === 0 || awayGoals === 0) cleanSheetMatch += 1;
    if (homeGoals === 0) failedTeamSides += 1;
    if (awayGoals === 0) failedTeamSides += 1;
  }

  return {
    matches_count: total,
    goals_per_game: Number((goals / total).toFixed(3)),
    btts_pct: Number(((btts / total) * 100).toFixed(2)),
    over_15_pct: Number(((over15 / total) * 100).toFixed(2)),
    over_25_pct: Number(((over25 / total) * 100).toFixed(2)),
    over_35_pct: Number(((over35 / total) * 100).toFixed(2)),
    under_25_pct: Number(((under25 / total) * 100).toFixed(2)),
    clean_sheets_pct: Number(((cleanSheetMatch / total) * 100).toFixed(2)),
    failed_to_score_pct: Number(((failedTeamSides / (total * 2)) * 100).toFixed(2))
  };
}

function buildTeamAggregates(playedMatches) {
  const map = new Map();

  function ensure(teamName) {
    const key = teamKey(teamName);
    if (!map.has(key)) {
      map.set(key, {
        team: teamName,
        goals_for: 0,
        goals_against: 0,
        matches: 0,
        btts_matches: 0,
        over25_matches: 0,
        clean_sheet_matches: 0
      });
    }
    return map.get(key);
  }

  for (const match of playedMatches) {
    const home = ensure(match.home);
    const away = ensure(match.away);
    const homeGoals = toNumber(match.home_goals);
    const awayGoals = toNumber(match.away_goals);

    home.matches += 1;
    away.matches += 1;

    home.goals_for += homeGoals;
    home.goals_against += awayGoals;
    away.goals_for += awayGoals;
    away.goals_against += homeGoals;

    if (homeGoals > 0 && awayGoals > 0) {
      home.btts_matches += 1;
      away.btts_matches += 1;
    }
    if (homeGoals + awayGoals > 2.5) {
      home.over25_matches += 1;
      away.over25_matches += 1;
    }
    if (awayGoals === 0) home.clean_sheet_matches += 1;
    if (homeGoals === 0) away.clean_sheet_matches += 1;
  }

  return Array.from(map.values()).map((row) => ({
    team: row.team,
    goals_scored: row.goals_for,
    goals_conceded: row.goals_against,
    btts_pct: row.matches ? Number(((row.btts_matches / row.matches) * 100).toFixed(2)) : 0,
    over_25_pct: row.matches ? Number(((row.over25_matches / row.matches) * 100).toFixed(2)) : 0,
    clean_sheets_pct: row.matches ? Number(((row.clean_sheet_matches / row.matches) * 100).toFixed(2)) : 0
  }));
}

function buildSplits(playedMatches) {
  const total = playedMatches.length || 1;
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

  return {
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
      if (stats.goals_scored >= 45) tags.push("offensive strong");
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

export function buildPremierLeagueV1Snapshot({ standingsPayload, fixturesPayload, generatedAtUtc = new Date().toISOString() }) {
  const standingsRows = mapStandingsRows(standingsPayload);
  const fixtures = buildFixtures(fixturesPayload);
  const playedMatches = fixtures.normalized.filter((fixture) => fixture.hasResult);
  const summary = buildSummary(playedMatches);
  const teamRankings = buildTeamAggregates(playedMatches)
    .sort((a, b) => b.goals_scored - a.goals_scored)
    .slice(0, 20);
  const splits = buildSplits(playedMatches);

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

  return {
    competition,
    summary,
    standings: standingsRows,
    fixtures: {
      upcoming: fixtures.upcoming,
      recent: fixtures.recent
    },
    statistics: {
      league: {
        goals_per_game: summary.goals_per_game,
        btts_pct: summary.btts_pct,
        over_15_pct: summary.over_15_pct,
        over_25_pct: summary.over_25_pct,
        over_35_pct: summary.over_35_pct,
        under_25_pct: summary.under_25_pct,
        clean_sheets_pct: summary.clean_sheets_pct,
        failed_to_score_pct: summary.failed_to_score_pct,
        corners_avg: null,
        shots_avg: null,
        possession_avg: null
      },
      team_rankings: teamRankings,
      home_away_splits: splits
    },
    trends: {
      trend_cards: buildTrendCards(summary),
      team_profiles: buildTeamProfiles(standingsRows, teamRankings),
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
        resources: ["/standings", "/fixtures"]
      },
      version: "league_page_v1",
      schema: 1
    }
  };
}