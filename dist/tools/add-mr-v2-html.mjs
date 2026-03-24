import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

async function listHtml(dir){
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for(const e of entries){
    if(e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if(e.isDirectory()) out.push(...(await listHtml(p)));
    else if(e.isFile() && e.name.toLowerCase().endsWith('.html')) out.push(p);
  }
  return out;
}

async function run(){
  const files = await listHtml(ROOT);
  for(const f of files){
    let html = await fs.readFile(f, 'utf8');
    if(html.includes('match-radar-v2')) continue; // already patched

    // Insert MR V2 includes before the app script if present, otherwise before </body>
    const appScriptRe = /<script\s+src="\/assets\/(?:app|js\/app)\.[^\"]+\.js"\s*>\s*<\/script>/i;
    const appScriptSimple = /<script\s+src="\/assets\/app\.[^\"]+\.js"\s*>\s*<\/script>/i;
    const insertHtml = '\n  <link rel="stylesheet" href="/assets/css/match-radar-v2.css" />\n  <script src="/assets/js/match-radar-v2.js"></script>\n';

    if(appScriptRe.test(html)){
      html = html.replace(appScriptRe, match => insertHtml + match);
    }else if(appScriptSimple.test(html)){
      html = html.replace(appScriptSimple, match => insertHtml + match);
    }else if(/<\/body>/i.test(html)){
      html = html.replace(/<\/body>/i, insertHtml + '</body>');
    }else{
      // append
      html = html + insertHtml;
    }

    await fs.writeFile(f, html, 'utf8');
  }
  console.log('Patched', files.length, 'HTML files');
}

run().catch(err=>{ console.error(err); process.exit(1); });
