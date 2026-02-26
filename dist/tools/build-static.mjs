
const FORCE_PLAIN_APP_JS = true; // RadarTips: always use /assets/js/app.js (no hashed bundle)

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateMatchRadarCssHash } from "./hash-css.mjs";

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

async function listHtmlFiles(dir, excludeDirs = new Set()) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (excludeDirs.has(e.name)) continue;
      out.push(...(await listHtmlFiles(p, excludeDirs)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

async function updateHtmlFiles(htmlFiles, newName, newCssName) {
  for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");
    if (newName) {
      // Replace ALL references: assets/app.js AND assets/app.<oldhash>.js
      // Add cache-busting query param based on hash to force CDN/browser refresh
      const cacheBust = newName.match(/app\.([a-f0-9]{12})\.js/)?.[1]?.slice(0, 8) || Date.now();
      html = html.replace(/assets\/app(\.[a-f0-9]{12})?\.js(\?[^"']*)?/g, `assets/js/${newName}?v=${cacheBust}`);
      html = html.replace(/assets\/js\/app(\.[a-f0-9]{12})?\.js(\?[^"']*)?/g, `assets/js/${newName}?v=${cacheBust}`);
    }
    
    // Update Match Radar V2 CSS hash reference
    if (newCssName) {
      html = html.replace(/assets\/match-radar-v2(\.[a-f0-9]{12})?\.css/g, `assets/${newCssName}`);
    }

    // Inject GA4 snippet right after <head>, if missing
    const gaId = "G-ME07NV3W8Y";
    const hasGa = /googletagmanager\.com\/gtag\/js\?id=G-ME07NV3W8Y/i.test(html)
      || /gtag\(['"]config['"],\s*['"]G-ME07NV3W8Y['"]/i.test(html);
    if (!hasGa && /<head>/i.test(html)) {
      const gaSnippet = `\n  <script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>\n  <script>window.dataLayer=window.dataLayer||[]; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config','${gaId}', { anonymize_ip: true });</script>\n`;
      html = html.replace(/<head>/i, `<head>${gaSnippet}`);
    }
    // Inject a small build badge into every page so humans can visually confirm deployed bundle
    try{
      html = html.replace(/\s*<!-- build-badge -->[\s\S]*?<!-- \/build-badge -->\s*/g, "\n");
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
}

async function main() {
  await rmDirSafe(DIST);
  await copyDir(ROOT, DIST);

  // Generate hashed CSS file for match-radar
  let newCssName = null;
  try {
    const cssResult = await generateMatchRadarCssHash(ROOT);
    newCssName = cssResult.filename;
    console.log(`[build-static] CSS hash generated: ${newCssName}`);
  } catch (e) {
    console.warn(`[build-static] Warning: CSS hashing skipped - ${e.message}`);
  }

  // Ensure assets dir exists in dist
  const distAssets = path.join(DIST, "assets");
  await ensureDir(distAssets);

  // Try to find an existing hashed app file in dist/assets/js (app.<hash>.js)
  // If multiple exist, choose the newest by mtime (deterministic)
  const distAssetsJs = path.join(distAssets, "js");
  const filesInDistAssetsJs = await fs.readdir(distAssetsJs).catch(() => []);
  let newName = null;

  const candidates = [];
  for (const f of filesInDistAssetsJs) {
    if (/^app\.[a-f0-9]{12}\.js$/.test(f)) {
      const fullPath = path.join(distAssetsJs, f);
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
    console.log(`[build-static] Found ${candidates.length} bundle(s) in dist/assets/js, using newest: ${newName}`);
  }

  // If not found in dist, try to find in project root `assets/js`
  if (!newName) {
    const rootAssets = path.join(ROOT, "assets");
    const rootAssetsJs = path.join(rootAssets, "js");
    const filesInRootAssetsJs = await fs.readdir(rootAssetsJs).catch(() => []);

    // Find all hashed files in root, choose newest by mtime
    const rootCandidates = [];
    for (const f of filesInRootAssetsJs) {
      if (/^app\.[a-f0-9]{12}\.js$/.test(f)) {
        const fullPath = path.join(rootAssetsJs, f);
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
      console.log(`[build-static] Found ${rootCandidates.length} bundle(s) in assets/js, using newest: ${newName}`);
      await fs.copyFile(path.join(rootAssetsJs, newName), path.join(distAssetsJs, newName));
    } else {
      // Fallback: look for assets/js/app.js and hash it
      const plainInRoot = filesInRootAssetsJs.find((f) => f === "app.js");
      if (plainInRoot) {
        const srcPath = path.join(rootAssetsJs, plainInRoot);
        const appBuf = await fs.readFile(srcPath);
        const hash = sha256Short(appBuf);
        newName = `app.${hash}.js`;
        const newPath = path.join(distAssetsJs, newName);
        await fs.writeFile(newPath, appBuf);
        console.log(`[build-static] Generated bundle from assets/js/app.js: ${newName}`);
      }
    }
  }

  // If we still don't have a hashed app file, don't attempt to read dist/assets/app.js
  if (!newName) {
    console.warn("No app.*.js found in dist/assets or assets/; skipping app bundling step.");
  }

  const htmlFiles = await listHtmlFiles(DIST);
  await updateHtmlFiles(htmlFiles, newName, newCssName);

  // If Pages is serving repo root, update HTML there too (exclude dist/node_modules/.git)
  const rootHtmlFiles = await listHtmlFiles(ROOT, new Set(["dist", "node_modules", ".git"]));
  await updateHtmlFiles(rootHtmlFiles, newName, newCssName);

  // Ensure hashed bundle exists in root assets/js, then prune old hashes
  if (newName) {
    const rootAssets = path.join(ROOT, "assets");
    const rootAssetsJs = path.join(ROOT, "assets", "js");
    await ensureDir(rootAssets);
    await ensureDir(rootAssetsJs);
    const distBundleJsPath = path.join(distAssetsJs, newName);
    const rootBundleJsPath = path.join(rootAssetsJs, newName);
    await fs.copyFile(distBundleJsPath, rootBundleJsPath).catch(() => {});

    const pruneOldHashes = async (dir) => {
      const files = await fs.readdir(dir).catch(() => []);
      for (const f of files) {
        if (/^app\.[a-f0-9]{12}\.js$/.test(f) && f !== newName) {
          await fs.rm(path.join(dir, f), { force: true });
        }
      }
    };

    await pruneOldHashes(distAssetsJs);
    await pruneOldHashes(rootAssetsJs);
  }

  console.log("Build complete:", newName);
}

main();



// POSTPROCESS_FORCE_APP_JS
// After build completes, normalize all dist HTML references to /assets/js/app.js
try {
  const fs = await import("node:fs");
  const path = await import("node:path");

  function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  }

  const distDir = path.join(process.cwd(), "dist");
  if (fs.existsSync(distDir)) {
    const htmls = walk(distDir).filter((f) => f.endsWith(".html"));
    for (const f of htmls) {
      let html = fs.readFileSync(f, "utf8");
      const before = html;
      html = html
        .replace(/\/assets\/js\/app\.[a-f0-9]+\.js\?v=[^"' ]*/gi, "/assets/js/app.js")
        .replace(/\/assets\/js\/app\.[a-f0-9]+\.js/gi, "/assets/js/app.js");
      if (html !== before) fs.writeFileSync(f, "utf8");
    }
  }
} catch (e) {
  // no-op
}
