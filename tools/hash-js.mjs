import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function sha256Short(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

async function listHtml(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await listHtml(p));
    else if (e.isFile() && e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

async function main() {
  // Ajuste aqui se seu “app principal” estiver em outro lugar:
  const srcPath = path.join(ROOT, "assets", "app.js");
  const buf = await fs.readFile(srcPath);
  const hash = sha256Short(buf);

  const newName = `app.${hash}.js`;
  const newPath = path.join(ROOT, "assets", newName);

  await fs.writeFile(newPath, buf);

  // Atualiza todas as páginas HTML (pega app.js, app.js?v=15, e também assets/js/app.js se existir)
  const htmlFiles = await listHtml(ROOT);

  for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");
    html = html
      .replace(/assets\/app\.js(\?[^"']*)?/g, `assets/${newName}`)
      .replace(/assets\/js\/app\.js(\?[^"']*)?/g, `assets/${newName}`)
      .replace(/\/assets\/app\.js(\?[^"']*)?/g, `/assets/${newName}`);
    await fs.writeFile(file, html);
  }

  console.log(`OK: gerado assets/${newName} e HTML atualizado.`);
}

main();
