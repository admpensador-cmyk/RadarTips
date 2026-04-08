/**
 * Team analytics engine (pipeline-only).
 * Single source of truth for cohort team profiles: facts from ALL finished fixtures,
 * profile scores via team-profile-engine (Node).
 */

import { computeTeamProfileV1 } from "./team-profile-engine.mjs";

export const TEAM_ANALYTICS_SCHEMA = "team_analytics_v1";

function teamKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(fc|cf|afc|ac)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickDisciplineRates(raw) {
  const d = raw?.discipline;
  if (!d || typeof d !== "object") return null;
  const tot = d.total;
  if (tot?.rates && typeof tot.rates === "object") return tot.rates;
  return null;
}

function pickGoalkeeperRates(raw) {
  const g = raw?.goalkeeper;
  if (!g || typeof g !== "object") return null;
  const tot = g.total;
  if (tot?.rates && typeof tot.rates === "object") return tot.rates;
  return null;
}

function findStandingForTeam(standings, teamName) {
  const k = teamKey(teamName);
  for (const row of standings || []) {
    if (teamKey(row?.team) === k) return row;
  }
  return null;
}

function teamFixtureNameMatches(standingTeam, fixtureSide) {
  const a = teamKey(standingTeam);
  const b = teamKey(fixtureSide);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith(`${a} `)) return true;
  if (a.startsWith(`${b} `)) return true;
  return false;
}

function parseFixtureScoreString(scoreStr) {
  const m = String(scoreStr || "").trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  const hg = Number(m[1]);
  const ag = Number(m[2]);
  if (!Number.isFinite(hg) || !Number.isFinite(ag)) return null;
  return { homeGoals: hg, awayGoals: ag };
}

export function buildFinishedFactsForTeam(teamName, finishedList) {
  const facts = [];
  for (const f of finishedList || []) {
    const pr = parseFixtureScoreString(f?.score);
    if (!pr) continue;
    let gf;
    let ga;
    if (teamFixtureNameMatches(teamName, f.home)) {
      gf = pr.homeGoals;
      ga = pr.awayGoals;
    } else if (teamFixtureNameMatches(teamName, f.away)) {
      gf = pr.awayGoals;
      ga = pr.homeGoals;
    } else {
      continue;
    }
    const win = gf > ga;
    const draw = gf === ga;
    const r = win ? "W" : draw ? "D" : "L";
    facts.push({
      goals_for: gf,
      goals_against: ga,
      btts: gf > 0 && ga > 0,
      over_25: gf + ga > 2,
      result: r,
      won: win,
      clean_sheet: ga === 0,
    });
  }
  return facts;
}

export function rawStatisticsTeamToCohortMember(raw, standing) {
  const played = Number(raw?.played ?? raw?.matches ?? 0);
  const st = standing || {};
  const splitStats = {
    played: Number.isFinite(played) && played > 0 ? played : 0,
    won: numOrNull(st.wins),
    drew: numOrNull(st.draws),
    lost: numOrNull(st.losses),
    points: numOrNull(st.points),
    goals_for: numOrNull(raw?.goals_for != null ? raw.goals_for : raw?.goals_scored),
    goals_against: numOrNull(raw?.goals_against != null ? raw.goals_against : raw?.goals_conceded),
    goals_for_per_game: numOrNull(raw?.goals_for_per_game),
    goals_against_per_game: numOrNull(raw?.goals_against_per_game),
    failed_to_score_pct: numOrNull(raw?.failed_to_score_pct),
    clean_sheets_pct: numOrNull(raw?.clean_sheets_pct),
    shots_for_avg: numOrNull(raw?.shots_for_avg),
    shots_against_avg: numOrNull(raw?.shots_against_avg),
    shots_on_target_for_avg: numOrNull(raw?.shots_on_target_for_avg),
    shots_on_target_against_avg: numOrNull(raw?.shots_on_target_against_avg),
    shots_on_target_for_total: numOrNull(raw?.shots_on_target_for_total),
    shots_on_target_against_total: numOrNull(raw?.shots_on_target_against_total),
    fouls_for_avg: numOrNull(raw?.fouls_for_avg),
    fouls_against_avg: numOrNull(raw?.fouls_against_avg),
    yellow_cards_for_avg: null,
    red_cards_for_avg: null,
  };
  const dr = pickDisciplineRates(raw);
  if (dr) {
    splitStats.yellow_cards_for_avg = numOrNull(dr.yellow_cards_per_game);
    splitStats.red_cards_for_avg = numOrNull(dr.red_cards_per_game);
  }
  const optional = {};
  if (numOrNull(raw?.xg_per_game) != null) optional.xg_per_game = numOrNull(raw.xg_per_game);
  if (numOrNull(raw?.xga_per_game) != null) optional.xga_per_game = numOrNull(raw.xga_per_game);
  const gkr = pickGoalkeeperRates(raw);
  if (gkr) {
    if (numOrNull(gkr.saves_per_game) != null) optional.saves_per_game = numOrNull(gkr.saves_per_game);
    const sp = numOrNull(gkr.save_pct);
    if (sp != null) optional.save_rate = sp <= 1 ? sp : sp / 100;
  }
  const gtot = raw?.goalkeeper?.total?.totals;
  if (gtot && Number.isFinite(Number(gtot.saves))) {
    optional.saves_total = Number(gtot.saves);
  }
  return { splitStats, optional };
}

function parseSeasonForEngine(season) {
  const s = String(season == null ? "" : season).trim();
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  const m = s.match(/(19|20)\d{2}/);
  if (m) return Number(m[0]);
  return new Date().getUTCFullYear();
}

function scoresFromEngineOut(out) {
  if (!out?.scores) return null;
  const s = out.scores;
  return {
    overall: s.overall,
    attack: s.attack,
    defense: s.defense,
    control: s.control,
    consistency: s.consistency,
    aggressiveness: s.aggressiveness,
    goalkeeper: s.goalkeeper,
  };
}

function profileDimensionNumeric(row, dim) {
  if (!row?.scores) return NaN;
  const raw = row.scores[dim];
  if (raw == null) return NaN;
  const v = Number(raw);
  return Number.isFinite(v) ? v : NaN;
}

function buildOrderedProfileRows(standingsRaw, scoreMap, cohortInputs) {
  const finalRows = [];
  const usedKeys = new Set();
  (standingsRaw || []).forEach((st, j) => {
    const name = String(st?.team || "").trim();
    if (!name) return;
    const k = teamKey(name);
    usedKeys.add(k);
    const hit = scoreMap[k];
    finalRows.push({
      team: name,
      team_id: hit && Number.isFinite(Number(hit.team_id)) ? hit.team_id : 830000 + j,
      scores: hit?.scores != null ? hit.scores : null,
    });
  });
  for (const c of cohortInputs || []) {
    const k = teamKey(c.team);
    if (!k || usedKeys.has(k)) continue;
    usedKeys.add(k);
    const hit = scoreMap[k];
    finalRows.push({
      team: c.team,
      team_id: hit && Number.isFinite(Number(hit.team_id)) ? hit.team_id : c.team_id,
      scores: hit?.scores != null ? hit.scores : null,
    });
  }
  return finalRows;
}

/**
 * Runs cohort profile engine once; returns comparison UI block + per-team analytics records.
 * @param {object} snapshot - league_page_v1 snapshot (enforced)
 */
export function runTeamAnalyticsForLeagueSnapshot(snapshot) {
  const competition = snapshot?.competition || {};
  const compId = Number(competition.competition_id);
  const seasonNum = parseSeasonForEngine(competition.season);
  const standings = Array.isArray(snapshot?.standings) ? snapshot.standings : [];
  const teamsStats = Array.isArray(snapshot?.statistics?.teams) ? snapshot.statistics.teams : [];
  const finished = Array.isArray(snapshot?.fixtures?.finished) ? snapshot.fixtures.finished : [];

  const cohortInputs = [];
  teamsStats.forEach((raw, idx) => {
    const teamName = String(raw?.team || "").trim();
    if (!teamName) return;
    const standing = findStandingForTeam(standings, teamName);
    let tid = Number(raw.team_id);
    if (!Number.isFinite(tid) || tid <= 0) tid = 900000 + idx;
    const mem = rawStatisticsTeamToCohortMember(raw, standing);
    cohortInputs.push({
      team: teamName,
      team_id: tid,
      splitStats: mem.splitStats,
      facts: buildFinishedFactsForTeam(teamName, finished),
      optional: mem.optional,
    });
  });

  const scoreMap = {};
  const analyticsByTeamId = {};
  let showGkColumn = false;
  let hasOverallScore = false;

  if (!cohortInputs.length) {
    return {
      team_profile_comparison: {
        rows: [],
        leaders: {},
        show_gk_column: false,
        has_overall_score: false,
      },
      team_analytics_by_team_id: {},
    };
  }

  const cohortForEngine = cohortInputs.map((c) => ({
    team_id: c.team_id,
    splitStats: c.splitStats,
    facts: c.facts,
    optional: c.optional,
  }));

  if (cohortForEngine.length < 2 || !Number.isFinite(compId) || !Number.isFinite(seasonNum)) {
    cohortInputs.forEach((c) => {
      scoreMap[teamKey(c.team)] = { team_id: c.team_id, scores: null };
    });
    return {
      team_profile_comparison: {
        rows: buildOrderedProfileRows(standings, scoreMap, cohortInputs),
        leaders: {},
        show_gk_column: false,
        has_overall_score: false,
      },
      team_analytics_by_team_id: {},
    };
  }

  for (const c of cohortInputs) {
    let out = null;
    try {
      out = computeTeamProfileV1({
        competition_id: compId,
        season: seasonNum,
        split: "total",
        team_id: c.team_id,
        target: {
          team_id: c.team_id,
          splitStats: c.splitStats,
          facts: c.facts,
          optional: c.optional,
        },
        cohort: cohortForEngine,
      });
    } catch {
      out = null;
    }
    const sc = scoresFromEngineOut(out);
    scoreMap[teamKey(c.team)] = { team_id: c.team_id, scores: sc };
    if (sc) {
      if (Number.isFinite(Number(sc.overall))) hasOverallScore = true;
      if (Number.isFinite(Number(sc.goalkeeper))) showGkColumn = true;
    }
    analyticsByTeamId[c.team_id] = {
      schema: TEAM_ANALYTICS_SCHEMA,
      team_id: c.team_id,
      team: c.team,
      profile_scores: sc,
      data_quality: out?.data_quality ?? null,
      available_features: out?.available_features ?? null,
      missing_features: out?.missing_features ?? null,
      meta: out?.meta ?? null,
    };
  }

  const rows = buildOrderedProfileRows(standings, scoreMap, cohortInputs);
  const leaders = {};
  const dims = ["overall", "attack", "defense", "control", "consistency", "goalkeeper"];
  for (const dim of dims) {
    let best = null;
    for (const r of rows) {
      const v = profileDimensionNumeric(r, dim);
      if (!Number.isFinite(v)) continue;
      if (
        !best ||
        v > best.value ||
        (v === best.value && String(r.team).localeCompare(String(best.team), undefined, { sensitivity: "base" }) < 0)
      ) {
        best = { team: r.team, value: v };
      }
    }
    if (best) leaders[dim] = best;
  }

  return {
    team_profile_comparison: {
      rows,
      leaders,
      show_gk_column: showGkColumn,
      has_overall_score: hasOverallScore,
    },
    team_analytics_by_team_id: analyticsByTeamId,
  };
}
