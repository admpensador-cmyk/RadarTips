#!/usr/bin/env node
/**
 * Ambiente de dev para análise e validação da UI (Radar Day / Calendário).
 *
 * 1) Executa verify-no-zombie-radar.mjs na árvore fonte (fail-closed).
 * 2) Inicia o dev-server na raiz do repo com cache desligado.
 *
 * Uso:
 *   npm run dev:ui
 *   npm run dev:ui:open
 *   node tools/dev-ui-session.mjs --port 5173 --open
 */

import { spawn, execSync } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parsePort(argv) {
  const i = argv.indexOf("--port");
  if (i >= 0 && argv[i + 1]) return String(Number(argv[i + 1]) || 5173);
  return "5173";
}

const argv = process.argv.slice(2);
const open = argv.includes("--open") || argv.includes("-o");
const port = parsePort(argv);

console.log("[dev-ui] Verificação de HTML/CSS (fonte)…\n");
try {
  execSync(`"${process.execPath}" "${path.join(root, "tools", "verify-no-zombie-radar.mjs")}"`, {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  });
} catch {
  console.error("\n[dev-ui] Falhou verify-no-zombie-radar. Corrija antes de validar a UI.\n");
  process.exit(1);
}

const base = `http://127.0.0.1:${port}`;
console.log("\n[dev-ui] Servidor de pré-visualização (raiz = repo, dados em /data/v1/)");
console.log("--- URLs para validação manual ---");
console.log(`  Radar Dia (PT):  ${base}/pt/radar/day/`);
console.log(`  Radar Dia (EN):  ${base}/en/radar/day/`);
console.log(`  Calendário (PT): ${base}/pt/calendar/`);
console.log(`  Calendário (EN): ${base}/en/calendar/`);
console.log("\n[dev-ui] Checklist rápido: Top 3 sem chip LOW; pick premium; calendário 2 colunas; tabs Hoje/Amanhã.");
console.log("[dev-ui] Ctrl+C para encerrar.\n");

const child = spawn(process.execPath, [path.join(root, "tools", "dev-server.mjs"), "--port", port, ...(open ? ["--open"] : [])], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, RADARTIPS_DEV_UI: "1" },
});

child.on("exit", (code) => process.exit(code ?? 0));
