#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const baseUrl = String(process.env.RADARTIPS_BASE_URL || "https://radartips.com").replace(/\/+$/g, "");
const expectedPath = path.resolve(process.cwd(), process.env.RADARTIPS_EXPECTED_CALENDAR_PATH || "data/v1/calendar_2d.json");

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[OK] ${msg}`);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    fail(`${label}_invalid_json: ${err.message}`);
  }
}

if (!fs.existsSync(expectedPath)) {
  fail(`expected_calendar_missing: ${expectedPath}`);
}

const expected = parseJson(fs.readFileSync(expectedPath, "utf8"), "expected_calendar");
const expectedGeneratedAt = String(expected?.meta?.generated_at_utc || "").trim();
if (!expectedGeneratedAt) {
  fail("expected_calendar_missing_meta.generated_at_utc");
}

const res = await fetch(`${baseUrl}/api/v1/calendar_2d`, {
  headers: { "cache-control": "no-cache" }
});

if (!res.ok) {
  fail(`production_calendar_http_${res.status}`);
}

const live = parseJson(await res.text(), "production_calendar");
const liveGeneratedAt = String(live?.meta?.generated_at_utc || "").trim();

console.log(`expected_generated_at=${expectedGeneratedAt}`);
console.log(`live_generated_at=${liveGeneratedAt || "missing"}`);
console.log(`live_today_count=${Array.isArray(live?.today) ? live.today.length : -1}`);
console.log(`live_tomorrow_count=${Array.isArray(live?.tomorrow) ? live.tomorrow.length : -1}`);

if (!liveGeneratedAt) {
  fail("production_calendar_missing_meta.generated_at_utc");
}

if (liveGeneratedAt !== expectedGeneratedAt) {
  fail(`production_drift_detected expected=${expectedGeneratedAt} live=${liveGeneratedAt}`);
}

if (!Array.isArray(live?.today) || !Array.isArray(live?.tomorrow)) {
  fail("production_calendar_invalid_shape_today_tomorrow");
}

ok("production calendar matches generated snapshot");
