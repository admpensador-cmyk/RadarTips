(function () {
  console.log('[LeaguePage] script loaded');

  var STORE = window.RT_LEAGUE_V1_DATA;

  var TAB_ORDER = ['overview', 'table', 'statistics', 'trends', 'games', 'teams'];
  var TAB_LABELS = {
    overview: 'Visao Geral',
    table: 'Tabela',
    statistics: 'Estatisticas',
    trends: 'Tendencias',
    games: 'Jogos',
    teams: 'Times'
  };

  var REAL_SNAPSHOT_BY_SLUG = {
    'premier-league': '/api/v1/leagues/premier-league.json'
  };

  function buildRuntimeStore() {
    return {
      availableLeagues: [
        { slug: 'premier-league', name: 'Premier League', code: 'PL', icon: '🦁', country: 'England', season: 'current' }
      ],
      defaultLeague: 'premier-league'
    };
  }

  if (!STORE || !Array.isArray(STORE.availableLeagues)) {
    STORE = buildRuntimeStore();
  }

  var state = {
    leagueSlug: getLeagueSlug(),
    activeTab: 'overview',
    gamesMode: 'upcoming',
    gamesRound: 'all',
    loading: false,
    leagueDataBySlug: {},
    loadErrorBySlug: {}
  };

  function getLeagueSlug() {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = params.get('league');
    if (fromQuery && REAL_SNAPSHOT_BY_SLUG[fromQuery]) return fromQuery;
    return STORE.defaultLeague;
  }

  function getLeague() {
    return state.leagueDataBySlug[state.leagueSlug] || null;
  }

  async function setLeague(slug) {
    if (!REAL_SNAPSHOT_BY_SLUG[slug]) return;
    state.leagueSlug = slug;
    state.gamesMode = 'upcoming';
    state.gamesRound = 'all';
    var params = new URLSearchParams(window.location.search);
    params.set('league', slug);
    window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
    await ensureLeagueDataLoaded(slug);
    render();
  }

  async function fetchJson(url) {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('http_' + res.status);
    return res.json();
  }

  function asPct(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num.toFixed(1) + '%' : null;
  }

  function asPctOrDash(value) {
    var num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(1) + '%';
  }

  function asNumOrDash(value, digits) {
    var num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(digits || 1);
  }

  function numberOrNull(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function asNum(value, digits) {
    var num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(digits || 1);
  }

  function valueOrDash(value) {
    return value == null || value === '' ? '—' : String(value);
  }

  function asSplitPct(value) {
    var num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, num));
  }

  function formString(value) {
    var cleaned = String(value || '').toUpperCase().replace(/[^WDL]/g, '');
    if (!cleaned) return 'DDDDD';
    return cleaned.slice(0, 5);
  }

  function teamKey(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(fc|cf|afc|ac)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildFeaturedFromFixtures(fixtures) {
    return (fixtures || []).slice(0, 8).map(function (f) {
      var kickoff = formatKickoff(f.kickoff_utc);
      var home = String(f.home || '').trim();
      var away = String(f.away || '').trim();
      var round = String(f.round || '').trim();
      var status = String(f.status || '').trim();
      if (!home || !away || !kickoff) return null;

      var tags = [];
      if (f.score) tags.push('result captured');
      if (round) tags.push(round);
      return {
        fixtureId: f.fixture_id,
        round: round || null,
        kickoff: kickoff,
        status: status || null,
        home: home,
        away: away,
        tags: tags
      };
    }).filter(Boolean).slice(0, 5);
  }

  function formatKickoff(isoUtc) {
    var ms = Date.parse(String(isoUtc || ''));
    if (!Number.isFinite(ms)) return null;
    var d = new Date(ms);
    var day = String(d.getUTCDate()).padStart(2, '0');
    var month = String(d.getUTCMonth() + 1).padStart(2, '0');
    var hh = String(d.getUTCHours()).padStart(2, '0');
    var mm = String(d.getUTCMinutes()).padStart(2, '0');
    return day + '/' + month + ' ' + hh + ':' + mm + ' UTC';
  }

  function deriveTrend(summary, splits) {
    var goals = numberOrNull(summary.goals_per_game);
    var btts = numberOrNull(summary.btts_pct);
    var over25 = numberOrNull(summary.over_25_pct);
    var under25 = numberOrNull(summary.under_25_pct);
    var safeSplits = splits && typeof splits === 'object' ? splits : {};
    var homeBtts = numberOrNull((safeSplits.home && safeSplits.home.btts_pct) != null ? safeSplits.home.btts_pct : safeSplits.home_btts_pct);
    var rows = [];
    if (goals != null) rows.push({ title: 'Goals per game', value: goals.toFixed(2), note: goals.toFixed(2) + ' average goals per match' });
    if (btts != null) rows.push({ title: 'BTTS', value: btts.toFixed(1) + '%', note: btts.toFixed(1) + '% of matches had both teams scoring' });
    if (over25 != null) rows.push({ title: 'Over 2.5', value: over25.toFixed(1) + '%', note: over25.toFixed(1) + '% of matches finished over 2.5 goals' });
    if (under25 != null) rows.push({ title: 'Under 2.5', value: under25.toFixed(1) + '%', note: under25.toFixed(1) + '% of matches stayed under 2.5 goals' });
    if (homeBtts != null) rows.push({ title: 'Home BTTS', value: homeBtts.toFixed(1) + '%', note: homeBtts.toFixed(1) + '% BTTS rate in home-side split' });
    return rows;
  }

  function adaptSnapshotToLeague(snapshot) {
    var competition = snapshot && snapshot.competition ? snapshot.competition : {};
    var standings = Array.isArray(snapshot && snapshot.standings) ? snapshot.standings : [];
    var fixtures = snapshot && snapshot.fixtures ? snapshot.fixtures : { upcoming: [], recent: [] };
    var statistics = snapshot && snapshot.statistics ? snapshot.statistics : {};
    var leagueStats = statistics.league || {};
    var teamsStats = Array.isArray(statistics.teams) ? statistics.teams : [];
    var rankings = statistics.team_rankings && !Array.isArray(statistics.team_rankings) ? statistics.team_rankings : null;
    var splits = statistics.home_away_splits || {};
    var trends = snapshot && snapshot.trends ? snapshot.trends : {};
    var advanced = snapshot && snapshot.advanced && typeof snapshot.advanced === 'object' ? snapshot.advanced : {};

    function asRankingRows(rows) {
      return (Array.isArray(rows) ? rows : []).slice(0, 5);
    }

    var byGoalsFor = asRankingRows(rankings && rankings.by_goals_for);
    var byGoalsAgainst = asRankingRows(rankings && rankings.by_goals_against);
    var byBtts = asRankingRows(rankings && rankings.by_btts_pct);
    var byOver25 = asRankingRows(rankings && rankings.by_over_25_pct);
    var byClean = asRankingRows(rankings && rankings.by_clean_sheets_pct);

    var topAttack = byGoalsFor[0] || null;
    var topDefense = byGoalsAgainst[0] || null;
    var topOver = byOver25[0] || null;
    var topBtts = byBtts[0] || null;
    var topClean = byClean[0] || null;

    var splitHome = splits && typeof splits.home === 'object' ? splits.home : null;
    var splitAway = splits && typeof splits.away === 'object' ? splits.away : null;

    var leagueGoalsPerGame = numberOrNull(leagueStats.goals_per_game);
    var leagueOver15Pct = numberOrNull(leagueStats.over_15_pct);
    var leagueOver25Pct = numberOrNull(leagueStats.over_25_pct);
    var leagueOver35Pct = numberOrNull(leagueStats.over_35_pct);
    var leagueBttsPct = numberOrNull(leagueStats.btts_pct);
    var leagueCleanSheetsPct = numberOrNull(leagueStats.clean_sheets_pct);
    var leagueFailedToScorePct = numberOrNull(leagueStats.failed_to_score_pct);

    var summaryRows = [];
    if (leagueGoalsPerGame != null) summaryRows.push({ label: 'Goals per game', value: leagueGoalsPerGame.toFixed(2), insight: leagueGoalsPerGame.toFixed(2) + ' average goals per match' });
    if (leagueBttsPct != null) summaryRows.push({ label: 'BTTS', value: asPctOrDash(leagueBttsPct), insight: asPctOrDash(leagueBttsPct) + ' of matches had both teams scoring' });
    if (leagueOver15Pct != null) summaryRows.push({ label: 'Over 1.5', value: asPctOrDash(leagueOver15Pct), insight: asPctOrDash(leagueOver15Pct) + ' of matches finished over 1.5 goals' });
    if (leagueOver25Pct != null) summaryRows.push({ label: 'Over 2.5', value: asPctOrDash(leagueOver25Pct), insight: asPctOrDash(leagueOver25Pct) + ' of matches finished over 2.5 goals' });

    var under25Pct = numberOrNull(leagueStats.under_25_pct);
    if (under25Pct != null) summaryRows.push({ label: 'Under 2.5', value: asPctOrDash(under25Pct), insight: asPctOrDash(under25Pct) + ' of matches stayed under 2.5 goals' });

    var leagueMetricRows = [];
    if (leagueGoalsPerGame != null) leagueMetricRows.push({ label: 'Goals / game', value: leagueGoalsPerGame.toFixed(2) });
    if (leagueBttsPct != null) leagueMetricRows.push({ label: 'BTTS', value: asPctOrDash(leagueBttsPct) });
    if (leagueOver15Pct != null) leagueMetricRows.push({ label: 'Over 1.5', value: asPctOrDash(leagueOver15Pct) });
    if (leagueOver25Pct != null) leagueMetricRows.push({ label: 'Over 2.5', value: asPctOrDash(leagueOver25Pct) });
    if (leagueOver35Pct != null) leagueMetricRows.push({ label: 'Over 3.5', value: asPctOrDash(leagueOver35Pct) });
    if (leagueCleanSheetsPct != null) leagueMetricRows.push({ label: 'Clean sheets', value: asPctOrDash(leagueCleanSheetsPct) });
    if (leagueFailedToScorePct != null) leagueMetricRows.push({ label: 'Failed to score', value: asPctOrDash(leagueFailedToScorePct) });
    if (numberOrNull(leagueStats.corners_avg) != null) leagueMetricRows.push({ label: 'Corners avg', value: asNumOrDash(leagueStats.corners_avg, 2) });
    if (numberOrNull(leagueStats.yellow_cards_avg) != null) leagueMetricRows.push({ label: 'Yellow cards avg', value: asNumOrDash(leagueStats.yellow_cards_avg, 2) });
    if (numberOrNull(leagueStats.red_cards_avg) != null) leagueMetricRows.push({ label: 'Red cards avg', value: asNumOrDash(leagueStats.red_cards_avg, 2) });

    function splitMetric(metric, homeValue, awayValue, formatter) {
      var h = numberOrNull(homeValue);
      var a = numberOrNull(awayValue);
      if (h == null || a == null) return null;
      var total = Math.max(0.01, h + a);
      return {
        metric: metric,
        homeLabel: formatter === 'num' ? asNumOrDash(h, 2) : asPctOrDash(h),
        awayLabel: formatter === 'num' ? asNumOrDash(a, 2) : asPctOrDash(a),
        barHome: asSplitPct((h / total) * 100),
        barAway: asSplitPct((a / total) * 100)
      };
    }

    var splitRows = [
      splitMetric('Goals avg', splitHome && splitHome.goals_avg, splitAway && splitAway.goals_avg, 'num'),
      splitMetric('BTTS', splitHome && splitHome.btts_pct, splitAway && splitAway.btts_pct, 'pct'),
      splitMetric('Over 2.5', splitHome && splitHome.over_25_pct, splitAway && splitAway.over_25_pct, 'pct'),
      splitMetric('Clean sheets', splitHome && splitHome.clean_sheets_pct, splitAway && splitAway.clean_sheets_pct, 'pct')
    ].filter(Boolean);

    return {
      competition: {
        slug: competition.slug || 'premier-league',
        code: 'PL',
        icon: '🦁',
        name: competition.name || 'Premier League',
        country: competition.country || 'England',
        season: competition.season || 'current'
      },
      heroMetrics: [
        leagueGoalsPerGame != null ? { label: 'Goals / match', value: leagueGoalsPerGame.toFixed(2) } : null,
        leagueBttsPct != null ? { label: 'BTTS', value: asPctOrDash(leagueBttsPct) } : null,
        leagueOver25Pct != null ? { label: 'Over 2.5', value: asPctOrDash(leagueOver25Pct) } : null,
        leagueCleanSheetsPct != null ? { label: 'Clean sheets', value: asPctOrDash(leagueCleanSheetsPct) } : null
      ].filter(Boolean),
      overview: {
        competitionSummary: summaryRows,
        featuredMatches: buildFeaturedFromFixtures(fixtures.upcoming && fixtures.upcoming.length ? fixtures.upcoming : fixtures.recent),
        globalTrends: deriveTrend(leagueStats, splits),
        quickRankings: [
          { label: 'Best attack', team: topAttack ? topAttack.team : null },
          { label: 'Best defense', team: topDefense ? topDefense.team : null },
          { label: 'Highest over 2.5', team: topOver ? topOver.team : null },
          { label: 'Highest BTTS', team: topBtts ? topBtts.team : null },
          { label: 'Highest clean sheets', team: topClean ? topClean.team : null }
        ].filter(function (row) { return !!row.team; })
      },
      standings: standings.map(function (row) {
        return {
          position: Number.isFinite(Number(row.position || row.rank)) ? Number(row.position || row.rank) : null,
          team: row.team,
          points: Number.isFinite(Number(row.points)) ? Number(row.points) : null,
          played: Number.isFinite(Number(row.played)) ? Number(row.played) : null,
          wins: Number.isFinite(Number(row.wins)) ? Number(row.wins) : null,
          draws: Number.isFinite(Number(row.draws)) ? Number(row.draws) : null,
          losses: Number.isFinite(Number(row.losses)) ? Number(row.losses) : null,
          goalsFor: Number.isFinite(Number(row.goals_for)) ? Number(row.goals_for) : null,
          goalsAgainst: Number.isFinite(Number(row.goals_against)) ? Number(row.goals_against) : null,
          goalDiff: Number.isFinite(Number(row.goal_diff)) ? Number(row.goal_diff) : null,
          form: formString(row.form_last5)
        };
      }),
      statistics: {
        leagueStats: leagueMetricRows,
        rankings: [
          { title: 'Top scoring teams', rows: byGoalsFor },
          { title: 'Best defensive records', rows: byGoalsAgainst },
          { title: 'Highest BTTS rate', rows: byBtts },
          { title: 'Highest over 2.5 rate', rows: byOver25 },
          { title: 'Highest clean sheet rate', rows: byClean }
        ],
        teams: teamsStats.map(function (row) {
          return {
            team_id: Number.isFinite(Number(row.team_id)) ? Number(row.team_id) : null,
            team: row.team,
            played: Number.isFinite(Number(row.played || row.matches)) ? Number(row.played || row.matches) : null,
            goals_for: Number.isFinite(Number(row.goals_for || row.goals_scored)) ? Number(row.goals_for || row.goals_scored) : null,
            goals_against: Number.isFinite(Number(row.goals_against || row.goals_conceded)) ? Number(row.goals_against || row.goals_conceded) : null,
            goals_for_per_game: asNumOrDash(row.goals_for_per_game, 2),
            goals_against_per_game: asNumOrDash(row.goals_against_per_game, 2),
            over_15_pct: asPctOrDash(row.over_15_pct),
            over_25_pct: asPctOrDash(row.over_25_pct),
            over_35_pct: asPctOrDash(row.over_35_pct),
            btts_pct: asPctOrDash(row.btts_pct),
            clean_sheets_pct: asPctOrDash(row.clean_sheets_pct),
            failed_to_score_pct: asPctOrDash(row.failed_to_score_pct),
            corners_for_avg: asNumOrDash(row.corners_for_avg, 2),
            corners_against_avg: asNumOrDash(row.corners_against_avg, 2),
            yellow_cards_for_avg: asNumOrDash(row.yellow_cards_for_avg, 2),
            yellow_cards_against_avg: asNumOrDash(row.yellow_cards_against_avg, 2),
            red_cards_for_avg: asNumOrDash(row.red_cards_for_avg, 2),
            red_cards_against_avg: asNumOrDash(row.red_cards_against_avg, 2)
          };
        }),
        splits: splitRows,
        advanced: {
          corners: advanced.corners || null,
          cards: advanced.cards || null
        }
      },
      trends: {
        cards: Array.isArray(trends.trend_cards) && trends.trend_cards.length ? trends.trend_cards.map(function (card) {
          return { title: card.title, text: card.note ? (card.value + ' - ' + card.note) : card.value };
        }) : [],
        teamProfiles: Array.isArray(trends.team_profiles) ? trends.team_profiles.map(function (profile) {
          return { team: profile.team, profile: profile.profile, tags: profile.tags || [] };
        }) : [],
        reading: [
          trends.summary_text ? String(trends.summary_text) : null,
          (snapshot.meta && snapshot.meta.generated_at_utc) ? ('Snapshot generated at ' + snapshot.meta.generated_at_utc + '.') : null
        ].filter(Boolean)
      },
      games: {
        upcoming: buildFeaturedFromFixtures(fixtures.upcoming || []),
        recent: buildFeaturedFromFixtures(fixtures.recent || [])
      },
      teamsIndex: standings.map(function (row) {
        var rankRow = teamsStats.find(function (r) { return teamKey(r.team) === teamKey(row.team); }) || null;
        return {
          team: row.team,
          position: Number(row.position || 0),
          form: formString(row.form_last5),
          goalsFor: Number.isFinite(Number(row.goals_for)) ? Number(row.goals_for) : null,
          goalsAgainst: Number.isFinite(Number(row.goals_against)) ? Number(row.goals_against) : null,
          btts: rankRow ? asPct(rankRow.btts_pct) : null,
          profile: null
        };
      })
    };
  }

  async function ensureLeagueDataLoaded(slug) {
    if (state.leagueDataBySlug[slug]) return;
    var snapshotUrl = REAL_SNAPSHOT_BY_SLUG[slug];
    if (!snapshotUrl) {
      state.loadErrorBySlug[slug] = 'snapshot_url_missing';
      return;
    }

    state.loading = true;
    try {
      var snapshot = await fetchJson(snapshotUrl);
      state.leagueDataBySlug[slug] = adaptSnapshotToLeague(snapshot);
      state.loadErrorBySlug[slug] = null;
    } catch (err) {
      var reason = err && err.message ? err.message : String(err || 'unknown_error');
      console.error('[league-v1] snapshot load failed for', slug, reason);
      state.loadErrorBySlug[slug] = reason;
    } finally {
      state.loading = false;
    }
  }

  function createTopMetric(metric) {
    if (!metric || !metric.value) return '';
    return '<article class="league-v1-kpi">' +
      '<div class="league-v1-kpi-label">' + esc(metric.label) + '</div>' +
      '<div class="league-v1-kpi-value">' + esc(metric.value) + '</div>' +
      '</article>';
  }

  function renderHeader(league) {
    var options = STORE.availableLeagues.map(function (item) {
      var selected = item.slug === state.leagueSlug ? ' selected' : '';
      return '<option value="' + esc(item.slug) + '"' + selected + '>' + esc(item.name) + '</option>';
    }).join('');

    return '<section class="league-v1-header">' +
      '<div class="league-v1-header-top">' +
      '<div class="league-v1-identity">' +
      '<div class="league-v1-logo" aria-hidden="true">' + esc(league.competition.icon) + '</div>' +
      '<div class="league-v1-title-wrap">' +
      '<h1>' + esc(league.competition.name) + '</h1>' +
      '<div class="league-v1-meta">' +
      '<span>' + esc(league.competition.country) + '</span>' +
      '<span>Season ' + esc(league.competition.season) + '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="league-v1-switcher">' +
      '<label for="leagueV1Switcher">Competition</label>' +
      '<select id="leagueV1Switcher">' + options + '</select>' +
      '</div>' +
      '</div>' +
        (Array.isArray(league.heroMetrics) && league.heroMetrics.length ? '<div class="league-v1-kpis">' + league.heroMetrics.map(createTopMetric).join('') + '</div>' : '') +
      '</section>';
  }

  function renderTabs() {
    var buttons = TAB_ORDER.map(function (tab) {
      var active = state.activeTab === tab;
      return '<button class="league-v1-tab" data-tab="' + tab + '" aria-selected="' + (active ? 'true' : 'false') + '">' +
        esc(TAB_LABELS[tab]) +
        '</button>';
    }).join('');
    return '<nav class="league-v1-tabs" aria-label="Competition tabs">' + buttons + '</nav>';
  }

  function section(title, note, body) {
    return '<section class="league-v1-section">' +
      '<header class="league-v1-section-head">' +
      '<h3 class="league-v1-section-title">' + esc(title) + '</h3>' +
      '<div class="league-v1-section-note">' + esc(note || '') + '</div>' +
      '</header>' + body +
      '</section>';
  }

  function renderOverview(league) {
    var sections = [];

    var summaryRows = Array.isArray(league.overview.competitionSummary) ? league.overview.competitionSummary : [];
    if (summaryRows.length) {
      var summaryCards = '<div class="league-v1-grid-3">' + summaryRows.map(function (metric) {
        return '<article class="league-v1-card">' +
          '<h4>' + esc(metric.label) + '</h4>' +
          '<p>' + esc(metric.value) + '</p>' +
          '<div class="league-v1-tagline">' + esc(metric.insight || '') + '</div>' +
          '</article>';
      }).join('') + '</div>';
      sections.push(section('Overview metrics', '', summaryCards));
    }

    var featuredMatches = Array.isArray(league.overview.featuredMatches) ? league.overview.featuredMatches : [];
    if (featuredMatches.length) {
      var featured = '<div class="league-v1-match-list">' + featuredMatches.map(matchCard).join('') + '</div>';
      sections.push(section('Featured fixtures', '', featured));
    }

    var trendRows = Array.isArray(league.overview.globalTrends) ? league.overview.globalTrends : [];
    if (trendRows.length) {
      var trendCards = '<div class="league-v1-grid-4">' + trendRows.map(function (trend) {
        return '<article class="league-v1-card">' +
          '<h4>' + esc(trend.title) + '</h4>' +
          '<p>' + esc(trend.value) + '</p>' +
          '<div class="league-v1-tagline">' + esc(trend.note || '') + '</div>' +
          '</article>';
      }).join('') + '</div>';
      sections.push(section('Derived ratios', '', trendCards));
    }

    var quickRankingsRows = Array.isArray(league.overview.quickRankings) ? league.overview.quickRankings : [];
    if (quickRankingsRows.length) {
      var rankings = '<div class="league-v1-grid-2">' + quickRankingsRows.map(function (item) {
        return '<article class="league-v1-card">' +
          '<h4>' + esc(item.label) + '</h4>' +
          '<p>' + esc(item.team) + '</p>' +
          '</article>';
      }).join('') + '</div>';
      sections.push(section('Quick rankings', '', rankings));
    }

    if (!sections.length) {
      return section('Overview metrics', 'no summary data available', '<div class="league-v1-text-block"><p>No summary fields were returned by the snapshot.</p></div>');
    }

    return sections.join('');
  }

  function renderTable(league) {
    var rows = league.standings.map(function (row) {
      return '<tr>' +
        '<td><span class="league-v1-pos">' + esc(valueOrDash(row.position)) + '</span></td>' +
        '<td><strong>' + esc(row.team) + '</strong></td>' +
        '<td>' + esc(valueOrDash(row.points)) + '</td>' +
        '<td>' + esc(valueOrDash(row.played)) + '</td>' +
        '<td>' + esc(valueOrDash(row.wins)) + '</td>' +
        '<td>' + esc(valueOrDash(row.draws)) + '</td>' +
        '<td>' + esc(valueOrDash(row.losses)) + '</td>' +
        '<td>' + esc(valueOrDash(row.goalsFor)) + '</td>' +
        '<td>' + esc(valueOrDash(row.goalsAgainst)) + '</td>' +
        '<td>' + esc(valueOrDash(row.goalDiff)) + '</td>' +
        '<td>' + formDots(row.form) + '</td>' +
        '</tr>';
    }).join('');

    return section('Tabela da liga', 'classificacao atual',
      '<div class="league-v1-table-wrap"><table class="league-v1-table"><thead><tr>' +
      '<th>#</th><th>Team</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Forma</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    );
  }

  function renderStatistics(league) {
    var safeStatistics = league && league.statistics ? league.statistics : {};
    var statRows = Array.isArray(safeStatistics.leagueStats) ? safeStatistics.leagueStats : [];
    var rankingGroups = (Array.isArray(safeStatistics.rankings) ? safeStatistics.rankings : []).filter(function (group) {
      return group && Array.isArray(group.rows) && group.rows.length;
    });
    var teamsRows = Array.isArray(safeStatistics.teams) ? safeStatistics.teams : [];
    var splitRowsData = Array.isArray(safeStatistics.splits) ? safeStatistics.splits : [];
    var advancedStats = safeStatistics.advanced && typeof safeStatistics.advanced === 'object' ? safeStatistics.advanced : {};

    var blocks = [];

    if (statRows.length) {
      var statCards = '<div class="league-v1-grid-4">' + statRows.map(function (stat) {
        return '<article class="league-v1-card"><h4>' + esc(stat.label) + '</h4><p>' + esc(stat.value) + '</p></article>';
      }).join('') + '</div>';
      blocks.push(section('League statistics', '', statCards));
    }

    if (rankingGroups.length) {
      var rankingBlocks = '<div class="league-v1-grid-2">' + rankingGroups.map(function (group) {
        var safeGroup = group && typeof group === 'object' ? group : {};
        var rows = (Array.isArray(safeGroup.rows) ? safeGroup.rows : []).slice(0, 5).map(function (row) {
          return '<tr><td><strong>' + esc(row.team) + '</strong></td><td>' + asNumOrDash(row.value, 2) + '</td><td>' + Number(row.matches || 0) + '</td></tr>';
        }).join('');
        return '<article class="league-v1-card">' +
          '<h4>' + esc(safeGroup.title || 'Ranking') + '</h4>' +
          '<div class="league-v1-table-wrap"><table class="league-v1-table"><thead><tr><th>Team</th><th>Value</th><th>Matches</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '</article>';
      }).join('') + '</div>';
      blocks.push(section('Rankings', '', rankingBlocks));
    }

    if (teamsRows.length) {
      var teamRows = teamsRows.map(function (row) {
        return '<tr>' +
          '<td><strong>' + esc(row.team) + '</strong></td>' +
          '<td>' + esc(valueOrDash(row.played)) + '</td>' +
          '<td>' + esc(valueOrDash(row.goals_for)) + '</td>' +
          '<td>' + esc(valueOrDash(row.goals_against)) + '</td>' +
          '<td>' + esc(valueOrDash(row.goals_for_per_game)) + '</td>' +
          '<td>' + esc(valueOrDash(row.goals_against_per_game)) + '</td>' +
          '<td>' + esc(valueOrDash(row.over_15_pct)) + '</td>' +
          '<td>' + esc(valueOrDash(row.over_25_pct)) + '</td>' +
          '<td>' + esc(valueOrDash(row.over_35_pct)) + '</td>' +
          '<td>' + esc(valueOrDash(row.btts_pct)) + '</td>' +
          '<td>' + esc(valueOrDash(row.clean_sheets_pct)) + '</td>' +
          '<td>' + esc(valueOrDash(row.failed_to_score_pct)) + '</td>' +
          '<td>' + esc(valueOrDash(row.corners_for_avg)) + '</td>' +
          '<td>' + esc(valueOrDash(row.yellow_cards_for_avg)) + '</td>' +
          '<td>' + esc(valueOrDash(row.red_cards_for_avg)) + '</td>' +
        '</tr>';
      }).join('');
      blocks.push(section('Team table', '', '<div class="league-v1-table-wrap"><table class="league-v1-table"><thead><tr><th>Team</th><th>P</th><th>GF</th><th>GA</th><th>GF/P</th><th>GA/P</th><th>O1.5</th><th>O2.5</th><th>O3.5</th><th>BTTS</th><th>CS</th><th>FTS</th><th>Corners</th><th>Yellow</th><th>Red</th></tr></thead><tbody>' + teamRows + '</tbody></table></div>'));
    }

    var advancedCards = [];
    if (advancedStats.corners && typeof advancedStats.corners === 'object') {
      if (numberOrNull(advancedStats.corners.total_avg) != null) {
        advancedCards.push({ label: 'Corners avg (league)', value: asNumOrDash(advancedStats.corners.total_avg, 2) });
      }
      if (numberOrNull(advancedStats.corners.home_avg) != null && numberOrNull(advancedStats.corners.away_avg) != null) {
        advancedCards.push({ label: 'Corners home/away', value: asNumOrDash(advancedStats.corners.home_avg, 2) + ' / ' + asNumOrDash(advancedStats.corners.away_avg, 2) });
      }
    }
    if (advancedStats.cards && typeof advancedStats.cards === 'object') {
      if (numberOrNull(advancedStats.cards.yellow_avg) != null) {
        advancedCards.push({ label: 'Yellow cards avg', value: asNumOrDash(advancedStats.cards.yellow_avg, 2) });
      }
      if (numberOrNull(advancedStats.cards.red_avg) != null) {
        advancedCards.push({ label: 'Red cards avg', value: asNumOrDash(advancedStats.cards.red_avg, 2) });
      }
    }
    if (advancedCards.length) {
      var advancedRows = '<div class="league-v1-grid-4">' + advancedCards.map(function (stat) {
        return '<article class="league-v1-card"><h4>' + esc(stat.label) + '</h4><p>' + esc(stat.value) + '</p></article>';
      }).join('') + '</div>';
      blocks.push(section('Advanced corners and cards', '', advancedRows));
    }

    if (splitRowsData.length) {
      var splitRows = splitRowsData.map(function (split) {
        return '<article class="league-v1-card">' +
          '<h4>' + esc(split.metric) + '</h4>' +
          '<p>Home ' + esc(split.homeLabel) + ' vs Away ' + esc(split.awayLabel) + '</p>' +
          '<div class="league-v1-split-bar"><span class="league-v1-split-home" style="width:' + Number(split.barHome || 0) + '%"></span><span class="league-v1-split-away" style="width:' + Number(split.barAway || 0) + '%"></span></div>' +
          '</article>';
      }).join('');
      blocks.push(section('Home vs Away', '', '<div class="league-v1-grid-2">' + splitRows + '</div>'));
    }

    if (!blocks.length) {
      return section('League statistics', 'no statistics data available', '<div class="league-v1-text-block"><p>No statistics fields were returned by the snapshot.</p></div>');
    }

    return blocks.join('');
  }

  function renderTrends(league) {
    var cardsList = Array.isArray(league.trends.cards) ? league.trends.cards : [];
    var profiles = Array.isArray(league.trends.teamProfiles) ? league.trends.teamProfiles : [];
    var readingRows = Array.isArray(league.trends.reading) ? league.trends.reading : [];
    var out = [];

    if (cardsList.length) {
      var cards = '<div class="league-v1-grid-2">' + cardsList.map(function (card) {
        return '<article class="league-v1-card"><h4>' + esc(card.title) + '</h4><p>' + esc(card.text) + '</p></article>';
      }).join('') + '</div>';
      out.push(section('Trend cards', '', cards));
    }

    if (profiles.length) {
      var teamProfileRows = profiles.map(function (entry) {
        return '<tr><td><strong>' + esc(entry.team) + '</strong></td><td>' + esc(entry.profile) + '</td><td>' + entry.tags.map(function (tag) { return '<span class="league-v1-tag">' + esc(tag) + '</span>'; }).join(' ') + '</td></tr>';
      }).join('');
      out.push(section('Team profiles', '', '<div class="league-v1-table-wrap"><table class="league-v1-table"><thead><tr><th>Team</th><th>Profile</th><th>Tags</th></tr></thead><tbody>' + teamProfileRows + '</tbody></table></div>'));
    }

    if (readingRows.length) {
      var reading = '<div class="league-v1-text-block">' + readingRows.map(function (row) { return '<p>' + esc(row) + '</p>'; }).join('') + '</div>';
      out.push(section('Summary text', '', reading));
    }

    if (!out.length) {
      return section('Trend cards', 'no trends data available', '<div class="league-v1-text-block"><p>No trends fields were returned by the snapshot.</p></div>');
    }

    return out.join('');
  }

  function renderGames(league) {
    var list = state.gamesMode === 'upcoming' ? league.games.upcoming : league.games.recent;
    var rounds = ['all'];
    list.forEach(function (item) {
      if (rounds.indexOf(item.round) === -1) rounds.push(item.round);
    });

    var filtered = list.filter(function (item) {
      if (state.gamesRound === 'all') return true;
      return item.round === state.gamesRound;
    });

    var modeFilters = ['upcoming', 'recent'].map(function (mode) {
      var label = mode === 'upcoming' ? 'Proximos' : 'Recentes';
      var active = mode === state.gamesMode ? ' active' : '';
      return '<button class="league-v1-filter' + active + '" data-filter-kind="mode" data-filter-value="' + mode + '">' + label + '</button>';
    }).join('');

    var roundFilters = rounds.map(function (round) {
      var label = round === 'all' ? 'Todas rodadas' : round;
      var active = round === state.gamesRound ? ' active' : '';
      return '<button class="league-v1-filter' + active + '" data-filter-kind="round" data-filter-value="' + esc(round) + '">' + esc(label) + '</button>';
    }).join('');

    return section('Jogos da competicao', 'filtro por rodada e status',
      '<div class="league-v1-filters">' + modeFilters + '</div>' +
      '<div class="league-v1-filters">' + roundFilters + '</div>' +
      '<div class="league-v1-match-list">' + filtered.map(matchCard).join('') + '</div>'
    );
  }

  function renderTeams(league) {
    var cards = league.teamsIndex.map(function (team) {
      return '<article class="league-v1-team-card">' +
        '<div class="league-v1-team-head"><strong>' + esc(team.team) + '</strong><span>#' + esc(valueOrDash(team.position)) + '</span></div>' +
        '<div class="league-v1-row"><small>Forma</small><span>' + formDots(team.form) + '</span></div>' +
        '<div class="league-v1-row"><small>Gols pro</small><strong>' + esc(valueOrDash(team.goalsFor)) + '</strong></div>' +
        '<div class="league-v1-row"><small>Gols contra</small><strong>' + esc(valueOrDash(team.goalsAgainst)) + '</strong></div>' +
        (team.btts ? '<div class="league-v1-row"><small>BTTS</small><strong>' + esc(team.btts) + '</strong></div>' : '') +
        '</article>';
    }).join('');

    return section('Indice de times', 'snapshot por clube', '<div class="league-v1-team-grid">' + cards + '</div>');
  }

  function matchCard(match) {
    var statusRow = [];
    if (match.status) statusRow.push('<span class="league-v1-status">' + esc(match.status) + '</span>');
    if (match.round) statusRow.push('<span class="league-v1-status">' + esc(match.round) + '</span>');
    var tags = Array.isArray(match.tags) ? match.tags : [];

    return '<article class="league-v1-match-item">' +
      '<div class="league-v1-row"><strong>' + esc(match.home) + ' vs ' + esc(match.away) + '</strong><span class="league-v1-time">' + esc(match.kickoff) + '</span></div>' +
      (statusRow.length ? '<div class="league-v1-row">' + statusRow.join('') + '</div>' : '') +
      '<div class="league-v1-row"><div class="league-v1-tags">' + tags.map(function (tag) { return '<span class="league-v1-tag">' + esc(tag) + '</span>'; }).join('') + '</div><button class="league-v1-action">Analisar</button></div>' +
      '</article>';
  }

  function formDots(form) {
    var dots = String(form || '').split('').map(function (c) {
      var cls = c === 'W' ? 'W' : c === 'D' ? 'D' : 'L';
      return '<i class="' + cls + '" title="' + cls + '"></i>';
    }).join('');
    return '<span class="league-v1-form">' + dots + '</span>';
  }

  function renderPanels(league) {
    var htmlByTab = {
      overview: renderOverview(league),
      table: renderTable(league),
      statistics: renderStatistics(league),
      trends: renderTrends(league),
      games: renderGames(league),
      teams: renderTeams(league)
    };

    return TAB_ORDER.map(function (tab) {
      var active = tab === state.activeTab ? ' active' : '';
      return '<section class="league-v1-panel' + active + '" data-panel="' + tab + '">' + htmlByTab[tab] + '</section>';
    }).join('');
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function bindInteractions() {
    var root = document.querySelector('[data-league-v1-root]');
    if (!root) {
      console.warn('[LeaguePage] bindInteractions skipped: root not found');
      return;
    }

    root.querySelectorAll('.league-v1-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeTab = btn.getAttribute('data-tab');
        render();
      });
    });

    root.querySelectorAll('.league-v1-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-filter-kind');
        var value = btn.getAttribute('data-filter-value');
        if (kind === 'mode') {
          state.gamesMode = value;
          state.gamesRound = 'all';
        } else if (kind === 'round') {
          state.gamesRound = value;
        }
        render();
      });
    });

    var switcher = document.getElementById('leagueV1Switcher');
    if (switcher) {
      switcher.addEventListener('change', function () {
        setLeague(switcher.value);
      });
    }
  }

  function render() {
    var league = getLeague();
    var root = document.querySelector('[data-league-v1-root]');
    if (!root) {
      console.warn('[LeaguePage] render skipped: root not found');
      return;
    }

    if (state.loading) {
      root.innerHTML = '<section class="league-v1-section"><div class="league-v1-section-head"><h3 class="league-v1-section-title">Loading</h3></div><div class="league-v1-text-block"><p>Loading league data.</p></div></section>';
      return;
    }

    if (!league) {
      var reason = state.loadErrorBySlug[state.leagueSlug] || 'snapshot_not_loaded';
      root.innerHTML = '<section class="league-v1-section"><div class="league-v1-section-head"><h3 class="league-v1-section-title">Data unavailable</h3></div><div class="league-v1-text-block"><p>Official league snapshot is unavailable.</p><p>reason: ' + esc(reason) + '</p></div></section>';
      return;
    }

    try {
      root.innerHTML = renderHeader(league) + renderTabs() + renderPanels(league);
      bindInteractions();
    } catch (err) {
      console.error('[league-v1] render_failed', err && err.message ? err.message : err);
      root.innerHTML = '<section class="league-v1-section"><div class="league-v1-section-head"><h3 class="league-v1-section-title">Render error</h3></div><div class="league-v1-text-block"><p>Unable to render official league snapshot.</p></div></section>';
    }
  }

  async function initLeaguePage() {
    console.log('[LeaguePage] init start');

    var root = document.querySelector('[data-league-v1-root]');
    if (!root) {
      console.warn('[LeaguePage] init aborted: root not found');
      return;
    }

    await ensureLeagueDataLoaded(state.leagueSlug);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initLeaguePage().catch(function (err) {
        console.error('[LeaguePage] init failed', err && err.message ? err.message : err);
      });
    }, { once: true });
  } else {
    initLeaguePage().catch(function (err) {
      console.error('[LeaguePage] init failed', err && err.message ? err.message : err);
    });
  }
})();
