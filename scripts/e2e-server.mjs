import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(new URL('..', import.meta.url)), 'dist'));
const port = Number(process.env.E2E_PORT ?? 8097);
const previewApiBaseUrl = (
  process.env.PVZ_PREVIEW_API_BASE_URL ??
  (process.argv.includes('--production-api') ? 'https://pvz-android.vercel.app' : undefined)
)?.replace(/\/$/, '');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.png', 'image/png'],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  if (previewApiBaseUrl && url.pathname.startsWith('/api/')) {
    await proxyApiRequest(request, response, url);
    return;
  }

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

async function proxyApiRequest(request, response, url) {
  try {
    const target = new URL(`${url.pathname}${url.search}`, `${previewApiBaseUrl}/`);
    const headers = new Headers();

    for (const name of ['accept', 'authorization', 'content-type']) {
      const value = request.headers[name];

      if (typeof value === 'string') {
        headers.set(name, value);
      }
    }

    const method = request.method ?? 'GET';
    const bodyChunks = [];

    for await (const chunk of request) {
      bodyChunks.push(chunk);
    }

    const upstream = await fetch(target, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(bodyChunks),
      redirect: 'manual',
    });
    const body = Buffer.from(await upstream.arrayBuffer());

    response.writeHead(upstream.status, {
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'X-PVZ-Preview': 'production-proxy',
    });
    response.end(body);
  } catch (error) {
    console.error('Preview API proxy failed:', error);
    response.writeHead(502, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-PVZ-Preview': 'production-proxy',
    });
    response.end(JSON.stringify({ error: 'PREVIEW_PROXY_FAILED' }));
  }
}
