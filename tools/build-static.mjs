#!/usr/bin/env node
// RadarTips build-static.mjs
// Production output hardening: serve commit-SHA versioned app bundle.


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

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

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isFile() && entry.name.toLowerCase() === "calendar_7d.json") {
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

// Ensure dist/assets/js/app.js is a direct copy of assets/js/app.js (no wrappers)
const srcApp = path.join(root, 'assets', 'js', 'app.js');
const distAppDir = path.join(dist, 'assets', 'js');
const distApp = path.join(distAppDir, 'app.js');
if (fs.existsSync(srcApp)) {
  fs.mkdirSync(distAppDir, { recursive: true });
  fs.copyFileSync(srcApp, distApp);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
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
const buildAssetName = `app.${commitShort}.js`;
const buildAssetPath = `/assets/js/${buildAssetName}`;

const distAppHashed = path.join(distAppDir, buildAssetName);
if (fs.existsSync(srcApp)) {
  fs.copyFileSync(srcApp, distAppHashed);
}

for (const file of htmlFiles) {
  let html = fs.readFileSync(file, "utf8");

  html = html
    .replace(/\/assets\/js\/app\.[a-f0-9]{7,40}\.js(\?[^"' ]*)?/gi, buildAssetPath)
    .replace(/\/assets\/js\/app\.js(\?[^"' ]*)?/gi, buildAssetPath)
    .replace(/\/assets\/app\.[a-f0-9]{7,40}\.js(\?[^"' ]*)?/gi, buildAssetPath)
    .replace(/\/assets\/app\.js(\?[^"' ]*)?/gi, buildAssetPath)
    .replace(/assets\/js\/app\.[a-f0-9]{7,40}\.js(\?[^"' ]*)?/gi, `assets/js/${buildAssetName}`)
    .replace(/assets\/js\/app\.js(\?[^"' ]*)?/gi, `assets/js/${buildAssetName}`)
    .replace(/assets\/app\.[a-f0-9]{7,40}\.js(\?[^"' ]*)?/gi, `assets/js/${buildAssetName}`)
    .replace(/assets\/app\.js(\?[^"' ]*)?/gi, `assets/js/${buildAssetName}`);

  html = ensureBuildMetaTag(html, commitShort);

  // Replace build badge content
  html = html.replace(
    /(<div[^>]+id=["']build-badge["'][^>]*>)([\s\S]*?)(<\/div>)/i,
    `$1Build: ${buildAssetName} | ${stamp}$3`
  );

  fs.writeFileSync(file, html, "utf8");
}

console.log(`Build complete. Using versioned bundle ${buildAssetPath}.`);
