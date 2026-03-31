#!/usr/bin/env node
// RadarTips build-static.mjs
// Production output hardening: serve content-hash versioned app bundle.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { loadRadartipsEnv } from "./load-radartips-env.mjs";

loadRadartipsEnv(process.env.APP_ENV || "production");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
}
fs.mkdirSync(dist, { recursive: true });

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }

    // Never copy env files into Pages output (secrets + wrong runtime).
    if (entry.name.startsWith(".env")) {
      continue;
    }

    // Never ship scratch artifacts or build-only tooling to Cloudflare Pages.
    if (entry.name === "tools" || entry.name.startsWith("tmp_")) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Root package.json references tools/ (not copied to dist); avoid a broken npm surface in output.
    if (
      entry.isFile() &&
      entry.name === "package.json" &&
      path.resolve(srcPath) === path.resolve(root, "package.json")
    ) {
      continue;
    }

    if (entry.isFile() && ["calendar_7d.json", "radar_day.json"].includes(entry.name.toLowerCase())) {
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".bak")) {
      continue;
    }

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}


copyRecursive(root, dist);

removeLegacyPath(path.join(dist, "data", "v1", `${"radar"}_${"week"}.json`));
for (const L of ["pt", "en", "es", "fr", "de"]) {
  removeLegacyPath(path.join(dist, L, "radar", "week"));
}

const srcApp = path.join(root, 'assets', 'js', 'app.js');
const distAppDir = path.join(dist, 'assets', 'js');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function removeLegacyPath(targetPath) {
  if (!fs.existsSync(targetPath)) return;

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return;
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EBUSY") throw error;
  }

  try {
    const stat = fs.statSync(targetPath);
    fs.chmodSync(targetPath, 0o666);

    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } else {
      fs.unlinkSync(targetPath);
    }
  } catch (error) {
    if (error?.code === "EBUSY" || error?.code === "EPERM") {
      console.warn(`WARN: could not remove locked path (skipped): ${targetPath}`);
      return;
    }
    throw error;
  }
}

const htmlFiles = walk(dist).filter((f) => f.endsWith(".html"));


function getGitCommitShort() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore","pipe","ignore"] })
      .toString().trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function nowStamp() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function ensureBuildMetaTag(html, buildId) {
  const metaTag = `<meta name="radartips-build" content="${buildId}">`;
  if (/name=["']radartips-build["']/i.test(html)) {
    return html.replace(
      /<meta\s+name=["']radartips-build["']\s+content=["'][^"']*["']\s*\/?\s*>/i,
      metaTag
    );
  }

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${metaTag}\n</head>`);
  }

  return `${metaTag}\n${html}`;
}

const commitShort = getGitCommitShort();
const stamp = nowStamp();
const srcHash = fs.existsSync(srcApp)
  ? createHash("sha1").update(fs.readFileSync(srcApp)).digest("hex").slice(0, 12)
  : createHash("sha1").update(String(commitShort || "unknown")).digest("hex").slice(0, 12);
const buildAssetName = `app.${srcHash}.js`;
const buildAssetPath = `/assets/js/${buildAssetName}`;

const distAppHashed = path.join(distAppDir, buildAssetName);
if (fs.existsSync(srcApp)) {
  fs.mkdirSync(distAppDir, { recursive: true });
  fs.copyFileSync(srcApp, distAppHashed);
}

for (const name of fs.existsSync(distAppDir) ? fs.readdirSync(distAppDir) : []) {
  if (!/^app\.[a-f0-9]+\.js$/i.test(name) || name === buildAssetName) continue;
  removeLegacyPath(path.join(distAppDir, name));
}

const distAssetsRoot = path.join(dist, "assets");
if (fs.existsSync(distAssetsRoot)) {
  for (const name of fs.readdirSync(distAssetsRoot)) {
    if (/^app\.[a-f0-9]{7,40}\.js$/i.test(name)) {
      removeLegacyPath(path.join(distAssetsRoot, name));
    }
    if (/^match-radar-v2\./i.test(name) && (name.endsWith(".js") || name.endsWith(".css"))) {
      removeLegacyPath(path.join(distAssetsRoot, name));
    }
  }
}

const zombieDirs = [
  path.join(dist, "assets", "js", "match-radar"),
  path.join(dist, "assets", "css"),
];
for (const zDir of zombieDirs) {
  if (!fs.existsSync(zDir)) continue;
  if (zDir.endsWith("match-radar")) {
    removeLegacyPath(zDir);
    continue;
  }
  for (const name of fs.readdirSync(zDir)) {
    if (name === "match-radar-v2.css" || /^match-radar-v2\./i.test(name)) {
      removeLegacyPath(path.join(zDir, name));
    }
  }
}

for (const rel of [
  path.join(dist, "assets", "js", "match-radar-v2.js"),
  path.join(dist, "assets", "js", "bootstrap.js"),
  path.join(dist, "assets", "js", "features", "radar-day-impl.js"),
  path.join(dist, "assets", "js", "features", "radar-day.js"),
  path.join(dist, "assets", "js", "features", "match-radar.js"),
  path.join(dist, "assets", "js", "features", "competition-radar.js"),
]) {
  removeLegacyPath(rel);
}

for (const file of htmlFiles) {
  let html = fs.readFileSync(file, "utf8");

  html = html
    .replace(/<link[^>]*match-radar-v2[^>]*>\s*/gi, "")
    .replace(/\/assets\/js\/app\.[a-f0-9]{7,40}\.js(\?[^"' ]*)?/gi, buildAssetPath)
    .replace(/\/assets\/js\/app\.js(\?[^"' ]*)?/gi, buildAssetPath)
    .replace(/\/assets\/app\.[a-f0-9]{7,40}\.js(\?[^"' ]*)?/gi, buildAssetPath)
    .replace(/\/assets\/app\.js(\?[^"' ]*)?/gi, buildAssetPath)
    .replace(/assets\/js\/app\.[a-f0-9]{7,40}\.js(\?[^"' ]*)?/gi, `assets/js/${buildAssetName}`)
    .replace(/assets\/js\/app\.js(\?[^"' ]*)?/gi, `assets/js/${buildAssetName}`)
    .replace(/assets\/app\.[a-f0-9]{7,40}\.js(\?[^"' ]*)?/gi, `assets/js/${buildAssetName}`)
    .replace(/assets\/app\.js(\?[^"' ]*)?/gi, `assets/js/${buildAssetName}`);

  html = html.replace(/app\.b6507b815961\.js/gi, buildAssetName);

  html = ensureBuildMetaTag(html, srcHash);

  // Replace build badge content
  html = html.replace(
    /(<div[^>]+id=["']build-badge["'][^>]*>)([\s\S]*?)(<\/div>)/i,
    `$1Build: ${buildAssetName} | ${stamp}$3`
  );

  fs.writeFileSync(file, html, "utf8");
}

for (const legacyPath of [
  path.join(dist, 'assets', 'js', 'app.js'),
  path.join(dist, 'assets', 'app.js'),
  path.join(dist, 'data', 'v1', 'radar_day.json')
]) {
  removeLegacyPath(legacyPath);
}

console.log(`Build complete. Using versioned bundle ${buildAssetPath}.`);

const verifyScript = path.join(__dirname, "verify-no-zombie-radar.mjs");
const verifyRun = spawnSync(process.execPath, [verifyScript, "--dist"], {
  stdio: "inherit",
  cwd: root,
});
if (verifyRun.status !== 0) {
  process.exit(verifyRun.status ?? 1);
}

const routesScript = path.join(__dirname, "verify-dist-routes.mjs");
const routesRun = spawnSync(process.execPath, [routesScript], {
  stdio: "inherit",
  cwd: root,
});
if (routesRun.status !== 0) {
  process.exit(routesRun.status ?? 1);
}
