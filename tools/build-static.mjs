
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

async function rmDirSafe(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const e of entries) {
    if (e.name === "dist" || e.name === "node_modules" || e.name === ".git") continue;

    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);

    if (e.isDirectory()) {
      await copyDir(s, d);
    } else if (e.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

function sha256Short(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

async function listHtmlFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listHtmlFiles(p)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

async function main() {
  await rmDirSafe(DIST);
  await copyDir(ROOT, DIST);

  const appPath = path.join(DIST, "assets", "app.js");
  const appBuf = await fs.readFile(appPath);
  const hash = sha256Short(appBuf);

  const newName = `app.${hash}.js`;
  const newPath = path.join(DIST, "assets", newName);

  await fs.writeFile(newPath, appBuf);
  await fs.rm(appPath);

  const htmlFiles = await listHtmlFiles(DIST);

  for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");
    html = html.replace(/assets\/app\.js(\?[^"']*)?/g, `assets/${newName}`);
    await fs.writeFile(file, html);
  }

  console.log("Build complete:", newName);
}

main();
