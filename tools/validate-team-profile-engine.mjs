#!/usr/bin/env node
/**
 * Deterministic checks for Team Profile engine v1 (no network).
 */
import assert from "node:assert/strict";
import { computeTeamProfileV1, weightedScoreReweighted, varianceSampleFactor } from "./lib/team-profile-engine.mjs";

function mkSplit(o) {
  const played = o.played;
  return {
    played,
    won: o.won,
    drew: o.drew,
    lost: o.lost,
    points: o.points,
    goals_for: o.goals_for,
    goals_against: o.goals_against,
    goal_diff: o.goals_for - o.goals_against,
    goals_for_per_game: o.goals_for / played,
    goals_against_per_game: o.goals_against / played,
    failed_to_score_pct: o.failed_to_score_pct,
    clean_sheets_pct: o.clean_sheets_pct,
    shots_for_total: o.shots_for_total,
    shots_against_total: o.shots_against_total,
    shots_on_target_for_total: o.shots_on_target_for_total,
    shots_on_target_against_total: o.shots_on_target_against_total,
    shots_for_avg: o.shots_for_avg,
    shots_against_avg: o.shots_against_avg,
    fouls_for_avg: o.fouls_for_avg,
    fouls_against_avg: o.fouls_against_avg,
    yellow_cards_for_avg: o.yellow_cards_for_avg,
    red_cards_for_avg: o.red_cards_for_avg,
  };
}

function mkFacts(n, jitter = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const gf = 1 + ((i + jitter) % 3);
    const ga = (i + jitter) % 2;
    const won = gf > ga;
    const drew = gf === ga;
    out.push({
      goals_for: gf,
      goals_against: ga,
      btts: gf > 0 && ga > 0,
      over_25: gf + ga > 2.5,
      won,
      drew,
      lost: !won && !drew,
      clean_sheet: ga === 0,
      result: won ? "W" : drew ? "D" : "L",
    });
  }
  return out;
}

function assertScoresRange(obj) {
  for (const v of Object.values(obj.scores)) {
    if (v == null) continue;
    assert.ok(v >= 0 && v <= 100, `score out of range: ${v}`);
  }
}

// --- weightedScoreReweighted: drop missing, renormalize ---
assert.equal(
  weightedScoreReweighted({ a: 80, b: null, c: 60 }, { a: 0.5, b: 0.25, c: 0.25 }),
  (80 * 0.5 + 60 * 0.25) / 0.75
);

// --- variance sample factor ---
assert.ok(varianceSampleFactor(2) < varianceSampleFactor(10));

const played = 12;
const base = {
  played,
  won: 6,
  drew: 3,
  lost: 3,
  points: 21,
  goals_for: 18,
  goals_against: 12,
  failed_to_score_pct: 8.33,
  clean_sheets_pct: 33.33,
  shots_for_total: 144,
  shots_against_total: 120,
  shots_on_target_for_total: 54,
  shots_on_target_against_total: 45,
  shots_for_avg: 12,
  shots_against_avg: 10,
  fouls_for_avg: 11,
  fouls_against_avg: 10.5,
  yellow_cards_for_avg: 2.1,
  red_cards_for_avg: 0.08,
};

const t1 = { team_id: 1, splitStats: mkSplit(base), facts: mkFacts(played, 0) };
const t2 = {
  team_id: 2,
  splitStats: mkSplit({
    ...base,
    goals_for: 10,
    goals_against: 20,
    points: 12,
    won: 2,
    drew: 6,
    lost: 4,
    shots_for_total: 100,
    shots_against_total: 150,
    shots_on_target_for_total: 35,
    shots_on_target_against_total: 55,
    shots_for_avg: 100 / played,
    shots_against_avg: 150 / played,
    failed_to_score_pct: 25,
    clean_sheets_pct: 16.67,
  }),
  facts: mkFacts(played, 1),
};
const t3 = {
  team_id: 3,
  splitStats: mkSplit({
    ...base,
    goals_for: 24,
    goals_against: 8,
    points: 27,
    won: 8,
    drew: 3,
    lost: 1,
    shots_for_total: 180,
    shots_against_total: 90,
    shots_on_target_for_total: 70,
    shots_on_target_against_total: 30,
    shots_for_avg: 15,
    shots_against_avg: 7.5,
    failed_to_score_pct: 0,
    clean_sheets_pct: 50,
  }),
  facts: mkFacts(played, 2),
};

const out = computeTeamProfileV1({
  team_id: 1,
  competition_id: 39,
  season: 2025,
  split: "total",
  target: t1,
  cohort: [t1, t2, t3],
});

assertScoresRange(out);
assert.equal(out.meta.engine_version, "v1");
assert.equal(out.meta.normalization_method, "winsorized_percentile_v1");
assert.ok(out.scores.attack != null);
assert.ok(out.components?.attack?.production != null);

// Cohort too small
const tiny = computeTeamProfileV1({
  team_id: 1,
  competition_id: 39,
  season: 2025,
  split: "home",
  target: t1,
  cohort: [t1],
});
assert.equal(tiny.scores.overall, null);
assert.equal(tiny.meta.error, "cohort_too_small_for_normalization");

// Missing xG: still runs
const noXg = computeTeamProfileV1({
  team_id: 2,
  competition_id: 39,
  season: 2025,
  split: "total",
  target: { ...t2, optional: {} },
  cohort: [t1, t2, t3],
});
assertScoresRange(noXg);

// Goalkeeper uses SoT path when saves_total provided
const gk = computeTeamProfileV1({
  team_id: 3,
  competition_id: 39,
  season: 2025,
  split: "total",
  target: {
    ...t3,
    optional: { saves_total: 80 },
  },
  cohort: [t1, t2, { ...t3, optional: { saves_total: 70 } }],
});
assert.ok(gk.scores.goalkeeper != null);

console.log("validate-team-profile-engine: OK");
