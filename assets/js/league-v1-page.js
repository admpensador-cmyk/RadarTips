(function () {
  var STORE = window.RT_LEAGUE_V1_DATA;
  if (!STORE || !STORE.bySlug) return;

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

  var state = {
    leagueSlug: getLeagueSlug(),
    activeTab: 'overview',
    gamesMode: 'upcoming',
    gamesRound: 'all',
    loading: false,
    leagueDataBySlug: {}
  };

  function getLeagueSlug() {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = params.get('league');
    if (fromQuery && STORE.bySlug[fromQuery]) return fromQuery;
    return STORE.defaultLeague;
  }

  function getFallbackLeague(slug) {
    return STORE.bySlug[slug] || STORE.bySlug[STORE.defaultLeague];
  }

  function getLeague() {
    return state.leagueDataBySlug[state.leagueSlug] || getFallbackLeague(state.leagueSlug);
  }

  async function setLeague(slug) {
    if (!STORE.bySlug[slug]) return;
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
    if (!Number.isFinite(num)) return '0.0%';
    return num.toFixed(1) + '%';
  }

  function asNum(value, digits) {
    var num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return num.toFixed(digits || 1);
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
    return (fixtures || []).slice(0, 5).map(function (f) {
      var tags = [];
      if (f.score) tags.push('result captured');
      if (f.round) tags.push(String(f.round));
      return {
        fixtureId: f.fixture_id,
        round: f.round || 'Round',
        kickoff: formatKickoff(f.kickoff_utc),
        status: f.status || 'Scheduled',
        home: f.home,
        away: f.away,
        tags: tags.length ? tags : ['league fixture']
      };
    });
  }

  function formatKickoff(isoUtc) {
    var ms = Date.parse(String(isoUtc || ''));
    if (!Number.isFinite(ms)) return 'TBD';
    var d = new Date(ms);
    var day = String(d.getUTCDate()).padStart(2, '0');
    var month = String(d.getUTCMonth() + 1).padStart(2, '0');
    var hh = String(d.getUTCHours()).padStart(2, '0');
    var mm = String(d.getUTCMinutes()).padStart(2, '0');
    return day + '/' + month + ' ' + hh + ':' + mm + ' UTC';
  }

  function deriveTrend(summary, leagueStats) {
    var goals = Number(summary.goals_per_game || 0);
    var btts = Number(summary.btts_pct || 0);
    var over25 = Number(summary.over_25_pct || 0);
    var clean = Number(summary.clean_sheets_pct || 0);
    return [
      { title: 'Goal trend', value: goals.toFixed(2) + ' goals/game', note: goals >= 2.7 ? 'high-volume phase' : 'moderate scoring pace' },
      { title: 'BTTS trend', value: btts.toFixed(1) + '%', note: btts >= 52 ? 'bilateral scoring above baseline' : 'mixed bilateral scoring' },
      { title: 'Home edge', value: asPct(leagueStats.home_away_splits ? leagueStats.home_away_splits.btts_home_pct : 50), note: 'home-away split monitored' },
      { title: 'Over/Under shape', value: over25.toFixed(1) + '% over 2.5', note: clean >= 40 ? 'defensive resistance still present' : 'open-game pattern' }
    ];
  }

  function adaptSnapshotToLeague(snapshot, fallbackLeague) {
    var competition = snapshot && snapshot.competition ? snapshot.competition : {};
    var summary = snapshot && snapshot.summary ? snapshot.summary : {};
    var standings = Array.isArray(snapshot && snapshot.standings) ? snapshot.standings : [];
    var fixtures = snapshot && snapshot.fixtures ? snapshot.fixtures : { upcoming: [], recent: [] };
    var statistics = snapshot && snapshot.statistics ? snapshot.statistics : {};
    var leagueStats = statistics.league || {};
    var teamRankings = Array.isArray(statistics.team_rankings) ? statistics.team_rankings : [];
    var splits = statistics.home_away_splits || {};
    var trends = snapshot && snapshot.trends ? snapshot.trends : {};

    var topAttack = standings.slice().sort(function (a, b) { return Number(b.goals_for || 0) - Number(a.goals_for || 0); })[0];
    var topDefense = standings.slice().sort(function (a, b) { return Number(a.goals_against || 999) - Number(b.goals_against || 999); })[0];
    var topOver = teamRankings.slice().sort(function (a, b) { return Number(b.over_25_pct || 0) - Number(a.over_25_pct || 0); })[0];
    var topBtts = teamRankings.slice().sort(function (a, b) { return Number(b.btts_pct || 0) - Number(a.btts_pct || 0); })[0];
    var topClean = teamRankings.slice().sort(function (a, b) { return Number(b.clean_sheets_pct || 0) - Number(a.clean_sheets_pct || 0); })[0];

    return {
      competition: {
        slug: competition.slug || fallbackLeague.competition.slug,
        code: fallbackLeague.competition.code,
        icon: fallbackLeague.competition.icon,
        name: competition.name || fallbackLeague.competition.name,
        country: competition.country || fallbackLeague.competition.country,
        season: competition.season || fallbackLeague.competition.season
      },
      heroMetrics: [
        { label: 'Goals / match', value: asNum(summary.goals_per_game, 2), trend: 'up' },
        { label: 'BTTS', value: asPct(summary.btts_pct), trend: 'steady' },
        { label: 'Over 2.5', value: asPct(summary.over_25_pct), trend: 'up' },
        { label: 'Clean sheets', value: asPct(summary.clean_sheets_pct), trend: 'steady' },
        { label: 'Avg corners', value: asNum(leagueStats.corners_avg, 1), trend: 'steady' }
      ],
      overview: {
        competitionSummary: [
          { label: 'Average goals', value: asNum(summary.goals_per_game, 2), insight: 'derived from finished season fixtures' },
          { label: 'BTTS', value: asPct(summary.btts_pct), insight: 'both teams to score ratio' },
          { label: 'Over 1.5', value: asPct(summary.over_15_pct), insight: 'goal floor consistency' },
          { label: 'Over 2.5', value: asPct(summary.over_25_pct), insight: 'primary totals trigger' },
          { label: 'Under 2.5', value: asPct(summary.under_25_pct), insight: 'controlled-game counterweight' },
          { label: 'Average corners', value: asNum(leagueStats.corners_avg, 1), insight: 'competition-level set-piece volume' }
        ],
        featuredMatches: buildFeaturedFromFixtures(fixtures.upcoming && fixtures.upcoming.length ? fixtures.upcoming : fixtures.recent),
        globalTrends: deriveTrend(summary, statistics),
        quickRankings: [
          { label: 'Best attack', team: topAttack ? topAttack.team : 'n/a' },
          { label: 'Best defense', team: topDefense ? topDefense.team : 'n/a' },
          { label: 'Most over 2.5', team: topOver ? topOver.team : 'n/a' },
          { label: 'Most BTTS', team: topBtts ? topBtts.team : 'n/a' },
          { label: 'Most clean sheets', team: topClean ? topClean.team : 'n/a' }
        ]
      },
      standings: standings.map(function (row) {
        return {
          position: Number(row.position || row.rank || 0),
          team: row.team,
          points: Number(row.points || 0),
          played: Number(row.played || 0),
          wins: Number(row.wins || 0),
          draws: Number(row.draws || 0),
          losses: Number(row.losses || 0),
          goalsFor: Number(row.goals_for || 0),
          goalsAgainst: Number(row.goals_against || 0),
          goalDiff: Number(row.goal_diff || 0),
          form: formString(row.form_last5)
        };
      }),
      statistics: {
        leagueStats: [
          { label: 'Goals / game', value: asNum(summary.goals_per_game, 2) },
          { label: 'BTTS', value: asPct(summary.btts_pct) },
          { label: 'Over 1.5', value: asPct(summary.over_15_pct) },
          { label: 'Over 2.5', value: asPct(summary.over_25_pct) },
          { label: 'Over 3.5', value: asPct(summary.over_35_pct) },
          { label: 'Under 2.5', value: asPct(summary.under_25_pct) },
          { label: 'Clean sheets', value: asPct(summary.clean_sheets_pct) },
          { label: 'Failed to score', value: asPct(summary.failed_to_score_pct) }
        ],
        teamRankings: teamRankings.map(function (row) {
          return {
            team: row.team,
            goalsFor: Number(row.goals_scored || 0),
            goalsAgainst: Number(row.goals_conceded || 0),
            btts: asPct(row.btts_pct),
            over25: asPct(row.over_25_pct),
            cleanSheets: asPct(row.clean_sheets_pct)
          };
        }),
        splits: [
          { metric: 'Goals', home: Number(splits.goals_home || 0), away: Number(splits.goals_away || 0) },
          { metric: 'BTTS', home: Number(splits.btts_home_pct || 0), away: Number(splits.btts_away_pct || 0) },
          { metric: 'Over 2.5', home: Number(splits.over_25_home_pct || 0), away: Number(splits.over_25_away_pct || 0) },
          { metric: 'Clean sheets', home: Number(splits.clean_sheets_home_pct || 0), away: Number(splits.clean_sheets_away_pct || 0) }
        ]
      },
      trends: {
        cards: Array.isArray(trends.trend_cards) && trends.trend_cards.length ? trends.trend_cards.map(function (card) {
          return { title: card.title, text: card.note ? (card.value + ' - ' + card.note) : card.value };
        }) : fallbackLeague.trends.cards,
        teamProfiles: Array.isArray(trends.team_profiles) ? trends.team_profiles.map(function (profile) {
          return { team: profile.team, profile: profile.profile, tags: profile.tags || [] };
        }) : fallbackLeague.trends.teamProfiles,
        reading: [
          String(trends.summary_text || 'Premier League data is now loaded from a consolidated real snapshot.'),
          String((snapshot.meta && snapshot.meta.generated_at_utc) ? ('Snapshot generated at ' + snapshot.meta.generated_at_utc + '.') : 'Data source is structured for upcoming multi-league rollout.')
        ]
      },
      games: {
        upcoming: buildFeaturedFromFixtures(fixtures.upcoming || []),
        recent: buildFeaturedFromFixtures(fixtures.recent || [])
      },
      teamsIndex: standings.map(function (row) {
        var rankRow = teamRankings.find(function (r) { return teamKey(r.team) === teamKey(row.team); }) || null;
        return {
          team: row.team,
          position: Number(row.position || 0),
          form: formString(row.form_last5),
          goalsFor: Number(row.goals_for || 0),
          goalsAgainst: Number(row.goals_against || 0),
          btts: rankRow ? asPct(rankRow.btts_pct) : '0.0%',
          profile: rankRow && Number(rankRow.clean_sheets_pct || 0) >= 35 ? 'defensive stable' : 'balanced profile'
        };
      })
    };
  }

  async function ensureLeagueDataLoaded(slug) {
    if (state.leagueDataBySlug[slug]) return;
    var fallbackLeague = getFallbackLeague(slug);
    var snapshotUrl = REAL_SNAPSHOT_BY_SLUG[slug];
    if (!snapshotUrl) {
      state.leagueDataBySlug[slug] = fallbackLeague;
      return;
    }

    state.loading = true;
    try {
      var snapshot = await fetchJson(snapshotUrl);
      state.leagueDataBySlug[slug] = adaptSnapshotToLeague(snapshot, fallbackLeague);
    } catch (err) {
      console.warn('[league-v1] snapshot fallback activated for', slug, err && err.message ? err.message : err);
      state.leagueDataBySlug[slug] = fallbackLeague;
    } finally {
      state.loading = false;
    }
  }

  function createTopMetric(metric) {
    return '<article class="league-v1-kpi">' +
      '<div class="league-v1-kpi-label">' + esc(metric.label) + '</div>' +
      '<div class="league-v1-kpi-value">' + esc(metric.value) + '</div>' +
      '<div class="league-v1-kpi-trend ' + esc(metric.trend) + '">' + esc(metric.trend) + '</div>' +
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
      '<span>RadarTips League Center v1</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="league-v1-switcher">' +
      '<label for="leagueV1Switcher">Competition</label>' +
      '<select id="leagueV1Switcher">' + options + '</select>' +
      '</div>' +
      '</div>' +
      '<div class="league-v1-kpis">' + league.heroMetrics.map(createTopMetric).join('') + '</div>' +
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
    var summaryCards = '<div class="league-v1-grid-3">' + league.overview.competitionSummary.map(function (metric) {
      return '<article class="league-v1-card">' +
        '<h4>' + esc(metric.label) + '</h4>' +
        '<p>' + esc(metric.value) + '</p>' +
        '<div class="league-v1-tagline">' + esc(metric.insight) + '</div>' +
        '</article>';
    }).join('') + '</div>';

    var featured = '<div class="league-v1-match-list">' + league.overview.featuredMatches.map(matchCard).join('') + '</div>';

    var trendCards = '<div class="league-v1-grid-4">' + league.overview.globalTrends.map(function (trend) {
      return '<article class="league-v1-card">' +
        '<h4>' + esc(trend.title) + '</h4>' +
        '<p>' + esc(trend.value) + '</p>' +
        '<div class="league-v1-tagline">' + esc(trend.note) + '</div>' +
        '</article>';
    }).join('') + '</div>';

    var rankings = '<div class="league-v1-grid-2">' + league.overview.quickRankings.map(function (item) {
      return '<article class="league-v1-card">' +
        '<h4>' + esc(item.label) + '</h4>' +
        '<p>' + esc(item.team) + '</p>' +
        '</article>';
    }).join('') + '</div>';

    return section('Resumo da competicao', 'snapshot analitico', summaryCards) +
      section('Destaques da rodada', '3-5 jogos priorizados', featured) +
      section('Tendencias globais', 'leitura de comportamento', trendCards) +
      section('Rankings rapidos', 'quem lidera cada eixo', rankings);
  }

  function renderTable(league) {
    var rows = league.standings.map(function (row) {
      return '<tr>' +
        '<td><span class="league-v1-pos">' + row.position + '</span></td>' +
        '<td><strong>' + esc(row.team) + '</strong></td>' +
        '<td>' + row.points + '</td>' +
        '<td>' + row.played + '</td>' +
        '<td>' + row.wins + '</td>' +
        '<td>' + row.draws + '</td>' +
        '<td>' + row.losses + '</td>' +
        '<td>' + row.goalsFor + '</td>' +
        '<td>' + row.goalsAgainst + '</td>' +
        '<td>' + row.goalDiff + '</td>' +
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
    var statCards = '<div class="league-v1-grid-4">' + league.statistics.leagueStats.map(function (stat) {
      return '<article class="league-v1-card"><h4>' + esc(stat.label) + '</h4><p>' + esc(stat.value) + '</p></article>';
    }).join('') + '</div>';

    var teamRows = league.statistics.teamRankings.map(function (row) {
      return '<tr><td><strong>' + esc(row.team) + '</strong></td><td>' + row.goalsFor + '</td><td>' + row.goalsAgainst + '</td><td>' + esc(row.btts) + '</td><td>' + esc(row.over25) + '</td><td>' + row.cleanSheets + '</td></tr>';
    }).join('');

    var splitRows = league.statistics.splits.map(function (split) {
      return '<article class="league-v1-card">' +
        '<h4>' + esc(split.metric) + '</h4>' +
        '<p>Home ' + split.home + '% vs Away ' + split.away + '%</p>' +
        '<div class="league-v1-split-bar"><span class="league-v1-split-home" style="width:' + split.home + '%"></span><span class="league-v1-split-away" style="width:' + split.away + '%"></span></div>' +
        '</article>';
    }).join('');

    return section('Estatisticas gerais da liga', 'camada macro', statCards) +
      section('Rankings por time', 'densidade por clube', '<div class="league-v1-table-wrap"><table class="league-v1-table"><thead><tr><th>Time</th><th>Gols marcados</th><th>Gols sofridos</th><th>BTTS</th><th>Over 2.5</th><th>Clean sheets</th></tr></thead><tbody>' + teamRows + '</tbody></table></div>') +
      section('Splits mandante vs visitante', 'comparativo visual', '<div class="league-v1-grid-2">' + splitRows + '</div>');
  }

  function renderTrends(league) {
    var cards = '<div class="league-v1-grid-2">' + league.trends.cards.map(function (card) {
      return '<article class="league-v1-card"><h4>' + esc(card.title) + '</h4><p>' + esc(card.text) + '</p></article>';
    }).join('') + '</div>';

    var teamProfileRows = league.trends.teamProfiles.map(function (entry) {
      return '<tr><td><strong>' + esc(entry.team) + '</strong></td><td>' + esc(entry.profile) + '</td><td>' + entry.tags.map(function (tag) { return '<span class="league-v1-tag">' + esc(tag) + '</span>'; }).join(' ') + '</td></tr>';
    }).join('');

    var reading = '<div class="league-v1-text-block"><p>' + esc(league.trends.reading[0]) + '</p><p>' + esc(league.trends.reading[1]) + '</p></div>';

    return section('Tendencias da competicao', 'interpretable layer', cards) +
      section('Perfil dos times', 'tags analiticas', '<div class="league-v1-table-wrap"><table class="league-v1-table"><thead><tr><th>Time</th><th>Perfil</th><th>Tags</th></tr></thead><tbody>' + teamProfileRows + '</tbody></table></div>') +
      section('Leitura automatica', 'resumo contextual', reading);
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
        '<div class="league-v1-team-head"><strong>' + esc(team.team) + '</strong><span>#' + team.position + '</span></div>' +
        '<div class="league-v1-row"><small>Forma</small><span>' + formDots(team.form) + '</span></div>' +
        '<div class="league-v1-row"><small>Gols pro</small><strong>' + team.goalsFor + '</strong></div>' +
        '<div class="league-v1-row"><small>Gols contra</small><strong>' + team.goalsAgainst + '</strong></div>' +
        '<div class="league-v1-row"><small>BTTS</small><strong>' + esc(team.btts) + '</strong></div>' +
        '<div class="league-v1-profile">' + esc(team.profile) + '</div>' +
        '</article>';
    }).join('');

    return section('Indice de times', 'snapshot por clube', '<div class="league-v1-team-grid">' + cards + '</div>');
  }

  function matchCard(match) {
    return '<article class="league-v1-match-item">' +
      '<div class="league-v1-row"><strong>' + esc(match.home) + ' vs ' + esc(match.away) + '</strong><span class="league-v1-time">' + esc(match.kickoff) + '</span></div>' +
      '<div class="league-v1-row"><span class="league-v1-status">' + esc(match.status) + '</span><span class="league-v1-status">' + esc(match.round) + '</span></div>' +
      '<div class="league-v1-row"><div class="league-v1-tags">' + match.tags.map(function (tag) { return '<span class="league-v1-tag">' + esc(tag) + '</span>'; }).join('') + '</div><button class="league-v1-action">Analisar</button></div>' +
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
    if (!root) return;

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
    if (!root) return;

    if (state.loading) {
      root.innerHTML = '<section class="league-v1-section"><div class="league-v1-section-head"><h3 class="league-v1-section-title">Loading competition data</h3><div class="league-v1-section-note">building view...</div></div><div class="league-v1-text-block"><p>Fetching consolidated league snapshot.</p></div></section>';
      return;
    }

    root.innerHTML = renderHeader(league) + renderTabs() + renderPanels(league);
    bindInteractions();
  }

  (async function init() {
    await ensureLeagueDataLoaded(state.leagueSlug);
    render();
  })();
})();
