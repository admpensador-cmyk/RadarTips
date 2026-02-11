import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// ✅ JS REAL (maior) do seu projeto
const SRC_JS = path.join(ROOT, "assets", "js", "app.js");

// ✅ Vamos publicar o hasheado em /assets (onde suas páginas já procuram)
const OUT_DIR = path.join(ROOT, "assets");

function sha256Short(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

async function listHtml(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listHtml(p)));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".html")) out.push(p);
  }
  return out;
}

async function main() {
  // 1) Lê o JS grande
  const buf = await fs.readFile(SRC_JS);
  const hash = sha256Short(buf);

  // 2) Gera /assets/app.<hash>.js (MESMO CAMINHO QUE O SITE JÁ BUSCA)
  const newName = `app.${hash}.js`;
  const newPath = path.join(OUT_DIR, newName);
  await fs.writeFile(newPath, buf);

  // 3) Atualiza TODAS as páginas HTML para apontar para /assets/app.<hash>.js
  const htmlFiles = await listHtml(ROOT);
  for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");

    // cobre:
    // - /assets/app.js
    // - /assets/js/app.js
    // - assets/app.js
    // - assets/js/app.js
    // - com ou sem ?v=...
    html = html
      .replace(/\/assets\/app\.js(\?[^"']*)?/g, `/assets/${newName}`)
      .replace(/\/assets\/js\/app\.js(\?[^"']*)?/g, `/assets/${newName}`)
      .replace(/assets\/app\.js(\?[^"']*)?/g, `assets/${newName}`)
      .replace(/assets\/js\/app\.js(\?[^"']*)?/g, `assets/${newName}`);

    await fs.writeFile(file, html, "utf8");
  }

  console.log(`OK: gerado assets/${newName} (a partir de assets/js/app.js) e HTML atualizado.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
