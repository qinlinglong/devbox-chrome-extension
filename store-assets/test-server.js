const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.DEVBOX_SCREENSHOT_PORT || 8787);

function sendJson(res, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/demo')) {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      let payload = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch (_) {}
      sendJson(res, { ok: true, received: payload, source: 'local-test-page' });
    });
    return;
  }

  const requested = req.url === '/' ? 'test-page.html' : req.url.slice(1);
  const file = path.resolve(root, requested);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`DevBox screenshot test page: http://127.0.0.1:${port}/`);
});
