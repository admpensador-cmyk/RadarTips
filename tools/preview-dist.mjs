#!/usr/bin/env node
/**
 * Preview: serve real dist/ output only. Isolated from development (source root).
 * Sets RADARTIPS_ALLOW_DIST_ROOT=1 and APP_ENV=preview.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { loadRadartipsEnv, repoRoot } from "./load-radartips-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadRadartipsEnv("preview");

process.env.RADARTIPS_ALLOW_DIST_ROOT = "1";

const distDir = path.join(repoRoot, "dist");
if (!fs.existsSync(distDir)) {
  console.error("[preview-dist] FAIL: dist/ missing. Run: npm run preview:build (or npm run build)");
  process.exit(1);
}

const routes = spawnSync(process.execPath, [path.join(__dirname, "verify-dist-routes.mjs")], {
  stdio: "inherit",
  cwd: repoRoot,
  env: process.env,
});
if (routes.status !== 0) process.exit(routes.status ?? 1);

const argv = process.argv.slice(2);
const args = [path.join(__dirname, "dev-server.mjs"), "--root", distDir, "--port", "4173"];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--port" && argv[i + 1]) {
    args.push("--port", argv[++i]);
    continue;
  }
  if (a === "--open" || a === "-o") args.push(a);
}

const child = spawn(process.execPath, args, { stdio: "inherit", cwd: repoRoot, env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
