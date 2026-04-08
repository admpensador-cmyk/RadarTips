#!/usr/bin/env node
/**
 * Re-run pipeline-only enrichers on committed JSON (no API-Football).
 * - data/v1/calendar_2d.json → match_radar_ui, match_analytics, home_page_ui_v2
 * - data/v1/leagues/*.json → league_analytics, league_page_ui, team_page_ui_by_team_id
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichCalendar2dPayload } from "./lib/match-analytics-engine.mjs";
import { buildLeagueAnalyticsPackage } from "./lib/league-analytics-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const calPath = path.join(root, "data", "v1", "calendar_2d.json");
if (!fs.existsSync(calPath)) {
  console.error("[FATAL] missing", calPath);
  process.exit(1);
}
const cal = JSON.parse(fs.readFileSync(calPath, "utf8"));
enrichCalendar2dPayload(cal);
// Worker rejects snapshots older than HARD_STALE_HOURS (24) based on meta.generated_at_utc.
const nowIso = new Date().toISOString();
if (!cal.meta) cal.meta = {};
cal.meta.generated_at_utc = nowIso;
if (cal.meta.home_page_ui && typeof cal.meta.home_page_ui === "object") {
  cal.meta.home_page_ui.generated_at_utc = nowIso;
}
if (cal.radar_day && typeof cal.radar_day === "object") {
  cal.radar_day.generated_at_utc = nowIso;
}
fs.writeFileSync(calPath, JSON.stringify(cal, null, 2) + "\n", "utf8");
console.log("[ok] wrote", path.relative(root, calPath), "meta.home_page_ui.schema =", cal.meta?.home_page_ui?.schema);

const leaguesDir = path.join(root, "data", "v1", "leagues");
if (fs.existsSync(leaguesDir)) {
  for (const name of fs.readdirSync(leaguesDir)) {
    if (!name.endsWith(".json")) continue;
    const p = path.join(leaguesDir, name);
    const snap = JSON.parse(fs.readFileSync(p, "utf8"));
    const pkg = buildLeagueAnalyticsPackage(snap);
    snap.league_analytics = pkg.league_analytics;
    snap.league_page_ui = pkg.league_page_ui;
    snap.team_page_ui_by_team_id = pkg.team_page_ui_by_team_id;
    const leagueNow = new Date().toISOString();
    if (!snap.meta) snap.meta = {};
    snap.meta.generated_at_utc = leagueNow;
    fs.writeFileSync(p, JSON.stringify(snap, null, 2) + "\n", "utf8");
    console.log("[ok] league package", name);
  }
}

console.log("[done] regenerate-snapshot-outputs");
