
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

  // Ensure assets dir exists in dist
  const distAssets = path.join(DIST, "assets");
  await ensureDir(distAssets);

  // Try to find an existing hashed app file in dist/assets (app.<hash>.js)
  // If multiple exist, choose the newest by mtime (deterministic)
  const filesInDistAssets = await fs.readdir(distAssets).catch(() => []);
  let newName = null;

  const candidates = [];
  for (const f of filesInDistAssets) {
    if (/^app\.[a-f0-9]{12}\.js$/.test(f)) {
      const fullPath = path.join(distAssets, f);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat) {
        candidates.push({ name: f, mtime: stat.mtime.getTime() });
      }
    }
  }

  if (candidates.length > 0) {
    // Sort by mtime descending, pick newest
    candidates.sort((a, b) => b.mtime - a.mtime);
    newName = candidates[0].name;
    console.log(`[build-static] Found ${candidates.length} bundle(s) in dist/assets, using newest: ${newName}`);
  }

  // If not found in dist, try to find in project root `assets/`
  if (!newName) {
    const rootAssets = path.join(ROOT, "assets");
    const filesInRootAssets = await fs.readdir(rootAssets).catch(() => []);

    // Find all hashed files in root, choose newest by mtime
    const rootCandidates = [];
    for (const f of filesInRootAssets) {
      if (/^app\.[a-f0-9]{12}\.js$/.test(f)) {
        const fullPath = path.join(rootAssets, f);
        const stat = await fs.stat(fullPath).catch(() => null);
        if (stat) {
          rootCandidates.push({ name: f, mtime: stat.mtime.getTime() });
        }
      }
    }

    if (rootCandidates.length > 0) {
      // Sort by mtime descending, pick newest
      rootCandidates.sort((a, b) => b.mtime - a.mtime);
      newName = rootCandidates[0].name;
      console.log(`[build-static] Found ${rootCandidates.length} bundle(s) in assets/, using newest: ${newName}`);
      await fs.copyFile(path.join(rootAssets, newName), path.join(distAssets, newName));
    } else {
      // Fallback: look for app.js and hash it
      const plainInRoot = filesInRootAssets.find((f) => f === "app.js");
      if (plainInRoot) {
        const srcPath = path.join(rootAssets, plainInRoot);
        const appBuf = await fs.readFile(srcPath);
        const hash = sha256Short(appBuf);
        newName = `app.${hash}.js`;
        const newPath = path.join(distAssets, newName);
        await fs.writeFile(newPath, appBuf);
        console.log(`[build-static] Generated bundle from assets/app.js: ${newName}`);
      }
    }
  }

  // If we still don't have a hashed app file, don't attempt to read dist/assets/app.js
  if (!newName) {
    console.warn("No app.*.js found in dist/assets or assets/; skipping app bundling step.");
  }

  const htmlFiles = await listHtmlFiles(DIST);

  for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");
    if (newName) {
      // Replace ALL references: assets/app.js AND assets/app.<oldhash>.js
      // Add cache-busting query param based on hash to force CDN/browser refresh
      const cacheBust = newName.match(/app\.([a-f0-9]{12})\.js/)?.[1]?.slice(0, 8) || Date.now();
      html = html.replace(/assets\/app(\.[a-f0-9]{12})?\.js(\?[^"']*)?/g, `assets/${newName}?v=${cacheBust}`);
    }
    // Inject a small build badge into every page so humans can visually confirm deployed bundle
    try{
      const d = new Date();
      const pad = (n)=> String(n).padStart(2,'0');
      const badgeDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const badgeHtml = `\n<!-- build-badge -->\n<div id="build-badge" style="position:fixed;right:10px;bottom:8px;padding:6px 8px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;border-radius:6px;opacity:.75;z-index:2147483647">Build: ${newName || 'unknown'} | ${badgeDate}</div>\n<!-- /build-badge -->\n`;
      if(/<\/body>/i.test(html)){
        html = html.replace(/<\/body>/i, badgeHtml + "</body>");
      }else{
        html = html + badgeHtml;
      }
    }catch(e){ /* don't fail build for badge issues */ }
    await fs.writeFile(file, html);
  }

  console.log("Build complete:", newName);
}

main();
