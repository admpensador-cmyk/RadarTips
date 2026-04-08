/**
 * Build profile-finished-matches.json from fixture-derived team facts + raw fixtures + /fixtures/events.
 * No standings reconstruction, no synthetic rows.
 */
import { deriveProfileMatchControlBooleans } from "./league-fixtures-model.mjs";

function parseTime(fact) {
  const s = fact?.played_at_utc;
  const t = s ? Date.parse(String(s)) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {object} opts
 * @param {number} opts.leagueId
 * @param {number|string} opts.season
 * @param {string} opts.generatedAtUtc
 * @param {object[]} opts.allFacts — team facts (two per finished fixture)
 * @param {object[]} opts.rawFixtures — buildRawFixtureRecord[]
 * @param {Record<string, any[]>} opts.rawEventsByFixtureId — fixture_id string -> /fixtures/events response array
 * @param {object[]} opts.standingsRows — { team_id } from snapshot standings
 */
export function buildProfileFinishedMatchesDocument(opts) {
  const leagueId = Number(opts.leagueId);
  const season = String(opts.season ?? "");
  const generatedAtUtc = String(opts.generatedAtUtc || "").trim();
  const allFacts = Array.isArray(opts.allFacts) ? opts.allFacts : [];
  const rawFixtures = Array.isArray(opts.rawFixtures) ? opts.rawFixtures : [];
  const rawEventsByFixtureId = opts.rawEventsByFixtureId && typeof opts.rawEventsByFixtureId === "object"
    ? opts.rawEventsByFixtureId
    : {};
  const standingsRows = Array.isArray(opts.standingsRows) ? opts.standingsRows : [];

  const rawByFixtureId = new Map();
  for (const r of rawFixtures) {
    const id = Number(r?.fixture_id);
    if (Number.isFinite(id)) rawByFixtureId.set(id, r);
  }

  function factToRow(f) {
    const fid = Number(f.fixture_id);
    const raw = rawByFixtureId.get(fid);
    if (!raw) {
      throw new Error(`[profile-finished-matches] Missing raw fixture for fixture_id=${fid}`);
    }
    const events = rawEventsByFixtureId[String(fid)] ?? [];
    const ctrl = deriveProfileMatchControlBooleans(raw, events, f.team_id, f.is_home, f.result);
    const row = {
      fixture_id: fid,
      gf: f.goals_for,
      ga: f.goals_against,
      result: f.result,
      ...ctrl
    };
    return JSON.parse(JSON.stringify(row));
  }

  function sortAndMap(list) {
    return [...list].sort((a, b) => parseTime(a) - parseTime(b)).map(factToRow);
  }

  const byTeamId = {};
  const standingIds = [];
  for (const st of standingsRows) {
    const tid = Number(st?.team_id);
    if (!Number.isFinite(tid)) continue;
    standingIds.push(tid);
  }

  for (const tid of standingIds) {
    const teamFacts = allFacts.filter((x) => Number(x.team_id) === tid);
    byTeamId[String(tid)] = {
      total: sortAndMap(teamFacts),
      home: sortAndMap(teamFacts.filter((x) => x.is_home)),
      away: sortAndMap(teamFacts.filter((x) => !x.is_home))
    };
  }

  return {
    meta: {
      schema: "preview_brasileirao_profile_finished_matches_v2",
      league_id: leagueId,
      season,
      generated_at_utc: generatedAtUtc,
      data_integrity: "real_fixtures_only",
      sources: ["/fixtures", "/fixtures/statistics", "/fixtures/events"],
      source_note:
        "One row per finished fixture (FT/AET/PEN) per team appearance. Control flags from API halftime and/or goal events only — no standings or goal-total synthesis."
    },
    by_team_id: byTeamId
  };
}

/**
 * Fail if any standing team is missing or played count mismatches profile rows.
 */
export function assertProfileFinishedMatchesVsStandings(doc, standingsRows) {
  const rows = Array.isArray(standingsRows) ? standingsRows : [];
  const by = doc?.by_team_id && typeof doc.by_team_id === "object" ? doc.by_team_id : {};
  for (const st of rows) {
    const tid = Number(st?.team_id);
    if (!Number.isFinite(tid)) continue;
    const key = String(tid);
    const block = by[key];
    if (!block || typeof block !== "object") {
      throw new Error(`[profile-finished-matches] Missing by_team_id block for team_id=${tid}`);
    }
    const playedStanding = Number(st.played);
    const n = Array.isArray(block.total) ? block.total.length : 0;
    if (Number.isFinite(playedStanding) && playedStanding !== n) {
      throw new Error(
        `[profile-finished-matches] Team ${tid} played mismatch: standings=${playedStanding} profile_total_rows=${n}`
      );
    }
  }
}
