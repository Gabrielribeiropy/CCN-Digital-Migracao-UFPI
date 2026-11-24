import { createHash } from 'node:crypto';
import { kvReady, reserveLoginAttempt } from './kv-store.mjs';

export async function allowPublicRequest(request, scope, target) {
  const forwarded = request.headers['x-vercel-forwarded-for'] || request.headers['x-forwarded-for'];
  const ip = String(forwarded || request.socket?.remoteAddress || '').split(',')[0].trim();
  if (!ip || !kvReady()) return { allowed: false, retryAfter: 60 };
  const digest = createHash('sha256').update(ip).digest('hex');
  const budgets = scope === 'media' ? [240, 1200, 600] : [120, 600, 300];
  const host = target instanceof URL ? target.hostname.toLowerCase() : '';
  // Reserva o tamanho máximo antes de buscar a origem: limita também pedidos simultâneos.
  const maxMiB = scope === 'media' ? 5 : 12;
  const byteBudgetsMiB = scope === 'media' ? [120, 600, 300] : [240, 1200, 600];
  try {
    const keys = [
      [`ccn-public:${scope}:ip:${digest}`, budgets[0]],
      [`ccn-public:${scope}:global`, budgets[1]],
      ...(host ? [[`ccn-public:${scope}:host:${createHash('sha256').update(host).digest('hex')}`, budgets[2]]] : []),
    ];
    for (const [key, limit] of keys) {
      const result = await reserveLoginAttempt(key, limit, 60);
      if (!result.allowed) return result;
    }
    const byteKeys = [
      [`ccn-public:${scope}:bytes:ip:${digest}`, byteBudgetsMiB[0]],
      [`ccn-public:${scope}:bytes:global`, byteBudgetsMiB[1]],
      ...(host ? [[`ccn-public:${scope}:bytes:host:${createHash('sha256').update(host).digest('hex')}`, byteBudgetsMiB[2]]] : []),
    ];
    for (const [key, limit] of byteKeys) {
      const result = await reserveLoginAttempt(key, limit, 60, maxMiB);
      if (!result.allowed) return result;
    }
    return { allowed: true, retryAfter: 60 };
  }
  catch { return { allowed: false, retryAfter: 60 }; }
}
