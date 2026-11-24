import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { isIP } from 'node:net';

import appConfig from '../api/app-config.mjs';
import news from '../api/news.mjs';
import media from '../api/media.mjs';
import portal from '../api/portal.mjs';
import login from '../api/admin/login.mjs';
import logout from '../api/admin/logout.mjs';
import adminConfig from '../api/admin/config.mjs';
import health from '../api/admin/health.mjs';
import diagnostics from '../api/admin/diagnostics.mjs';
import users from '../api/admin/users.mjs';
import recovery from '../api/admin/recovery.mjs';
import { sharedAdminRoutes } from '../api/_lib/shared-admin-routes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const handlers = new Map([
  ['/api/app-config', appConfig], ['/api/news', news], ['/api/media', media],
  ['/api/portal', portal],
  ['/api/admin/login', login], ['/api/admin/logout', logout],
  ['/api/admin/config', adminConfig], ['/api/admin/health', health], ['/api/admin/diagnostics', diagnostics],
  ['/api/admin/users', users], ['/api/admin/recovery', recovery],
  ...sharedAdminRoutes.map(({ path, handler }) => [path, handler]),
]);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function loopback(ip) { return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip); }

function prepareHeaders(request) {
  // O servidor escuta no loopback. O proxy deve sobrescrever X-Real-IP.
  const realIp = process.env.CCN_TRUST_PROXY === 'loopback' && loopback(request.socket.remoteAddress)
    ? String(request.headers['x-real-ip'] || '') : '';
  delete request.headers['x-vercel-forwarded-for'];
  delete request.headers['x-forwarded-for'];
  delete request.headers['x-forwarded-host'];
  delete request.headers['x-forwarded-proto'];
  request.headers['x-vercel-forwarded-for'] = isIP(realIp) ? realIp : request.socket.remoteAddress;
  if (process.env.CCN_PUBLIC_ORIGIN) {
    const publicOrigin = new URL(process.env.CCN_PUBLIC_ORIGIN);
    if (publicOrigin.protocol !== 'https:' && publicOrigin.hostname !== 'localhost') throw new Error('CCN_PUBLIC_ORIGIN deve usar HTTPS.');
    request.headers.host = publicOrigin.host;
    request.headers['x-forwarded-host'] = publicOrigin.host;
    request.headers['x-forwarded-proto'] = publicOrigin.protocol.slice(0, -1);
  } else {
    request.headers['x-forwarded-host'] = request.headers.host;
    request.headers['x-forwarded-proto'] = 'http';
  }
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Corpo da requisição excede 1 MB.');
    chunks.push(chunk);
  }
  if (!size) return {};
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) throw new Error('Envie JSON.');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function adaptResponse(response) {
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(body));
    return response;
  };
  response.send = (body) => { response.end(body); return response; };
}

async function serveStatic(pathname, response) {
  const prefix = pathname === '/admin' || pathname.startsWith('/admin/') ? '/admin' :
    pathname.startsWith('/pdf-viewer/') ? '/pdf-viewer' :
    pathname.startsWith('/branding/') ? '/branding' : null;
  if (!prefix) return false;
  const directory = join(root, 'public', prefix.slice(1));
  let relative;
  try { relative = decodeURIComponent(pathname.slice(prefix.length)).replace(/^\/+/, '') || 'index.html'; }
  catch { response.statusCode = 400; response.end(); return true; }
  const path = resolve(directory, relative);
  if (!path.startsWith(`${directory}${sep}`) || !extname(path)) { response.statusCode = 404; response.end(); return true; }
  try {
    const body = await readFile(path);
    response.setHeader('content-type', mime[extname(path)] || 'application/octet-stream');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.end(body);
  } catch { response.statusCode = 404; response.end(); }
  return true;
}

export function createCcnServer() {
  return createServer(async (request, response) => {
    try {
      prepareHeaders(request);
      adaptResponse(response);
      const url = new URL(request.url, 'http://localhost');
      const handler = handlers.get(url.pathname);
      if (handler) {
        request.query = Object.fromEntries(url.searchParams);
        if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
          try { request.body = await readBody(request); }
          catch { return response.status(400).json({ error: 'Dados enviados inválidos ou muito grandes.' }); }
        }
        await handler(request, response);
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return response.status(405).json({ error: 'Método não permitido.' });
      if (url.pathname === '/') { response.statusCode = 302; response.setHeader('location', '/admin'); response.end(); return; }
      if (await serveStatic(url.pathname, response)) return;
      return response.status(404).json({ error: 'Não encontrado.' });
    } catch {
      if (!response.headersSent) response.status(500).json({ error: 'Erro interno.' });
      else response.destroy();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  createCcnServer().listen(port, host, () => { console.log(`CCN Digital: ${host}:${port}`); });
}
