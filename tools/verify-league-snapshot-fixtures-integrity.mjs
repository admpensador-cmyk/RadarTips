#!/usr/bin/env node
/**
 * Release check: fixture_derived_v1 league snapshots must expose fixtures.finished
 * with one row per league match (cardinality = summary.matches_count).
 *
 * Usage: node tools/verify-league-snapshot-fixtures-integrity.mjs [path/to/league.json]
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const defaultPath = path.join(ROOT, "data", "v1", "leagues", "brasileirao.json");
const snapPath = path.resolve(process.argv[2] || defaultPath);

const raw = fs.readFileSync(snapPath, "utf8");
const j = JSON.parse(raw);

const model = String(j?.meta?.source?.model || "").trim();
if (model !== "fixture_derived_v1") {
  console.log(`[SKIP] ${path.basename(snapPath)} model=${model || "(empty)"} — not fixture_derived_v1`);
  process.exit(0);
}

const fin = j?.fixtures?.finished;
const mc = Number(j?.summary?.matches_count);

if (!Array.isArray(fin)) {
  console.error(`[FAIL] ${snapPath}: fixtures.finished must be an array`);
  process.exit(1);
}
if (!Number.isFinite(mc) || mc <= 0) {
  console.error(`[FAIL] ${snapPath}: invalid summary.matches_count`);
  process.exit(1);
}
if (fin.length !== mc) {
  console.error(
    `[FAIL] ${snapPath}: fixtures.finished.length=${fin.length} !== summary.matches_count=${mc}`
  );
  process.exit(1);
}

console.log(`[OK] ${path.basename(snapPath)} fixtures.finished=${fin.length} matches_count=${mc}`);
process.exit(0);
