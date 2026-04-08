/**
 * League analytics engine (pipeline-only).
 * Produces league_analytics domain model + display snapshots league_page_ui + team_page_ui_by_team_id.
 */

import { runTeamAnalyticsForLeagueSnapshot } from "./team-analytics-engine.mjs";

export const LEAGUE_ANALYTICS_SCHEMA = "league_analytics_v1";
/** Display snapshot keyed by team_id (numeric keys in JSON). */
export const TEAM_PAGE_UI_SCHEMA = "team_page_ui_v2";

function teamKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(fc|cf|afc|ac)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNum(value, digits) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(digits ?? 1);
}

function formatPct1(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0.0%";
  return `${num.toFixed(1)}%`;
}

function clampSplitPct(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function buildOverviewGlobalTrends(summary, splits) {
  splits = splits || {};
  const goals = Number(summary.goals_per_game || 0);
  const btts = Number(summary.btts_pct || 0);
  const over25 = Number(summary.over_25_pct || 0);
  const clean = Number(summary.clean_sheets_pct || 0);
  const homeBtts = Number(
    splits.home?.btts_pct != null
      ? splits.home.btts_pct
      : splits.home_btts_pct != null
        ? splits.home_btts_pct
        : 50
  );
  return [
    {
      title: "Goal trend",
      value: `${goals.toFixed(2)} goals/game`,
      note: goals >= 2.7 ? "high-volume phase" : "moderate scoring pace",
    },
    {
      title: "BTTS trend",
      value: `${btts.toFixed(1)}%`,
      note: btts >= 52 ? "bilateral scoring above baseline" : "mixed bilateral scoring",
    },
    {
      title: "Home edge",
      value: formatPct1(homeBtts),
      note: "home-away split monitored",
    },
    {
      title: "Over/Under shape",
      value: `${over25.toFixed(1)}% over 2.5`,
      note: clean >= 40 ? "defensive resistance still present" : "open-game pattern",
    },
  ];
}

function buildStatisticsSplitsDisplay(splits) {
  splits = splits || {};
  const splitHome = splits.home || {};
  const splitAway = splits.away || {};
  const goalsHomeTot = Number(splits.goals_home);
  const goalsAwayTot = Number(splits.goals_away);
  let gh = Number.isFinite(goalsHomeTot) ? goalsHomeTot : 0;
  let ga = Number.isFinite(goalsAwayTot) ? goalsAwayTot : 0;
  const goalsSum = gh + ga;
  const shareHomePct = goalsSum > 0 ? (gh / goalsSum) * 100 : 50;
  const shareAwayPct = goalsSum > 0 ? (ga / goalsSum) * 100 : 50;

  const hG =
    splitHome.goals_avg != null ? Number(splitHome.goals_avg) : Number(splits.home_goals_avg);
  const aG =
    splitAway.goals_avg != null ? Number(splitAway.goals_avg) : Number(splits.away_goals_avg);
  const denom = Math.max(0.01, (Number.isFinite(hG) ? hG : 0) + (Number.isFinite(aG) ? aG : 0));

  return [
    {
      metric: "Goals avg",
      home_label: formatNum(splitHome.goals_avg != null ? splitHome.goals_avg : splits.home_goals_avg, 2),
      away_label: formatNum(splitAway.goals_avg != null ? splitAway.goals_avg : splits.away_goals_avg, 2),
      bar_home: clampSplitPct(((Number.isFinite(hG) ? hG : 0) / denom) * 100),
      bar_away: clampSplitPct(((Number.isFinite(aG) ? aG : 0) / denom) * 100),
    },
    {
      metric: "Share of goals",
      home_label: `${formatNum(shareHomePct, 1)}% (${gh})`,
      away_label: `${formatNum(shareAwayPct, 1)}% (${ga})`,
      bar_home: clampSplitPct(shareHomePct),
      bar_away: clampSplitPct(shareAwayPct),
    },
    {
      metric: "Over 2.5",
      home_label: formatPct1(
        splitHome.over_25_pct != null ? splitHome.over_25_pct : splits.home_over_25_pct
      ),
      away_label: formatPct1(
        splitAway.over_25_pct != null ? splitAway.over_25_pct : splits.away_over_25_pct
      ),
      bar_home: clampSplitPct(
        splitHome.over_25_pct != null ? splitHome.over_25_pct : splits.home_over_25_pct
      ),
      bar_away: clampSplitPct(
        splitAway.over_25_pct != null ? splitAway.over_25_pct : splits.away_over_25_pct
      ),
    },
    {
      metric: "Clean sheets",
      home_label: formatPct1(
        splitHome.clean_sheets_pct != null ? splitHome.clean_sheets_pct : splits.home_clean_sheets_pct
      ),
      away_label: formatPct1(
        splitAway.clean_sheets_pct != null ? splitAway.clean_sheets_pct : splits.away_clean_sheets_pct
      ),
      bar_home: clampSplitPct(
        splitHome.clean_sheets_pct != null ? splitHome.clean_sheets_pct : splits.home_clean_sheets_pct
      ),
      bar_away: clampSplitPct(
        splitAway.clean_sheets_pct != null ? splitAway.clean_sheets_pct : splits.away_clean_sheets_pct
      ),
    },
  ];
}

function firstTeamName(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const t = String(rows[0]?.team || "").trim();
  return t || null;
}

function buildQuickRankings(teamRankings) {
  const r = teamRankings && typeof teamRankings === "object" ? teamRankings : {};
  return [
    { label: "Best attack", team: firstTeamName(r.by_goals_for) || "n/a" },
    { label: "Best defense", team: firstTeamName(r.by_goals_against) || "n/a" },
    { label: "Most over 2.5", team: firstTeamName(r.by_over_25_pct) || "n/a" },
    { label: "Most BTTS", team: firstTeamName(r.by_btts_pct) || "n/a" },
    { label: "Most clean sheets", team: firstTeamName(r.by_clean_sheets_pct) || "n/a" },
  ];
}

function formString(value) {
  const cleaned = String(value || "")
    .toUpperCase()
    .replace(/[^WDL]/g, "");
  if (!cleaned) return "DDDDD";
  return cleaned.slice(0, 5);
}

function buildHeroMetrics(summary) {
  return [
    { label: "Goals / match", value: formatNum(summary.goals_per_game, 2), trend: "steady" },
    { label: "BTTS", value: formatPct1(summary.btts_pct), trend: "steady" },
    { label: "Over 2.5", value: formatPct1(summary.over_25_pct), trend: "steady" },
    { label: "Clean sheets", value: formatPct1(summary.clean_sheets_pct), trend: "steady" },
  ];
}

function buildCompetitionSummaryCards(summary) {
  return [
    {
      label: "Average goals",
      value: formatNum(summary.goals_per_game, 2),
      insight: "from finished season fixtures (snapshot)",
    },
    { label: "BTTS", value: formatPct1(summary.btts_pct), insight: "both teams to score ratio" },
    { label: "Over 1.5", value: formatPct1(summary.over_15_pct), insight: "goal floor consistency" },
    { label: "Over 2.5", value: formatPct1(summary.over_25_pct), insight: "primary totals trigger" },
    { label: "Under 2.5", value: formatPct1(summary.under_25_pct), insight: "controlled-game counterweight" },
  ];
}

function buildLeagueStatCards(leagueStats, summary) {
  const L = leagueStats || {};
  return [
    {
      label: "Goals / game",
      value: formatNum(L.goals_per_game != null ? L.goals_per_game : summary.goals_per_game, 2),
    },
    {
      label: "Over 2.5",
      value: formatPct1(L.over_25_pct != null ? L.over_25_pct : summary.over_25_pct),
    },
    {
      label: "BTTS",
      value: formatPct1(L.btts_pct != null ? L.btts_pct : summary.btts_pct),
    },
    {
      label: "Clean sheets",
      value: formatPct1(L.clean_sheets_pct != null ? L.clean_sheets_pct : summary.clean_sheets_pct),
    },
  ];
}

function buildTeamsIndexRows(standings, teamsStats, trendProfiles) {
  const byStats = new Map((teamsStats || []).map((row) => [teamKey(row.team), row]));
  const byProf = new Map((trendProfiles || []).map((p) => [teamKey(p.team), p]));
  return (standings || []).map((row) => {
    const rankRow = byStats.get(teamKey(row.team)) || null;
    const prof = byProf.get(teamKey(row.team)) || null;
    return {
      team: row.team,
      position: Number(row.position || row.rank || 0),
      form: formString(row.form_last5),
      goalsFor: Number(row.goals_for || 0),
      goalsAgainst: Number(row.goals_against || 0),
      btts: formatPct1(rankRow?.btts_pct),
      profile: prof?.profile && String(prof.profile).trim() ? String(prof.profile).trim() : "—",
    };
  });
}

function buildRankingGroupsForUi(teamRankings) {
  const r = teamRankings && typeof teamRankings === "object" ? teamRankings : {};
  function sliceRows(key) {
    const list = Array.isArray(r[key]) ? r[key] : [];
    return list.slice(0, 5).map((row) => ({
      team: row.team,
      value: Number(row.value),
      matches: Number(row.matches ?? row.played ?? 0),
    }));
  }
  return [
    { title: "Top ataques", rows: sliceRows("by_goals_for") },
    { title: "Melhores defesas", rows: sliceRows("by_goals_against") },
    { title: "Mais BTTS", rows: sliceRows("by_btts_pct") },
    { title: "Mais Over 2.5", rows: sliceRows("by_over_25_pct") },
    { title: "Mais clean sheets", rows: sliceRows("by_clean_sheets_pct") },
  ];
}

function scoreBarWidth(score) {
  if (score == null || !Number.isFinite(Number(score))) return 0;
  return Math.max(0, Math.min(100, Number(score)));
}

function scoreText(score) {
  if (score == null || !Number.isFinite(Number(score))) return "—";
  return String(Math.round(Number(score)));
}

function findStandingByTeamId(standings, teamId) {
  const tid = Number(teamId);
  for (const row of standings || []) {
    if (Number(row?.team_id) === tid) return row;
  }
  return null;
}

function findStatisticsTeamRow(teamsStats, teamId) {
  const tid = Number(teamId);
  for (const row of teamsStats || []) {
    if (Number(row?.team_id) === tid) return row;
  }
  return null;
}

function findTeamProfileTrend(trendProfiles, teamName) {
  const k = teamKey(teamName);
  for (const p of trendProfiles || []) {
    if (teamKey(p?.team) === k) return p;
  }
  return null;
}

function cohortRankForTeam(rows, teamId, dimKey) {
  const tid = Number(teamId);
  const sorted = (rows || [])
    .filter((r) => r?.scores && Number.isFinite(Number(r.scores[dimKey])))
    .slice()
    .sort((a, b) => Number(b.scores[dimKey]) - Number(a.scores[dimKey]));
  const idx = sorted.findIndex((r) => Number(r.team_id) === tid);
  if (idx < 0) return null;
  return { rank: idx + 1, total: sorted.length };
}

function ordinal(n) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return String(n);
  const j = x % 10;
  const k = x % 100;
  if (j === 1 && k !== 11) return `${x}st`;
  if (j === 2 && k !== 12) return `${x}nd`;
  if (j === 3 && k !== 13) return `${x}rd`;
  return `${x}th`;
}

function buildTeamSummaryCards(standing, statsRow) {
  const cards = [];
  const st = standing || {};
  const sr = statsRow || {};
  const played = Number(st.played ?? sr.played ?? sr.matches ?? 0);
  if (played > 0) {
    cards.push({ label: "Matches", value: String(played) });
    const w = st.wins,
      d = st.draws,
      l = st.losses;
    if ([w, d, l].every((x) => Number.isFinite(Number(x)))) {
      cards.push({ label: "Record", value: `${w}-${d}-${l}`, note: "W-D-L (table)" });
    }
    if (Number.isFinite(Number(st.points))) {
      cards.push({ label: "Points", value: String(st.points) });
    }
    if (Number.isFinite(Number(st.position))) {
      cards.push({ label: "League rank", value: ordinal(st.position) });
    }
  }
  const gf = st.goals_for ?? sr.goals_for ?? sr.goals_scored;
  const ga = st.goals_against ?? sr.goals_against ?? sr.goals_conceded;
  if (Number.isFinite(Number(gf)) || Number.isFinite(Number(ga))) {
    cards.push({
      label: "Goals for / against",
      value: `${Number.isFinite(Number(gf)) ? gf : "—"} / ${Number.isFinite(Number(ga)) ? ga : "—"}`,
    });
  }
  if (Number.isFinite(Number(sr.btts_pct))) {
    cards.push({ label: "BTTS (season)", value: formatPct1(sr.btts_pct) });
  }
  if (Number.isFinite(Number(sr.over_25_pct))) {
    cards.push({ label: "Over 2.5", value: formatPct1(sr.over_25_pct) });
  }
  if (Number.isFinite(Number(sr.clean_sheets_pct))) {
    cards.push({ label: "Clean sheets", value: formatPct1(sr.clean_sheets_pct) });
  }
  return cards;
}

/**
 * Canonical league-level analytics (numbers + references; not HTML).
 */
export function buildLeagueAnalytics(snapshot, teamAnalyticsByTeamId) {
  const competition = snapshot?.competition || {};
  const summary = snapshot?.summary || {};
  const statistics = snapshot?.statistics || {};
  const splits = statistics.home_away_splits || snapshot?.splits || {};
  const teamRankings = statistics.team_rankings || snapshot?.rankings || {};
  const trends = snapshot?.trends || {};

  return {
    schema: LEAGUE_ANALYTICS_SCHEMA,
    competition_id: Number(competition.competition_id) || null,
    season: competition.season != null ? String(competition.season) : null,
    slug: competition.slug != null ? String(competition.slug) : null,
    summary_metrics: {
      matches_count: summary.matches_count,
      goals_per_game: summary.goals_per_game,
      over_15_pct: summary.over_15_pct,
      over_25_pct: summary.over_25_pct,
      under_25_pct: summary.under_25_pct,
      btts_pct: summary.btts_pct,
      clean_sheets_pct: summary.clean_sheets_pct,
      failed_to_score_pct: summary.failed_to_score_pct,
    },
    team_rankings: teamRankings,
    home_away_splits: splits,
    trend_cards: Array.isArray(trends.trend_cards) ? trends.trend_cards : [],
    team_profiles_tags: Array.isArray(trends.team_profiles) ? trends.team_profiles : [],
    summary_text: trends.summary_text != null ? String(trends.summary_text) : null,
    team_analytics_by_team_id: teamAnalyticsByTeamId || {},
  };
}

/**
 * Per-team display snapshot: header, summary cards, profile bars, cohort comparison, trend copy.
 * @param {object} snapshot - league snapshot
 * @param {object} teamAnalyticsByTeamId - from runTeamAnalyticsForLeagueSnapshot
 * @param {object} teamProfileComparison - { rows, leaders }
 */
export function buildTeamPageUiByTeamId(snapshot, teamAnalyticsByTeamId, teamProfileComparison) {
  const competition = snapshot?.competition || {};
  const standings = Array.isArray(snapshot?.standings) ? snapshot.standings : [];
  const teamsStats = Array.isArray(snapshot?.statistics?.teams) ? snapshot.statistics.teams : [];
  const trends = snapshot?.trends || {};
  const trendProfiles = Array.isArray(trends.team_profiles) ? trends.team_profiles : [];
  const rows = Array.isArray(teamProfileComparison?.rows) ? teamProfileComparison.rows : [];
  const leaders = teamProfileComparison?.leaders && typeof teamProfileComparison.leaders === "object"
    ? teamProfileComparison.leaders
    : {};

  const comparisonDims = [
    { key: "overall", label: "Overall profile" },
    { key: "attack", label: "Attack" },
    { key: "defense", label: "Defense" },
    { key: "control", label: "Control" },
    { key: "consistency", label: "Consistency" },
    { key: "goalkeeper", label: "Goalkeeper" },
  ];

  const out = {};
  for (const [tidStr, rec] of Object.entries(teamAnalyticsByTeamId || {})) {
    const tid = Number(tidStr);
    if (!Number.isFinite(tid)) continue;
    const sc = rec?.profile_scores || {};
    const teamName = rec.team != null ? String(rec.team) : "";
    const standing = findStandingByTeamId(standings, tid);
    const statsRow = findStatisticsTeamRow(teamsStats, tid);
    const profTrend = findTeamProfileTrend(trendProfiles, teamName);
    const tags = Array.isArray(profTrend?.tags) ? profTrend.tags.map((x) => String(x)) : [];
    const dims = [
      { key: "attack", label: "Attack" },
      { key: "defense", label: "Defense" },
      { key: "control", label: "Control" },
      { key: "consistency", label: "Consistency" },
      { key: "aggressiveness", label: "Aggressiveness" },
      { key: "goalkeeper", label: "Goalkeeper" },
    ];

    const comparison_rows = [];
    for (const { key, label } of comparisonDims) {
      const lead = leaders[key];
      if (lead && teamKey(lead.team) === teamKey(teamName)) {
        comparison_rows.push({ label, value_text: "Best in cohort", note: String(lead.team || "") });
        continue;
      }
      const rk = cohortRankForTeam(rows, tid, key);
      if (rk) {
        comparison_rows.push({
          label,
          value_text: `${ordinal(rk.rank)} of ${rk.total}`,
          note: "Cohort rank by model score",
        });
      } else {
        comparison_rows.push({ label, value_text: "—", note: "Insufficient cohort data" });
      }
    }

    const formDisp =
      standing?.form_last5 != null && String(standing.form_last5).trim()
        ? formString(standing.form_last5)
        : "—";

    out[tid] = {
      contract: TEAM_PAGE_UI_SCHEMA,
      schema: 2,
      team_id: tid,
      team: teamName,
      header: {
        competition_name: competition.name != null ? String(competition.name) : "",
        season: competition.season != null ? String(competition.season) : "",
        country: competition.country != null ? String(competition.country) : "",
        team_name: teamName || (standing?.team != null ? String(standing.team) : ""),
        position_text: standing?.position != null ? ordinal(standing.position) : "—",
        points_text:
          standing?.points != null && Number.isFinite(Number(standing.points))
            ? String(standing.points)
            : "—",
        form_display: formDisp,
      },
      summary_cards: buildTeamSummaryCards(standing, statsRow),
      trends_reading: {
        primary_text:
          profTrend?.profile != null && String(profTrend.profile).trim()
            ? String(profTrend.profile).trim()
            : "—",
        tags_line: tags.length ? tags.join(" · ") : "—",
        league_context_line:
          trends.summary_text != null && String(trends.summary_text).trim()
            ? String(trends.summary_text).trim()
            : null,
      },
      overall_text: scoreText(sc.overall),
      profile_rows: dims.map((d) => ({
        key: d.key,
        label: d.label,
        value_text: scoreText(sc[d.key]),
        bar_width_pct: scoreBarWidth(sc[d.key]),
      })),
      comparison_rows,
      data_quality: rec.data_quality ?? null,
    };
  }
  return out;
}

/** @param {object} snapshot - league_page_v1 snapshot (enforced) */
export function buildLeaguePageUi(snapshot) {
  return buildLeagueAnalyticsPackage(snapshot).league_page_ui;
}

/**
 * Single call: league_analytics + league_page_ui (without internal _) + team_page_ui_by_team_id.
 * Runs team profile cohort once.
 */
export function buildLeagueAnalyticsPackage(snapshot) {
  const { team_profile_comparison, team_analytics_by_team_id } = runTeamAnalyticsForLeagueSnapshot(snapshot);

  const league_page_ui_rest = (() => {
    const summary = snapshot?.summary || {};
    const statistics = snapshot?.statistics || {};
    const splits = statistics.home_away_splits || snapshot?.splits || {};
    const teamRankings = statistics.team_rankings || snapshot?.rankings || {};
    const leagueStats = statistics.league || {};
    const standings = Array.isArray(snapshot?.standings) ? snapshot.standings : [];
    const teamsStats = Array.isArray(statistics.teams) ? statistics.teams : [];
    const trends = snapshot?.trends || {};
    const trendProfiles = Array.isArray(trends.team_profiles) ? trends.team_profiles : [];
    return {
      schema: 1,
      engine_version: "league_analytics_engine_v1",
      hero_metrics: buildHeroMetrics(summary),
      overview_competition_summary: buildCompetitionSummaryCards(summary),
      overview_global_trends: buildOverviewGlobalTrends(summary, splits),
      quick_rankings: buildQuickRankings(teamRankings),
      statistics_league_cards: buildLeagueStatCards(leagueStats, summary),
      statistics_ranking_groups: buildRankingGroupsForUi(teamRankings),
      statistics_splits: buildStatisticsSplitsDisplay(splits),
      teams_index: buildTeamsIndexRows(standings, teamsStats, trendProfiles),
      team_profile_comparison,
    };
  })();

  const league_analytics = buildLeagueAnalytics(snapshot, team_analytics_by_team_id);
  const team_page_ui_by_team_id = buildTeamPageUiByTeamId(
    snapshot,
    team_analytics_by_team_id,
    team_profile_comparison
  );

  return {
    league_analytics,
    league_page_ui: league_page_ui_rest,
    team_page_ui_by_team_id,
  };
}
