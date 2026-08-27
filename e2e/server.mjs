// Minimal static file server for the Playwright e2e suite.
//
// Serves the production build produced by `ng build --configuration e2e`
// (service worker disabled) and rewrites unknown, extension-less paths to
// index.html so Angular's client-side routing works.
//
// Usage: node e2e/server.mjs [port]
// The served directory can be overridden with the E2E_DIST env variable.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = process.env.E2E_DIST
  ? normalize(process.env.E2E_DIST)
  : join(process.cwd(), 'dist', 'water-credits-frontend', 'browser');

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4200);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

async function resolveFile(urlPath) {
  // Strip query/hash and decode.
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const candidate = normalize(join(ROOT, clean));
  // Prevent path traversal outside ROOT.
  if (!candidate.startsWith(ROOT)) return null;
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = join(candidate, 'index.html');
      await stat(index);
      return index;
    }
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const file = await resolveFile(req.url ?? '/');

    if (file) {
      const type = MIME_TYPES[extname(file)] ?? 'application/octet-stream';
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      res.end(data);
      return;
    }

    // SPA fallback: only rewrite paths without a file extension.
    const urlPath = (req.url ?? '/').split('?')[0].split('#')[0];
    if (!extname(urlPath)) {
      try {
        const index = join(ROOT, 'index.html');
        const data = await readFile(index);
        res.writeHead(200, { 'content-type': MIME_TYPES['.html'] });
        res.end(data);
        return;
      } catch {
        /* fall through to 404 */
      }
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Server error: ' + (err?.message ?? String(err)));
  }
});

server.listen(PORT, () => {
  console.log(`e2e static server listening on http://localhost:${PORT} (root: ${ROOT})`);
});
