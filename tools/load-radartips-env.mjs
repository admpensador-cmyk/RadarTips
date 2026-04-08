#!/usr/bin/env node
/**
 * Loads optional repo-root `.env.<APP_ENV>` then `.env.<APP_ENV>.local` (gitignored).
 * Merged file values apply only where process.env[key] is still undefined (shell wins).
 * `.local` overrides the base file for the same key in the merged map.
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
 * Merge `.env.<appEnv>` then `.env.<appEnv>.local` into process.env for keys that are still undefined.
 * Shell-exported variables always win. Does not change APP_ENV or PUBLIC_PAGES_MODE (use for layered loads).
 * @param {string} appEnvName e.g. "preview", "development"
 */
export function mergeRadartipsEnvLayer(appEnvName) {
  const appEnv = String(appEnvName || "").trim();
  if (!appEnv) return { repoRoot, appEnv: "", envFile: "", mergedKeys: 0 };

  const file = path.join(repoRoot, `.env.${appEnv}`);
  const localFile = path.join(repoRoot, `.env.${appEnv}.local`);
  const merged = {};
  if (fs.existsSync(file)) {
    Object.assign(merged, parseEnvFile(fs.readFileSync(file, "utf8")));
  }
  if (fs.existsSync(localFile)) {
    Object.assign(merged, parseEnvFile(fs.readFileSync(localFile, "utf8")));
  }
  let n = 0;
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
      n += 1;
    }
  }
  return { repoRoot, appEnv, envFile: file, mergedKeys: n };
}

/**
 * Merge a single env file (e.g. repo-root `.env.local`) into process.env where still undefined.
 * @param {string} absolutePath
 */
export function mergeRadartipsEnvFile(absolutePath) {
  const file = String(absolutePath || "").trim();
  if (!file || !fs.existsSync(file)) return 0;
  const merged = parseEnvFile(fs.readFileSync(file, "utf8"));
  let n = 0;
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
      n += 1;
    }
  }
  return n;
}

/**
 * @param {string} [appEnvName]
 */
export function loadRadartipsEnv(appEnvName) {
  const appEnv = String(appEnvName || process.env.APP_ENV || "development").trim() || "development";
  if (!process.env.APP_ENV) process.env.APP_ENV = appEnv;

  const file = path.join(repoRoot, `.env.${appEnv}`);
  const localFile = path.join(repoRoot, `.env.${appEnv}.local`);
  const merged = {};
  if (fs.existsSync(file)) {
    Object.assign(merged, parseEnvFile(fs.readFileSync(file, "utf8")));
  }
  if (fs.existsSync(localFile)) {
    Object.assign(merged, parseEnvFile(fs.readFileSync(localFile, "utf8")));
  }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v;
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
