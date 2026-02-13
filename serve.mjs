#!/usr/bin/env node
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = 3000;
const root = join(__dirname, 'dist');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
  let filePath = join(root, req.url === '/' ? '/index.html' : req.url);
  
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
}).listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}/`);
  console.log(`📂 Serving: ${root}`);
  console.log(`\n🔗 Test URLs:`);
  console.log(`   http://localhost:${port}/pt/radar/day/`);
  console.log(`   http://localhost:${port}/en/calendar/`);
  console.log(`\n⏹️  Press Ctrl+C to stop`);
});
