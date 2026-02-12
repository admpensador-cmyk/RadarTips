import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// ✅ JS REAL (maior) do seu projeto
const SRC_JS = path.join(ROOT, "assets", "js", "app.js");
// Match Radar V2 (extra asset to publish hashed)
const SRC_V2_JS = path.join(ROOT, "assets", "js", "match-radar-v2.js");
const SRC_V2_CSS = path.join(ROOT, "assets", "css", "match-radar-v2.css");

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

  // 2b) Se existir, gere também match-radar-v2 hashed assets
  let newV2JsName = null;
  let newV2CssName = null;
  try{
    const buf2 = await fs.readFile(SRC_V2_JS);
    const h2 = sha256Short(buf2);
    newV2JsName = `match-radar-v2.${h2}.js`;
    await fs.writeFile(path.join(OUT_DIR, newV2JsName), buf2);
  }catch(e){ /* missing v2 js - ok */ }
  try{
    const bufCss = await fs.readFile(SRC_V2_CSS);
    const h3 = sha256Short(bufCss);
    newV2CssName = `match-radar-v2.${h3}.css`;
    await fs.writeFile(path.join(OUT_DIR, newV2CssName), bufCss);
  }catch(e){ /* missing v2 css - ok */ }

  // 3) Atualiza TODAS as páginas HTML para apontar para /assets/app.<hash>.js
  const htmlFiles = await listHtml(ROOT);
    for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");

    // Replace app.js references (various forms)
    html = html
      .replace(/\/assets\/app\.js(\?[^"']*)?/g, `/assets/${newName}`)
      .replace(/\/assets\/js\/app\.js(\?[^"']*)?/g, `/assets/${newName}`)
      .replace(/assets\/app\.js(\?[^"']*)?/g, `assets/${newName}`)
      .replace(/assets\/js\/app\.js(\?[^"']*)?/g, `assets/${newName}`);

    // Replace match-radar-v2 references if we generated them
    if(newV2JsName){
      html = html
        .replace(/\/assets\/js\/match-radar-v2\.js(\?[^"']*)?/g, `/assets/${newV2JsName}`)
        .replace(/assets\/js\/match-radar-v2\.js(\?[^"']*)?/g, `assets/${newV2JsName}`)
        .replace(/\/assets\/match-radar-v2\.js(\?[^"']*)?/g, `/assets/${newV2JsName}`)
        .replace(/assets\/match-radar-v2\.js(\?[^"']*)?/g, `assets/${newV2JsName}`);
    }
    if(newV2CssName){
      html = html
        .replace(/\/assets\/css\/match-radar-v2\.css(\?[^"']*)?/g, `/assets/${newV2CssName}`)
        .replace(/assets\/css\/match-radar-v2\.css(\?[^"']*)?/g, `assets/${newV2CssName}`)
        .replace(/\/assets\/match-radar-v2\.css(\?[^"']*)?/g, `/assets/${newV2CssName}`)
        .replace(/assets\/match-radar-v2\.css(\?[^"']*)?/g, `assets/${newV2CssName}`);
    }

    await fs.writeFile(file, html, "utf8");
  }

  console.log(`OK: gerado assets/${newName} (a partir de assets/js/app.js) e HTML atualizado.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
