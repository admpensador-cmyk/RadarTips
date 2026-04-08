#!/usr/bin/env node
/**
 * Apply official logo PNG (header + favicon). Match RT_LOGO_ASSET_QS in assets/js/app.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const top = ["pt", "en", "es", "fr", "de", "go"];
const Q = "v=7";
const MARK = `/assets/logo-radartips-mark-official.png?${Q}`;
const HEADER_IMG_FULL_RE = /<img\s[^>]*\bid="header_logo"[^>]*\/?>/g;
const ICON_LINK_RE = /<link\s+rel="icon"[^>]*>/gi;

function patchFile(p) {
  let c = fs.readFileSync(p, "utf8");
  const o = c;
  c = c.replace(ICON_LINK_RE, `<link rel="icon" type="image/png" href="${MARK}" />`);
  c = c.replace(HEADER_IMG_FULL_RE, () => {
    return `<img class="rt-logo-img" id="header_logo" src="${MARK}" alt="RadarTips" width="40" height="40" decoding="async" loading="eager" fetchpriority="high" />`;
  });
  if (c !== o) {
    fs.writeFileSync(p, c);
    console.log("patched", path.relative(root, p));
  }
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) patchFile(p);
  }
}

for (const d of top) {
  const p = path.join(root, d);
  if (fs.existsSync(p)) walk(p);
}
