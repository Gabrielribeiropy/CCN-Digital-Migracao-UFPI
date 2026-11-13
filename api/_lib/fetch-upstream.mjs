import { readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { rootCertificates } from 'node:tls';

// A UFPI serves its leaf certificate with an unrelated intermediate CA.
// Add the actual issuer to Node's trusted chain without disabling TLS checks.
const ufpiCa = [
  ...rootCertificates,
  readFileSync(new URL('./certs/rnp-intermediate.crt', import.meta.url), 'utf8'),
];

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;

function isUfpi(url) {
  return url.hostname === 'ufpi.br' || url.hostname.endsWith('.ufpi.br');
}

export function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168 || b === 88 && c === 99)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function publicHttpUrl(input) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || url.hostname.includes(':') || url.port && !['80', '443'].includes(url.port)) return null;
    if (isIP(url.hostname) && !isPublicIPv4(url.hostname)) return null;
    return url;
  } catch { return null; }
}

async function pinnedAddress(url) {
  if (isIP(url.hostname)) {
    if (!isPublicIPv4(url.hostname)) throw new Error('Endereço de rede não permitido.');
    return url.hostname;
  }
  const addresses = await lookup(url.hostname, { family: 4, all: true, verbatim: true });
  const publicAddresses = addresses.filter(({ address }) => isPublicIPv4(address));
  if (!publicAddresses.length) throw new Error('Destino de rede não permitido.');
  return publicAddresses[0].address;
}

export function lookupPinnedAddress(address, options, callback) {
  if (options?.all) callback(null, [{ address, family: 4 }]);
  else callback(null, address, 4);
}

export async function fetchUpstream(input, options = {}, redirects = 0) {
  const url = publicHttpUrl(input);
  if (!url) throw new Error('URL de origem não permitida.');
  if (redirects > MAX_REDIRECTS) throw new Error('Redirecionamentos demais na origem.');
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > MAX_RESPONSE_BYTES) throw new Error('Limite de resposta inválido.');
  const address = await pinnedAddress(url);
  const headers = Object.fromEntries(new Headers(options.headers).entries());
  headers['accept-encoding'] = 'identity';
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.get(url, {
      headers,
      ca: url.protocol === 'https:' && isUfpi(url) ? ufpiCa : undefined,
      signal: options.signal,
      lookup: (_host, lookupOptions, callback) => lookupPinnedAddress(address, lookupOptions, callback),
    }, async (upstream) => {
      const status = upstream.statusCode || 502;
      if (status >= 300 && status < 400 && upstream.headers.location) {
        upstream.resume();
        try {
          resolve(await fetchUpstream(new URL(upstream.headers.location, url), options, redirects + 1));
        } catch (error) { reject(error); }
        return;
      }
      const length = Number(upstream.headers['content-length']);
      upstream.on('error', reject);
      if (Number.isFinite(length) && length > maxResponseBytes) {
        upstream.destroy(new Error('Resposta da origem muito grande.'));
        return;
      }
      const chunks = [];
      let size = 0;
      upstream.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxResponseBytes) { upstream.destroy(new Error('Resposta da origem muito grande.')); return; }
        chunks.push(chunk);
      });
      upstream.on('end', () => resolve(new Response(Buffer.concat(chunks), {
        status,
        headers: { 'content-type': upstream.headers['content-type'] || 'application/octet-stream', 'x-ccn-final-url': url.toString() },
      })));
    });
    request.setTimeout(25_000, () => request.destroy(new Error('Tempo esgotado ao acessar a origem.')));
    request.on('error', reject);
  });
}
