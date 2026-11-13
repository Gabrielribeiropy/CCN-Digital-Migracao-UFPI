import { fetchUpstream, publicHttpUrl } from './_lib/fetch-upstream.mjs';
import { allowPublicRequest } from './_lib/public-rate-limit.mjs';

function safePublicUrl(value) {
  return publicHttpUrl(value);
}

export default async function handler(request, response) {
  const target = safePublicUrl(request.query.url || '');
  const quota = await allowPublicRequest(request, 'media', target);
  if (!quota.allowed) { response.setHeader('retry-after', String(quota.retryAfter)); return response.status(429).json({ error: 'Muitas solicitações. Tente novamente em instantes.' }); }
  if (!target) return response.status(400).json({ error: 'URL de imagem inválida.' });
  try {
    const upstream = await fetchUpstream(target, { headers: { 'user-agent': 'CCN-Mobile/1.0 (+https://ufpi.br/ccn)' }, signal: AbortSignal.timeout(20_000), maxResponseBytes: 5 * 1024 * 1024 });
    const type = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !/^image\/(?:png|jpeg|gif|webp|avif)(?:;|$)/i.test(type)) return response.status(upstream.ok ? 415 : upstream.status).json({ error: 'Imagem indisponível.' });
    response.setHeader('content-type', type);
    response.setHeader('cache-control', 'public, max-age=3600');
    response.setHeader('x-content-type-options', 'nosniff');
    return response.status(200).send(Buffer.from(await upstream.arrayBuffer()));
  } catch { return response.status(502).json({ error: 'Imagem indisponível.' }); }
}
