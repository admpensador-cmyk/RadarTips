(function () {
  var STORE = window.RT_LEAGUE_V1_DATA;

  var TAB_ORDER = ['overview', 'table', 'teamProfiles', 'statistics', 'trends', 'games', 'teams'];
  var TAB_LABELS = {
    overview: 'Visao Geral',
    table: 'Tabela',
    teamProfiles: 'Team Profiles',
    statistics: 'Estatisticas',
    trends: 'Tendencias',
    games: 'Jogos',
    teams: 'Times'
  };

  /** Static snapshots under /data/v1/leagues/ — no API-Football in browser; premier may use Worker JSON. */
  var REAL_SNAPSHOT_BY_SLUG = {
    'premier-league': '/api/v1/leagues/premier-league.json',
    brasileirao: '/data/v1/leagues/brasileirao.json'
  };

  /** Aligns with app.js COUNTRY_LABEL_TO_ISO for league hero flags (SVG under /assets/flags/countries/). */
  var LEAGUE_COUNTRY_TO_ISO = {
    argentina: 'AR', australia: 'AU', austria: 'AT', belgium: 'BE', bolivia: 'BO', brazil: 'BR',
    canada: 'CA', chile: 'CL', colombia: 'CO', 'costa rica': 'CR', croatia: 'HR', czechia: 'CZ',
    denmark: 'DK', ecuador: 'EC', england: 'GB', europe: 'EU', finland: 'FI', france: 'FR',
    germany: 'DE', greece: 'GR', honduras: 'HN', ireland: 'IE', italy: 'IT', japan: 'JP',
    mexico: 'MX', netherlands: 'NL', norway: 'NO', paraguay: 'PY', peru: 'PE', poland: 'PL',
    portugal: 'PT', romania: 'RO', scotland: 'GB', serbia: 'RS', slovakia: 'SK', slovenia: 'SI',
    'south africa': 'ZA', spain: 'ES', sweden: 'SE', switzerland: 'CH', turkey: 'TR', ukraine: 'UA',
    uruguay: 'UY', usa: 'US', 'united states': 'US', venezuela: 'VE', wales: 'GB'
  };

  function leagueCountryToIso(label) {
    var s = String(label || '').trim().replace(/-/g, ' ');
    if (!s) return '';
    var up = s.toUpperCase();
    if (up === 'UK') return 'GB';
    if (/^[A-Z]{2}$/.test(up)) return up;
    return LEAGUE_COUNTRY_TO_ISO[s.toLowerCase()] || '';
  }

  function buildRuntimeStore() {
    return {
      availableLeagues: [
        { slug: 'premier-league', name: 'Premier League', code: 'PL', icon: '🦁', country: 'England', season: 'current' },
        { slug: 'brasileirao', name: 'Brasileirão Série A', code: 'BR', icon: '🇧🇷', country: 'Brazil', season: 'current' }
      ],
      defaultLeague: 'premier-league',
      bySlug: {
        'premier-league': {
          competition: {
            slug: 'premier-league',
            code: 'PL',
            icon: '🦁',
            name: 'Premier League',
            country: 'England',
            season: 'current'
          },
          heroMetrics: [
            { label: 'Goals / match', value: '-', trend: 'steady' },
            { label: 'BTTS', value: '-', trend: 'steady' },
            { label: 'Over 2.5', value: '-', trend: 'steady' },
            { label: 'Clean sheets', value: '-', trend: 'steady' }
          ],
          overview: { competitionSummary: [], featuredMatches: [], globalTrends: [], quickRankings: [] },
          standings: [],
          statistics: { leagueStats: [], rankings: [], teams: [], splits: [] },
          trends: { cards: [], teamProfiles: [], reading: ['Awaiting league snapshot.', ''] },
          games: { upcoming: [], recent: [] },
          teamsIndex: [],
          teamProfileComparison: { rows: [], leaders: {}, showGkColumn: false, hasOverallScore: false }
        },
        brasileirao: {
          competition: {
            slug: 'brasileirao',
            code: 'BR',
            icon: '🇧🇷',
            name: 'Brasileirão Série A',
            country: 'Brazil',
            season: 'current'
          },
          heroMetrics: [
            { label: 'Goals / match', value: '-', trend: 'steady' },
            { label: 'BTTS', value: '-', trend: 'steady' },
            { label: 'Over 2.5', value: '-', trend: 'steady' },
            { label: 'Clean sheets', value: '-', trend: 'steady' }
          ],
          overview: { competitionSummary: [], featuredMatches: [], globalTrends: [], quickRankings: [] },
          standings: [],
          statistics: { leagueStats: [], rankings: [], teams: [], splits: [] },
          trends: { cards: [], teamProfiles: [], reading: ['Awaiting league snapshot.', ''] },
          games: { upcoming: [], recent: [] },
          teamsIndex: [],
          teamProfileComparison: { rows: [], leaders: {}, showGkColumn: false, hasOverallScore: false }
        }
      }
    };
  }

  if (!STORE || !STORE.bySlug) {
    STORE = buildRuntimeStore();
  }

  var state = {
    leagueSlug: getLeagueSlug(),
    activeTab: 'overview',
    gamesMode: 'upcoming',
    gamesRound: 'all',
    loading: false,
    leagueDataBySlug: {},
    statsTeamSort: { column: null, direction: 'desc' },
    profileTeamSort: { column: null, direction: 'desc' },
    profileSortLeagueKey: null
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
    state.statsTeamSort = { column: null, direction: 'desc' };
    state.profileSortLeagueKey = null;
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

  function getLocalePrefix() {
    var L = typeof window !== 'undefined' && window.RT_LOCALE ? String(window.RT_LOCALE).trim() : 'en';
    L = L.toLowerCase();
    if (!/^[a-z]{2}$/.test(L)) L = 'en';
    return L;
  }

  function teamSlug(name) {
    var base = String(name || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    return base
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'team';
  }

  function teamPageHref(name) {
    return '/' + getLocalePrefix() + '/team/?name=' + encodeURIComponent(teamSlug(name));
  }

  function teamNameLink(name) {
    var n = String(name || '');
    return '<a class="league-v1-team-link" href="' + esc(teamPageHref(n)) + '">' + esc(n) + '</a>';
  }

  function teamNameLinkMaybe(name) {
    var n = String(name || '').trim();
    if (!n || /^n\/a$/i.test(n)) return esc(n || '—');
    return teamNameLink(n);
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

  function adaptSnapshotToLeague(snapshot, fallbackLeague) {
    var competition = snapshot && snapshot.competition ? snapshot.competition : {};
    var summary = snapshot && snapshot.summary ? snapshot.summary : {};
    var standings = Array.isArray(snapshot && snapshot.standings) ? snapshot.standings : [];
    var fixtures = snapshot && snapshot.fixtures ? snapshot.fixtures : { finished: [], upcoming: [], recent: [] };
    var statistics = snapshot && snapshot.statistics ? snapshot.statistics : {};
    var teamsStats = Array.isArray(statistics.teams) ? statistics.teams : [];
    var trends = snapshot && snapshot.trends ? snapshot.trends : {};
    var ui = snapshot && snapshot.league_page_ui ? snapshot.league_page_ui : null;

    var rawCountryIso = String(competition.country_code || competition.country_iso || '').trim().toUpperCase();
    var countryIso = /^[A-Z]{2}$/.test(rawCountryIso)
      ? rawCountryIso
      : leagueCountryToIso(competition.country || fallbackLeague.competition.country || '');
    var logoUrl = String(competition.logo || competition.logo_url || competition.emblem || competition.emblem_url || '').trim();

    var dashHero = [
      { label: 'Goals / match', value: '—', trend: 'steady' },
      { label: 'BTTS', value: '—', trend: 'steady' },
      { label: 'Over 2.5', value: '—', trend: 'steady' },
      { label: 'Clean sheets', value: '—', trend: 'steady' }
    ];
    var heroMetrics =
      ui && Array.isArray(ui.hero_metrics)
        ? ui.hero_metrics.map(function (m) {
            return {
              label: String(m.label || ''),
              value: String(m.value != null ? m.value : '—'),
              trend: String(m.trend || 'steady')
            };
          })
        : dashHero;

    var overviewComp =
      ui && Array.isArray(ui.overview_competition_summary)
        ? ui.overview_competition_summary.map(function (c) {
            return {
              label: String(c.label || ''),
              value: String(c.value != null ? c.value : '—'),
              insight: String(c.insight || '')
            };
          })
        : [];

    var globalTrends =
      ui && Array.isArray(ui.overview_global_trends)
        ? ui.overview_global_trends.map(function (t) {
            return {
              title: String(t.title || ''),
              value: String(t.value != null ? t.value : '—'),
              note: String(t.note || '')
            };
          })
        : [];

    var quickRankings =
      ui && Array.isArray(ui.quick_rankings)
        ? ui.quick_rankings.map(function (q) {
            return { label: String(q.label || ''), team: String(q.team != null ? q.team : 'n/a') };
          })
        : [];

    var leagueStatsCards =
      ui && Array.isArray(ui.statistics_league_cards)
        ? ui.statistics_league_cards.map(function (c) {
            return { label: String(c.label || ''), value: String(c.value != null ? c.value : '—') };
          })
        : [];

    var rankingGroups =
      ui && Array.isArray(ui.statistics_ranking_groups)
        ? ui.statistics_ranking_groups.map(function (g) {
            var rows = Array.isArray(g.rows)
              ? g.rows.map(function (row) {
                  return {
                    team: row.team,
                    value: Number(row.value),
                    matches: Number(row.matches || 0)
                  };
                })
              : [];
            return { title: String(g.title || ''), rows: rows };
          })
        : [];

    var splitsUi =
      ui && Array.isArray(ui.statistics_splits)
        ? ui.statistics_splits.map(function (s) {
            return {
              metric: String(s.metric || ''),
              homeLabel: String(s.home_label != null ? s.home_label : '—'),
              awayLabel: String(s.away_label != null ? s.away_label : '—'),
              barHome: Number(s.bar_home),
              barAway: Number(s.bar_away)
            };
          })
        : [];

    var teamsIndexUi =
      ui && Array.isArray(ui.teams_index)
        ? ui.teams_index.map(function (r) {
            return {
              team: r.team,
              position: Number(r.position || 0),
              form: String(r.form || ''),
              goalsFor: Number(r.goalsFor || 0),
              goalsAgainst: Number(r.goalsAgainst || 0),
              btts: String(r.btts != null ? r.btts : '—'),
              profile: String(r.profile != null ? r.profile : '—')
            };
          })
        : [];

    var tpc = ui && ui.team_profile_comparison ? ui.team_profile_comparison : null;
    var teamProfileComparison = {
      rows: tpc && Array.isArray(tpc.rows) ? tpc.rows : [],
      leaders: tpc && tpc.leaders ? tpc.leaders : {},
      showGkColumn: !!(tpc && tpc.show_gk_column),
      hasOverallScore: !!(tpc && tpc.has_overall_score)
    };

    return {
      competition: {
        slug: competition.slug || fallbackLeague.competition.slug,
        code: fallbackLeague.competition.code,
        icon: fallbackLeague.competition.icon,
        name: competition.name || fallbackLeague.competition.name,
        country: competition.country || fallbackLeague.competition.country,
        season: competition.season || fallbackLeague.competition.season,
        logoUrl: logoUrl,
        countryIso: countryIso
      },
      heroMetrics: heroMetrics,
      overview: {
        competitionSummary: overviewComp,
        featuredMatches: buildFeaturedFromFixtures(fixtures.upcoming && fixtures.upcoming.length ? fixtures.upcoming : fixtures.recent),
        globalTrends: globalTrends,
        quickRankings: quickRankings
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
        leagueStats: leagueStatsCards,
        rankings: rankingGroups,
        teams: teamsStats.map(function (row) {
          return {
            team_id: Number(row.team_id || 0),
            team: row.team,
            played: Number(row.played || row.matches || 0),
            goals_for: Number(row.goals_for || row.goals_scored || 0),
            goals_against: Number(row.goals_against || row.goals_conceded || 0),
            goals_for_per_game: asNum(row.goals_for_per_game, 2),
            goals_against_per_game: asNum(row.goals_against_per_game, 2),
            over_15_pct: asPct(row.over_15_pct),
            over_25_pct: asPct(row.over_25_pct),
            over_35_pct: asPct(row.over_35_pct),
            btts_pct: asPct(row.btts_pct),
            clean_sheets_pct: asPct(row.clean_sheets_pct),
            failed_to_score_pct: asPct(row.failed_to_score_pct)
          };
        }),
        splits: splitsUi
      },
      trends: {
        cards: Array.isArray(trends.trend_cards) && trends.trend_cards.length
          ? trends.trend_cards.map(function (card) {
              return { title: card.title, text: card.note ? card.value + ' - ' + card.note : card.value };
            })
          : fallbackLeague.trends.cards,
        teamProfiles: Array.isArray(trends.team_profiles)
          ? trends.team_profiles.map(function (profile) {
              return { team: profile.team, profile: profile.profile, tags: profile.tags || [] };
            })
          : fallbackLeague.trends.teamProfiles,
        reading: (function () {
          var genAt = (snapshot.meta && snapshot.meta.generated_at_utc) || competition.generated_at_utc || '';
          var leagueName = competition.name || fallbackLeague.competition.name || 'League';
          return [
            String(trends.summary_text || leagueName + ' — data loaded from the persisted fixture-derived snapshot.'),
            genAt ? 'Snapshot generated at ' + String(genAt) + '.' : 'Structured snapshot: standings, team statistics, fixtures.'
          ];
        })()
      },
      games: {
        upcoming: buildFeaturedFromFixtures(fixtures.upcoming || []),
        recent: buildFeaturedFromFixtures(fixtures.recent || [])
      },
      teamsIndex: teamsIndexUi.length ? teamsIndexUi : [],
      teamProfileComparison: teamProfileComparison
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

    var c = league.competition;
    var iso = String(c.countryIso || leagueCountryToIso(c.country) || '').toUpperCase();
    var flagPath = /^[A-Z]{2}$/.test(iso) ? '/assets/flags/countries/' + iso.toLowerCase() + '.svg' : '';
    var flagHtml = flagPath
      ? '<span class="league-v1-country-flag" title="' + esc(c.country || '') + '"><img src="' + esc(flagPath) + '" alt="" width="32" height="24" decoding="async" loading="lazy" /></span>'
      : '<span class="league-v1-country-flag league-v1-country-flag--empty" aria-hidden="true"></span>';

    var logoUrl = String(c.logoUrl || '').trim();
    var logoHtml;
    if (logoUrl) {
      logoHtml = '<div class="league-v1-competition-logo"><img src="' + esc(logoUrl) + '" alt="" decoding="async" loading="lazy" /></div>';
    } else if (c.icon) {
      logoHtml = '<div class="league-v1-competition-logo league-v1-competition-logo--fallback" aria-hidden="true">' + esc(c.icon) + '</div>';
    } else {
      logoHtml = '<div class="league-v1-competition-logo league-v1-competition-logo--empty" aria-hidden="true"></div>';
    }

    return '<section class="league-v1-header">' +
      '<div class="league-v1-header-top">' +
      '<div class="league-v1-identity">' +
      '<div class="league-v1-hero-visual">' + flagHtml + logoHtml + '</div>' +
      '<div class="league-v1-title-wrap">' +
      '<h1>' + esc(c.name) + '</h1>' +
      '<div class="league-v1-meta">' +
      '<span class="league-v1-meta-country">' + esc(c.country) + '</span>' +
      '<span class="league-v1-meta-season">' + esc((function () {
        var s = String(c.season || '').trim();
        if (!s) return 'Season —';
        if (s.toLowerCase() === 'current') return 'Current season';
        return 'Season ' + s;
      })()) + '</span>' +
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
        '<p>' + teamNameLinkMaybe(item.team) + '</p>' +
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
        '<td><strong>' + teamNameLink(row.team) + '</strong></td>' +
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

  /** Table cell: track + fill + value (same rt-team-prof-* as Team Page). */
  function profileScoreBarCell(score) {
    var s = score != null && Number.isFinite(Number(score)) ? Number(score) : null;
    var valText = s == null ? '—' : String(Math.round(s));
    var w = s == null ? 0 : Math.max(0, Math.min(100, s));
    var fill = '<span class="rt-team-prof-fill" style="width:' + w + '%"></span>';
    return (
      '<div class="profile-cell">' +
      '<div class="rt-team-prof-track" role="presentation">' +
      fill +
      '</div>' +
      '<span class="rt-team-prof-val">' +
      esc(valText) +
      '</span>' +
      '</div>'
    );
  }

  function renderProfileLeaderGrid(meta) {
    var L = meta.leaders || {};
    var defs = [
      { key: 'overall', label: 'Best Overall' },
      { key: 'attack', label: 'Best Attack' },
      { key: 'defense', label: 'Best Defense' },
      { key: 'control', label: 'Best Control' },
      { key: 'consistency', label: 'Most Consistent' },
      { key: 'goalkeeper', label: 'Best Goalkeeper' }
    ];
    var parts = [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (d.key === 'goalkeeper' && !meta.showGkColumn) continue;
      var b = L[d.key];
      if (!b) continue;
      parts.push(
        '<div class="leader-card">' +
          '<div class="leader-label">' +
          esc(d.label) +
          '</div>' +
          '<div class="leader-team">' +
          teamNameLink(b.team) +
          '</div>' +
          '<div class="leader-value">' +
          esc(b.value.toFixed(1)) +
          '</div>' +
          '</div>'
      );
    }
    if (!parts.length) return '';
    return '<div class="league-v1-profile-leaders">' + parts.join('') + '</div>';
  }

  function profileTeamTh(label, col) {
    var st = state.profileTeamSort || { column: null, direction: 'desc' };
    var active = st.column === col;
    var arrow = active
      ? '<span class="league-v1-sort-arrow" aria-hidden="true">' + (st.direction === 'desc' ? '\u2193' : '\u2191') + '</span>'
      : '';
    return (
      '<th class="league-v1-th-sortable" data-profile-sort-col="' +
      esc(col) +
      '" tabindex="0" title="Sort column">' +
      esc(label) +
      arrow +
      '</th>'
    );
  }

  function getProfileSortValue(row, col) {
    if (col === 'team') return String(row.team || '');
    return profileDimensionNumeric(row, col);
  }

  function sortProfileRowsByColumn(rows, col, dir) {
    var desc = dir === 'desc';
    var isStr = col === 'team';
    return rows
      .map(function (row, idx) {
        return { row: row, idx: idx };
      })
      .sort(function (a, b) {
        var cmp = 0;
        if (isStr) {
          var sa = String(getProfileSortValue(a.row, col));
          var sb = String(getProfileSortValue(b.row, col));
          cmp = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
          if (desc) cmp = -cmp;
        } else {
          var na = getProfileSortValue(a.row, col);
          var nb = getProfileSortValue(b.row, col);
          if (!Number.isFinite(na)) na = desc ? -Infinity : Infinity;
          if (!Number.isFinite(nb)) nb = desc ? -Infinity : Infinity;
          cmp = desc ? nb - na : na - nb;
        }
        if (cmp !== 0) return cmp;
        return a.idx - b.idx;
      })
      .map(function (x) {
        return x.row;
      });
  }

  function getSortedProfileRows(league) {
    var meta = league.teamProfileComparison || { rows: [], hasOverallScore: false };
    var base = Array.isArray(meta.rows) ? meta.rows.slice() : [];
    var st = state.profileTeamSort || { column: null, direction: 'desc' };
    if (!st.column) {
      return sortProfileRowsByColumn(
        base,
        meta.hasOverallScore ? 'overall' : 'team',
        meta.hasOverallScore ? 'desc' : 'asc'
      );
    }
    return sortProfileRowsByColumn(base, st.column, st.direction);
  }

  function renderTeamProfiles(league) {
    var meta = league.teamProfileComparison || {
      rows: [],
      leaders: {},
      showGkColumn: false,
      hasOverallScore: false
    };
    var leaderHtml = renderProfileLeaderGrid(meta);
    var theadCols =
      profileTeamTh('Team', 'team') +
      profileTeamTh('Overall', 'overall') +
      profileTeamTh('Attack', 'attack') +
      profileTeamTh('Defense', 'defense') +
      profileTeamTh('Control', 'control') +
      profileTeamTh('Consistency', 'consistency') +
      profileTeamTh('Aggressiveness', 'aggressiveness') +
      profileTeamTh('Goalkeeper', 'goalkeeper');

    var body = getSortedProfileRows(league)
      .map(function (r) {
        var sc = r.scores;
        return (
          '<tr>' +
          '<td><strong>' +
          teamNameLink(r.team) +
          '</strong></td>' +
          '<td>' +
          profileScoreBarCell(sc ? sc.overall : null) +
          '</td>' +
          '<td>' +
          profileScoreBarCell(sc ? sc.attack : null) +
          '</td>' +
          '<td>' +
          profileScoreBarCell(sc ? sc.defense : null) +
          '</td>' +
          '<td>' +
          profileScoreBarCell(sc ? sc.control : null) +
          '</td>' +
          '<td>' +
          profileScoreBarCell(sc ? sc.consistency : null) +
          '</td>' +
          '<td>' +
          profileScoreBarCell(sc ? sc.aggressiveness : null) +
          '</td>' +
          '<td>' +
          profileScoreBarCell(sc ? sc.goalkeeper : null) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var note =
      'Scores are cohort-relative (0–100), computed from published team statistics in this snapshot. Click a column header to sort (first click: highest first; Team: Z–A first).';
    if (!meta.hasOverallScore && meta.rows.length) {
      note += ' Some leagues lack fields needed for a full profile; em dashes mean that dimension could not be scored.';
    }

    return section(
      'Team profile comparison',
      note,
      (leaderHtml ? leaderHtml : '') +
        '<div class="league-v1-table-wrap league-v1-table-wrap--profile">' +
        '<table class="league-v1-table" data-league-v1-profile-table>' +
        '<thead><tr>' +
        theadCols +
        '</tr></thead><tbody>' +
        body +
        '</tbody></table></div>'
    );
  }

  function sortStatisticsTeamsByStandings(teams, standings) {
    var posByKey = {};
    (standings || []).forEach(function (row) {
      var k = teamKey(row.team);
      var p = Number(row.position != null ? row.position : row.rank);
      if (k && Number.isFinite(p) && p > 0) posByKey[k] = p;
    });
    return teams.slice().sort(function (a, b) {
      var ka = teamKey(a.team);
      var kb = teamKey(b.team);
      var pa = Object.prototype.hasOwnProperty.call(posByKey, ka) ? posByKey[ka] : 9999;
      var pb = Object.prototype.hasOwnProperty.call(posByKey, kb) ? posByKey[kb] : 9999;
      if (pa !== pb) return pa - pb;
      return String(a.team || '').localeCompare(String(b.team || ''), undefined, { sensitivity: 'base' });
    });
  }

  function pctToSortNum(v) {
    var n = parseFloat(String(v || '').replace(/%/g, '').replace(/,/g, '.').trim());
    return Number.isFinite(n) ? n : NaN;
  }

  function decimalCellToNum(v) {
    var s = String(v == null ? '' : v).trim();
    if (s === '' || s === '-') return NaN;
    var n = parseFloat(s.replace(/,/g, '.'));
    return Number.isFinite(n) ? n : NaN;
  }

  function getTeamStatSortValue(row, col) {
    if (col === 'team') return String(row.team || '');
    if (col === 'j') return Number(row.played || 0);
    if (col === 'gf') return Number(row.goals_for || 0);
    if (col === 'ga') return Number(row.goals_against || 0);
    if (col === 'gfj') return decimalCellToNum(row.goals_for_per_game);
    if (col === 'gaj') return decimalCellToNum(row.goals_against_per_game);
    if (col === 'o15') return pctToSortNum(row.over_15_pct);
    if (col === 'o25') return pctToSortNum(row.over_25_pct);
    if (col === 'o35') return pctToSortNum(row.over_35_pct);
    if (col === 'btts') return pctToSortNum(row.btts_pct);
    if (col === 'cs') return pctToSortNum(row.clean_sheets_pct);
    if (col === 'fts') return pctToSortNum(row.failed_to_score_pct);
    return 0;
  }

  function sortTeamStatsByColumn(teams, col, dir) {
    var desc = dir === 'desc';
    var isStr = col === 'team';
    return teams
      .map(function (row, idx) {
        return { row: row, idx: idx };
      })
      .sort(function (a, b) {
        var cmp = 0;
        if (isStr) {
          var sa = String(getTeamStatSortValue(a.row, col));
          var sb = String(getTeamStatSortValue(b.row, col));
          cmp = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
          if (desc) cmp = -cmp;
        } else {
          var na = getTeamStatSortValue(a.row, col);
          var nb = getTeamStatSortValue(b.row, col);
          if (!Number.isFinite(na)) na = desc ? -Infinity : Infinity;
          if (!Number.isFinite(nb)) nb = desc ? -Infinity : Infinity;
          cmp = desc ? nb - na : na - nb;
        }
        if (cmp !== 0) return cmp;
        return a.idx - b.idx;
      })
      .map(function (x) {
        return x.row;
      });
  }

  function getSortedTeamStatsRows(league) {
    var base = league.statistics.teams || [];
    var st = state.statsTeamSort || { column: null, direction: 'desc' };
    if (!st.column) return sortStatisticsTeamsByStandings(base, league.standings);
    return sortTeamStatsByColumn(base.slice(), st.column, st.direction);
  }

  function statsTeamTh(label, col) {
    var st = state.statsTeamSort || { column: null, direction: 'desc' };
    var active = st.column === col;
    var arrow = active
      ? '<span class="league-v1-sort-arrow" aria-hidden="true">' + (st.direction === 'desc' ? '\u2193' : '\u2191') + '</span>'
      : '';
    return (
      '<th class="league-v1-th-sortable" data-sort-col="' +
      esc(col) +
      '" tabindex="0" title="Sort column">' +
      esc(label) +
      arrow +
      '</th>'
    );
  }

  function renderStatistics(league) {
    var statCards = '<div class="league-v1-grid-4">' + (league.statistics.leagueStats || []).map(function (stat) {
      return '<article class="league-v1-card"><h4>' + esc(stat.label) + '</h4><p>' + esc(stat.value) + '</p></article>';
    }).join('') + '</div>';

    var rankingBlocks = '<div class="league-v1-grid-2">' + (league.statistics.rankings || []).map(function (group) {
      var rows = (group.rows || []).slice(0, 5).map(function (row) {
        return '<tr><td><strong>' + teamNameLinkMaybe(row.team) + '</strong></td><td>' + asNum(row.value, 2) + '</td><td>' + Number(row.matches || 0) + '</td></tr>';
      }).join('');
      return '<article class="league-v1-card">' +
        '<h4>' + esc(group.title) + '</h4>' +
        '<div class="league-v1-table-wrap"><table class="league-v1-table"><thead><tr><th>Time</th><th>Valor</th><th>Jogos</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '</article>';
    }).join('') + '</div>';

    var teamStatsThead =
      '<tr>' +
      statsTeamTh('Time', 'team') +
      statsTeamTh('J', 'j') +
      statsTeamTh('GF', 'gf') +
      statsTeamTh('GA', 'ga') +
      statsTeamTh('GF/J', 'gfj') +
      statsTeamTh('GA/J', 'gaj') +
      statsTeamTh('O1.5', 'o15') +
      statsTeamTh('O2.5', 'o25') +
      statsTeamTh('O3.5', 'o35') +
      statsTeamTh('BTTS', 'btts') +
      statsTeamTh('CS', 'cs') +
      statsTeamTh('FTS', 'fts') +
      '</tr>';

    var teamRows = getSortedTeamStatsRows(league).map(function (row) {
      return (
        '<tr>' +
        '<td><strong>' + teamNameLink(row.team) + '</strong></td>' +
        '<td>' + Number(row.played || 0) + '</td>' +
        '<td>' + Number(row.goals_for || 0) + '</td>' +
        '<td>' + Number(row.goals_against || 0) + '</td>' +
        '<td>' + esc(row.goals_for_per_game) + '</td>' +
        '<td>' + esc(row.goals_against_per_game) + '</td>' +
        '<td>' + esc(row.over_15_pct) + '</td>' +
        '<td>' + esc(row.over_25_pct) + '</td>' +
        '<td>' + esc(row.over_35_pct) + '</td>' +
        '<td>' + esc(row.btts_pct) + '</td>' +
        '<td>' + esc(row.clean_sheets_pct) + '</td>' +
        '<td>' + esc(row.failed_to_score_pct) + '</td>' +
        '</tr>'
      );
    }).join('');

    var splitRows = (league.statistics.splits || []).map(function (split) {
      return '<article class="league-v1-card">' +
        '<h4>' + esc(split.metric) + '</h4>' +
        '<p>Home ' + esc(split.homeLabel) + ' vs Away ' + esc(split.awayLabel) + '</p>' +
        '<div class="league-v1-split-bar"><span class="league-v1-split-home" style="width:' + Number(split.barHome || 0) + '%"></span><span class="league-v1-split-away" style="width:' + Number(split.barAway || 0) + '%"></span></div>' +
        '</article>';
    }).join('');

    return section('Estatisticas gerais da liga', 'dados reais do snapshot oficial', statCards) +
      section('Rankings', 'top ataques, defesas, BTTS, over e clean sheets', rankingBlocks) +
      section(
        'Tabela por time',
        'Padrao: posicao na tabela; clique no cabeçalho para ordenar (1o clique: maior primeiro / Z-A no Time).',
        '<div class="league-v1-table-wrap"><table class="league-v1-table" data-league-v1-team-stats><thead>' +
          teamStatsThead +
          '</thead><tbody>' +
          teamRows +
          '</tbody></table></div>'
      ) +
      section('Casa vs Fora', 'splits comparativos da competicao', '<div class="league-v1-grid-2">' + splitRows + '</div>');
  }

  function renderTrends(league) {
    var cards = '<div class="league-v1-grid-2">' + league.trends.cards.map(function (card) {
      return '<article class="league-v1-card"><h4>' + esc(card.title) + '</h4><p>' + esc(card.text) + '</p></article>';
    }).join('') + '</div>';

    var trendsProfileByKey = {};
    (league.trends.teamProfiles || []).forEach(function (p) {
      if (p && p.team) trendsProfileByKey[teamKey(p.team)] = p;
    });
    var trendsProfileRows = (league.standings || [])
      .map(function (row) {
        var hit = trendsProfileByKey[teamKey(row.team)];
        var profileText = hit && String(hit.profile || '').trim() ? hit.profile : '—';
        var tagHtml =
          hit && hit.tags && hit.tags.length
            ? hit.tags.map(function (tag) {
                return '<span class="league-v1-tag">' + esc(tag) + '</span>';
              }).join(' ')
            : '—';
        return (
          '<tr><td><strong>' +
          teamNameLink(row.team) +
          '</strong></td><td>' +
          esc(profileText) +
          '</td><td>' +
          tagHtml +
          '</td></tr>'
        );
      })
      .join('');

    var teamProfilesTable =
      '<div class="league-v1-table-wrap"><table class="league-v1-table"><thead><tr><th>Time</th><th>Perfil</th><th>Tags</th></tr></thead><tbody>' +
      trendsProfileRows +
      '</tbody></table></div>';

    var reading = '<div class="league-v1-text-block"><p>' + esc(league.trends.reading[0]) + '</p><p>' + esc(league.trends.reading[1]) + '</p></div>';

    return section('Tendencias da competicao', 'interpretable layer', cards) +
      section(
        'Perfil dos times',
        'Texto e tags vêm do snapshot (dados da temporada). Ausência aparece como “—”.',
        teamProfilesTable
      ) +
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
        '<div class="league-v1-team-head"><strong>' + teamNameLink(team.team) + '</strong><span>#' + team.position + '</span></div>' +
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
      '<div class="league-v1-row"><strong>' + teamNameLink(match.home) + ' vs ' + teamNameLink(match.away) + '</strong><span class="league-v1-time">' + esc(match.kickoff) + '</span></div>' +
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
      teamProfiles: renderTeamProfiles(league),
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

  function applyStatsTeamColumnSort(col) {
    if (!col) return;
    if (!state.statsTeamSort) state.statsTeamSort = { column: null, direction: 'desc' };
    if (state.statsTeamSort.column === col) {
      state.statsTeamSort.direction = state.statsTeamSort.direction === 'desc' ? 'asc' : 'desc';
    } else {
      state.statsTeamSort.column = col;
      state.statsTeamSort.direction = 'desc';
    }
    render();
  }

  function applyProfileTeamColumnSort(col) {
    if (!col) return;
    if (!state.profileTeamSort) state.profileTeamSort = { column: null, direction: 'desc' };
    if (state.profileTeamSort.column === col) {
      state.profileTeamSort.direction = state.profileTeamSort.direction === 'desc' ? 'asc' : 'desc';
    } else {
      state.profileTeamSort.column = col;
      state.profileTeamSort.direction = 'desc';
    }
    render();
  }

  function bindInteractions() {
    var root = document.querySelector('[data-league-v1-root]');
    if (!root) return;

    if (!root.dataset.leagueV1DelegateBound) {
      root.dataset.leagueV1DelegateBound = '1';
      root.addEventListener('click', function (e) {
        var th = e.target && e.target.closest ? e.target.closest('th[data-sort-col]') : null;
        if (!th || !th.closest('table[data-league-v1-team-stats]')) return;
        var col = th.getAttribute('data-sort-col');
        if (!col) return;
        e.preventDefault();
        applyStatsTeamColumnSort(col);
      });
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var th = e.target;
        if (!th || !th.getAttribute || th.tagName !== 'TH' || !th.getAttribute('data-sort-col')) return;
        if (!th.closest('table[data-league-v1-team-stats]')) return;
        e.preventDefault();
        applyStatsTeamColumnSort(th.getAttribute('data-sort-col'));
      });
      root.addEventListener('click', function (e) {
        var pth = e.target && e.target.closest ? e.target.closest('th[data-profile-sort-col]') : null;
        if (!pth || !pth.closest('table[data-league-v1-profile-table]')) return;
        var pcol = pth.getAttribute('data-profile-sort-col');
        if (!pcol) return;
        e.preventDefault();
        applyProfileTeamColumnSort(pcol);
      });
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var pth2 = e.target;
        if (!pth2 || !pth2.getAttribute || pth2.tagName !== 'TH' || !pth2.getAttribute('data-profile-sort-col')) return;
        if (!pth2.closest('table[data-league-v1-profile-table]')) return;
        e.preventDefault();
        applyProfileTeamColumnSort(pth2.getAttribute('data-profile-sort-col'));
      });
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
    if (!root) return;

    if (!state.loading && league.teamProfileComparison) {
      if (state.profileSortLeagueKey !== state.leagueSlug) {
        state.profileSortLeagueKey = state.leagueSlug;
        state.profileTeamSort = league.teamProfileComparison.hasOverallScore
          ? { column: 'overall', direction: 'desc' }
          : { column: 'team', direction: 'asc' };
      }
    }

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
