import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { computeTeamProfileV1 } from "./lib/team-profile-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function previewRowToCohortInput(teamId, previewStatsDoc, splitKey, finishedMatchesDoc) {
  const tid = Number(teamId);
  const row = previewStatsDoc.teams.find((r) => Number(r?.identity?.team_id) === tid);
  const sk = String(splitKey || "total").toLowerCase();
  const isTotal = sk === "total";

  const key = String(tid);
  const blockFm = finishedMatchesDoc?.by_team_id?.[key];
  const rawFinished = Array.isArray(blockFm?.[sk]) ? blockFm[sk] : [];
  const facts = rawFinished.map((r) => {
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
      goals_for_per_game: block.rates?.goals_for_per_game != null ? Number(block.rates.goals_for_per_game) : null,
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

const teamStats = JSON.parse(
  fs.readFileSync(path.join(root, "data/preview/brasileirao/team-stats.json"), "utf8")
);
const finished = JSON.parse(
  fs.readFileSync(path.join(root, "data/preview/brasileirao/profile-finished-matches.json"), "utf8")
);
const teamId = 118;

for (const split of ["total", "home", "away"]) {
  const target = previewRowToCohortInput(teamId, teamStats, split, finished);
  const cohort = teamStats.teams
    .map((r) => Number(r.identity.team_id))
    .map((id) => previewRowToCohortInput(id, teamStats, split, finished));
  const p = computeTeamProfileV1({
    team_id: teamId,
    competition_id: 71,
    season: 2026,
    split,
    target,
    cohort,
  });
  console.log(split.toUpperCase(), JSON.stringify(p.scores, null, 0));
}
