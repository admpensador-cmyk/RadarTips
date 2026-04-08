/**
 * Team Profile v1 — feature derivation from finished-match facts + split aggregates.
 * Structural identity metrics only; match-event outputs stay separate at product level.
 */

/**
 * Optional pipeline-provided fields not yet on split aggregates (saves, HT, first goal, xG).
 * @typedef {{
 *   scored_first_pct?: number | null,
 *   leading_ht_pct?: number | null,
 *   comeback_wins_pct?: number | null,
 *   conceded_first_pct?: number | null,
 *   xg_per_game?: number | null,
 *   xga_per_game?: number | null,
 *   saves_per_game?: number | null,
 *   save_rate?: number | null,
 *   saves_total?: number | null,
 * }} TeamProfileOptionalDerived
 */

const ALL_FEATURE_KEYS = [
  "goals_for_per_game",
  "shots_per_game",
  "shots_on_target_per_game",
  "xg_per_game",
  "team_scored_0_5_plus_pct",
  "team_scored_1_5_plus_pct",
  "failed_to_score_pct",
  "shots_per_goal",
  "shots_on_target_per_goal",
  "goals_against_per_game",
  "shots_conceded_per_game",
  "shots_on_target_conceded_per_game",
  "xga_per_game",
  "clean_sheet_pct",
  "conceded_at_least_one_pct",
  "shots_conceded_per_goal_allowed",
  "shots_on_target_conceded_per_goal_allowed",
  "goals_conceded_stddev",
  "scored_first_pct",
  "leading_ht_pct",
  "win_rate",
  "points_per_game",
  "wins_to_nil_pct",
  "comeback_wins_pct",
  "conceded_first_pct",
  "goals_scored_stddev",
  "btts_rate_variance",
  "over_25_rate_variance",
  "result_entropy_norm",
  "fouls_committed_per_game",
  "fouls_suffered_per_game",
  "yellow_cards_per_game",
  "red_cards_per_game",
  "saves_per_game",
  "save_rate",
  "goals_conceded_per_shot_on_target_faced",
  "draw_rate",
  "clean_sheet_freq_variance",
  "failed_to_score_freq_variance",
];

function mean(arr) {
  const v = arr.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function variancePop(arr) {
  const m = mean(arr);
  if (m == null || arr.length < 2) return null;
  const v = arr.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  let s = 0;
  for (const x of v) s += (x - m) ** 2;
  return s / v.length;
}

function safeDiv(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

/**
 * @param {object} splitStats — output of buildSplitStats for one split
 * @param {object[]} facts — team facts for this team in this competition+season+split
 * @param {TeamProfileOptionalDerived} [optional]
 * @returns {{ values: Record<string, number|null>, available_features: string[], missing_features: string[] }}
 */
export function deriveTeamProfileFeatures(splitStats, facts = [], optional = {}) {
  const s = splitStats && typeof splitStats === "object" ? splitStats : {};
  const played = Number(s.played);
  const n = Number.isFinite(played) && played > 0 ? played : 0;

  const factsArr = Array.isArray(facts) ? facts : [];
  const opt = optional && typeof optional === "object" ? optional : {};
  const values = /** @type {Record<string, number|null>} */ ({});

  const setNum = (key, v) => {
    if (v == null || !Number.isFinite(v)) {
      values[key] = null;
      return;
    }
    values[key] = Number(v);
  };

  const mergedOpt = { ...opt };
  /** Rate over matches where the flag is defined (real data only; omit unknown). */
  function pctDefined(predicate, isDefined) {
    const subset = factsArr.filter(isDefined);
    if (subset.length === 0) return null;
    return (subset.filter(predicate).length / subset.length) * 100;
  }
  if (factsArr.length) {
    if (mergedOpt.scored_first_pct == null) {
      const v = pctDefined((f) => f.scored_first === true, (f) => typeof f.scored_first === "boolean");
      if (v != null) mergedOpt.scored_first_pct = v;
    }
    if (mergedOpt.leading_ht_pct == null) {
      const v = pctDefined((f) => f.leading_ht === true, (f) => typeof f.leading_ht === "boolean");
      if (v != null) mergedOpt.leading_ht_pct = v;
    }
    if (mergedOpt.conceded_first_pct == null) {
      const v = pctDefined((f) => f.conceded_first === true, (f) => typeof f.conceded_first === "boolean");
      if (v != null) mergedOpt.conceded_first_pct = v;
    }
    if (mergedOpt.comeback_wins_pct == null) {
      const v = pctDefined((f) => f.comeback_win === true, (f) => typeof f.comeback_win === "boolean");
      if (v != null) mergedOpt.comeback_wins_pct = v;
    }
  }

  setNum("goals_for_per_game", n ? s.goals_for_per_game : null);
  setNum("goals_against_per_game", n ? s.goals_against_per_game : null);
  setNum("failed_to_score_pct", s.failed_to_score_pct);
  setNum("clean_sheet_pct", s.clean_sheets_pct);

  setNum("shots_per_game", s.shots_for_avg);
  setNum("shots_conceded_per_game", s.shots_against_avg);

  const sotForPg =
    s.shots_on_target_for_avg != null && Number.isFinite(Number(s.shots_on_target_for_avg))
      ? Number(s.shots_on_target_for_avg)
      : null;
  const sotAgPg =
    s.shots_on_target_against_avg != null && Number.isFinite(Number(s.shots_on_target_against_avg))
      ? Number(s.shots_on_target_against_avg)
      : null;
  setNum("shots_on_target_per_game", sotForPg);
  setNum("shots_on_target_conceded_per_game", sotAgPg);

  const gfpg =
    s.goals_for_per_game != null && Number.isFinite(Number(s.goals_for_per_game))
      ? Number(s.goals_for_per_game)
      : null;
  const gapg =
    s.goals_against_per_game != null && Number.isFinite(Number(s.goals_against_per_game))
      ? Number(s.goals_against_per_game)
      : null;
  const sfa = s.shots_for_avg != null && Number.isFinite(Number(s.shots_for_avg)) ? Number(s.shots_for_avg) : null;
  const saa =
    s.shots_against_avg != null && Number.isFinite(Number(s.shots_against_avg))
      ? Number(s.shots_against_avg)
      : null;
  setNum("shots_per_goal", safeDiv(sfa, gfpg));
  setNum("shots_on_target_per_goal", safeDiv(sotForPg, gfpg));
  setNum("shots_conceded_per_goal_allowed", safeDiv(saa, gapg));
  setNum("shots_on_target_conceded_per_goal_allowed", safeDiv(sotAgPg, gapg));

  if (n && s.failed_to_score_pct != null) {
    values.team_scored_0_5_plus_pct = Number((100 - s.failed_to_score_pct).toFixed(4));
  } else {
    values.team_scored_0_5_plus_pct = null;
  }

  if (factsArr.length) {
    const ge2 = factsArr.filter((f) => Number(f.goals_for) >= 2).length;
    setNum("team_scored_1_5_plus_pct", (ge2 / factsArr.length) * 100);
  } else {
    values.team_scored_1_5_plus_pct = null;
  }

  if (n && s.clean_sheets_pct != null) {
    values.conceded_at_least_one_pct = Number((100 - s.clean_sheets_pct).toFixed(4));
  } else {
    values.conceded_at_least_one_pct = null;
  }

  const gcs = factsArr.map((f) => Number(f.goals_against)).filter(Number.isFinite);
  const gsd = variancePop(gcs);
  setNum("goals_conceded_stddev", gsd != null ? Math.sqrt(gsd) : null);

  const gfs = factsArr.map((f) => Number(f.goals_for)).filter(Number.isFinite);
  const gsv = variancePop(gfs);
  setNum("goals_scored_stddev", gsv != null ? Math.sqrt(gsv) : null);

  setNum("xg_per_game", mergedOpt.xg_per_game ?? null);
  setNum("xga_per_game", mergedOpt.xga_per_game ?? null);

  const hasFactResults =
    factsArr.length > 0 &&
    factsArr.every((f) => f.result === "W" || f.result === "D" || f.result === "L");
  if (hasFactResults) {
    const nn = factsArr.length;
    const w = factsArr.filter((f) => f.result === "W").length;
    const d = factsArr.filter((f) => f.result === "D").length;
    setNum("win_rate", (w / nn) * 100);
    setNum("draw_rate", (d / nn) * 100);
    setNum("points_per_game", (w * 3 + d) / nn);
  } else {
    setNum(
      "win_rate",
      n && s.won != null && Number.isFinite(Number(s.won)) ? (Number(s.won) / n) * 100 : null
    );
    setNum(
      "points_per_game",
      n && s.points != null && Number.isFinite(Number(s.points)) ? Number(s.points) / n : null
    );
    setNum(
      "draw_rate",
      n && s.drew != null && Number.isFinite(Number(s.drew)) ? (Number(s.drew) / n) * 100 : null
    );
  }

  if (factsArr.length) {
    const wtn = factsArr.filter((f) => f.won && f.clean_sheet).length;
    setNum("wins_to_nil_pct", (wtn / factsArr.length) * 100);
  } else {
    values.wins_to_nil_pct = null;
  }

  setNum("scored_first_pct", mergedOpt.scored_first_pct ?? null);
  setNum("leading_ht_pct", mergedOpt.leading_ht_pct ?? null);
  setNum("comeback_wins_pct", mergedOpt.comeback_wins_pct ?? null);
  setNum("conceded_first_pct", mergedOpt.conceded_first_pct ?? null);

  if (factsArr.length >= 2) {
    const btts = factsArr.map((f) => (f.btts ? 1 : 0));
    setNum("btts_rate_variance", variancePop(btts));
    const o25 = factsArr.map((f) => (f.over_25 ? 1 : 0));
    setNum("over_25_rate_variance", variancePop(o25));
    const csB = factsArr.map((f) => (f.clean_sheet ? 1 : 0));
    setNum("clean_sheet_freq_variance", variancePop(csB));
    const ftsB = factsArr.map((f) => (Number(f.goals_for) === 0 ? 1 : 0));
    setNum("failed_to_score_freq_variance", variancePop(ftsB));
  } else {
    values.btts_rate_variance = null;
    values.over_25_rate_variance = null;
    values.clean_sheet_freq_variance = null;
    values.failed_to_score_freq_variance = null;
  }

  if (factsArr.length >= 2) {
    const counts = { W: 0, D: 0, L: 0 };
    for (const f of factsArr) {
      if (f.result === "W") counts.W++;
      else if (f.result === "D") counts.D++;
      else counts.L++;
    }
    const p = [counts.W, counts.D, counts.L].map((c) => c / factsArr.length);
    let h = 0;
    for (const pi of p) {
      if (pi > 0) h -= pi * Math.log(pi + 1e-12);
    }
    const hMax = Math.log(3);
    values.result_entropy_norm = hMax > 0 ? Number((h / hMax).toFixed(6)) : null;
  } else {
    values.result_entropy_norm = null;
  }

  setNum("fouls_committed_per_game", s.fouls_for_avg);
  setNum("fouls_suffered_per_game", s.fouls_against_avg);
  setNum("yellow_cards_per_game", s.yellow_cards_for_avg);
  setNum("red_cards_per_game", s.red_cards_for_avg);

  setNum(
    "saves_per_game",
    mergedOpt.saves_per_game != null && Number.isFinite(Number(mergedOpt.saves_per_game))
      ? Number(mergedOpt.saves_per_game)
      : null
  );
  setNum(
    "save_rate",
    mergedOpt.save_rate != null && Number.isFinite(Number(mergedOpt.save_rate))
      ? Number(mergedOpt.save_rate)
      : null
  );
  setNum("goals_conceded_per_shot_on_target_faced", safeDiv(gapg, sotAgPg));

  const available_features = [];
  const missing_features = [];
  for (const key of ALL_FEATURE_KEYS) {
    const v = values[key];
    if (v != null && Number.isFinite(v)) available_features.push(key);
    else missing_features.push(key);
  }

  return { values, available_features, missing_features };
}

export { ALL_FEATURE_KEYS };

/**
 * Data quality bucket from coverage of advanced inputs.
 */
export function classifyDataQuality(available, played) {
  const set = new Set(available);
  const hasShots = ["shots_per_game", "shots_conceded_per_game"].every((k) => set.has(k));
  const hasCards = ["yellow_cards_per_game", "fouls_committed_per_game"].some((k) => set.has(k));
  const hasXg = set.has("xg_per_game") && set.has("xga_per_game");
  const hasGk = set.has("save_rate") || set.has("saves_per_game");

  if (!Number.isFinite(played) || played < 3) return "D";
  if (!hasShots && played < 8) return "D";
  if (!hasShots) return "C";
  if (hasShots && hasCards && (hasXg || hasGk)) return "A";
  if (hasShots && hasCards) return "B";
  if (hasShots) return "B";
  return "C";
}
