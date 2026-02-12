import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = process.env.PORT || 8080;
const ROOT = process.cwd();

function contentType(file){
  if(file.endsWith('.html')) return 'text/html; charset=utf-8';
  if(file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if(file.endsWith('.css')) return 'text/css; charset=utf-8';
  if(file.endsWith('.json')) return 'application/json; charset=utf-8';
  if(file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

const server = http.createServer(async (req, res) => {
  try{
    let url = decodeURIComponent(req.url.split('?')[0]);
    if(url === '/' ) url = '/index.html';
    // Prevent directory traversal
    const safePath = path.normalize(path.join(ROOT, url)).replace(/^([A-Za-z]:)?\\?/, '');
    const full = path.join(ROOT, url);
    let stat;
    try{ stat = await fs.stat(full); }catch(e){ stat = null; }
    if(!stat || stat.isDirectory()){
      res.writeHead(404, {'Content-Type':'text/plain'});
      res.end('Not found');
      return;
    }
    const data = await fs.readFile(full);
    res.writeHead(200, {'Content-Type': contentType(full)});
    res.end(data);
  }catch(err){
    res.writeHead(500, {'Content-Type':'text/plain'});
    res.end('Server error');
  }
});

server.listen(PORT, ()=>{
  console.log(`Dev server: http://localhost:${PORT}/`);
});
