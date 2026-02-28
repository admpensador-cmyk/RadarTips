#!/usr/bin/env node
// RadarTips build-static.mjs
// Simplified build: always serve plain /assets/js/app.js (no hashed bundle)


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

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(root, dist);

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

const commitShort = getGitCommitShort();
const stamp = nowStamp();

for (const file of htmlFiles) {
  let html = fs.readFileSync(file, "utf8");

  html = html
    .replace(/\/assets\/js\/app\.[a-f0-9]+\.js\?v=[^"' ]*/gi, "/assets/js/app.js")
    .replace(/\/assets\/js\/app\.[a-f0-9]+\.js/gi, "/assets/js/app.js");

  // Replace build badge content
  html = html.replace(
    /(<div[^>]+id=["']build-badge["'][^>]*>)([\s\S]*?)(<\/div>)/i,
    `$1Build: ${commitShort} | ${stamp}$3`
  );

  fs.writeFileSync(file, html, "utf8");
}

console.log("Build complete. Using plain /assets/js/app.js only.");
