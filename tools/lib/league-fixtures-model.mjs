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
 *   - Corners from /fixtures/statistics: only when BOTH sides have "Corner Kicks" on the
 *     same fixture are corners_for / corners_against set; otherwise null (fixture discarded
 *     for corners). Strict rollups use buildStrictCornersStats (valid fixtures only).
 *   - Cards and shots come from /fixtures/statistics when present; cards can fall back to events.
 *   - Goalkeeper strict facts: "Goalkeeper Saves" + opponent "Shots on Goal" both present or both null.
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
/** API-Football fixture.status.short values we treat as finished (goals required for aggregation). */
export function isApiFixtureFinished(apiItem) {
  const short = String(apiItem?.fixture?.status?.short || "").trim().toUpperCase();
  return short === "FT" || short === "AET" || short === "PEN";
}

/**
 * Deduplicate by fixture_id; only finished matches with both goal tallies present.
 * @param {Array} apiItems - /fixtures response[].items
 */
export function filterFinishedFixturesWithScores(apiItems, competitionId, season) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(apiItems) ? apiItems : []) {
    if (!isApiFixtureFinished(item)) continue;
    const raw = buildRawFixtureRecord(item, competitionId, season);
    if (!raw || raw.home_goals === null || raw.away_goals === null) continue;
    if (seen.has(raw.fixture_id)) continue;
    seen.add(raw.fixture_id);
    out.push(raw);
  }
  return out;
}

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

  const ht = apiItem?.score?.halftime;
  let halftime_home = null;
  let halftime_away = null;
  if (ht && typeof ht === "object") {
    const hh = Number(ht.home);
    const ha = Number(ht.away);
    if (Number.isFinite(hh)) halftime_home = Math.round(hh);
    if (Number.isFinite(ha)) halftime_away = Math.round(ha);
  }

  return {
    fixture_id: fixtureId,
    played_at_utc: playedAtUtc,
    round: String(league?.round || "").trim() || null,
    status: String(fixture?.status?.short || "").trim().toUpperCase(),
    competition_id: toInt(competitionId),
    competition_name: String(league?.name || "").trim() || null,
    season: toInt(season),
    home_id: toInt(teams?.home?.id),
    home_name: String(teams?.home?.name || "").trim(),
    away_id: toInt(teams?.away?.id),
    away_name: String(teams?.away?.name || "").trim(),
    home_goals: Number.isFinite(homeGoals) ? homeGoals : null,
    away_goals: Number.isFinite(awayGoals) ? awayGoals : null,
    halftime_home,
    halftime_away
  };
}

/**
 * Goal events from /fixtures/events, chronological (API-Football v3).
 * Skips disallowed / VAR-cancelled style rows when detail says so.
 */
export function sortedCanonicalGoalEvents(eventsArray) {
  const arr = Array.isArray(eventsArray) ? eventsArray : [];
  const out = [];
  for (const ev of arr) {
    const type = String(ev?.type || "").trim().toLowerCase();
    if (type !== "goal") continue;
    const detail = String(ev?.detail || "").toLowerCase();
    if (detail.includes("disallowed")) continue;
    const elapsed = Number(ev?.time?.elapsed) || 0;
    const extra = Number(ev?.time?.extra) || 0;
    const teamId = Number(ev?.team?.id);
    if (!Number.isFinite(teamId)) continue;
    out.push({ elapsed, extra, teamId });
  }
  out.sort((a, b) => a.elapsed - b.elapsed || a.extra - b.extra);
  return out;
}

/**
 * Control flags for Team Profile rows — only from real halftime scores and/or goal events.
 * Omits a key when the value cannot be established (no fabrication from final score alone).
 *
 * @param {object} rawFixture — buildRawFixtureRecord output (goals + optional halftime)
 * @param {Array} eventsArray — raw response[] from /fixtures/events
 * @param {number} teamId
 * @param {boolean} isHome
 * @param {string} result — W | D | L
 * @returns {Record<string, boolean>}
 */
export function deriveProfileMatchControlBooleans(rawFixture, eventsArray, teamId, isHome, result) {
  const out = {};
  const tid = Number(teamId);
  const res = result === "W" || result === "D" || result === "L" ? result : "L";

  const hh = rawFixture?.halftime_home;
  const ha = rawFixture?.halftime_away;
  const htKnown =
    hh != null && ha != null && Number.isFinite(Number(hh)) && Number.isFinite(Number(ha));
  if (htKnown) {
    const gfHt = isHome ? Number(hh) : Number(ha);
    const gaHt = isHome ? Number(ha) : Number(hh);
    out.leading_ht = gfHt > gaHt;
  }

  const goalEvents = sortedCanonicalGoalEvents(eventsArray);
  const ftGf = isHome ? Number(rawFixture?.home_goals) : Number(rawFixture?.away_goals);
  const ftGa = isHome ? Number(rawFixture?.away_goals) : Number(rawFixture?.home_goals);

  if (goalEvents.length > 0) {
    const first = goalEvents[0];
    out.scored_first = first.teamId === tid;
    out.conceded_first = first.teamId !== tid;
  } else if (Number.isFinite(ftGf) && Number.isFinite(ftGa) && ftGf === 0 && ftGa === 0) {
    out.scored_first = false;
    out.conceded_first = false;
  }

  if (res !== "W") {
    out.comeback_win = false;
  } else if (htKnown) {
    const gfHt = isHome ? Number(hh) : Number(ha);
    const gaHt = isHome ? Number(ha) : Number(hh);
    out.comeback_win = gfHt < gaHt;
  } else if (typeof out.conceded_first === "boolean") {
    out.comeback_win = out.conceded_first === true;
  }

  return out;
}

/**
 * Build a minimal fixture events record from API /fixtures/events response.
 * Currently used for card fallback only when /fixtures/statistics is missing.
 */
export function buildFixtureEventsRecord(fixtureId, homeTeamId, awayTeamId, apiEventsResponse) {
  const events = Array.isArray(apiEventsResponse) ? apiEventsResponse : [];

  const byTeam = {
    [String(homeTeamId)]: { yellow_cards: 0, red_cards: 0 },
    [String(awayTeamId)]: { yellow_cards: 0, red_cards: 0 }
  };

  for (const ev of events) {
    const teamId = toInt(ev?.team?.id);
    if (!teamId || !byTeam[String(teamId)]) continue;

    const type = String(ev?.type || "").toLowerCase();
    const detail = String(ev?.detail || "").toLowerCase();
    const isCard = type.includes("card") || detail.includes("card") || detail.includes("yellow") || detail.includes("red");
    if (!isCard) continue;

    const isRed = detail.includes("red");
    const isYellow = detail.includes("yellow");
    if (isRed) byTeam[String(teamId)].red_cards += 1;
    else if (isYellow) byTeam[String(teamId)].yellow_cards += 1;
  }

  return {
    fixture_id: fixtureId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home: {
      yellow_cards: byTeam[String(homeTeamId)]?.yellow_cards ?? 0,
      red_cards: byTeam[String(homeTeamId)]?.red_cards ?? 0
    },
    away: {
      yellow_cards: byTeam[String(awayTeamId)]?.yellow_cards ?? 0,
      red_cards: byTeam[String(awayTeamId)]?.red_cards ?? 0
    }
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
export function buildTeamFactsFromFixture(rawFixture, fixtureStats, fixtureEvents = null) {
  const {
    fixture_id,
    played_at_utc,
    round,
    status,
    competition_id,
    competition_name,
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
    const eventsBlock = fixtureEvents ? (isHome ? fixtureEvents.home : fixtureEvents.away) : null;
    const opponentEventsBlock = fixtureEvents ? (isHome ? fixtureEvents.away : fixtureEvents.home) : null;

    const hc = fixtureStats?.home?.corners;
    const ac = fixtureStats?.away?.corners;
    const cornersBothSides =
      fixtureStats != null &&
      hc != null &&
      ac != null &&
      Number.isFinite(Number(hc)) &&
      Number.isFinite(Number(ac)) &&
      Number(hc) >= 0 &&
      Number(ac) >= 0;
    const cornersHomeVal = cornersBothSides ? toInt(hc) : null;
    const cornersAwayVal = cornersBothSides ? toInt(ac) : null;

    const yellowFor = statsBlock?.yellow_cards ?? eventsBlock?.yellow_cards ?? null;
    const yellowAgainst = opponentStatsBlock?.yellow_cards ?? opponentEventsBlock?.yellow_cards ?? null;
    const redFor = statsBlock?.red_cards ?? eventsBlock?.red_cards ?? null;
    const redAgainst = opponentStatsBlock?.red_cards ?? opponentEventsBlock?.red_cards ?? null;

    return {
      fixture_id,
      team_id: teamId,
      team_name: teamName,
      opponent_id: opponentId,
      opponent_name: opponentName,
      competition_id,
      competition_name,
      season,
      is_home: isHome,
      played_at_utc,
      round,
      status,
      goals_for: gf,
      goals_against: ga,
      total_goals: totalGoals,
      result: won ? "W" : drew ? "D" : "L",
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
      // Corners — only when both teams have Corner Kicks on this fixture; never partial
      corners_for: cornersBothSides ? (isHome ? cornersHomeVal : cornersAwayVal) : null,
      corners_against: cornersBothSides ? (isHome ? cornersAwayVal : cornersHomeVal) : null,
      yellow_cards_for: yellowFor,
      yellow_cards_against: yellowAgainst,
      red_cards_for: redFor,
      red_cards_against: redAgainst,
      shots_for: statsBlock?.shots ?? null,
      shots_against: opponentStatsBlock?.shots ?? null,
      shots_on_target_for: statsBlock?.shots_on_target ?? null,
      shots_on_target_against: opponentStatsBlock?.shots_on_target ?? null,
      possession_pct: statsBlock?.possession_pct ?? null,
      fouls_for: statsBlock?.fouls ?? null,
      fouls_against: opponentStatsBlock?.fouls ?? null,
      offsides_for: statsBlock?.offsides ?? null,
      offsides_against: opponentStatsBlock?.offsides ?? null,
      // Goalkeeper — only when saves + opponent Shots on Goal both present (/fixtures/statistics)
      ...(() => {
        const gs = statsBlock?.saves;
        const osog = opponentStatsBlock?.shots_on_target;
        const ok =
          fixtureStats != null &&
          gs != null &&
          osog != null &&
          Number.isFinite(Number(gs)) &&
          Number.isFinite(Number(osog)) &&
          Number(gs) >= 0 &&
          Number(osog) >= 0;
        return {
          goalkeeper_saves: ok ? toInt(gs) : null,
          goalkeeper_shots_on_goal_faced: ok ? toInt(osog) : null
        };
      })()
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
 * Strict discipline rollup from team facts: every fact must have finite
 * yellow_cards_for and red_cards_for (0 allowed). Otherwise null — no coercion.
 * Derived only from per-fixture data (e.g. /fixtures/events) merged into facts.
 *
 * @param {Array} facts
 * @returns {{ totals: object, counts: object, rates: object } | null}
 */
export function buildStrictDisciplineStats(facts) {
  const list = Array.isArray(facts) ? facts : [];
  const n = list.length;
  if (n === 0) return null;
  for (const f of list) {
    const y = f?.yellow_cards_for;
    const r = f?.red_cards_for;
    if (y === null || y === undefined || r === null || r === undefined) return null;
    const yn = Number(y);
    const rn = Number(r);
    if (!Number.isFinite(yn) || !Number.isFinite(rn) || yn < 0 || rn < 0) return null;
  }
  let yellowSum = 0;
  let redSum = 0;
  let m1y = 0;
  let m2y = 0;
  let mr = 0;
  for (const f of list) {
    const y = Number(f.yellow_cards_for);
    const r = Number(f.red_cards_for);
    yellowSum += y;
    redSum += r;
    if (y >= 1) m1y += 1;
    if (y >= 2) m2y += 1;
    if (r >= 1) mr += 1;
  }
  return {
    totals: {
      yellow_cards: yellowSum,
      red_cards: redSum
    },
    counts: {
      matches: n,
      matches_with_1plus_yellow_count: m1y,
      matches_with_2plus_yellows_count: m2y,
      matches_with_red_count: mr
    },
    rates: {
      yellow_cards_per_game: Number((yellowSum / n).toFixed(3)),
      red_cards_per_game: Number((redSum / n).toFixed(3)),
      matches_with_1plus_yellow_pct: pct(m1y, n),
      matches_with_2plus_yellows_pct: pct(m2y, n),
      matches_with_red_pct: pct(mr, n)
    }
  };
}

/**
 * Strict corners rollup: only facts with BOTH corners_for and corners_against non-null
 * (same fixture had complete Corner Kicks for both sides). Denominator = count of those facts.
 * No null-as-zero. Returns null if no valid facts.
 *
 * @param {Array} facts
 * @returns {{ totals: object, counts: object, rates: object } | null}
 */
export function buildStrictCornersStats(facts) {
  const list = Array.isArray(facts) ? facts : [];
  const valid = [];
  for (const f of list) {
    const cf = f?.corners_for;
    const ca = f?.corners_against;
    if (cf === null || cf === undefined || ca === null || ca === undefined) continue;
    const cfn = Number(cf);
    const can = Number(ca);
    if (!Number.isFinite(cfn) || !Number.isFinite(can) || cfn < 0 || can < 0) continue;
    valid.push({ corners_for: Math.round(cfn), corners_against: Math.round(can) });
  }
  const n = valid.length;
  if (n === 0) return null;

  let sumFor = 0;
  let sumAgainst = 0;
  let m3 = 0;
  let m5 = 0;
  let m7 = 0;
  for (const v of valid) {
    sumFor += v.corners_for;
    sumAgainst += v.corners_against;
    if (v.corners_for >= 3) m3 += 1;
    if (v.corners_for >= 5) m5 += 1;
    if (v.corners_for >= 7) m7 += 1;
  }

  return {
    totals: {
      corners_for: sumFor,
      corners_against: sumAgainst
    },
    counts: {
      matches: n,
      matches_with_3plus_corners_for_count: m3,
      matches_with_5plus_corners_for_count: m5,
      matches_with_7plus_corners_for_count: m7
    },
    rates: {
      corners_for_per_game: Number((sumFor / n).toFixed(3)),
      corners_against_per_game: Number((sumAgainst / n).toFixed(3)),
      matches_with_3plus_corners_for_pct: pct(m3, n),
      matches_with_5plus_corners_for_pct: pct(m5, n),
      matches_with_7plus_corners_for_pct: pct(m7, n)
    }
  };
}

/**
 * Strict goalkeeper rollup: only facts with BOTH goalkeeper_saves and
 * goalkeeper_shots_on_goal_faced (opponent "Shots on Goal"). No null-as-zero.
 * save_pct = 100 * sum(saves) / sum(SoG faced) when sum(SoG faced) > 0, else null.
 *
 * @param {Array} facts
 * @returns {{ totals: object, counts: object, rates: object } | null}
 */
export function buildStrictGoalkeeperStats(facts) {
  const list = Array.isArray(facts) ? facts : [];
  const valid = [];
  for (const f of list) {
    const s = f?.goalkeeper_saves;
    const sog = f?.goalkeeper_shots_on_goal_faced;
    if (s === null || s === undefined || sog === null || sog === undefined) continue;
    const sn = Number(s);
    const ogn = Number(sog);
    if (!Number.isFinite(sn) || !Number.isFinite(ogn) || sn < 0 || ogn < 0) continue;
    valid.push({ saves: Math.round(sn), sog: Math.round(ogn) });
  }
  const n = valid.length;
  if (n === 0) return null;

  let saveSum = 0;
  let sogSum = 0;
  let m3 = 0;
  let m5 = 0;
  for (const v of valid) {
    saveSum += v.saves;
    sogSum += v.sog;
    if (v.saves >= 3) m3 += 1;
    if (v.saves >= 5) m5 += 1;
  }

  const savePct =
    sogSum > 0 ? Number(((saveSum / sogSum) * 100).toFixed(2)) : null;

  return {
    totals: {
      saves: saveSum
    },
    counts: {
      matches: n,
      matches_with_3plus_saves_count: m3,
      matches_with_5plus_saves_count: m5
    },
    rates: {
      saves_per_game: Number((saveSum / n).toFixed(3)),
      save_pct: savePct,
      matches_with_3plus_saves_pct: pct(m3, n),
      matches_with_5plus_saves_pct: pct(m5, n)
    }
  };
}

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
      under_25_count: 0, under_25_pct: null,
      corners_for_total: null, corners_for_avg: null,
      corners_against_total: null, corners_against_avg: null,
      yellow_cards_for_total: null, yellow_cards_for_avg: null,
      yellow_cards_against_total: null, yellow_cards_against_avg: null,
      red_cards_for_total: null, red_cards_for_avg: null,
      red_cards_against_total: null, red_cards_against_avg: null,
      shots_for_total: null, shots_for_avg: null,
      shots_against_total: null, shots_against_avg: null,
      shots_on_target_for_total: null, shots_on_target_against_total: null,
      possession_avg: null,
      fouls_for_total: null, fouls_for_avg: null,
      fouls_against_total: null, fouls_against_avg: null,
      offsides_for_total: null, offsides_for_avg: null,
      offsides_against_total: null, offsides_against_avg: null
    };
  }

  let won = 0, drew = 0, lost = 0, points = 0;
  let goals_for = 0, goals_against = 0;
  let btts_count = 0, clean_sheets_count = 0, failed_to_score_count = 0;
  let over_05_count = 0, over_15_count = 0, over_25_count = 0, over_35_count = 0;
  let corners_for_sum = 0, corners_against_sum = 0;
  let yellow_for_sum = 0, yellow_against_sum = 0;
  let red_for_sum = 0, red_against_sum = 0;
  let shots_for_sum = 0, shots_against_sum = 0, shots_on_target_sum = 0, shots_on_target_against_sum = 0;
  let possession_sum = 0;
  let fouls_for_sum = 0, fouls_against_sum = 0;
  let offsides_for_sum = 0, offsides_against_sum = 0;
  let corners_count = 0, yellow_count = 0, shots_count = 0, red_count = 0;
  let possession_count = 0, fouls_count = 0, offsides_count = 0;

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
    if (f.corners_for !== null && f.corners_against !== null) {
      const cff = Number(f.corners_for);
      const caf = Number(f.corners_against);
      if (Number.isFinite(cff) && Number.isFinite(caf) && cff >= 0 && caf >= 0) {
        corners_for_sum += cff;
        corners_against_sum += caf;
        corners_count++;
      }
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
      shots_against_sum += (f.shots_against ?? 0);
      shots_on_target_sum += (f.shots_on_target_for ?? 0);
      shots_on_target_against_sum += (f.shots_on_target_against ?? 0);
      shots_count++;
    }
    if (f.possession_pct !== null) {
      possession_sum += f.possession_pct;
      possession_count++;
    }
    if (f.fouls_for !== null) {
      fouls_for_sum += f.fouls_for;
      fouls_against_sum += (f.fouls_against ?? 0);
      fouls_count++;
    }
    if (f.offsides_for !== null) {
      offsides_for_sum += f.offsides_for;
      offsides_against_sum += (f.offsides_against ?? 0);
      offsides_count++;
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
    under_25_count: n - over_25_count,
    under_25_pct: pct(n - over_25_count, n),
    corners_for_total: corners_count > 0 ? corners_for_sum : null,
    corners_for_avg: corners_count > 0 ? toFloat(corners_for_sum / corners_count, 2) : null,
    corners_against_total: corners_count > 0 ? corners_against_sum : null,
    corners_against_avg: corners_count > 0 ? toFloat(corners_against_sum / corners_count, 2) : null,
    yellow_cards_for_total: yellow_count > 0 ? yellow_for_sum : null,
    yellow_cards_for_avg: yellow_count > 0 ? toFloat(yellow_for_sum / yellow_count, 2) : null,
    yellow_cards_against_total: yellow_count > 0 ? yellow_against_sum : null,
    yellow_cards_against_avg: yellow_count > 0 ? toFloat(yellow_against_sum / yellow_count, 2) : null,
    red_cards_for_total: red_count > 0 ? red_for_sum : null,
    red_cards_for_avg: red_count > 0 ? toFloat(red_for_sum / red_count, 2) : null,
    red_cards_against_total: red_count > 0 ? red_against_sum : null,
    red_cards_against_avg: red_count > 0 ? toFloat(red_against_sum / red_count, 2) : null,
    shots_for_total: shots_count > 0 ? shots_for_sum : null,
    shots_for_avg: shots_count > 0 ? toFloat(shots_for_sum / shots_count, 2) : null,
    shots_against_total: shots_count > 0 ? shots_against_sum : null,
    shots_against_avg: shots_count > 0 ? toFloat(shots_against_sum / shots_count, 2) : null,
    shots_on_target_for_total: shots_count > 0 ? shots_on_target_sum : null,
    shots_on_target_against_total: shots_count > 0 ? shots_on_target_against_sum : null,
    possession_avg: possession_count > 0 ? toFloat(possession_sum / possession_count, 2) : null,
    fouls_for_total: fouls_count > 0 ? fouls_for_sum : null,
    fouls_for_avg: fouls_count > 0 ? toFloat(fouls_for_sum / fouls_count, 2) : null,
    fouls_against_total: fouls_count > 0 ? fouls_against_sum : null,
    fouls_against_avg: fouls_count > 0 ? toFloat(fouls_against_sum / fouls_count, 2) : null,
    offsides_for_total: offsides_count > 0 ? offsides_for_sum : null,
    offsides_for_avg: offsides_count > 0 ? toFloat(offsides_for_sum / offsides_count, 2) : null,
    offsides_against_total: offsides_count > 0 ? offsides_against_sum : null,
    offsides_against_avg: offsides_count > 0 ? toFloat(offsides_against_sum / offsides_count, 2) : null
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
    away: buildSplitStats(awayFacts),
    discipline: {
      total: buildStrictDisciplineStats(teamFacts),
      home: buildStrictDisciplineStats(homeFacts),
      away: buildStrictDisciplineStats(awayFacts)
    },
    corners: {
      total: buildStrictCornersStats(teamFacts),
      home: buildStrictCornersStats(homeFacts),
      away: buildStrictCornersStats(awayFacts)
    },
    goalkeeper: {
      total: buildStrictGoalkeeperStats(teamFacts),
      home: buildStrictGoalkeeperStats(homeFacts),
      away: buildStrictGoalkeeperStats(awayFacts)
    }
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
 * Ensure every team in /standings has an aggregate (0 played if no finished facts yet).
 */
export function ensureAggregatesCoverStandings(teamAggregates, standingsPayload, competitionId, season) {
  const response = Array.isArray(standingsPayload?.response) ? standingsPayload.response : [];
  const leagueBlock = response[0]?.league || null;
  const groups = Array.isArray(leagueBlock?.standings) ? leagueBlock.standings : [];
  const rows = groups.find((entry) => Array.isArray(entry)) || [];
  const next = { ...(teamAggregates || {}) };
  for (const row of rows) {
    const id = Number(row?.team?.id);
    if (!Number.isFinite(id)) continue;
    const key = String(id);
    if (!next[key]) {
      const name = String(row?.team?.name || "").trim();
      next[key] = buildTeamAggregate(id, name, competitionId, season, []);
    }
  }
  return next;
}

/**
 * Build scoped team aggregates for:
 *  - all_competitions (all facts for the season)
 *  - competitions[competition_id] (facts filtered by competition)
 */
export function buildScopedTeamAggregates(allFacts, season) {
  const facts = Array.isArray(allFacts) ? allFacts : [];
  const byCompetitionFacts = new Map();

  for (const fact of facts) {
    const cid = Number(fact?.competition_id);
    if (!Number.isFinite(cid)) continue;
    if (!byCompetitionFacts.has(cid)) byCompetitionFacts.set(cid, []);
    byCompetitionFacts.get(cid).push(fact);
  }

  const teamMap = new Map();
  for (const fact of facts) {
    const tid = Number(fact?.team_id);
    if (!Number.isFinite(tid)) continue;
    if (!teamMap.has(tid)) teamMap.set(tid, String(fact?.team_name || "").trim());
  }

  const allCompetitions = {};
  for (const [teamId, teamName] of teamMap.entries()) {
    const teamFacts = facts.filter((f) => Number(f.team_id) === teamId);
    allCompetitions[String(teamId)] = {
      team_id: teamId,
      team_name: teamName,
      season,
      scope: "all_competitions",
      competitions: Array.from(new Set(teamFacts.map((f) => Number(f.competition_id)).filter((n) => Number.isFinite(n)))).sort((a, b) => a - b),
      total: buildSplitStats(teamFacts),
      home: buildSplitStats(teamFacts.filter((f) => f.is_home)),
      away: buildSplitStats(teamFacts.filter((f) => !f.is_home))
    };
  }

  const competitions = {};
  for (const [competitionId, competitionFacts] of byCompetitionFacts.entries()) {
    competitions[String(competitionId)] = buildAllTeamAggregates(competitionFacts, competitionId, season);
  }

  return {
    all_competitions: allCompetitions,
    competitions
  };
}

/**
 * Build all team facts from a list of raw fixtures and an optional fixture stats map.
 *
 * @param {Array}  rawFixtures  - output of buildRawFixtureRecord[]
 * @param {object} fixtureStatsMap - { [fixture_id]: buildFixtureStatsRecord output }, or {}
 * @returns {Array}  flat list of team facts (2 per fixture)
 */
export function buildAllTeamFacts(rawFixtures, fixtureStatsMap, fixtureEventsMap = {}) {
  const statsMap = fixtureStatsMap || {};
  const eventsMap = fixtureEventsMap || {};
  const allFacts = [];

  for (const raw of rawFixtures) {
    if (raw.home_goals === null || raw.away_goals === null) continue;
    const stats = statsMap[String(raw.fixture_id)] || null;
    const events = eventsMap[String(raw.fixture_id)] || null;
    try {
      const [homeFact, awayFact] = buildTeamFactsFromFixture(raw, stats, events);
      allFacts.push(homeFact, awayFact);
    } catch {
      // skip malformed fixtures silently
    }
  }

  return allFacts;
}
