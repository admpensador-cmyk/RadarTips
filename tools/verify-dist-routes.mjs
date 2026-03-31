#!/usr/bin/env node
/**
 * Fail-closed: dist must expose the canonical Radar Day surface and localized equivalents.
 * Primary: /en/radar/day/ (file dist/en/radar/day/index.html)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const PRIMARY = "en/radar/day/index.html";
const SECONDARY = ["pt", "es", "fr", "de"].map((L) => `${L}/radar/day/index.html`);

function mustExist(rel) {
  const p = path.join(dist, ...rel.split("/"));
  if (!fs.existsSync(p)) {
    console.error(`[verify-dist-routes] FAIL: missing ${rel}`);
    process.exit(1);
  }
}

if (!fs.existsSync(dist)) {
  console.error("[verify-dist-routes] FAIL: dist/ does not exist (run npm run build first)");
  process.exit(1);
}

mustExist(PRIMARY);
for (const rel of SECONDARY) mustExist(rel);

console.log(`[verify-dist-routes] OK primary=${PRIMARY} secondary=${SECONDARY.length} locales`);
process.exit(0);
