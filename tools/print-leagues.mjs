#!/usr/bin/env node
/**
 * print-leagues.mjs
 * Lists all configured leagues from api-football.config.json
 * Usage: node tools/print-leagues.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read config
const configPath = join(__dirname, 'api-football.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

const leagues = config.leagues || [];

// Group by country
const byCountry = {};
leagues.forEach((league, idx) => {
  const country = league.country || 'International';
  if (!byCountry[country]) {
    byCountry[country] = [];
  }
  byCountry[country].push({ ...league, index: idx });
});

// Sort countries alphabetically
const countries = Object.keys(byCountry).sort();

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║          Radartips - Configured Leagues                  ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log(`Total leagues: ${leagues.length}\n`);

// Print by country
countries.forEach(country => {
  const countryLeagues = byCountry[country];
  // Sort by search name within country
  countryLeagues.sort((a, b) => a.search.localeCompare(b.search));
  
  console.log(`\n📍 ${country} (${countryLeagues.length} league${countryLeagues.length > 1 ? 's' : ''})`);
  console.log('─'.repeat(60));
  
  countryLeagues.forEach(league => {
    const type = league.type ? ` [${league.type}]` : '';
    console.log(`  • ${league.search}${type}`);
  });
});

// Print all search terms in one line for quick reference
console.log('\n\n📋 Quick reference (search terms):');
console.log('─'.repeat(60));
const searchTerms = leagues.map(l => l.search).sort();
console.log(searchTerms.join(', '));

console.log('\n');
