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
  const primaryDayUrl = `${baseUrl}/en/radar/day/`;
  const secondaryDayUrls = [`${baseUrl}/pt/radar/day/`, `${baseUrl}/es/radar/day/`, `${baseUrl}/fr/radar/day/`, `${baseUrl}/de/radar/day/`];

  const { response: dayResp, text: dayHtml } = await fetchText(primaryDayUrl);
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

  const hasPageType = bundleJs.includes("pageType");
  const hasRenderTop3 = bundleJs.includes("renderTop3");
  const hasDayPath = bundleJs.includes("radar/day");

  console.log(`bundleHas_pageType=${hasPageType}`);
  console.log(`bundleHas_renderTop3=${hasRenderTop3}`);
  console.log(`bundleHas_radar_day_path=${hasDayPath}`);

  if (!hasPageType) fail("live bundle missing pageType (Radar Day routing)");
  if (!hasRenderTop3) fail("live bundle missing renderTop3");
  if (!hasDayPath) fail("live bundle missing radar/day path segment");

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

  const highlights = calendar?.radar_day?.highlights;
  if (!Array.isArray(highlights)) fail("calendar_2d missing radar_day.highlights (unified payload)");
  const radarPast = countPastMatches(highlights);
  console.log(`radar_day_embedded_generated_at_utc=${calendar?.radar_day?.generated_at_utc || calendar?.meta?.generated_at_utc || "missing"}`);
  console.log(`radar_day_embedded_past_highlights=${radarPast}`);
  if (radarPast !== 0) fail(`embedded radar_day still contains ${radarPast} past highlights`);

  const legacyRadarStatus = await fetchStatus(`${baseUrl}/api/v1/radar_day`);
  if (legacyRadarStatus !== 404) {
    fail(`/api/v1/radar_day must not exist (use calendar_2d.radar_day only), got HTTP ${legacyRadarStatus}`);
  }

  for (const u of secondaryDayUrls) {
    const st = await fetchStatus(u);
    console.log(`secondary_day_status ${u} = ${st}`);
    if (st !== 200) fail(`secondary Radar Day surface must be reachable: ${u} (HTTP ${st})`);
  }

  if (!process.exitCode) {
    ok("production Day runtime is healthy (primary /en/radar/day/)");
  }
}

main().catch((error) => {
  console.error(`[FATAL] ${error.message}`);
  process.exit(1);
});