#!/usr/bin/env node
/**
 * Fail-closed guard: legacy Radar surfaces and artifacts cannot ship silently.
 * Run: node tools/verify-no-zombie-radar.mjs
 * Dist: node tools/verify-no-zombie-radar.mjs --dist
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const useDist = process.argv.includes("--dist");
const base = useDist ? path.join(root, "dist") : root;

const LANGS = ["pt", "en", "es", "fr", "de"];

const SELF_NAME = "verify-no-zombie-radar.mjs";
const CODE_SCAN_SKIP = new Set([`tools/${SELF_NAME}`]);

/** @type {{ re: RegExp; msg: string }[]} */
const globalHtmlBanned = [
  { re: /radar_week/i, msg: "forbidden token radar_week" },
  { re: /radar\/week/i, msg: "forbidden path segment radar/week" },
  { re: /id="topbar"/i, msg: "legacy empty topbar id" },
  { re: /class="topbar"/i, msg: "legacy topbar shell class" },
  { re: /<div class="app">/i, msg: "legacy app shell" },
  { re: /<div class="shell">/i, msg: "legacy shell wrapper" },
  { re: /<div class="container">/i, msg: "legacy container shell" },
  { re: /\.card\[[^\]]*data-slot/i, msg: "legacy top-3 card[data-slot] selector" },
];

const allowlistHtmlRel = new Set(["index.html", "go/out/index.html", "debug/health.html"]);

const forbidden = [
  { re: /app\.b6507b815961\.js/i, msg: "legacy hashed bundle app.b6507b815961.js" },
  { re: /match-radar-v2/i, msg: "match-radar-v2 asset reference" },
  { re: /\/assets\/app\.js/i, msg: "root /assets/app.js (must use hashed /assets/js/app.*.js)" },
  { re: /\/assets\/app\.[a-f0-9]{7,}\.js/i, msg: "root hashed /assets/app.*.js" },
  { re: /bootstrap\.js/i, msg: "bootstrap.js" },
  { re: /radar-day-impl/i, msg: "radar-day-impl" },
  { re: /\/assets\/js\/match-radar\//i, msg: "match-radar micro-app path" },
];

const dayRequired = [
  { re: /data-shell="day-v2"/, msg: "radar/day must set data-shell=day-v2" },
  { re: /data-rt-surface="radar-day"/, msg: "radar/day must set data-rt-surface=radar-day" },
  { re: /class="rt-top3-grid"/, msg: "radar/day must use rt-top3-grid" },
  { re: /class="rt-slot"/, msg: "radar/day must use rt-slot top-3 cards" },
];

const dayForbidden = [
  { re: /<div class="grid">[\s\S]*?data-slot="1"/, msg: "radar/day must not use legacy hero .grid/.card top-3" },
];

const calRequired = [
  { re: /data-shell="day-v2"/, msg: "calendar must set data-shell=day-v2" },
  { re: /data-rt-surface="calendar"/, msg: "calendar must set data-rt-surface=calendar" },
  { re: /class="section rt-cal"/, msg: "calendar must use section rt-cal" },
  { re: /id="calendar_section"/, msg: "calendar must have calendar_section" },
];

const calForbidden = [
  { re: /<div class="grid">[\s\S]*?data-slot="1"/, msg: "calendar must not use legacy top-3 grid" },
  { re: /class="container"/, msg: "calendar must not use legacy container shell" },
  { re: /class="rt-top3"/, msg: "calendar must not include Top-3 block" },
  { re: /class="rt-slot"/, msg: "calendar must not include rt-slot" },
];

let errors = 0;

function fail(msg) {
  console.error(msg);
  errors++;
}

function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === ".git") continue;
      walkHtml(p, out);
    } else if (name.name.endsWith(".html")) out.push(p);
  }
  return out;
}

function walkCodeScan(dir, out = [], extRe) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === "dist" || name.name === ".git") continue;
      walkCodeScan(p, out, extRe);
    } else if (extRe.test(name.name)) out.push(p);
  }
  return out;
}

function relToRoot(abs) {
  return path.relative(root, abs).replace(/\\/g, "/");
}

function relToBase(abs) {
  return path.relative(base, abs).replace(/\\/g, "/");
}

// --- Artifact: legacy JSON must not exist on disk ---
const radarWeekJson = path.join(base, "data", "v1", `${"radar"}_${"week"}.json`);
if (fs.existsSync(radarWeekJson)) {
  fail(`FAIL ${relToRoot(radarWeekJson)}: legacy week JSON artifact must not exist`);
}

// --- Routes: no radar/week pages ---
for (const L of LANGS) {
  const weekIndex = path.join(base, L, "radar", "week", "index.html");
  if (fs.existsSync(weekIndex)) {
    fail(`FAIL ${relToRoot(weekIndex)}: radar/week route removed — delete this file`);
  }
}

// --- Source tree code scan (JS/MJS only; workflows may assert absence by filename) ---
if (!useDist) {
  const codeFiles = [];
  walkCodeScan(path.join(root, "tools"), codeFiles, /\.mjs$/);
  walkCodeScan(path.join(root, "workers"), codeFiles, /\.js$/);
  walkCodeScan(path.join(root, "assets", "js"), codeFiles, /\.js$/);
  for (const f of codeFiles) {
    const rel = relToRoot(f);
    if (CODE_SCAN_SKIP.has(rel)) continue;
    const text = fs.readFileSync(f, "utf8");
    if (/radar_week/i.test(text)) fail(`FAIL ${rel}: forbidden token radar_week`);
    if (/radar\/week/i.test(text)) fail(`FAIL ${rel}: forbidden path segment radar/week`);
  }
}

// --- Product HTML (lang sites + go) ---
const productHtml = [];
for (const L of LANGS) walkHtml(path.join(base, L), productHtml);
walkHtml(path.join(base, "go"), productHtml);

for (const file of productHtml) {
  const rel = relToBase(file);
  const text = fs.readFileSync(file, "utf8");

  for (const { re, msg } of globalHtmlBanned) {
    if (re.test(text)) fail(`FAIL ${rel}: ${msg}`);
  }

  const mainCount = (text.match(/<main\b/gi) || []).length;
  if (mainCount > 1) fail(`FAIL ${rel}: expected at most one <main> (found ${mainCount})`);

  if (!allowlistHtmlRel.has(rel)) {
    if (!/data-shell="day-v2"/.test(text)) {
      fail(`FAIL ${rel}: missing body contract data-shell="day-v2"`);
    }
  }
}

// --- Core radar day + calendar templates ---
const coreTemplates = [];
for (const L of LANGS) {
  coreTemplates.push(
    path.join(base, L, "radar", "day", "index.html"),
    path.join(base, L, "calendar", "index.html")
  );
}

for (const file of coreTemplates) {
  if (!fs.existsSync(file)) {
    fail(`Missing core template: ${relToRoot(file)}`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  const rel = relToRoot(file).replace(/\\/g, "/");
  for (const { re, msg } of forbidden) {
    if (re.test(text)) fail(`FAIL ${rel}: forbidden pattern (${msg})`);
  }
  if (rel.endsWith("/radar/day/index.html")) {
    for (const { re, msg } of dayRequired) {
      if (!re.test(text)) fail(`FAIL ${rel}: missing (${msg})`);
    }
    for (const { re, msg } of dayForbidden) {
      if (re.test(text)) fail(`FAIL ${rel}: forbidden day shell (${msg})`);
    }
    const slotArticles = text.match(/<article class="rt-slot"/g);
    const slotN = slotArticles ? slotArticles.length : 0;
    if (slotN !== 3) {
      fail(`FAIL ${rel}: radar/day must have exactly 3 <article class="rt-slot"> (found ${slotN})`);
    }
  }
  if (rel.endsWith("/calendar/index.html")) {
    for (const { re, msg } of calRequired) {
      if (!re.test(text)) fail(`FAIL ${rel}: missing (${msg})`);
    }
    for (const { re, msg } of calForbidden) {
      if (re.test(text)) fail(`FAIL ${rel}: forbidden calendar shell (${msg})`);
    }
  }
}

if (errors) {
  console.error(`\nverify-no-zombie-radar: ${errors} violation(s)`);
  process.exit(1);
}
console.log(
  useDist ? "verify-no-zombie-radar: OK (dist fail-closed)" : "verify-no-zombie-radar: OK (source fail-closed)"
);
process.exit(0);
