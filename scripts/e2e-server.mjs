import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(new URL('..', import.meta.url)), 'dist'));
const port = Number(process.env.E2E_PORT ?? 8097);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon'],
]);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  const pathname = decodeURIComponent(url.pathname);
  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const candidate = normalize(join(root, normalizedPath));
  const safePath = candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(root, 'index.html');
  const type = contentTypes.get(extname(safePath)) ?? 'application/octet-stream';

  response.writeHead(200, { 'Content-Type': type });
  createReadStream(safePath).pipe(response);
});

server.listen(port, '127.0.0.1');

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
