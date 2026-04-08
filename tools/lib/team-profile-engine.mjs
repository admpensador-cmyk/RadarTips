/**
 * Team Profile calculation engine v1.
 * Scoped to competition + season + split (total | home | away).
 * No cross-competition profiles in v1.
 */

import {
  deriveTeamProfileFeatures,
  classifyDataQuality,
} from "./team-profile-features.mjs";
import { winsorizedPercentileScore, NORMALIZATION_METHOD_ID } from "./team-profile-normalization.mjs";

export const ENGINE_VERSION = "v1";

/**
 * Dynamic reweight: combine weighted components skipping nulls; weights renormalized.
 * @param {Record<string, number|null|undefined>} values
 * @param {Record<string, number>} weights — should sum to 1 for full availability
 * @returns {number|null}
 */
export function weightedScoreReweighted(values, weights) {
  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (w <= 0) continue;
    const v = values[k];
    if (v == null || !Number.isFinite(v)) continue;
    num += v * w;
    den += w;
  }
  if (den <= 0) return null;
  return num / den;
}

/** Normalize one feature key against cohort list of feature bags. */
function nKey(value, cohortBags, key, higherIsBetter) {
  const cohort = cohortBags.map((b) => b.values[key]).filter((x) => Number.isFinite(x));
  if (value == null || !Number.isFinite(value)) return null;
  return winsorizedPercentileScore(value, cohort, { higherIsBetter });
}

/** @param {import('./team-profile-features.mjs').TeamProfileOptionalDerived} o */
function derivedSaveRate(splitStats, optional) {
  if (optional?.save_rate != null && Number.isFinite(optional.save_rate)) return optional.save_rate;
  const s = optional?.saves_total;
  const sot = splitStats?.shots_on_target_against_total;
  if (s != null && Number.isFinite(s) && sot != null && sot > 0) return s / sot;
  return null;
}

/**
 * Low-sample dampening for variance-based signals (deterministic).
 * @param {number} played
 */
export function varianceSampleFactor(played) {
  const n = Number(played);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 3) return 0.25;
  if (n >= 10) return 1;
  return 0.25 + (0.75 * (n - 3)) / 7;
}

/**
 * @typedef {{
 *   team_id: number,
 *   splitStats: object,
 *   facts?: object[],
 *   optional?: import('./team-profile-features.mjs').TeamProfileOptionalDerived & { saves_total?: number },
 * }} CohortTeamInput
 *
 * @typedef {{
 *   team_id: number,
 *   competition_id: number,
 *   season: number,
 *   split: 'total'|'home'|'away',
 *   target: CohortTeamInput,
 *   cohort: CohortTeamInput[],
 * }} TeamProfileEngineInput
 */

/**
 * @param {TeamProfileEngineInput} input
 * @returns {object} canonical profile contract
 */
export function computeTeamProfileV1(input) {
  const split = String(input?.split || "").toLowerCase();
  if (!["total", "home", "away"].includes(split)) {
    throw new Error(`computeTeamProfileV1: invalid split "${input?.split}"`);
  }
  const competitionId = Number(input.competition_id);
  const season = Number(input.season);
  const teamId = Number(input.team_id);
  if (![competitionId, season, teamId].every((x) => Number.isFinite(x))) {
    throw new Error("computeTeamProfileV1: team_id, competition_id, season must be finite numbers");
  }

  const targetIn = input.target;
  if (!targetIn?.splitStats) {
    throw new Error("computeTeamProfileV1: target.splitStats required");
  }

  const opt = { ...targetIn.optional };
  if (opt.save_rate == null && opt.saves_total != null) {
    opt.save_rate = derivedSaveRate(targetIn.splitStats, opt);
  }

  const targetBag = deriveTeamProfileFeatures(targetIn.splitStats, targetIn.facts || [], opt);

  const cohortById = new Map();
  for (const c of Array.isArray(input.cohort) ? input.cohort : []) {
    const id = Number(c.team_id);
    if (Number.isFinite(id)) cohortById.set(id, c);
  }
  cohortById.set(teamId, targetIn);
  const cohortTeams = [...cohortById.values()];

  const cohortBags = cohortTeams.map((c) =>
    deriveTeamProfileFeatures(
      c.splitStats,
      c.facts || [],
      c.optional ? { ...c.optional } : {}
    )
  );

  if (cohortBags.length < 2) {
    return {
      scores: {
        overall: null,
        attack: null,
        defense: null,
        control: null,
        consistency: null,
        aggressiveness: null,
        goalkeeper: null,
      },
      components: null,
      data_quality: "D",
      available_features: targetBag.available_features,
      missing_features: targetBag.missing_features,
      meta: {
        competition_id: competitionId,
        season,
        split,
        engine_version: ENGINE_VERSION,
        normalization_method: NORMALIZATION_METHOD_ID,
        matches_played: targetIn.splitStats.played ?? 0,
        error: "cohort_too_small_for_normalization",
      },
    };
  }

  const played = Number(targetIn.splitStats.played) || 0;
  const vDamp = varianceSampleFactor(played);

  const V = targetBag.values;

  const n = (key, hi) => nKey(V[key], cohortBags, key, hi);

  // --- Attack pillars (0–100 normalized sub-scores) ---
  const attackProduction = weightedScoreReweighted(
    {
      a: n("goals_for_per_game", true),
      b: n("xg_per_game", true),
    },
    { a: 0.6, b: 0.4 }
  );
  const attackVolume = weightedScoreReweighted(
    {
      a: n("shots_per_game", true),
      b: n("shots_on_target_per_game", true),
    },
    { a: 0.5, b: 0.5 }
  );
  const attackEfficiency = weightedScoreReweighted(
    {
      a: n("shots_per_goal", false),
      b: n("shots_on_target_per_goal", false),
      c: n("failed_to_score_pct", false),
    },
    { a: 0.35, b: 0.35, c: 0.3 }
  );
  const attackConsistencyPillar = weightedScoreReweighted(
    {
      a: n("team_scored_0_5_plus_pct", true),
      b: n("team_scored_1_5_plus_pct", true),
    },
    { a: 0.5, b: 0.5 }
  );

  const attack = weightedScoreReweighted(
    {
      production: attackProduction,
      volume: attackVolume,
      efficiency: attackEfficiency,
      consistency: attackConsistencyPillar,
    },
    { production: 0.3, volume: 0.3, efficiency: 0.25, consistency: 0.15 }
  );

  // --- Defense ---
  const defGoalPrev = weightedScoreReweighted(
    {
      a: n("goals_against_per_game", false),
      b: n("xga_per_game", false),
      c: n("clean_sheet_pct", true),
    },
    { a: 0.4, b: 0.35, c: 0.25 }
  );
  const defVolSup = weightedScoreReweighted(
    {
      a: n("shots_conceded_per_game", false),
      b: n("shots_on_target_conceded_per_game", false),
    },
    { a: 0.5, b: 0.5 }
  );
  const defResistance = weightedScoreReweighted(
    {
      a: n("shots_conceded_per_goal_allowed", false),
      b: n("shots_on_target_conceded_per_goal_allowed", false),
    },
    { a: 0.5, b: 0.5 }
  );
  const defStd = weightedScoreReweighted(
    {
      a: n("goals_conceded_stddev", false),
      b: n("conceded_at_least_one_pct", false),
    },
    { a: 0.55, b: 0.45 }
  );

  const defense = weightedScoreReweighted(
    {
      goal_prevention: defGoalPrev,
      volume_suppression: defVolSup,
      resistance: defResistance,
      consistency: defStd,
    },
    { goal_prevention: 0.3, volume_suppression: 0.3, resistance: 0.25, consistency: 0.15 }
  );

  // --- Control ---
  const ctlState = weightedScoreReweighted(
    {
      a: n("scored_first_pct", true),
      b: n("leading_ht_pct", true),
      c: n("conceded_first_pct", false),
    },
    { a: 0.4, b: 0.35, c: 0.25 }
  );
  const ctlResult = weightedScoreReweighted(
    {
      a: n("win_rate", true),
      b: n("points_per_game", true),
      c: n("wins_to_nil_pct", true),
    },
    { a: 0.4, b: 0.4, c: 0.2 }
  );
  const ctlMgmt = weightedScoreReweighted(
    {
      a: n("comeback_wins_pct", true),
      b: n("draw_rate", false),
    },
    { a: 0.55, b: 0.45 }
  );

  const control = weightedScoreReweighted(
    {
      game_state: ctlState,
      result_conversion: ctlResult,
      game_management: ctlMgmt,
    },
    { game_state: 0.4, result_conversion: 0.35, game_management: 0.25 }
  );

  // --- Consistency (top-level) ---
  let offStab = n("goals_scored_stddev", false);
  let defStab = n("goals_conceded_stddev", false);
  if (offStab != null) offStab = 50 + (offStab - 50) * vDamp;
  if (defStab != null) defStab = 50 + (defStab - 50) * vDamp;

  const evtReg = weightedScoreReweighted(
    {
      a: n("btts_rate_variance", false),
      b: n("over_25_rate_variance", false),
      c: n("result_entropy_norm", false),
      d: n("clean_sheet_freq_variance", false),
      e: n("failed_to_score_freq_variance", false),
    },
    { a: 0.2, b: 0.2, c: 0.2, d: 0.2, e: 0.2 }
  );
  let evtRegAdj = evtReg;
  if (evtRegAdj != null) evtRegAdj = 50 + (evtRegAdj - 50) * vDamp;

  const consistency = weightedScoreReweighted(
    {
      offensive_stability: offStab,
      defensive_stability: defStab,
      event_regularity: evtRegAdj,
    },
    { offensive_stability: 0.35, defensive_stability: 0.35, event_regularity: 0.3 }
  );

  // --- Aggressiveness (identity: more = higher score) ---
  const aggressiveness = weightedScoreReweighted(
    {
      fouls_committed: n("fouls_committed_per_game", true),
      yellow_cards: n("yellow_cards_per_game", true),
      fouls_suffered: n("fouls_suffered_per_game", true),
      red_cards: n("red_cards_per_game", true),
    },
    { fouls_committed: 0.35, yellow_cards: 0.25, fouls_suffered: 0.2, red_cards: 0.2 }
  );

  // --- Goalkeeper (SoT-centric) ---
  const gk = weightedScoreReweighted(
    {
      save_rate: n("save_rate", true),
      saves_pg: n("saves_per_game", true),
      gc_per_sot: n("goals_conceded_per_shot_on_target_faced", false),
      clean_sheet: n("clean_sheet_pct", true),
    },
    { save_rate: 0.4, saves_pg: 0.25, gc_per_sot: 0.2, clean_sheet: 0.15 }
  );

  const clamp = (x) => {
    if (x == null || !Number.isFinite(x)) return null;
    return Math.min(100, Math.max(0, Number(x.toFixed(2))));
  };

  let overall = weightedScoreReweighted(
    {
      attack,
      defense,
      consistency,
      control,
    },
    { attack: 0.3, defense: 0.3, consistency: 0.2, control: 0.2 }
  );

  if (overall != null && consistency != null) {
    if (consistency < 40) overall *= 0.85;
    if (consistency > 75) overall += 3;
    if (attack != null && defense != null && Math.abs(attack - defense) > 25) overall -= 2;
  }

  const dataQuality = classifyDataQuality(targetBag.available_features, played);

  const scores = {
    overall: clamp(overall),
    attack: clamp(attack),
    defense: clamp(defense),
    control: clamp(control),
    consistency: clamp(consistency),
    aggressiveness: clamp(aggressiveness),
    goalkeeper: clamp(gk),
  };

  const components = {
    attack: {
      production: clamp(attackProduction),
      volume: clamp(attackVolume),
      efficiency: clamp(attackEfficiency),
      consistency: clamp(attackConsistencyPillar),
    },
    defense: {
      goal_prevention: clamp(defGoalPrev),
      volume_suppression: clamp(defVolSup),
      resistance: clamp(defResistance),
      consistency: clamp(defStd),
    },
    control: {
      game_state_control: clamp(ctlState),
      result_conversion: clamp(ctlResult),
      game_management: clamp(ctlMgmt),
    },
    consistency: {
      offensive_stability: clamp(offStab),
      defensive_stability: clamp(defStab),
      event_regularity: clamp(evtRegAdj),
    },
    aggressiveness: {
      fouls_committed: clamp(n("fouls_committed_per_game", true)),
      yellow_cards: clamp(n("yellow_cards_per_game", true)),
      fouls_suffered: clamp(n("fouls_suffered_per_game", true)),
      red_cards: clamp(n("red_cards_per_game", true)),
    },
    goalkeeper: {
      save_rate: clamp(n("save_rate", true)),
      saves_per_game: clamp(n("saves_per_game", true)),
      goals_conceded_per_sot: clamp(n("goals_conceded_per_shot_on_target_faced", false)),
      clean_sheet_context: clamp(n("clean_sheet_pct", true)),
    },
  };

  return {
    scores,
    components,
    data_quality: dataQuality,
    available_features: targetBag.available_features,
    missing_features: targetBag.missing_features,
    meta: {
      competition_id: competitionId,
      season,
      split,
      engine_version: ENGINE_VERSION,
      normalization_method: NORMALIZATION_METHOD_ID,
      matches_played: played,
      variance_sample_factor: Number(vDamp.toFixed(4)),
    },
  };
}
