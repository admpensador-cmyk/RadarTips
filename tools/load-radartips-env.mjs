#!/usr/bin/env node
/**
 * Loads optional repo-root `.env.<APP_ENV>` into process.env (does not override existing vars).
 * Fail-closed defaults for local dev are applied when unset.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * @param {string} [appEnvName]
 */
export function loadRadartipsEnv(appEnvName) {
  const appEnv = String(appEnvName || process.env.APP_ENV || "development").trim() || "development";
  if (!process.env.APP_ENV) process.env.APP_ENV = appEnv;

  const file = path.join(repoRoot, `.env.${appEnv}`);
  if (fs.existsSync(file)) {
    const parsed = parseEnvFile(fs.readFileSync(file, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }

  // Map aliases → internal names (only if unset)
  if (process.env.RADARTIPS_ALLOW_DIST_ROOT === undefined) {
    const allow = String(process.env.ALLOW_DIST_ROOT || "").trim().toLowerCase();
    if (allow === "1" || allow === "true" || allow === "yes") process.env.RADARTIPS_ALLOW_DIST_ROOT = "1";
    else process.env.RADARTIPS_ALLOW_DIST_ROOT = "0";
  }

  if (process.env.PUBLIC_PAGES_MODE === undefined) {
    process.env.PUBLIC_PAGES_MODE = appEnv === "preview" || appEnv === "production" ? "dist" : "source";
  }

  return { repoRoot, appEnv, envFile: file };
}
