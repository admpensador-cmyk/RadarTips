#!/usr/bin/env node
/**
 * Static dev preview for RadarTips.
 * Serves from repo root (source) or dist — paths like /assets/ and /data/v1/ work as in production.
 *
 * Usage:
 *   node tools/dev-server.mjs
 *   node tools/dev-server.mjs --root dist --port 4173
 *   node tools/dev-server.mjs --open
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

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

const { root, port, open } = parseArgs(process.argv);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;
  if (pathname === "/") pathname = "/en/radar/day/";

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
  console.log(`RadarTips dev preview`);
  console.log(`  root: ${root}`);
  console.log(`  ${base}/`);
  console.log(`  ${base}/pt/radar/day/`);
  console.log(`  Produção local: npm run dev:dist (raiz = pasta dist)`);
  if (open) {
    const url = `${base}/pt/radar/day/`;
    const cmd = process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  }
});

server.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});
