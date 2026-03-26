#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const baseUrl = String(process.env.RADARTIPS_BASE_URL || "https://radartips.com").replace(/\/+$/g, "");
const expectedPath = path.resolve(process.cwd(), process.env.RADARTIPS_EXPECTED_CALENDAR_PATH || "data/v1/calendar_2d.json");
const maxAttempts = Number.parseInt(process.env.RADARTIPS_VERIFY_ATTEMPTS || "24", 10);
const retryDelayMs = Number.parseInt(process.env.RADARTIPS_VERIFY_DELAY_MS || "5000", 10);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!fs.existsSync(expectedPath)) {
  fail(`expected_calendar_missing: ${expectedPath}`);
}

const expected = parseJson(fs.readFileSync(expectedPath, "utf8"), "expected_calendar");
const expectedGeneratedAt = String(expected?.meta?.generated_at_utc || "").trim();
if (!expectedGeneratedAt) {
  fail("expected_calendar_missing_meta.generated_at_utc");
}

let lastHttpStatus = null;
let lastLiveGeneratedAt = "";
let lastBody = null;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const nonce = Date.now();
  const res = await fetch(`${baseUrl}/api/v1/calendar_2d?verify_sync=${nonce}`, {
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache"
    }
  });

  lastHttpStatus = res.status;
  if (res.ok) {
    const live = parseJson(await res.text(), "production_calendar");
    lastBody = live;
    const liveGeneratedAt = String(live?.meta?.generated_at_utc || "").trim();
    lastLiveGeneratedAt = liveGeneratedAt;

    console.log(`attempt=${attempt} expected_generated_at=${expectedGeneratedAt}`);
    console.log(`attempt=${attempt} live_generated_at=${liveGeneratedAt || "missing"}`);

    const hasShape = Array.isArray(live?.today) && Array.isArray(live?.tomorrow);
    if (liveGeneratedAt === expectedGeneratedAt && hasShape) {
      console.log(`live_today_count=${live.today.length}`);
      console.log(`live_tomorrow_count=${live.tomorrow.length}`);
      ok("production calendar matches generated snapshot");
      process.exit(0);
    }
  }

  if (attempt < maxAttempts) {
    await sleep(retryDelayMs);
  }
}

if (lastHttpStatus && lastHttpStatus >= 400) {
  fail(`production_calendar_http_${lastHttpStatus}`);
}

if (!lastLiveGeneratedAt) {
  fail("production_calendar_missing_meta.generated_at_utc");
}

if (!Array.isArray(lastBody?.today) || !Array.isArray(lastBody?.tomorrow)) {
  fail("production_calendar_invalid_shape_today_tomorrow");
}

fail(`production_drift_detected expected=${expectedGeneratedAt} live=${lastLiveGeneratedAt}`);
