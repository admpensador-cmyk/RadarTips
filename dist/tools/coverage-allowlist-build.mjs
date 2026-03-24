// coverage-allowlist-build.mjs
// Build and validate allowlist for RadarTips
import fs from 'fs';
import path from 'path';

const manualPath = path.resolve('data/coverage_allowlist.manual.json');
const outputPath = path.resolve('data/coverage_allowlist.json');
const distPath = path.resolve('dist/data/coverage_allowlist.json');
const tablePath = path.resolve('dist/data/coverage_allowlist.table.md');
const competitionsPath = path.resolve('data/competitions.json');

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\W_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadJSON(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function saveTable(p, rows) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const header = '| league_id | region | country | league_name |\n|---|---|---|---|\n';
  const body = rows.map(r => `| ${r.league_id} | ${r.region} | ${r.country} | ${r.league_name} |`).join('\n');
  fs.writeFileSync(p, header + body + '\n');
}

function main() {
  const manual = loadJSON(manualPath);
  if (!manual) throw new Error('Manual allowlist not found');
  const competitions = loadJSON(competitionsPath) || [];
  const allRows = [];
  const usedIds = new Set();
  const aliasLog = [];
  const overrideLog = [];

  // Helper: resolve league_id
  function resolveLeagueId(region, country, item) {
    if (item.league_id) {
      overrideLog.push({ ...item, region, country });
      return item.league_id;
    }
    const normName = normalize(item.query);
    let candidates = competitions.filter(c =>
      normalize(c.name) === normName && normalize(c.country) === normalize(country)
    );
    // Try aliases
    if (!candidates.length && item.aliases) {
      for (const alias of item.aliases) {
        const normAlias = normalize(alias);
        candidates = competitions.filter(c =>
          normalize(c.name) === normAlias && normalize(c.country) === normalize(country)
        );
        if (candidates.length) {
          aliasLog.push({ ...item, region, country, alias });
          break;
        }
      }
    }
    // Try partial match
    if (!candidates.length) {
      candidates = competitions.filter(c =>
        normalize(c.country) === normalize(country) &&
        normalize(c.name).includes(normName)
      );
    }
    // Filter by type/tier
    if (candidates.length > 1) {
      candidates = candidates.filter(c =>
        (!item.type || c.type === item.type) && (!item.tier || c.tier === item.tier)
      );
    }
    // Exclude base/feminino/reserva
    candidates = candidates.filter(c =>
      !/u17|u20|u21|youth|women|feminino|reserve/i.test(c.name)
    );
    if (candidates.length === 1) return candidates[0].id;
    if (candidates.length > 1) {
      throw new Error(`Ambiguous league for ${item.query} (${country}, ${region}): ${candidates.map(c => c.id + ' ' + c.name).join(', ')}`);
    }
    throw new Error(`Cannot resolve league_id for ${item.query} (${country}, ${region})`);
  }

  // Traverse manual
  for (const [region, countries] of Object.entries(manual)) {
    for (const [country, leagues] of Object.entries(countries)) {
      for (const item of leagues) {
        let league_id;
        try {
          league_id = resolveLeagueId(region, country, item);
        } catch (err) {
          console.error(err.message);
          continue;
        }
        if (usedIds.has(league_id)) {
          console.error(`Duplicate league_id: ${league_id} (${item.query})`);
          continue;
        }
        usedIds.add(league_id);
        allRows.push({ league_id, region, country, league_name: item.query });
      }
    }
  }

  // Output
  const outObj = {
    generated_at: new Date().toISOString(),
    total_leagues: allRows.length,
    leagues: allRows
  };
  saveJSON(outputPath, outObj);
  saveJSON(distPath, outObj);
  saveTable(tablePath, allRows);

  // Console output
  const continents = [...new Set(allRows.map(r => r.region))];
  const countries = [...new Set(allRows.map(r => r.country))];
  console.log(`Total ligas: ${allRows.length}`);
  console.log(`Total países: ${countries.length}`);
  console.log(`Total continentes: ${continents.length}`);
  console.log('Tabela:');
  allRows.forEach(r => console.log(`${r.league_id} | ${r.region} | ${r.country} | ${r.league_name}`));
  if (aliasLog.length) {
    console.log('\nLigas resolvidas por alias/heurística:');
    aliasLog.forEach(l => console.log(`${l.query} (${l.country}, ${l.region}) via alias: ${l.alias}`));
  }
  if (overrideLog.length) {
    console.log('\nLigas com override manual:');
    overrideLog.forEach(l => console.log(`${l.query} (${l.country}, ${l.region}) league_id: ${l.league_id}`));
  }
}

main();
