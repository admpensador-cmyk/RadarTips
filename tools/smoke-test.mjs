      // Checar radar-day-impl.js
      try {
        const resImpl = await fetch(base + '/assets/js/radar-day-impl.js');
        if (resImpl.ok) ok('radar-day-impl.js disponível');
        else fail('radar-day-impl.js não encontrado');
      } catch (e) { fail('Erro ao requisitar radar-day-impl.js: ' + e); }
    // Checar debug/health.html
    try {
      const resDebug = await fetch(base + '/debug/health.html');
      const htmlDebug = await resDebug.text();
      if (resDebug.ok && (htmlDebug.includes('rt_telemetry') || htmlDebug.includes('telemetry.js'))) {
        ok('Página de debug/health.html disponível e contém marcador telemetry');
      } else {
        fail('Página de debug/health.html não contém marcador telemetry');
      }
    } catch (e) { fail('Erro ao requisitar debug/health.html: ' + e); }
  // Opcional: checar manifest.meta.json
  try {
    const resMeta = await fetch(base + '/assets/manifest.meta.json');
    if (resMeta.ok) {
      const txtMeta = await resMeta.text();
      let meta;
      try { meta = JSON.parse(txtMeta); } catch { fail('manifest.meta.json inválido'); }
      if (meta && typeof meta.timestamp === 'string' && meta.timestamp.length > 10) ok('Manifest meta contém timestamp');
      else fail('Manifest meta não contém timestamp');
    } else {
      ok('manifest.meta.json não encontrado (opcional)');
    }
  } catch (e) { ok('manifest.meta.json não encontrado (opcional)'); }
// tools/smoke-test.mjs — Smoke test sem dependências externas
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '../dist');

function serveStatic(req, res) {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  if (url.endsWith('/')) url += 'index.html';
  const filePath = path.join(distDir, decodeURIComponent(url));
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found');
    } else {
      let type = 'text/html';
      if (filePath.endsWith('.js')) type = 'application/javascript';
      else if (filePath.endsWith('.json')) type = 'application/json';
      else if (filePath.endsWith('.css')) type = 'text/css';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    }
  });
}

const server = http.createServer(serveStatic);
server.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  let failed = false;
  function fail(msg) { console.error('FAIL:', msg); failed = true; }
  function ok(msg) { console.log('OK:', msg); }

  // A) GET /en/radar/day/
  try {
    const res = await fetch(base + '/en/radar/day/');
    const html = await res.text();
    if (!html.includes('/assets/js/bootstrap.js')) fail('bootstrap.js não encontrado no HTML');
    else ok('bootstrap.js presente');
    if (html.includes('/assets/js/app.js')) fail('Referência direta a app.js encontrada');
    else ok('Sem referência direta a app.js');
  } catch (e) { fail('Erro ao requisitar /en/radar/day/: ' + e); }

  // B) GET /assets/manifest.json
  try {
    const res = await fetch(base + '/assets/manifest.json');
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { fail('manifest.json inválido'); }
    if (json && typeof json["radar-day"] === 'string' && json["radar-day"] === '/assets/js/app.js') ok('Manifest OK');
    else fail('Manifest não contém radar-day correto');
  } catch (e) { fail('Erro ao requisitar manifest.json: ' + e); }

  // C) (Opcional) HEAD/GET /api/v1/radar_day.json?force=1
  try {
    const res = await fetch(base + '/api/v1/radar_day.json?force=1', { method: 'HEAD' });
    if (res.status === 200 || res.status === 204) ok('API /api/v1/radar_day.json disponível');
    else fail('API /api/v1/radar_day.json status: ' + res.status);
  } catch (e) { ok('API /api/v1/radar_day.json não disponível (ignorado)'); }

  setTimeout(() => {
    server.close();
    if (failed) process.exit(1);
    else { console.log('Smoke test concluído com sucesso.'); process.exit(0); }
  }, 200);
});
