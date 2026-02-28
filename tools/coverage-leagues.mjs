// coverage-leagues.mjs
// Gera dist/data/coverage_leagues.json com todas ligas cobertas
import fs from 'fs';
import path from 'path';

const sources = [
  // Configs/listas
  'create-snapshots.mjs',
  'generate-all-snapshots-v2.mjs',
  // Data JSONs
  'data/v1/calendar_2d.json',
  'data/radar/day.json',
  'data/radar/league/EPL.json',
  'data/standings_*.json',
  'data/compstats_*.json',
  // Dist JSONs
  'dist/data/v1/calendar_2d.json',
  'dist/data/radar/day.json',
  'dist/data/radar/league/EPL.json',
  'dist/data/standings_*.json',
  'dist/data/compstats_*.json',
];

function findLeagueIdsFromConfig() {
  // Exemplo: busca leagueIds em create-snapshots.mjs
  const configPath = path.resolve('create-snapshots.mjs');
  if (!fs.existsSync(configPath)) return [];
  const src = fs.readFileSync(configPath, 'utf8');
  const match = src.match(/leagueIds\s*=\s*\[(.*?)\]/s);
  if (!match) return [];
  return match[1].split(',').map(x => Number(x.trim())).filter(x => x);
}

function findLeagueIdsFromJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) return [];
  const raw = fs.readFileSync(jsonPath, 'utf8');
  let arr = [];
  try {
    const data = JSON.parse(raw);
    // calendar: array de jogos
    if (Array.isArray(data)) {
      data.forEach(obj => {
        if (obj.league_id || obj.leagueId || (obj.league && obj.league.id)) {
          arr.push(obj.league_id || obj.leagueId || obj.league.id);
        }
      });
    }
    // radar_day: {leagues: [{id, name, ...}]}
    if (data.leagues && Array.isArray(data.leagues)) {
      data.leagues.forEach(l => {
        if (l.id) arr.push(l.id);
      });
    }
    // standings/compstats: {league_id, league_name, country, season}
    if (data.league_id) arr.push(data.league_id);
    if (data.competition && data.competition.id) arr.push(data.competition.id);
  } catch (e) {}
  return arr;
}

function aggregateLeagues() {
  const leagueSet = new Set();
  const leagueMeta = {};
  // 1. Configs
  findLeagueIdsFromConfig().forEach(id => {
    leagueSet.add(id);
    leagueMeta[id] = leagueMeta[id] || { sources: [], seen_in: {} };
    leagueMeta[id].sources.push('config:create-snapshots.mjs');
  });
  // 2. Data JSONs
  const jsonFiles = [
    'data/v1/calendar_2d.json',
    'data/radar/day.json',
    'data/radar/league/EPL.json',
    'data/standings_140.json',
    'data/compstats_140.json',
    'dist/data/v1/calendar_2d.json',
    'dist/data/radar/day.json',
    'dist/data/radar/league/EPL.json',
    'dist/data/standings_140.json',
    'dist/data/compstats_140.json',
  ];
  jsonFiles.forEach(f => {
    findLeagueIdsFromJson(f).forEach(id => {
      leagueSet.add(id);
      leagueMeta[id] = leagueMeta[id] || { sources: [], seen_in: {} };
      leagueMeta[id].sources.push('snapshot:' + f);
      // seen_in flags
        if (f.includes('calendar_2d')) leagueMeta[id].seen_in.calendar_2d = true;
      if (f.includes('radar/day')) leagueMeta[id].seen_in.radar_day = true;
      if (f.includes('radar_week')) leagueMeta[id].seen_in.radar_week = true;
      if (f.includes('standings')) leagueMeta[id].seen_in.standings = true;
      if (f.includes('compstats')) leagueMeta[id].seen_in.compstats = true;
    });
  });
  return { leagueSet, leagueMeta };
}

function enrichLeagueMeta(leagueMeta) {
  // Preencher league_name/country/season se disponível
  Object.keys(leagueMeta).forEach(id => {
    // Buscar nos snapshots
    const files = [
      'data/standings_' + id + '.json',
      'data/compstats_' + id + '.json',
      'dist/data/standings_' + id + '.json',
      'dist/data/compstats_' + id + '.json',
    ];
    for (const f of files) {
      if (fs.existsSync(f)) {
        try {
          const data = JSON.parse(fs.readFileSync(f, 'utf8'));
          if (data.league_name) leagueMeta[id].league_name = data.league_name;
          if (data.country) leagueMeta[id].country = data.country;
          if (data.season) leagueMeta[id].season = data.season;
        } catch (e) {}
      }
    }
  });
}

function main() {
  const { leagueSet, leagueMeta } = aggregateLeagues();
  enrichLeagueMeta(leagueMeta);
  // Array final
  const arr = Array.from(leagueSet).map(id => ({
    league_id: id,
    league_name: leagueMeta[id].league_name || null,
    country: leagueMeta[id].country || null,
    season: leagueMeta[id].season || null,
    sources: leagueMeta[id].sources,
    seen_in: leagueMeta[id].seen_in,
  }));
  // Salvar arquivo
  const outPath = path.resolve('dist/data/coverage_leagues.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(arr, null, 2));
  // Log resumo
  console.log('Total de ligas únicas:', arr.length);
  console.log('Top 20 league_ids:', arr.slice(0, 20).map(x => x.league_id));
  arr.forEach(x => {
    if (!x.league_name || !x.country) {
      console.warn('Aviso: league_id', x.league_id, 'sem nome/country');
    }
  });
}

main();

// Para rodar: node tools/coverage-leagues.mjs
