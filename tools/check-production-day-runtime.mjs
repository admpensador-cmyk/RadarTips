#!/usr/bin/env node

const baseUrl = String(process.env.RADARTIPS_BASE_URL || "https://radartips.com").replace(/\/+$/g, "");
const expectedBuild = String(process.env.RADARTIPS_EXPECTED_BUILD || "").trim();

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function mustParseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}_invalid_json: ${error.message}`);
  }
}

function countPastMatches(matches, nowMs = Date.now()) {
  return (matches || []).filter((match) => {
    const kickoffMs = Date.parse(match?.kickoff_utc || "");
    return Number.isFinite(kickoffMs) && kickoffMs <= nowMs;
  }).length;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
  return { response, text: await response.text() };
}

async function fetchStatus(url) {
  const response = await fetch(url, { redirect: "manual", headers: { "cache-control": "no-cache" } });
  return response.status;
}

async function main() {
  const dayUrl = `${baseUrl}/pt/radar/day/`;
  const { response: dayResp, text: dayHtml } = await fetchText(dayUrl);
  if (!dayResp.ok) throw new Error(`day_html_http_${dayResp.status}`);

  const bundlePathMatch = dayHtml.match(/\/assets\/js\/app\.[a-f0-9]+\.js/);
  const buildMetaMatch = dayHtml.match(/<meta\s+name=["']radartips-build["']\s+content=["']([^"']+)["']/i);

  const bundlePath = bundlePathMatch?.[0] || "";
  const liveBuildMeta = buildMetaMatch?.[1] || "";

  console.log(`bundlePath=${bundlePath}`);
  console.log(`buildMeta=${liveBuildMeta || "missing"}`);

  if (!bundlePath) fail("live Day HTML is missing hashed bundle reference");
  if (!liveBuildMeta) fail("live Day HTML is missing radartips-build meta");
  if (expectedBuild && liveBuildMeta !== expectedBuild) {
    fail(`live build meta (${liveBuildMeta}) differs from expected build (${expectedBuild})`);
  } else if (expectedBuild && liveBuildMeta) {
    ok(`live build meta matches expected build (${liveBuildMeta})`);
  } else if (liveBuildMeta) {
    ok(`live build meta detected (${liveBuildMeta})`);
  }

  const { response: bundleResp, text: bundleJs } = await fetchText(`${baseUrl}${bundlePath}`);
  if (!bundleResp.ok) throw new Error(`bundle_http_${bundleResp.status}`);

  const hasIsRenderable = bundleJs.includes("isRenderableDayMatch");
  const hasDayFilter = bundleJs.includes("isRenderableDayMatch(m)");
  const hasTopGuard = bundleJs.includes("Date.parse(raw?.kickoff_utc");

  console.log(`bundleHas_isRenderableDayMatch=${hasIsRenderable}`);
  console.log(`bundleHas_dayFilterCall=${hasDayFilter}`);
  console.log(`bundleHas_topPickNowGuard=${hasTopGuard}`);

  if (!hasIsRenderable) fail("live bundle missing isRenderableDayMatch signature");
  if (!hasDayFilter) fail("live bundle missing Day render filter signature");
  if (!hasTopGuard) fail("live bundle missing Top Picks time guard signature");

  const plainBundleStatus = await fetchStatus(`${baseUrl}/assets/js/app.js`);
  const legacyBundleStatus = await fetchStatus(`${baseUrl}/assets/app.js`);
  const staticRadarDayStatus = await fetchStatus(`${baseUrl}/data/v1/radar_day.json`);

  console.log(`plainBundleStatus=${plainBundleStatus}`);
  console.log(`legacyBundleStatus=${legacyBundleStatus}`);
  console.log(`staticRadarDayStatus=${staticRadarDayStatus}`);

  if (plainBundleStatus !== 404) fail(`plain /assets/js/app.js should be absent from Pages, got HTTP ${plainBundleStatus}`);
  if (legacyBundleStatus !== 404) fail(`legacy /assets/app.js should be absent from Pages, got HTTP ${legacyBundleStatus}`);
  if (staticRadarDayStatus !== 404) fail(`static /data/v1/radar_day.json should be absent from Pages, got HTTP ${staticRadarDayStatus}`);

  const { response: calResp, text: calText } = await fetchText(`${baseUrl}/api/v1/calendar_2d`);
  if (!calResp.ok) throw new Error(`calendar_2d_http_${calResp.status}`);
  const calendar = mustParseJson(calText, "calendar_2d");
  const calendarPast = countPastMatches([...(calendar?.today || []), ...(calendar?.tomorrow || [])]);
  console.log(`calendar2d_generated_at_utc=${calendar?.meta?.generated_at_utc || "missing"}`);
  console.log(`calendar2d_past_in_today_tomorrow=${calendarPast}`);
  if (calendarPast !== 0) fail(`calendar_2d still contains ${calendarPast} past matches in today/tomorrow`);

  const { response: radarResp, text: radarText } = await fetchText(`${baseUrl}/api/v1/radar_day`);
  if (!radarResp.ok) throw new Error(`radar_day_http_${radarResp.status}`);
  const radar = mustParseJson(radarText, "radar_day");
  const radarPast = countPastMatches(radar?.highlights || []);
  console.log(`radar_day_generated_at_utc=${radar?.generated_at_utc || "missing"}`);
  console.log(`radar_day_past_highlights=${radarPast}`);
  if (radarPast !== 0) fail(`radar_day still contains ${radarPast} past highlights`);

  if (!process.exitCode) {
    ok("production Day runtime is healthy");
  }
}

main().catch((error) => {
  console.error(`[FATAL] ${error.message}`);
  process.exit(1);
});