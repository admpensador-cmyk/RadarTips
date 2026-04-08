#!/usr/bin/env node
/**
 * Upload ONLY pilot Brasileirão preview snapshots to R2 under preview/ prefix.
 * Keys:
 *   {prefix}/snapshots/brasileirao/competition.json
 *   {prefix}/snapshots/brasileirao/team-stats.json
 *
 * REQUIRED:
 *   RADARTIPS_SNAPSHOT_PREFIX=preview
 *   RADARTIPS_CONFIRM_PREVIEW_UPLOAD=1 (when not CI)
 * BLOCKED:
 *   prefix !== preview → exit 1 (production lock)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WRANGLER_PKG = "wrangler@4.62.0";
const R2_BUCKET = process.env.R2_BUCKET_NAME || "radartips-data";

const PREFIX = String(process.env.RADARTIPS_SNAPSHOT_PREFIX || "")
  .trim()
  .replace(/^\/+|\/+$/g, "");

if (PREFIX !== "preview") {
  console.error(
    "[FAIL-CLOSED] upload-preview-brasileirao only allows RADARTIPS_SNAPSHOT_PREFIX=preview (production lock)."
  );
  process.exit(1);
}

if (!process.env.CI && process.env.RADARTIPS_CONFIRM_PREVIEW_UPLOAD !== "1") {
  console.error(
    "[FAIL-CLOSED] Set RADARTIPS_CONFIRM_PREVIEW_UPLOAD=1 for local preview upload."
  );
  process.exit(1);
}

if (process.env.RADARTIPS_DENY_PROD_UPLOAD === "1" && PREFIX !== "preview") {
  process.exit(1);
}

function remote(rel) {
  return `${PREFIX}/${String(rel).replace(/^\/+/, "")}`;
}

function assertPrefixedR2Key(remoteKey) {
  const key = String(remoteKey || "");
  if (!key.startsWith("preview/")) {
    throw new Error(`[FAIL-CLOSED] Key must start with preview/: ${key}`);
  }
}

const LOCAL_COMP = path.join(ROOT, "data", "preview", "brasileirao", "competition.json");
const LOCAL_STATS = path.join(ROOT, "data", "preview", "brasileirao", "team-stats.json");

for (const f of [LOCAL_COMP, LOCAL_STATS]) {
  if (!fs.existsSync(f)) {
    console.error(`[FAIL-CLOSED] Missing file: ${f} (run tools/preview-pipeline-brasileirao.mjs first)`);
    process.exit(1);
  }
}

const targets = [
  { local: LOCAL_COMP, remote: remote("snapshots/brasileirao/competition.json") },
  { local: LOCAL_STATS, remote: remote("snapshots/brasileirao/team-stats.json") }
];

for (const t of targets) {
  assertPrefixedR2Key(t.remote);
}

function spawnWrangler(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["--yes", WRANGLER_PKG, ...args], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
      shell: true
    });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`wrangler exit ${code}`))));
  });
}

(async () => {
  for (const t of targets) {
    const fullKey = `${R2_BUCKET}/${t.remote}`;
    console.log(`[R2] PUT ${fullKey}`);
    await spawnWrangler([
      "r2",
      "object",
      "put",
      fullKey,
      "--file",
      t.local,
      "--content-type",
      "application/json",
      "--remote"
    ]);
  }
  console.log("[OK] Preview Brasileirão artifacts uploaded (preview/ only).");
})().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
