#!/usr/bin/env node
/**
 * No silent "magic" deploys: print the single official path for each environment.
 */
import process from "node:process";

const target = String(process.argv[2] || "").trim().toLowerCase();

if (target === "preview") {
  console.log(
    [
      "RadarTips — preview deploy (isolated)",
      "",
      "- Build locally: npm run preview:build",
      "- Serve dist locally: npm run dev:dist (http://127.0.0.1:4173) — canonical check: /en/radar/day/",
      "- Cloudflare Pages: use a preview project / branch; do not reuse production secrets.",
      "",
    ].join("\n")
  );
  process.exit(0);
}

if (target === "production" || target === "prod") {
  console.log(
    [
      "RadarTips — production deploy (single official path)",
      "",
      "- GitHub Actions: deploy_pages.yml (workflow_dispatch)",
      "  - Builds dist via tools/build-static.mjs",
      "  - Validates dist/en/radar/day/ and hashed bundle",
      "  - Deploys wrangler pages deploy dist",
      "  - Post-check: tools/check-production-day-runtime.mjs",
      "",
      "- Worker: deploy-worker.yml (separate; API + R2 bindings)",
      "",
    ].join("\n")
  );
  process.exit(0);
}

console.error("Usage: node tools/deploy-hint.mjs <preview|production>");
process.exit(1);
