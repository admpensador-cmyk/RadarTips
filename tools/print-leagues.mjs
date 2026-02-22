#!/usr/bin/env node
/**
 * RadarTips - Print configured leagues (from api-football.config.json)
 * 
 * Usage:
 *   node tools/print-leagues.mjs
 * 
 * Output:
 *   - Total number of leagues
 *   - List of leagues by ID, country, search name
 *   - Breakdown by country
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONFIG_PATH = path.join(process.cwd(), "tools", "api-football.config.json");

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`[ERROR] Config not found: ${CONFIG_PATH}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const leagues = Array.isArray(config?.leagues) ? config.leagues : [];

if (!leagues.length) {
  console.error("[ERROR] No leagues in config");
  process.exit(1);
}

console.log("\n╔═══════════════════════════════════════════════════════╗");
console.log("║        RadarTips - Configured Leagues List             ║");
console.log("╚═══════════════════════════════════════════════════════╝\n");

console.log(`📋 Total leagues: ${leagues.length}`);
console.log("\n[LEAGUES]");

for (const league of leagues) {
  const id = Number.isFinite(Number(league?.id)) ? Number(league.id) : "-";
  const country = String(league?.country || "(international)");
  const searchOrName = String(league?.search || league?.name || "-");
  console.log(`${id} | ${country} | ${searchOrName}`);
}

console.log("\n[BREAKDOWN BY COUNTRY]");

// Group by country
const byCountry = {};
for (const league of leagues) {
  const country = league.country || "(international)";
  if (!byCountry[country]) byCountry[country] = [];
  byCountry[country].push(league);
}

// Print by country
const sortedCountries = Object.keys(byCountry).sort();
for (const country of sortedCountries) {
  const leaguesInCountry = byCountry[country];
  console.log(`${country}: ${leaguesInCountry.length}`);
}

console.log("\n[OK] League list printed successfully.");
