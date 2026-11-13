import { createHmac } from 'node:crypto';
import { reserveLoginAttempt } from './kv-store.mjs';

export function sameOrigin(request) {
  const expected = String(request.headers['x-forwarded-host'] || request.headers.host || '');
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === expected; } catch { return false; }
}

export async function limitAdminRequest(request, kind, limit = 5, seconds = 900) {
  const ip = String(request.headers['x-ccn-client-ip'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const secret = process.env.CCN_ADMIN_SESSION_SECRET || '';
  if (!secret) throw new Error('Segredo de sessão ausente.');
  const key = `ccn-admin:${kind}:${createHmac('sha256', secret).update(ip).digest('hex')}`;
  return reserveLoginAttempt(key, limit, seconds);
}
