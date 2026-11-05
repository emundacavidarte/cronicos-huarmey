// Servidor de CONTROL (puerto 3210, solo mientras el servidor de la app esta detenido): sirve archivos estaticos sin express, sin ETag.
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2]; const mode = process.argv[3] || 'noetag';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  const h = { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': mode === 'noetag' ? 'no-store' : 'no-cache' };
  res.writeHead(200, h); fs.createReadStream(f).pipe(res);
}).listen(3210, () => console.log('ctrl listo', root, mode));
