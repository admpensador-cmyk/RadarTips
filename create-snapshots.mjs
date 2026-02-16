import fs from 'fs';

const leagueIds = [39, 61, 78, 135, 140, 475, 477, 622];

leagueIds.forEach(lid => {
  const standingsPath = `data/v1/standings_${lid}_2026.json`;
  const statsPath = `data/v1/compstats_${lid}_2026.json`;
  
  if (!fs.existsSync(standingsPath)) {
    const standings = {
      generated_at_utc: new Date().toISOString(),
      leagueId: lid,
      season: 2026,
      standings: [
        { rank: 1, team: { name: 'Team 1' }, points: 30, all: { played: 12, win: 9, draw: 3, lose: 0, goals: { for: 25, against: 15 } } },
        { rank: 2, team: { name: 'Team 2' }, points: 27, all: { played: 12, win: 8, draw: 3, lose: 1, goals: { for: 23, against: 16 } } }
      ]
    };
    fs.writeFileSync(standingsPath, JSON.stringify(standings, null, 2));
    console.log(`✅ Created ${standingsPath}`);
  }
  
  if (!fs.existsSync(statsPath)) {
    const stats = {
      generated_at_utc: new Date().toISOString(),
      leagueId: lid,
      season: 2026,
      sample: { fixtures_used: 40, fixtures_with_stats: 38 },
      metrics: { goals_avg: 2.5, shots_avg: 12, sot_avg: 5, corners_avg: 6, cards_avg: 4 }
    };
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    console.log(`✅ Created ${statsPath}`);
  }
});

console.log('✅ All snapshots ready!');
