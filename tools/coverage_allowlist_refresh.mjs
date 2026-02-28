// coverage_allowlist_refresh.mjs

import fs from 'fs';
import path from 'path';
import { apiGet } from './lib/api-football.mjs';

const seedPath = path.resolve('tools/coverage_allowlist.seed.json');
const outDataPath = path.resolve('data/coverage_allowlist.json');
const outDistPath = path.resolve('dist/data/coverage_allowlist.json');
const outTablePath = path.resolve('dist/data/coverage_allowlist.table.md');
const outFrontTablePath = path.resolve('dist/data/coverage_allowlist.table.front.md');

const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY;
if (!APIFOOTBALL_KEY) {
  console.log('$env:APIFOOTBALL_KEY="xxxx"');
  console.error('Erro: APIFOOTBALL_KEY não definido no ambiente.');
  process.exit(1);
}

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\W_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removePunctuation(str) {
  return str.replace(/[.,;:!?]/g, '').trim();
}

async function main() {
  // PROBE MODE
  if (process.argv.includes('--probe')) {
    const idx = process.argv.indexOf('--probe');
    const country = process.argv[idx + 1];
    const query = process.argv[idx + 2];
    if (!country || !query) {
      console.error('Uso: node tools/coverage_allowlist_refresh.mjs --probe "<country>" "<query>"');
      process.exit(1);
    }
    let params = {};
    let endpoint = '';
    let res = null;
    if (country === 'World') {
      params = { search: query };
      endpoint = `/leagues?search=${encodeURIComponent(query)}`;
      res = await apiGet(endpoint, { raw: true });
      if ((!res.data.response || !res.data.response.length) && res.status === 200) {
        params = { name: query };
        endpoint = `/leagues?name=${encodeURIComponent(query)}`;
        res = await apiGet(endpoint, { raw: true });
      }
    } else {
      params = { country };
      endpoint = `/leagues?country=${encodeURIComponent(country)}`;
      res = await apiGet(endpoint, { raw: true });
    }
    let all = res.data.response || [];
    // Score: normalizado igual, inclui, etc
    let normQuery = normalize(query);
    let scored = all.map(l => ({
      league_id: l.league.id,
      league_name: l.league.name,
      country_name: l.country.name,
      league_type: l.league.type,
      score: normalize(l.league.name) === normQuery ? 2 : (normalize(l.league.name).includes(normQuery) ? 1 : 0)
    }));
    scored.sort((a, b) => b.score - a.score);
    console.log(`PROBE: country="${country}" query="${query}"`);
    scored.slice(0, 15).forEach(l => {
      console.log(`${l.league_id} | ${l.league_name} | ${l.country_name} | ${l.league_type} | score=${l.score}`);
    });
    process.exit(0);
  }
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const debugOne = process.argv.includes('--debugOne');
  const items = debugOne ? [seed[0]] : seed;
  const rows = [];

  for (const [idx, item] of items.entries()) {
    let params = {};
    let searchQuery = item.query;
    let country = item.country !== 'World' ? item.country : undefined;
    let candidates = [];
    let lastResponse = null;
    let lastBody = '';
    let lastContentType = '';
    let endpoint = '';
    let qs = '';
    let res = null;

    if (country) {
      // 1a) GET /leagues?name=<query>&country=<country>
      params = { name: searchQuery, country };
      qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      endpoint = `/leagues?${qs}`;
      res = await apiGet(endpoint, { raw: true });
      lastResponse = res;
      lastContentType = res.headers['content-type'] || '';
      lastBody = JSON.stringify(res.data).slice(0, 300);
      candidates = res.data.response || [];
      if ((!candidates.length) && res.status === 200) {
        // 1b) GET /leagues?country=<country> e filtrar localmente
        params = { country };
        qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        endpoint = `/leagues?${qs}`;
        res = await apiGet(endpoint, { raw: true });
        lastResponse = res;
        lastContentType = res.headers['content-type'] || '';
        lastBody = JSON.stringify(res.data).slice(0, 300);
        let all = res.data.response || [];
        // Score: normalizado igual, inclui, etc
        let normQuery = normalize(searchQuery);
        candidates = all.filter(l => normalize(l.league.name) === normQuery);
        if (!candidates.length) {
          candidates = all.filter(l => normalize(l.league.name).includes(normQuery));
        }
      }
    } else {
      // 2a) GET /leagues?search=<query>
      params = { search: searchQuery };
      qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      endpoint = `/leagues?${qs}`;
      res = await apiGet(endpoint, { raw: true });
      lastResponse = res;
      lastContentType = res.headers['content-type'] || '';
      lastBody = JSON.stringify(res.data).slice(0, 300);
      candidates = res.data.response || [];
      if ((!candidates.length) && res.status === 200) {
        // 2b) fallback: name=<query>
        params = { name: searchQuery };
        qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        endpoint = `/leagues?${qs}`;
        res = await apiGet(endpoint, { raw: true });
        lastResponse = res;
        lastContentType = res.headers['content-type'] || '';
        lastBody = JSON.stringify(res.data).slice(0, 300);
        candidates = res.data.response || [];
      }
    }

    // Seleção do candidato correto
    // Excluir youth/women/reserve
    candidates = candidates.filter(l =>
      !/u17|u20|u21|youth|women|feminino|reserve/i.test(l.league.name)
    );
    // Tier
    if (item.tier) {
      if (item.tier === 2) {
        candidates = candidates.filter(l => /2|ii|b|segunda/i.test(l.league.name));
      } else if (item.tier === 1) {
        candidates = candidates.filter(l => !/2|ii|b|segunda/i.test(l.league.name));
      }
    }
    // Type
    if (item.type) {
      candidates = candidates.filter(l => normalize(l.league.type) === normalize(item.type));
    }
    // Strong name match
    let normQuery = normalize(searchQuery);
    let strongMatches = candidates.filter(l => normalize(l.league.name) === normQuery);
    if (strongMatches.length === 1) candidates = strongMatches;
    // Se múltiplos, preferir por nome exato
    if (candidates.length > 1) {
      candidates = candidates.filter(l => normalize(l.league.name) === normQuery);
    }
    // Se múltiplos, preferir por type
    if (candidates.length > 1 && item.type) {
      candidates = candidates.filter(l => normalize(l.league.type) === normalize(item.type));
    }
    // Se múltiplos, preferir por tier
    if (candidates.length > 1 && item.tier) {
      candidates = candidates.filter(l => item.tier === 2 ? /2|ii|b|segunda/i.test(l.league.name) : !/2|ii|b|segunda/i.test(l.league.name));
    }
    // Se múltiplos, pegar o primeiro
    if (candidates.length > 1) {
      candidates = [candidates[0]];
    }
    if (debugOne) {
      console.log('DEBUG:');
      console.log('URL:', 'https://v3.football.api-sports.io' + endpoint);
      console.log('Headers:', Object.keys({ 'x-apisports-key': APIFOOTBALL_KEY, 'Accept': 'application/json', 'User-Agent': 'RadarTips/1.0' }));
      console.log('HTTP status:', lastResponse.status);
      console.log('Content-Type:', lastContentType);
      console.log('Body (first 300 chars):', lastBody);
      let results = lastResponse.data && typeof lastResponse.data.results !== 'undefined' ? lastResponse.data.results : null;
      let responseLen = lastResponse.data && Array.isArray(lastResponse.data.response) ? lastResponse.data.response.length : null;
      console.log('results:', results);
      console.log('response.length:', responseLen);
      break;
    }
    if (!candidates.length) {
      continue;
    }
    const l = candidates[0];
    // Região/continente override
    let region = item.region;
    if (item.country === 'World') {
      if (/libertadores|sudamericana/i.test(l.league.name)) region = 'South America';
      if (/uefa/i.test(l.league.name)) region = 'Europe';
    }
    let display_name = item.display_name_override || l.league.name;
    rows.push({
      region,
      country: item.country,
      league_id: l.league.id,
      display_name,
      type: l.league.type,
      tier: item.tier || null
    });
      // ...existing code...
    // Ordenação
    rows.sort((a, b) => {
      if (a.region !== b.region) return a.region.localeCompare(b.region);
      if (a.country !== b.country) return a.country.localeCompare(b.country);
      return a.display_name.localeCompare(b.display_name);
    });
    // Salvar JSON
    fs.mkdirSync(path.dirname(outDataPath), { recursive: true });
    fs.writeFileSync(outDataPath, JSON.stringify({ generated_at: new Date().toISOString(), leagues: rows }, null, 2));
    fs.mkdirSync(path.dirname(outDistPath), { recursive: true });
    fs.writeFileSync(outDistPath, JSON.stringify({ generated_at: new Date().toISOString(), leagues: rows }, null, 2));
    // Tabela front
    fs.mkdirSync(path.dirname(outFrontTablePath), { recursive: true });
    const header = '| Região | País | Competição |\n|---|---|---|\n';
    const body = rows.map(r => `| ${r.region} | ${r.country} | ${r.display_name} |`).join('\n');
    fs.writeFileSync(outFrontTablePath, header + body + '\n');
    // Tabela auditoria
    fs.mkdirSync(path.dirname(outTablePath), { recursive: true });
    fs.writeFileSync(outTablePath, '| league_id | Região | País | Competição | Type | Tier |\n|---|---|---|---|---|---|\n' +
      rows.map(r => `| ${r.league_id} | ${r.region} | ${r.country} | ${r.display_name} | ${r.type} | ${r.tier || ''} |`).join('\n') + '\n');
    // Imprimir tabela final
    if (!debugOne) {
      console.log('| Região | País | Competição |');
      console.log('|---|---|---|');
      rows.forEach(r => console.log(`| ${r.region} | ${r.country} | ${r.display_name} |`));
      console.log(`\nArquivos gerados:\n- ${outDataPath}\n- ${outDistPath}\n- ${outFrontTablePath}\n- ${outTablePath}`);
    }
  }
}

main().catch(e => {
  console.error('Erro ao consultar API-Football:', e && e.message ? e.message : e);
  process.exit(1);
});
