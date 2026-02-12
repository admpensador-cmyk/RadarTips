#!/usr/bin/env node
/**
 * Local validation script for Worker routing
 * Tests that /api/* paths are correctly normalized and routed
 */

const testCases = [
  {
    description: "Health check at /api/__health",
    input: "/api/__health",
    expectedMatch: true,
    expectedPath: "/v1/health" // After normalization (but __health is handled separately)
  },
  {
    description: "Calendar snapshot at /api/v1/calendar_7d.json",
    input: "/api/v1/calendar_7d.json",
    expectedMatch: true,
    expectedPath: "/v1/calendar_7d" // After normalization
  },
  {
    description: "Radar day at /api/v1/radar_day.json",
    input: "/api/v1/radar_day.json",
    expectedMatch: true,
    expectedPath: "/v1/radar_day"
  },
  {
    description: "Radar week at /api/v1/radar_week.json",
    input: "/api/v1/radar_week.json",
    expectedMatch: true,
    expectedPath: "/v1/radar_week"
  },
  {
    description: "Health endpoint at /api/v1/health",
    input: "/api/v1/health",
    expectedMatch: true,
    expectedPath: "/v1/health"
  },
  {
    description: "Base endpoint at /api/v1/base",
    input: "/api/v1/base",
    expectedMatch: true,
    expectedPath: "/v1/base"
  },
  {
    description: "Calendar snapshot without /api prefix",
    input: "/v1/calendar_7d.json",
    expectedMatch: true,
    expectedPath: "/v1/calendar_7d"
  },
  {
    description: "Invalid path returns 404",
    input: "/api/v1/invalid.json",
    expectedMatch: false,
    expectedPath: "/v1/invalid"
  }
];

/**
 * Simulate the path normalization logic from Worker
 */
function normalizePath(pathname) {
  // Handle health check separately (no normalization for /api/__health)
  if (pathname === "/api/__health") {
    return { isHealthCheck: true, normalized: null };
  }

  let normalized = pathname;
  
  // Strip /api/ prefix if present
  if (normalized.startsWith("/api/")) {
    normalized = normalized.slice(4);
  }

  // Strip .json suffix if present
  if (normalized.endsWith(".json")) {
    normalized = normalized.slice(0, -5);
  }

  return {
    isHealthCheck: false,
    normalized,
    isV1: normalized.startsWith("/v1/")
  };
}

/**
 * Check if normalized path matches a known handler
 */
function pathMatches(normalized) {
  const handlers = [
    "/v1/health",
    "/v1/base",
    "/v1/live",
    "/v1/live/state",
    "/v1/calendar_7d",
    "/v1/radar_day",
    "/v1/radar_week"
  ];

  return handlers.includes(normalized);
}

function main() {
  console.log("🧪 Worker Route Normalization Tests\n");
  console.log("Testing path normalization and handler routing:\n");

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const result = normalizePath(test.input);
    let matches = false;
    let actualPath = null;

    if (result.isHealthCheck) {
      matches = true;
      actualPath = "/__health";
    } else if (result.isV1) {
      matches = pathMatches(result.normalized);
      actualPath = result.normalized;
    } else {
      matches = false;
      actualPath = result.normalized;
    }

    const success = matches === test.expectedMatch;

    if (success) {
      console.log(`✅ ${test.description}`);
      console.log(`   Input:    ${test.input}`);
      console.log(`   Normalized: ${actualPath}`);
      console.log(`   Routable:  ${matches}\n`);
      passed++;
    } else {
      console.log(`❌ ${test.description}`);
      console.log(`   Input:    ${test.input}`);
      console.log(`   Expected: matches=${test.expectedMatch}`);
      console.log(`   Actual:   matches=${matches}, path=${actualPath}\n`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed}/${testCases.length} passed`);

  if (failed === 0) {
    console.log("✅ All routing tests passed!");
    process.exit(0);
  } else {
    console.log(`❌ ${failed} test(s) failed`);
    process.exit(1);
  }
}

main();
