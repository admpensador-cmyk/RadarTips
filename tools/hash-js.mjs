import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// ✅ ENTRYPOINT REAL DO SEU SITE
const SRC_JS = path.join(ROOT, "assets", "js", "app.js");
// ✅ ONDE VAI SAIR O ARQUIVO HASHEADO
const OUT_DIR = path.join(ROOT, "assets", "js");

function sha256Short(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

async function listHtml(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const e of entries) {
    // ignora pastas que não interessam
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;

    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listHtml(p)));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".html")) out.push(p);
  }
  return out;
}

async function main() {
  // 1) Ler o JS fonte
  const buf = await fs.readFile(SRC_JS);
  const hash = sha256Short(buf);

  // 2) Gerar app.<hash>.js dentro de assets/js/
  const newName = `app.${hash}.js`;
  const newPath = path.join(OUT_DIR, newName);
  await fs.writeFile(newPath, buf);

  // 3) Atualizar TODAS as páginas HTML para apontar para o novo arquivo
  const htmlFiles = await listHtml(ROOT);

  for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");

    // Substitui:
    // - assets/js/app.js
    // - assets/app.js (se alguma página ainda tiver)
    // - app.js?v=...
    // - com ou sem barra inicial
    html = html
      .replace(/(["'])\/assets\/js\/app\.js(\?[^"']*)?\1/g, `$1/assets/js/${newName}$1`)
      .replace(/(["'])assets\/js\/app\.js(\?[^"']*)?\1/g, `$1assets/js/${newName}$1`)
      .replace(/(["'])\/assets\/app\.js(\?[^"']*)?\1/g, `$1/assets/js/${newName}$1`)
      .replace(/(["'])assets\/app\.js(\?[^"']*)?\1/g, `$1assets/js/${newName}$1`);

    await fs.writeFile(file, html, "utf8");
  }

  console.log(`OK: gerado assets/js/${newName} e HTML atualizado.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
