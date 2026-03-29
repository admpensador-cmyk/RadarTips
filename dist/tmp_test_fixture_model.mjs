/**
 * Quick logic test for the fixture model — no API key required.
 * Run: node tmp_test_fixture_model.mjs
 */
import { buildRawFixtureRecord, buildAllTeamFacts, buildAllTeamAggregates } from './tools/lib/league-fixtures-model.mjs';
import { buildLeagueV1SnapshotFromTeamAggregates, PREMIER_LEAGUE_V1 } from './tools/lib/league-v1-snapshot.mjs';

// ── Synthetic fixtures (4 matches between ManUtd and Liverpool) ────────────
// Match 1: ManUtd (H) 2-1 Liverpool → BTTS, OVER_2.5 (3 goals), ManUtd clean=F
// Match 2: Liverpool (H) 1-1 ManUtd  → BTTS, NOT over_2.5
// Match 3: ManUtd (H) 3-0 Liverpool  → NOT BTTS, OVER_2.5 (3 goals), ManUtd clean=T, Liverpool FTS=T
// Match 4: Liverpool (H) 0-2 ManUtd  → NOT BTTS, NOT over_2.5, ManUtd clean=T(away), Liverpool FTS=T
// Expected ManUtd: played=4 won=3 drew=1 gf=8 ga=2 btts_count=2 over_25_count=2 clean_sheets=2 failed=0
// Expected league: 4 matches, 2 over_2.5 (match1+match3) = 50%, 2/8 team-appearances with clean = 25%

const apiFixtures = [
  { fixture: { id: 1, timestamp: 1700000000, status: { short: 'FT' } }, league: { id: 39, season: 2025, round: 'R1' }, teams: { home: { id: 33, name: 'Manchester United' }, away: { id: 40, name: 'Liverpool' } }, goals: { home: 2, away: 1 } },
  { fixture: { id: 2, timestamp: 1700100000, status: { short: 'FT' } }, league: { id: 39, season: 2025, round: 'R1' }, teams: { home: { id: 40, name: 'Liverpool' }, away: { id: 33, name: 'Manchester United' } }, goals: { home: 1, away: 1 } },
  { fixture: { id: 3, timestamp: 1700200000, status: { short: 'FT' } }, league: { id: 39, season: 2025, round: 'R2' }, teams: { home: { id: 33, name: 'Manchester United' }, away: { id: 40, name: 'Liverpool' } }, goals: { home: 3, away: 0 } },
  { fixture: { id: 4, timestamp: 1700300000, status: { short: 'FT' } }, league: { id: 39, season: 2025, round: 'R2' }, teams: { home: { id: 40, name: 'Liverpool' }, away: { id: 33, name: 'Manchester United' } }, goals: { home: 0, away: 2 } },
];

const rawFixtures = apiFixtures.map(f => buildRawFixtureRecord(f, 39, 2025));
console.log('Layer 1 — raw fixtures:', rawFixtures.length);

const allFacts = buildAllTeamFacts(rawFixtures, {});
console.log('Layer 2 — team facts:', allFacts.length, '(should be 8)');

const teamAggregates = buildAllTeamAggregates(allFacts, 39, 2025);
const muAgg = teamAggregates['33'];

console.log('\nManUtd total:');
console.log('  played=%d won=%d drew=%d lost=%d', muAgg.total.played, muAgg.total.won, muAgg.total.drew, muAgg.total.lost);
console.log('  gf=%d ga=%d', muAgg.total.goals_for, muAgg.total.goals_against);
console.log('  btts_pct=%s (expect 50)', muAgg.total.btts_pct);
console.log('  over_25_pct=%s (expect 25)', muAgg.total.over_25_pct);
console.log('  clean_sheets_pct=%s (expect 50)', muAgg.total.clean_sheets_pct);
console.log('  failed_to_score_pct=%s (expect 0)', muAgg.total.failed_to_score_pct);

console.log('\nManUtd home: played=%d gf=%d ga=%d btts_pct=%s', muAgg.home.played, muAgg.home.goals_for, muAgg.home.goals_against, muAgg.home.btts_pct);
console.log('ManUtd away: played=%d gf=%d ga=%d btts_pct=%s', muAgg.away.played, muAgg.away.goals_for, muAgg.away.goals_against, muAgg.away.btts_pct);

// ── Assertions ─────────────────────────────────────────────────────────────
let errors = 0;
function assert(label, actual, expected) {
  const ok = actual == expected;
  console.log(ok ? `  ✅ ${label}: ${actual}` : `  ❌ ${label}: ${actual} (expected ${expected})`);
  if (!ok) errors++;
}

console.log('\n── Assertions ─────────────────────────────');
assert('ManUtd played', muAgg.total.played, 4);
assert('ManUtd won', muAgg.total.won, 3);
assert('ManUtd drew', muAgg.total.drew, 1);
assert('ManUtd gf', muAgg.total.goals_for, 8);
assert('ManUtd ga', muAgg.total.goals_against, 2);
assert('ManUtd btts_count', muAgg.total.btts_count, 2);
assert('ManUtd btts_pct', muAgg.total.btts_pct, 50);
assert('ManUtd over_25_count', muAgg.total.over_25_count, 2);
assert('ManUtd over_25_pct', muAgg.total.over_25_pct, 50);
assert('ManUtd clean_sheets_count', muAgg.total.clean_sheets_count, 2);
assert('ManUtd clean_sheets_pct', muAgg.total.clean_sheets_pct, 50);
assert('ManUtd failed_to_score_count', muAgg.total.failed_to_score_count, 0);
assert('ManUtd failed_to_score_pct', muAgg.total.failed_to_score_pct, 0);
assert('ManUtd home.played', muAgg.home.played, 2);
assert('ManUtd away.played', muAgg.away.played, 2);

// Liverpool: played=4 won=0 drew=1 lost=3 gf=2 ga=8 btts=2 over_25=1 clean=0 failed=2
const livAgg = teamAggregates['40'];
assert('Liverpool btts_count', livAgg.total.btts_count, 2);
assert('Liverpool clean_sheets_count', livAgg.total.clean_sheets_count, 0);
assert('Liverpool failed_to_score_count', livAgg.total.failed_to_score_count, 2);

// ── Synthetic standings for snapshot builder ──────────────────────────────
const standingsPayload = {
  response: [{
    league: {
      id: 39, name: 'Premier League', country: 'England', season: 2025,
      standings: [[
        { rank: 1, team: { id: 33, name: 'Manchester United' }, points: 10, all: { played: 4, win: 3, draw: 1, lose: 0, goals: { for: 8, against: 2 } }, goalsDiff: 6, form: 'WWWD' },
        { rank: 2, team: { id: 40, name: 'Liverpool' }, points: 1, all: { played: 4, win: 0, draw: 1, lose: 3, goals: { for: 2, against: 8 } }, goalsDiff: -6, form: 'LLLLD' }
      ]]
    }
  }]
};

try {
  const snapshot = buildLeagueV1SnapshotFromTeamAggregates({
    leagueDefinition: PREMIER_LEAGUE_V1,
    teamAggregates,
    standingsPayload,
    allSeasonFixtures: apiFixtures,
    generatedAtUtc: new Date().toISOString()
  });

  console.log('\n── Snapshot validation ─────────────────────────');
  const l = snapshot.statistics.league;
  assert('league.matches_count', l.matches_count, 4);
  assert('league.btts_pct', l.btts_pct, 50);
  assert('league.over_25_pct', l.over_25_pct, 50);
  // 4 clean sheets across 8 team-game appearances (ManUtd clean=2, Liverpool clean=0)
  // but wait: ManUtd.away.clean_sheets = 2 (match3 and match4 Ma scores, away means ManUtd keeps clean)
  // Actually from ManUtd's perspective: match1 (H) ManUtd 2-1 Liv → ManUtd ga=1 → NOT clean
  // match2 (A) Liv 1-1 ManUtd → ManUtd ga=1 → NOT clean
  // match3 (H) ManUtd 3-0 Liv → ManUtd ga=0 → CLEAN ✓
  // match4 (A) Liv 0-2 ManUtd → ManUtd ga=0 → CLEAN ✓
  // ManUtd clean_sheets=2, Liverpool clean_sheets=0
  // League: 2 clean sheets out of 8 team-appearances = 25%
  assert('league.clean_sheets_pct', l.clean_sheets_pct, 25);
  assert('statistics.teams length', snapshot.statistics.teams.length, 2);

  const mu = snapshot.statistics.teams.find(t => t.team_id === 33);
  assert('teams[ManUtd].btts_pct', mu.btts_pct, 50);
  assert('teams[ManUtd].over_25_pct', mu.over_25_pct, 50);
  assert('teams[ManUtd].clean_sheets_pct', mu.clean_sheets_pct, 50);
  assert('teams[ManUtd].home !== null', !!mu.home, true);
  assert('teams[ManUtd].away !== null', !!mu.away, true);

  console.log('\n  home_away_splits.home.btts_pct:', snapshot.statistics.home_away_splits?.home?.btts_pct, '(should be non-null)');

  if (errors === 0) {
    console.log('\n✅ ALL ASSERTIONS PASSED — model logic is correct\n');
  } else {
    console.log(`\n❌ ${errors} assertion(s) failed\n`);
    process.exit(1);
  }
} catch (err) {
  console.error('\n❌ Snapshot builder threw:', err.message);
  process.exit(1);
}
