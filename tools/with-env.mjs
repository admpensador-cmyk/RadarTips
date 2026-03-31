#!/usr/bin/env node
/**
 * Usage: node tools/with-env.mjs <development|preview|production> -- <command> [args...]
 * Example: node tools/with-env.mjs development -- node tools/dev-server.mjs --open
 */
import { spawn } from "node:child_process";
import process from "node:process";
import { loadRadartipsEnv } from "./load-radartips-env.mjs";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1) {
  console.error("Usage: node tools/with-env.mjs <APP_ENV> -- <command> [args...]");
  process.exit(1);
}
const appEnv = argv[0];
const cmd = argv.slice(sep + 1);
if (!cmd.length) {
  console.error("Missing command after --");
  process.exit(1);
}

loadRadartipsEnv(appEnv);

const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", env: process.env, shell: false });
child.on("exit", (code) => process.exit(code ?? 0));
