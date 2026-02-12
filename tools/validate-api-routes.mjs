#!/usr/bin/env node
/**
 * Smoke test for Match Radar V2 API routes
 * Validates that the three snapshot endpoints respond correctly
 */

const endpoints = [
  "/api/v1/calendar_7d.json",
  "/api/v1/radar_day.json",
  "/api/v1/radar_week.json"
];

const fallbacks = [
  "/data/v1/calendar_7d.json",
  "/data/v1/radar_day.json",
  "/data/v1/radar_week.json"
];

async function testEndpoint(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return {
      status: res.status,
      success: res.ok,
      contentType: res.headers.get("content-type"),
      error: res.ok ? null : `${res.status} ${res.statusText}`
    };
  } catch (err) {
    return {
      status: null,
      success: false,
      error: err.message
    };
  }
}

async function main() {
  console.log("🧪 API Route Validation\n");

  const baseUrl = process.env.TEST_URL || "http://localhost:3000";
  console.log(`Testing against: ${baseUrl}\n`);

  let allPassed = true;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const fallback = fallbacks[i];
    const name = endpoint.split("/").pop();

    console.log(`Testing ${name}:`);

    // Test primary endpoint (API route)
    const apiUrl = `${baseUrl}${endpoint}`;
    const apiResult = await testEndpoint(apiUrl);
    const apiStatus = apiResult.success ? "✅" : "❌";
    console.log(`  ${apiStatus} Primary (${endpoint}): ${apiResult.status} ${apiResult.error || "OK"}`);

    // Test fallback endpoint (static file)
    const fallbackUrl = `${baseUrl}${fallback}`;
    const fallbackResult = await testEndpoint(fallbackUrl);
    const fallbackStatus = fallbackResult.success ? "✅" : "❌";
    console.log(`  ${fallbackStatus} Fallback (${fallback}): ${fallbackResult.status} ${fallbackResult.error || "OK"}`);

    // For production, primary should work. For local dev, at least one should work.
    const isProduction = baseUrl.includes("radartips.com") || baseUrl.includes("production");
    if (isProduction && !apiResult.success) {
      console.log(`  ⚠️  WARNING: Primary endpoint failed in production!\n`);
      allPassed = false;
    } else if (!apiResult.success && !fallbackResult.success) {
      console.log(`  ⚠️  WARNING: Both primary and fallback failed!\n`);
      allPassed = false;
    } else {
      console.log(`  ✅ Route accessible\n`);
    }
  }

  if (allPassed) {
    console.log("✅ All routes validated successfully!");
    process.exit(0);
  } else {
    console.log("❌ Some routes failed validation");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Error during validation:", err);
  process.exit(1);
});
