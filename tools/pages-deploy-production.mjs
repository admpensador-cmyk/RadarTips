#!/usr/bin/env node
/**
 * Cloudflare Pages production deploy (same as deploy_pages.yml wrangler step).
 *
 * Credentials (never commit): use `.env.production.local` (gitignored) or shell env.
 * Wrangler expects CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID; aliases below are normalized.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const token =
  String(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || "").trim() || "";
const account =
  String(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || "").trim() || "";
const name = String(
  process.env.CLOUDFLARE_PAGES_PROJECT_NAME ||
    process.env.RADARTIPS_PAGES_PROJECT_NAME ||
    ""
).trim();

if (!token || !account || !name) {
  console.error(
    "[FATAL] Missing Cloudflare Pages deploy env. Provide (shell or .env.production.local):\n" +
      "  CLOUDFLARE_API_TOKEN (or CF_API_TOKEN)\n" +
      "  CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID)\n" +
      "  CLOUDFLARE_PAGES_PROJECT_NAME (or RADARTIPS_PAGES_PROJECT_NAME)\n" +
      "Note: committed .env.production has no secrets — use .env.production.local for keys."
  );
  process.exit(1);
}

const env = { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account };

const r = spawnSync(
  "npx",
  ["--yes", "wrangler@4.62.0", "pages", "deploy", "dist", "--project-name", name, "--branch", "main"],
  { stdio: "inherit", env, shell: true, cwd: process.cwd() }
);
process.exit(r.status === null ? 1 : r.status);
