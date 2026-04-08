#!/usr/bin/env node
/**
 * Validation report for data/preview/brasileirao/profile-finished-matches.json
 * (Brasileirão league_id 71 — real fixtures only for production gate).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { deriveTeamProfileFeatures } from "./lib/team-profile-features.mjs";
import { computeTeamProfileV1 } from "./lib/team-profile-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const PROFILE_PATH = path.join(root, "data/preview/brasileirao/profile-finished-matches.json");
const TEAM_STATS_PATH = path.join(root, "data/preview/brasileirao/team-stats.json");

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function rowsToFacts(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const gf = Number(r.gf);
    const ga = Number(r.ga);
    const res = r.result === "W" || r.result === "D" || r.result === "L" ? r.result : "L";
    const o = {
      goals_for: gf,
      goals_against: ga,
      btts: gf > 0 && ga > 0,
      over_25: gf + ga > 2,
      result: res,
      won: res === "W",
      clean_sheet: ga === 0,
    };
    if (typeof r.scored_first === "boolean") o.scored_first = r.scored_first;
    if (typeof r.leading_ht === "boolean") o.leading_ht = r.leading_ht;
    if (typeof r.conceded_first === "boolean") o.conceded_first = r.conceded_first;
    if (typeof r.comeback_win === "boolean") o.comeback_win = r.comeback_win;
    return o;
  });
}

function previewRowToCohortInput(teamId, previewStatsDoc, splitKey, finishedMatchesDoc) {
  const tid = Number(teamId);
  const row = previewStatsDoc.teams.find((r) => Number(r?.identity?.team_id) === tid);
  const sk = String(splitKey || "total").toLowerCase();
  const isTotal = sk === "total";
  const key = String(tid);
  const blockFm = finishedMatchesDoc?.by_team_id?.[key];
  const rawFinished = Array.isArray(blockFm?.[sk]) ? blockFm[sk] : [];
  const facts = rowsToFacts(rawFinished);

  if (!row) return { team_id: tid, splitStats: { played: 0 }, facts, optional: {} };

  const block = isTotal
    ? { totals: row.totals || {}, counts: row.counts || {}, rates: row.rates || {} }
    : row.splits?.[sk]
      ? {
          totals: row.splits[sk].totals || {},
          counts: row.splits[sk].counts || {},
          rates: row.splits[sk].rates || {},
        }
      : { totals: {}, counts: {}, rates: {} };

  const n = Number(block.counts?.matches);
  const played = Number.isFinite(n) && n > 0 ? n : 0;
  const disc = sk === "total" ? row.discipline : row.discipline?.splits?.[sk];
  const gk = sk === "total" ? row.goalkeeper : row.goalkeeper?.splits?.[sk];
  const ypg = disc?.rates?.yellow_cards_per_game;
  const rpg = disc?.rates?.red_cards_per_game;
  const optional = {};
  if (gk?.rates?.saves_per_game != null) optional.saves_per_game = Number(gk.rates.saves_per_game);
  if (gk?.rates?.save_pct != null) {
    const p = Number(gk.rates.save_pct);
    optional.save_rate = p <= 1 ? p : p / 100;
  }

  return {
    team_id: tid,
    splitStats: {
      played,
      won: null,
      drew: null,
      lost: null,
      points: null,
      goals_for: null,
      goals_against: null,
      goals_for_per_game:
        block.rates?.goals_for_per_game != null ? Number(block.rates.goals_for_per_game) : null,
      goals_against_per_game:
        block.rates?.goals_against_per_game != null ? Number(block.rates.goals_against_per_game) : null,
      failed_to_score_pct:
        block.rates?.failed_to_score_pct != null ? Number(block.rates.failed_to_score_pct) : null,
      clean_sheets_pct: block.rates?.clean_sheets_pct != null ? Number(block.rates.clean_sheets_pct) : null,
      shots_for_avg: null,
      shots_against_avg: null,
      yellow_cards_for_avg: ypg != null ? Number(ypg) : null,
      red_cards_for_avg: rpg != null ? Number(rpg) : null,
    },
    facts,
    optional,
  };
}

function main() {
  if (!fs.existsSync(PROFILE_PATH)) {
    console.log("FAIL: missing " + PROFILE_PATH);
    console.log("\nDEPLOYMENT: BLOCKED (no profile-finished-matches.json)");
    process.exit(1);
  }

  const doc = loadJson(PROFILE_PATH);
  const schema = String(doc?.meta?.schema || "").trim();
  const integrity = String(doc?.meta?.data_integrity || "").trim();

  console.log("=== Profile finished-matches validation (Brasileirão) ===\n");

  console.log("## 1. Schema / integrity");
  console.log(`  schema: ${schema || "(missing)"}`);
  console.log(`  data_integrity: ${integrity || "(not set)"}`);
  console.log(`  league_id: ${doc?.meta?.league_id}`);
  console.log(`  season: ${doc?.meta?.season}`);

  let fail = false;
  if (schema !== "preview_brasileirao_profile_finished_matches_v2") {
    console.log("\n  FAIL: expected schema preview_brasileirao_profile_finished_matches_v2 (v1 = legacy synthetic pipeline).");
    fail = true;
  }
  if (integrity !== "real_fixtures_only") {
    console.log("\n  FAIL: expected meta.data_integrity = real_fixtures_only");
    fail = true;
  }

  const by = doc.by_team_id && typeof doc.by_team_id === "object" ? doc.by_team_id : {};
  const teamIds = Object.keys(by).sort((a, b) => Number(a) - Number(b));
  console.log(`\n## 2. Coverage`);
  console.log(`  teams in by_team_id: ${teamIds.length}`);

  const perTeam = teamIds.map((id) => {
    const b = by[id];
    const total = Array.isArray(b?.total) ? b.total.length : 0;
    const home = Array.isArray(b?.home) ? b.home.length : 0;
    const away = Array.isArray(b?.away) ? b.away.length : 0;
    return { id, total, home, away };
  });
  for (const p of perTeam.slice(0, 5)) {
    console.log(`  sample team ${p.id}: total=${p.total} home=${p.home} away=${p.away}`);
  }
  if (perTeam.length > 5) console.log(`  … ${perTeam.length - 5} more teams`);

  console.log(`\n## 3. Row shape (fixture_id required)`);
  let badRow = 0;
  for (const p of perTeam) {
    for (const row of by[p.id].total || []) {
      if (!Number.isFinite(Number(row?.fixture_id))) badRow++;
      if (!(row?.result === "W" || row?.result === "D" || row?.result === "L")) badRow++;
    }
  }
  if (badRow > 0) {
    console.log(`  FAIL: ${badRow} row issues (missing fixture_id or result)`);
    fail = true;
  } else {
    console.log(`  OK: all total rows have fixture_id + result`);
  }

  for (const p of perTeam) {
    const t = by[p.id].total?.length ?? 0;
    const h = by[p.id].home?.length ?? 0;
    const a = by[p.id].away?.length ?? 0;
    if (h + a !== t) {
      console.log(`  FAIL: team ${p.id} home+away (${h}+${a}) != total (${t})`);
      fail = true;
    }
  }

  let previewStats = null;
  if (fs.existsSync(TEAM_STATS_PATH)) {
    previewStats = loadJson(TEAM_STATS_PATH);
  }

  if (previewStats?.teams?.length) {
    console.log(`\n## 4. Align vs team-stats (matches count, total split)`);
    let alignOk = true;
    for (const row of previewStats.teams) {
      const tid = Number(row?.identity?.team_id);
      if (!Number.isFinite(tid)) continue;
      const m = Number(row?.counts?.matches);
      const prof = by[String(tid)]?.total?.length;
      if (Number.isFinite(m) && m !== prof) {
        console.log(`  FAIL: team ${tid} team-stats matches=${m} profile total rows=${prof}`);
        fail = true;
        alignOk = false;
      }
    }
    if (alignOk) console.log(`  OK: profile row counts match team-stats.matches per team`);
  } else {
    console.log(`\n## 4. Skipped (no team-stats.json)`);
  }

  console.log(`\n## 5. Feature & pillar availability (total split)`);
  let withCtlRate = 0;
  let withControlPillar = 0;
  let withConsistencyPillar = 0;
  const pt = previewStats?.teams || [];
  const nTeams = pt.length || teamIds.length;
  const cohortTotal = pt.length
    ? pt.map((r) => previewRowToCohortInput(r.identity.team_id, previewStats, "total", doc))
    : [];
  for (const row of pt) {
    const tid = Number(row?.identity?.team_id);
    if (!Number.isFinite(tid)) continue;
    const target = previewRowToCohortInput(tid, previewStats, "total", doc);
    const feats = deriveTeamProfileFeatures(target.splitStats, target.facts, target.optional);
    const ctls = ["scored_first_pct", "leading_ht_pct", "conceded_first_pct", "comeback_wins_pct"];
    const ctlOk = ctls.some((k) => feats.values[k] != null && Number.isFinite(feats.values[k]));
    if (ctlOk) withCtlRate++;
    const prof = computeTeamProfileV1({
      team_id: tid,
      competition_id: 71,
      season: Number(doc.meta?.season) || 2026,
      split: "total",
      target,
      cohort: cohortTotal,
    });
    if (prof.scores?.control != null && Number.isFinite(prof.scores.control)) withControlPillar++;
    if (prof.scores?.consistency != null && Number.isFinite(prof.scores.consistency)) withConsistencyPillar++;
  }
  if (pt.length) {
    console.log(
      `  teams with ≥1 control rate from real match flags: ${withCtlRate} / ${nTeams} (${((withCtlRate / nTeams) * 100).toFixed(1)}%)`
    );
    console.log(
      `  teams with numeric Control pillar: ${withControlPillar} / ${nTeams} (${((withControlPillar / nTeams) * 100).toFixed(1)}%)`
    );
    console.log(
      `  teams with numeric Consistency pillar: ${withConsistencyPillar} / ${nTeams} (${((withConsistencyPillar / nTeams) * 100).toFixed(1)}%)`
    );
  } else {
    console.log("  (skipped — no team-stats.json)");
  }

  console.log(`\n## 6. Sample teams (raw rows → features excerpt)`);
  const sampleIds = [118, 121, 127].filter((id) => by[String(id)]);
  for (const sid of sampleIds.slice(0, 3)) {
    const rows = by[String(sid)].total?.slice(0, 3) || [];
    console.log(`\n  Team ${sid} — first ${rows.length} fixtures (raw):`);
    for (const r of rows) console.log(`    ${JSON.stringify(r)}`);
    if (previewStats?.teams?.length) {
      const target = previewRowToCohortInput(sid, previewStats, "total", doc);
      const feats = deriveTeamProfileFeatures(target.splitStats, target.facts, target.optional);
      console.log(
        `  derived (subset): scored_first_pct=${feats.values.scored_first_pct ?? "null"}, leading_ht_pct=${feats.values.leading_ht_pct ?? "null"}`
      );
      const cohort = previewStats.teams.map((r) =>
        previewRowToCohortInput(r.identity.team_id, previewStats, "total", doc)
      );
      const prof = computeTeamProfileV1({
        team_id: sid,
        competition_id: 71,
        season: Number(doc.meta?.season) || 2026,
        split: "total",
        target,
        cohort,
      });
      console.log(
        `  profile scores: overall=${prof.scores?.overall ?? "null"} control=${prof.scores?.control ?? "null"} consistency=${prof.scores?.consistency ?? "null"}`
      );
    }
  }

  console.log(`\n=== Summary ===`);
  if (fail) {
    console.log("DEPLOYMENT: BLOCKED (see FAIL lines above)");
    process.exit(1);
  }
  console.log("Synthetic / v1 pipeline: rejected by schema gate.");
  console.log("DEPLOYMENT: READY FOR PRODUCTION (subject to your API/data freshness checks)");
}

main();
