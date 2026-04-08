#!/usr/bin/env node
/**
 * Static dev preview for RadarTips.
 * Default: repo root (source HTML). Paths like /assets/ and /data/v1/ mirror production.
 * GET /api/v1/calendar_2d → data/v1/calendar_2d.json (local stub; production uses the Worker).
 *
 * Serving dist/ requires RADARTIPS_ALLOW_DIST_ROOT=1 (use npm run dev:dist after build).
 *
 * Usage:
 *   node tools/dev-server.mjs
 *   node tools/dev-server.mjs --open
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import process from "node:process";

import { loadRadartipsEnv } from "./load-radartips-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadRadartipsEnv(process.env.APP_ENV || "development");

function assertSourceOnlyRoot(rootPath) {
  const distResolved = path.resolve(repoRoot, "dist");
  const resolved = path.resolve(rootPath);
  if (resolved === distResolved || resolved.startsWith(distResolved + path.sep)) {
    if (process.env.RADARTIPS_ALLOW_DIST_ROOT !== "1") {
      console.error(
        "[dev-server] Refusing to use dist/ as document root.\n" +
          "  Use npm run dev (source HTML at repo root), or after npm run build use npm run dev:dist."
      );
      process.exit(1);
    }
  }
}

function assertPreviewUsesDist(rootPath) {
  const distResolved = path.resolve(repoRoot, "dist");
  const resolved = path.resolve(rootPath);
  const appEnv = String(process.env.APP_ENV || "").trim();
  if (appEnv === "preview" && resolved !== distResolved) {
    console.error(
      "[dev-server] APP_ENV=preview requires serving dist/ only.\n" +
        "  Use: npm run dev:dist (after npm run build)."
    );
    process.exit(1);
  }
}

function parseArgs(argv) {
  let root = repoRoot;
  let port = 5173;
  let open = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root" && argv[i + 1]) {
      root = path.resolve(repoRoot, argv[++i]);
    } else if (a === "--port" && argv[i + 1]) {
      port = Number(argv[++i]) || 5173;
    } else if (a === "--open" || a === "-o") {
      open = true;
    }
  }
  return { root, port, open };
}

const { root, port, open } = parseArgs(process.argv);
assertSourceOnlyRoot(root);
assertPreviewUsesDist(root);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const trimmed = decoded.replace(/^\/+/, "");
  const rel = path.normalize(trimmed).replace(/^(\.\.(\/|\\|$))+/, "");
  const rootRes = path.resolve(root);
  const abs = path.resolve(path.join(rootRes, rel));
  const relToRoot = path.relative(rootRes, abs);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return null;
  return abs;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function tryFile(filePath) {
  try {
    const st = fs.statSync(filePath);
    if (st.isFile()) return filePath;
  } catch {
    /* missing */
  }
  return null;
}

function resolvePath(root, pathname) {
  let abs = safeJoin(root, pathname);
  if (!abs) return null;

  let file = tryFile(abs);
  if (file) return file;

  const withIndex = tryFile(path.join(abs, "index.html"));
  if (withIndex) return withIndex;

  if (!pathname.endsWith("/")) {
    const asDir = tryFile(path.join(abs + path.sep, "index.html"));
    if (asDir) return asDir;
  }

  if (pathname.endsWith("/") || !path.extname(abs)) {
    const html = abs + ".html";
    file = tryFile(html);
    if (file) return file;
  }

  return null;
}

const CALENDAR_2D_LOCAL = path.join(repoRoot, "data", "v1", "calendar_2d.json");

const FLAG_ICONS_4X3 = path.join(repoRoot, "node_modules", "flag-icons", "flags", "4x3");
const FLAG_URL_PREFIX = "/assets/flags/countries/";

function tryCountryFlagFile(pathname) {
  if (!pathname.startsWith(FLAG_URL_PREFIX) || !pathname.toLowerCase().endsWith(".svg")) {
    return null;
  }
  const base = pathname.slice(FLAG_URL_PREFIX.length).replace(/\\/g, "/");
  const safe = path.normalize(base).replace(/^(\.\.(\/|\\|$))+/, "");
  if (safe.includes("..") || !/^[a-z0-9-]+\.svg$/i.test(safe)) return null;
  const abs = path.join(FLAG_ICONS_4X3, safe);
  if (!abs.startsWith(path.resolve(FLAG_ICONS_4X3))) return null;
  return tryFile(abs);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;
  if (pathname === "/") pathname = "/en/radar/day/";

  const flagFile = tryCountryFlagFile(pathname);
  if (flagFile) {
    const body = fs.readFileSync(flagFile);
    res.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store"
    });
    res.end(body);
    return;
  }

  if (pathname === "/api/v1/calendar_2d" && req.method === "GET") {
    const calFile = tryFile(CALENDAR_2D_LOCAL);
    if (!calFile) {
      send(
        res,
        503,
        JSON.stringify({
          error: "Dev stub: missing data/v1/calendar_2d.json (copy or generate calendar pipeline output).",
        }),
        { "Content-Type": "application/json; charset=utf-8" }
      );
      return;
    }
    const body = fs.readFileSync(calFile);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(body);
    return;
  }

  const file = resolvePath(root, pathname);
  if (!file) {
    send(res, 404, `Not found: ${pathname}\n`, { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const body = fs.readFileSync(file);
  const headers = {
    "Content-Type": type,
    "Cache-Control": "no-store",
  };
  res.writeHead(200, headers);
  res.end(body);
});

server.listen(port, "127.0.0.1", () => {
  const base = `http://127.0.0.1:${port}`;
  const mode = String(process.env.PUBLIC_PAGES_MODE || "source");
  const appEnv = String(process.env.APP_ENV || "development");
  console.log(`RadarTips static server`);
  console.log(`  APP_ENV=${appEnv} PUBLIC_PAGES_MODE=${mode}`);
  console.log(`  root: ${root}`);
  console.log(`  Canonical surface: ${base}/en/radar/day/ (primary)`);
  console.log(`  ${base}/`);
  console.log(`  Localized: ${base}/pt/radar/day/ …`);
  console.log(`  Dist preview: npm run dev:dist (after npm run build)`);
  console.log(`  API stub: GET /api/v1/calendar_2d → ${CALENDAR_2D_LOCAL}`);
  if (open) {
    const url = `${base}/en/radar/day/`;
    const cmd = process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  }
});

server.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});
