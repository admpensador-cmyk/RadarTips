#!/usr/bin/env node

const BASE_URL = (process.env.RADARTIPS_BASE_URL || "https://radartips.com").replace(/\/$/, "");
const CALENDAR_URL = `${BASE_URL}/api/v1/calendar_2d`;
const ALLOWLIST_URL = `${BASE_URL}/data/coverage_allowlist.json`;
const CRITICAL_IDS = [39, 78, 73, 45, 48, 253];

function fail(message, details = null) {
  console.error(`[FATAL] ${message}`);
  if (details) {
    console.error(JSON.stringify(details, null, 2));
  }
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "cache-control": "no-cache" }
  });

  if (res.status !== 200) {
    fail(`Expected HTTP 200 from ${url}, got ${res.status}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    fail(`Invalid JSON from ${url}: ${err?.message || String(err)}`);
  }

  return data;
}

function toNumericSet(values) {
  const out = new Set();
  for (const value of values || []) {
    const num = Number(value);
    if (Number.isFinite(num)) out.add(num);
  }
  return out;
}

function difference(fromSet, subtractSet) {
  const out = [];
  for (const value of fromSet) {
    if (!subtractSet.has(value)) out.push(value);
  }
  out.sort((a, b) => a - b);
  return out;
}

function missingCriticalIds(idSet) {
  return CRITICAL_IDS.filter((id) => !idSet.has(id));
}

async function main() {
  console.log("=== Production consistency check: calendar_2d vs coverage_allowlist ===");
  console.log(`calendar_url=${CALENDAR_URL}`);
  console.log(`allowlist_url=${ALLOWLIST_URL}`);

  const [calendar, allowlist] = await Promise.all([
    fetchJson(CALENDAR_URL),
    fetchJson(ALLOWLIST_URL)
  ]);

  const calendarIds = toNumericSet(calendar?.meta?.allowlist_league_ids || []);
  const leagues = Array.isArray(allowlist?.leagues) ? allowlist.leagues : [];
  const allowlistIds = toNumericSet(leagues.map((entry) => entry?.league_id));

  if (!calendarIds.size) {
    fail("calendar_2d.meta.allowlist_league_ids is missing or empty");
  }
  if (!allowlistIds.size) {
    fail("coverage_allowlist.json leagues is missing or empty");
  }

  const tierMissing = leagues.filter((entry) => !Object.prototype.hasOwnProperty.call(entry, "tier"));
  if (tierMissing.length > 0) {
    fail("coverage_allowlist.json contains entries without tier", {
      missing_tier_count: tierMissing.length,
      sample: tierMissing.slice(0, 5)
    });
  }

  const missingCritical = missingCriticalIds(allowlistIds);
  if (missingCritical.length > 0) {
    fail("coverage_allowlist.json missing required critical league_ids", {
      missing_critical_league_ids: missingCritical,
      required_critical_league_ids: CRITICAL_IDS
    });
  }

  const inCalendarNotAllowlist = difference(calendarIds, allowlistIds);
  const inAllowlistNotCalendar = difference(allowlistIds, calendarIds);
  if (inCalendarNotAllowlist.length > 0 || inAllowlistNotCalendar.length > 0) {
    fail("calendar_2d and coverage_allowlist scopes are inconsistent", {
      calendar_ids_count: calendarIds.size,
      allowlist_ids_count: allowlistIds.size,
      in_calendar_not_allowlist: inCalendarNotAllowlist,
      in_allowlist_not_calendar: inAllowlistNotCalendar
    });
  }

  console.log(`[OK] calendar_2d status=200 and allowlist status=200`);
  console.log(`[OK] coverage_allowlist tier field present in all ${leagues.length} entries`);
  console.log(`[OK] critical league_ids present: ${CRITICAL_IDS.join(",")}`);
  console.log(`[OK] scope match: calendar_ids=${calendarIds.size} allowlist_ids=${allowlistIds.size}`);
}

main().catch((err) => {
  fail(`Unhandled consistency-check error: ${err?.message || String(err)}`);
});