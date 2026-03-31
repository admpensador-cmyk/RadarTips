#!/usr/bin/env node
/**
 * Fail-closed verification: required prod/ keys exist in R2 (non-zero size).
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, wrangler auth.
 *
 *   node tools/r2-verify-prod-prefix.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BUCKET = process.env.R2_BUCKET_NAME || "radartips-data";
const PREFIX = "prod";

const REQUIRED = [
  `${PREFIX}/snapshots/calendar_2d.json`,
  `${PREFIX}/snapshots/latest_calendar_2d.json`,
  `${PREFIX}/snapshots/radar_day.json`,
  `${PREFIX}/snapshots/latest_radar_day.json`,
  `${PREFIX}/data/coverage_allowlist.json`,
  `${PREFIX}/snapshots/leagues/premier-league.json`,
];

const root = process.cwd();
const tmp = path.join(root, ".tmp-r2-verify");
fs.mkdirSync(tmp, { recursive: true });

function getObject(key) {
  const local = path.join(tmp, key.replace(/\//g, "_"));
  const r = spawnSync(
    "npx",
    ["--yes", "wrangler@4.62.0", "r2", "object", "get", "--remote", `${BUCKET}/${key}`, "--file", local],
    { stdio: "pipe", shell: process.platform === "win32", env: process.env }
  );
  if (r.status !== 0) {
    return { ok: false, key, error: r.stderr?.toString() || `exit ${r.status}` };
  }
  const st = fs.statSync(local);
  return { ok: true, key, bytes: st.size, mtime: st.mtime.toISOString() };
}

let failed = false;
for (const key of REQUIRED) {
  const out = getObject(key);
  if (!out.ok) {
    console.error(`[FAIL] ${key}: ${out.error}`);
    failed = true;
    continue;
  }
  if (out.bytes <= 0) {
    console.error(`[FAIL] ${key}: empty file`);
    failed = true;
    continue;
  }
  console.log(`[OK] ${key} bytes=${out.bytes} mtime=${out.mtime}`);
}

process.exit(failed ? 1 : 0);
