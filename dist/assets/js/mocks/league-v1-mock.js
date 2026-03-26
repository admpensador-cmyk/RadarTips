(function () {
  const CORE_LEAGUES = [
    {
      slug: 'premier-league',
      code: 'PL',
      icon: '🦁',
      name: 'Premier League',
      country: 'England',
      season: '2025/26'
    },
    {
      slug: 'la-liga',
      code: 'LL',
      icon: '⚽',
      name: 'La Liga',
      country: 'Spain',
      season: '2025/26'
    },
    {
      slug: 'serie-a',
      code: 'SA',
      icon: '🏛️',
      name: 'Serie A',
      country: 'Italy',
      season: '2025/26'
    },
    {
      slug: 'bundesliga',
      code: 'BL',
      icon: '⚡',
      name: 'Bundesliga',
      country: 'Germany',
      season: '2025/26'
    },
    {
      slug: 'ligue-1',
      code: 'L1',
      icon: '🛡️',
      name: 'Ligue 1',
      country: 'France',
      season: '2025/26'
    },
    {
      slug: 'brasileirao',
      code: 'BRA',
      icon: '🇧🇷',
      name: 'Brasileirao',
      country: 'Brazil',
      season: '2026'
    }
  ];

  function shiftMetric(base, step, index, suffix) {
    return (base + (step * index)).toFixed(1) + suffix;
  }

  function pct(base, step, index) {
    return Math.max(8, Math.min(90, Math.round(base + (step * index)))) + '%';
  }

  function createLeaguePayload(meta, index) {
    const pace = ['high tempo transitions', 'controlled possession flow', 'hybrid rhythm with tactical breaks'][index % 3];

    const teams = [
      'Northbridge FC', 'Rivergate United', 'Atlas City', 'Kingsport', 'Starlight',
      'Port Vale', 'Union Harbor', 'Iron Hill', 'Cobalt Rovers', 'Lakeside',
      'Monarchs', 'Granite Town', 'Foxborough', 'Asteria', 'Summit FC',
      'Southbank', 'Orchid Athletic', 'Cedar 04', 'Vanguard', 'Old Mill'
    ].map(function (name, pos) {
      const p = pos + 1;
      const gf = 59 - (p * 1.6) + (index * 0.9);
      const ga = 24 + (p * 1.1) + (index * 0.4);
      const points = 74 - (p * 2) + (index % 4);
      const forms = ['WWDLW', 'WDWWW', 'WDLWW', 'DWWLW', 'LWDWW', 'WWDWL', 'DLWWW'];
      const profilePool = ['offensive stronghold', 'defensive balance', 'BTTS inclined', 'home pressure', 'away fragile', 'under profile'];
      return {
        position: p,
        team: name,
        points: points,
        played: 30,
        wins: Math.max(4, Math.floor(points / 3) - 3),
        draws: 4 + (p % 5),
        losses: Math.max(2, 30 - (Math.max(4, Math.floor(points / 3) - 3) + (4 + (p % 5)))),
        goalsFor: Math.max(15, Math.round(gf)),
        goalsAgainst: Math.max(14, Math.round(ga)),
        goalDiff: Math.round(gf - ga),
        form: forms[p % forms.length],
        btts: pct(58, -1, p),
        over25: pct(62, -1, p),
        cleanSheets: Math.max(3, 14 - Math.floor(p / 2)),
        profile: profilePool[(p + index) % profilePool.length]
      };
    });

    const featuredMatches = [
      {
        fixtureId: 910000 + index,
        round: 'Round 31',
        kickoff: 'Sat 19:30',
        status: 'Upcoming',
        home: teams[0].team,
        away: teams[2].team,
        tags: ['title pressure', 'xG over 2.8']
      },
      {
        fixtureId: 910010 + index,
        round: 'Round 31',
        kickoff: 'Sun 17:00',
        status: 'Upcoming',
        home: teams[5].team,
        away: teams[8].team,
        tags: ['BTTS profile', 'mid-table duel']
      },
      {
        fixtureId: 910020 + index,
        round: 'Round 31',
        kickoff: 'Sun 20:45',
        status: 'Upcoming',
        home: teams[1].team,
        away: teams[4].team,
        tags: ['defense test', 'corner spike']
      },
      {
        fixtureId: 910030 + index,
        round: 'Round 32',
        kickoff: 'Mon 21:00',
        status: 'Upcoming',
        home: teams[10].team,
        away: teams[13].team,
        tags: ['relegation edge', 'under lean']
      }
    ];

    return {
      competition: {
        slug: meta.slug,
        code: meta.code,
        icon: meta.icon,
        name: meta.name,
        country: meta.country,
        season: meta.season
      },
      heroMetrics: [
        { label: 'Goals / match', value: shiftMetric(2.6, 0.08, index, ''), trend: 'up' },
        { label: 'BTTS', value: pct(51, 2, index), trend: index % 2 ? 'steady' : 'up' },
        { label: 'Over 2.5', value: pct(48, 3, index), trend: 'up' },
        { label: 'Clean sheets', value: pct(28, -1, index), trend: 'steady' },
        { label: 'Avg corners', value: shiftMetric(9.4, 0.25, index, ''), trend: index % 2 ? 'down' : 'up' }
      ],
      overview: {
        competitionSummary: [
          { label: 'Average goals', value: shiftMetric(2.6, 0.08, index, ''), insight: 'stable conversion quality' },
          { label: 'BTTS', value: pct(51, 2, index), insight: 'mid-to-high bilateral scoring' },
          { label: 'Over 1.5', value: pct(73, 2, index), insight: 'strong floor for goals' },
          { label: 'Over 2.5', value: pct(48, 3, index), insight: 'volatile by round context' },
          { label: 'Under 2.5', value: pct(52, -2, index), insight: 'still relevant in tactical blocks' },
          { label: 'Average corners', value: shiftMetric(9.4, 0.25, index, ''), insight: 'active wing profiles' }
        ],
        featuredMatches: featuredMatches,
        globalTrends: [
          { title: 'Goal trend', value: 'consistent uptick', note: pace },
          { title: 'BTTS trend', value: 'moderate-high', note: 'late equalizers recurring' },
          { title: 'Home edge', value: pct(56, 1, index), note: 'home xPTS above away xPTS' },
          { title: 'Over/Under shape', value: 'balanced with over spikes', note: 'high variance in top-6 matchups' }
        ],
        quickRankings: [
          { label: 'Best attack', team: teams[0].team },
          { label: 'Best defense', team: teams[3].team },
          { label: 'Most over 2.5', team: teams[2].team },
          { label: 'Most BTTS', team: teams[6].team },
          { label: 'Most clean sheets', team: teams[1].team }
        ]
      },
      standings: teams,
      statistics: {
        leagueStats: [
          { label: 'Goals / game', value: shiftMetric(2.6, 0.08, index, '') },
          { label: 'BTTS', value: pct(51, 2, index) },
          { label: 'Over 1.5', value: pct(73, 2, index) },
          { label: 'Over 2.5', value: pct(48, 3, index) },
          { label: 'Over 3.5', value: pct(24, 2, index) },
          { label: 'Under 2.5', value: pct(52, -2, index) },
          { label: 'Clean sheets', value: pct(28, -1, index) },
          { label: 'Failed to score', value: pct(21, -1, index) }
        ],
        teamRankings: teams.slice(0, 12).map(function (row) {
          return {
            team: row.team,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            btts: row.btts,
            over25: row.over25,
            cleanSheets: row.cleanSheets
          };
        }),
        splits: [
          { metric: 'Goals', home: 56 + index, away: 44 - index },
          { metric: 'BTTS', home: 52 + index, away: 48 - index },
          { metric: 'Over 2.5', home: 58 + index, away: 42 - index },
          { metric: 'Clean sheets', home: 61 + index, away: 39 - index }
        ]
      },
      trends: {
        cards: [
          { title: 'Over 1.5 floor', text: 'The league keeps a high over 1.5 baseline in 3 of 4 rounds.' },
          { title: 'BTTS rhythm', text: 'BTTS remains moderate but rises in games between direct-table rivals.' },
          { title: 'Home attacking edge', text: 'Home teams sustain higher chance volume after minute 60.' },
          { title: 'Few extreme scorelines', text: 'Most fixtures cluster between 2 and 4 total goals.' }
        ],
        teamProfiles: teams.slice(0, 10).map(function (row) {
          return {
            team: row.team,
            profile: row.profile,
            tags: [row.btts + ' BTTS', row.over25 + ' over2.5', 'form ' + row.form]
          };
        }),
        reading: [
          meta.name + ' currently shows a ' + pace + ' profile, with mid-table teams driving a large share of BTTS outcomes. That makes context-based filtering by form and tactical matchup essential.',
          'Top-zone teams combine high pressing with stronger set-piece conversion, while lower-zone clubs generate under pockets when facing direct rivals. The league remains analytically rich, especially for totals and both-teams-to-score angles.'
        ]
      },
      games: {
        upcoming: featuredMatches.concat([
          {
            fixtureId: 910040 + index,
            round: 'Round 32',
            kickoff: 'Tue 19:00',
            status: 'Upcoming',
            home: teams[7].team,
            away: teams[9].team,
            tags: ['home pressure', 'cards uptrend']
          }
        ]),
        recent: [
          {
            fixtureId: 920000 + index,
            round: 'Round 30',
            kickoff: '2-1 FT',
            status: 'Finished',
            home: teams[2].team,
            away: teams[11].team,
            tags: ['over landed', 'late winner']
          },
          {
            fixtureId: 920010 + index,
            round: 'Round 30',
            kickoff: '1-1 FT',
            status: 'Finished',
            home: teams[6].team,
            away: teams[12].team,
            tags: ['BTTS landed', 'under survived']
          },
          {
            fixtureId: 920020 + index,
            round: 'Round 30',
            kickoff: '0-2 FT',
            status: 'Finished',
            home: teams[15].team,
            away: teams[1].team,
            tags: ['away control', 'clean sheet']
          }
        ]
      },
      teamsIndex: teams.slice(0, 18).map(function (row) {
        return {
          team: row.team,
          position: row.position,
          form: row.form,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          btts: row.btts,
          profile: row.profile
        };
      })
    };
  }

  const leaguePayloads = CORE_LEAGUES.map(createLeaguePayload);
  const bySlug = {};
  leaguePayloads.forEach(function (item) {
    bySlug[item.competition.slug] = item;
  });

  window.RT_LEAGUE_V1_DATA = {
    availableLeagues: CORE_LEAGUES,
    bySlug: bySlug,
    defaultLeague: CORE_LEAGUES[0].slug
  };
})();
