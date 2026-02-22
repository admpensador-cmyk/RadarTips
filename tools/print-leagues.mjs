#!/usr/bin/env node
/**
 * RadarTips - Print configured leagues from config
 *
 * Reads tools/api-football.config.json and displays:
 *  - Total leagues count
 *  - For each league: id | country | search (name)
 *  - Breakdown by country
 *
 * Usage: node tools/print-leagues.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONFIG_PATH = path.join(process.cwd(), "tools", "api-football.config.json");

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config file: ${CONFIG_PATH}`);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

function main() {
  const cfg = readConfig();
  const leagues = cfg?.leagues || [];

  if (!Array.isArray(leagues) || leagues.length === 0) {
    console.log("[ERROR] No leagues found in config.");
    process.exit(1);
  }

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  RadarTips - Configured Leagues (${String(leagues.length).padStart(2, " ")})                      ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  // Display all leagues
  console.log(`📋 All Leagues:\n`);
  console.log(`${"Type".padEnd(6)} | ${"Country".padEnd(15)} | ${"Search / Name"}`);
  console.log(`${"".padEnd(6)}-+-${"".padEnd(15)}-+-${"".padEnd(18)}`);

  const byCountry = {};
  for (const entry of leagues) {
    const country = String(entry?.country || "").trim() || "—";
    const search = String(entry?.search || "").trim();
    const type = String(entry?.type || "league").trim();
    const typeShort = type === "cup" ? "CUP" : "LGE";

    console.log(`${typeShort.padEnd(6)} | ${country.padEnd(15)} | ${search}`);

    if (!byCountry[country]) byCountry[country] = [];
    byCountry[country].push(search);
  }

  // Breakdown by country
  console.log(`\n📊 Breakdown by Country:\n`);
  const countries = Object.keys(byCountry).sort();
  for (const country of countries) {
    const count = byCountry[country].length;
    console.log(`  ${country.padEnd(15)} ${String(count).padStart(2, " ")} league(s)`);
  }

  console.log(`\n✅ Total: ${leagues.length} league(s) configured.\n`);
}
main();