import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { pagesBase } from './check-dist.mjs';

// Serve only dist, without Vite's HTML fallback, to catch paths that fail on GitHub Pages.
const root = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(pagesBase)) { res.writeHead(404); res.end(); return; }
    const path = resolve(root, pathname.slice(pagesBase.length) || 'index.html');
    if (!path.startsWith(root + sep)) { res.writeHead(404); res.end(); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const previous = process.env.APP_URL;
try {
  const url = `http://127.0.0.1:${server.address().port}${pagesBase}`;
  for (const path of ['.private-reference/01-symbols.png', '.verification-report/index.html', 'src/App.tsx']) {
    assert.equal((await fetch(url + path)).status, 404, `Private/source path was served: ${path}`);
  }
  process.env.APP_URL = url;
  await import('./smoke.mjs');
  console.log('Pages verification passed on a strict static server.');
} finally {
  if (previous === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous;
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
