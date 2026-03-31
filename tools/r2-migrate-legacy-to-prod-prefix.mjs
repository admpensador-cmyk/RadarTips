#!/usr/bin/env node
/**
 * One-time migration: copy legacy R2 keys (snapshots/*, data/coverage_allowlist.json)
 * into prod/ namespace. Run AFTER authenticating wrangler (CLOUDFLARE_API_TOKEN, etc.).
 *
 *   RADARTIPS_SNAPSHOT_PREFIX=prod node tools/r2-migrate-legacy-to-prod-prefix.mjs
 *
 * Does NOT delete legacy objects (ops can remove manually after Worker deploy).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BUCKET = process.env.R2_BUCKET_NAME || "radartips-data";
const PREFIX = String(process.env.RADARTIPS_SNAPSHOT_PREFIX || "prod")
  .trim()
  .replace(/^\/+|\/+$/g, "");
if (PREFIX !== "prod") {
  console.error("[FATAL] This migration targets prod/ only. Set RADARTIPS_SNAPSHOT_PREFIX=prod");
  process.exit(1);
}

const LEGACY_KEYS = [
  "snapshots/calendar_2d.json",
  "snapshots/latest_calendar_2d.json",
  "snapshots/radar_day.json",
  "snapshots/latest_radar_day.json",
  "data/coverage_allowlist.json",
  "snapshots/leagues/premier-league.json",
];

const root = process.cwd();
const tmpDir = path.join(root, ".tmp-r2-migrate");
fs.mkdirSync(tmpDir, { recursive: true });

function wrangler(args) {
  const r = spawnSync("npx", ["--yes", "wrangler@4.62.0", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

for (const legacy of LEGACY_KEYS) {
  const dest = `${PREFIX}/${legacy}`;
  const local = path.join(tmpDir, legacy.replace(/\//g, "_"));
  console.log(`\n[migrate] ${legacy} -> ${dest}`);
  wrangler(["r2", "object", "get", "--remote", `${BUCKET}/${legacy}`, "--file", local]);
  wrangler(["r2", "object", "put", "--remote", `${BUCKET}/${dest}`, "--file", local, "--content-type", "application/json"]);
}

console.log("\n[migrate] OK — deploy Worker with RADARTIPS_SNAPSHOT_PREFIX=prod, then remove legacy keys if desired.");
