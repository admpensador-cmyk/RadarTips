/**
 * Preview-only contract shape for data/preview/brasileirao/team-stats.json (teams[]).
 * Maps fixture-derived rows from league_page_v1 statistics.teams — no recalculation.
 * preview_brasileirao_team_stats_v5: adds strict `corners` (valid fixtures only).
 * preview_brasileirao_team_stats_v6: adds strict `goalkeeper` (saves + opponent SoG per fixture).
 */

function mapDisciplineBlock(block) {
  if (!block || typeof block !== "object") return null;
  const t = block.totals;
  const c = block.counts;
  const r = block.rates;
  if (!t || !c || !r || typeof t !== "object" || typeof c !== "object" || typeof r !== "object") return null;
  return {
    totals: { ...t },
    counts: { ...c },
    rates: { ...r }
  };
}

/**
 * @param {{ total?: object, home?: object, away?: object } | null | undefined} d
 */
function mapDisciplineContract(d) {
  if (!d || typeof d !== "object") return null;
  const total = mapDisciplineBlock(d.total);
  if (!total) return null;
  return {
    totals: total.totals,
    counts: total.counts,
    rates: total.rates,
    splits: {
      home: mapDisciplineBlock(d.home),
      away: mapDisciplineBlock(d.away)
    }
  };
}

function mapCornersBlock(block) {
  if (!block || typeof block !== "object") return null;
  const t = block.totals;
  const c = block.counts;
  const r = block.rates;
  if (!t || !c || !r || typeof t !== "object" || typeof c !== "object" || typeof r !== "object") return null;
  return {
    totals: { ...t },
    counts: { ...c },
    rates: { ...r }
  };
}

/**
 * @param {{ total?: object, home?: object, away?: object } | null | undefined} x
 */
function mapCornersContract(x) {
  if (!x || typeof x !== "object") return null;
  const total = mapCornersBlock(x.total);
  if (!total) return null;
  return {
    totals: total.totals,
    counts: total.counts,
    rates: total.rates,
    splits: {
      home: mapCornersBlock(x.home),
      away: mapCornersBlock(x.away)
    }
  };
}

function mapGoalkeeperBlock(block) {
  if (!block || typeof block !== "object") return null;
  const t = block.totals;
  const c = block.counts;
  const r = block.rates;
  if (!t || !c || !r || typeof t !== "object" || typeof c !== "object" || typeof r !== "object") return null;
  return {
    totals: { ...t },
    counts: { ...c },
    rates: { ...r }
  };
}

/**
 * @param {{ total?: object, home?: object, away?: object } | null | undefined} x
 */
function mapGoalkeeperContract(x) {
  if (!x || typeof x !== "object") return null;
  const total = mapGoalkeeperBlock(x.total);
  if (!total) return null;
  return {
    totals: total.totals,
    counts: total.counts,
    rates: total.rates,
    splits: {
      home: mapGoalkeeperBlock(x.home),
      away: mapGoalkeeperBlock(x.away)
    }
  };
}

function groupVenueSplit(s) {
  if (!s || typeof s !== "object") {
    return {
      totals: { goals_for: null, goals_against: null },
      counts: {
        matches: null,
        over_15_count: null,
        over_25_count: null,
        over_35_count: null,
        under_25_count: null,
        btts_count: null,
        clean_sheets_count: null,
        failed_to_score_count: null
      },
      rates: {
        goals_for_per_game: null,
        goals_against_per_game: null,
        over_15_pct: null,
        over_25_pct: null,
        over_35_pct: null,
        under_25_pct: null,
        btts_pct: null,
        clean_sheets_pct: null,
        failed_to_score_pct: null
      }
    };
  }
  const matches = Number(s.played ?? s.matches);
  return {
    totals: {
      goals_for: Number.isFinite(Number(s.goals_for)) ? Number(s.goals_for) : null,
      goals_against: Number.isFinite(Number(s.goals_against)) ? Number(s.goals_against) : null
    },
    counts: {
      matches: Number.isFinite(matches) ? matches : null,
      over_15_count: s.over_15_count ?? null,
      over_25_count: s.over_25_count ?? null,
      over_35_count: s.over_35_count ?? null,
      under_25_count: s.under_25_count ?? null,
      btts_count: s.btts_count ?? null,
      clean_sheets_count: s.clean_sheets_count ?? null,
      failed_to_score_count: s.failed_to_score_count ?? null
    },
    rates: {
      goals_for_per_game: s.goals_for_per_game ?? null,
      goals_against_per_game: s.goals_against_per_game ?? null,
      over_15_pct: s.over_15_pct ?? null,
      over_25_pct: s.over_25_pct ?? null,
      over_35_pct: s.over_35_pct ?? null,
      under_25_pct: s.under_25_pct ?? null,
      btts_pct: s.btts_pct ?? null,
      clean_sheets_pct: s.clean_sheets_pct ?? null,
      failed_to_score_pct: s.failed_to_score_pct ?? null
    }
  };
}

/**
 * @param {object} row - statistics.teams[] element from buildLeagueV1SnapshotFromTeamAggregates
 */
export function mapTeamRowToPreviewContract(row) {
  const matches = Number(row?.played ?? row?.matches);
  return {
    identity: {
      team_id: Number.isFinite(Number(row?.team_id)) ? Number(row.team_id) : null,
      team: String(row?.team || "").trim()
    },
    totals: {
      goals_for: Number.isFinite(Number(row?.goals_for)) ? Number(row.goals_for) : null,
      goals_against: Number.isFinite(Number(row?.goals_against)) ? Number(row.goals_against) : null
    },
    counts: {
      matches: Number.isFinite(matches) ? matches : null,
      over_15_count: row?.over_15_count ?? null,
      over_25_count: row?.over_25_count ?? null,
      over_35_count: row?.over_35_count ?? null,
      under_25_count: row?.under_25_count ?? null,
      btts_count: row?.btts_count ?? null,
      clean_sheets_count: row?.clean_sheets_count ?? null,
      failed_to_score_count: row?.failed_to_score_count ?? null
    },
    rates: {
      goals_for_per_game: row?.goals_for_per_game ?? null,
      goals_against_per_game: row?.goals_against_per_game ?? null,
      over_15_pct: row?.over_15_pct ?? null,
      over_25_pct: row?.over_25_pct ?? null,
      over_35_pct: row?.over_35_pct ?? null,
      under_25_pct: row?.under_25_pct ?? null,
      btts_pct: row?.btts_pct ?? null,
      clean_sheets_pct: row?.clean_sheets_pct ?? null,
      failed_to_score_pct: row?.failed_to_score_pct ?? null
    },
    splits: {
      home: groupVenueSplit(row?.home),
      away: groupVenueSplit(row?.away)
    },
    discipline: mapDisciplineContract(row?.discipline),
    corners: mapCornersContract(row?.corners),
    goalkeeper: mapGoalkeeperContract(row?.goalkeeper)
  };
}

/**
 * @param {object[]} teams - snapshot.statistics.teams
 */
export function mapTeamsToPreviewContract(teams) {
  return (Array.isArray(teams) ? teams : []).map((row) => mapTeamRowToPreviewContract(row));
}
