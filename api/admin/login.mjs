import { credentialRole, issueSession } from '../_lib/admin-auth.mjs';
import { createHmac } from 'node:crypto';
import { clearLoginAttempts, reserveLoginAttempt } from '../_lib/kv-store.mjs';
import { authenticateUser } from '../_lib/admin-users.mjs';
import { mfaAvailable, mfaIdentity, mfaRequired, readMfaSecret, useBackupCode, verifyTotp } from '../_lib/admin-mfa.mjs';

function attemptKey(request) {
  const ip = String(request.headers['x-ccn-client-ip'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const secret = process.env.CCN_ADMIN_SESSION_SECRET || '';
  return `ccn-admin:login:v1:${createHmac('sha256', secret).update(ip).digest('hex')}`;
}

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  const { username, password, code } = request.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 128 || password.length > 1024) return response.status(401).json({ error: 'Usuário ou senha inválidos.' });
  if (!process.env.CCN_ADMIN_SESSION_SECRET) return response.status(503).json({ error: 'Acesso administrativo temporariamente indisponível.' });
  const key = attemptKey(request);
  let mfaVerified = false;
  try {
    const attempt = await reserveLoginAttempt(key);
    if (!attempt.allowed) {
      response.setHeader('retry-after', String(attempt.retryAfter));
      return response.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
  } catch {
    return response.status(503).json({ error: 'Acesso administrativo temporariamente indisponível.' });
  }
  let account = null;
  try { account = await authenticateUser(username.trim(), password); }
  catch { return response.status(503).json({ error: 'Acesso administrativo temporariamente indisponível.' }); }
  const role = account?.role || credentialRole(request, username, password);
  if (!role) return response.status(401).json({ error: 'Usuário ou senha inválidos.' });
  try {
    if (mfaRequired() && !mfaAvailable()) return response.status(503).json({ error: 'Segundo fator temporariamente indisponível.' });
    const identity = mfaIdentity(role, account);
    const secret = await readMfaSecret(identity);
    if (mfaRequired() && !secret) {
      await issueSession(request, response, role, account, false, true);
      return response.status(200).json({ mfaSetup: true });
    }
    if (secret && !code) return response.status(401).json({ error: 'Informe o código do autenticador.', secondFactorRequired: true });
    if (secret && !verifyTotp(secret, code)) {
      if (!await useBackupCode(identity, code)) return response.status(401).json({ error: 'Código do autenticador ou de recuperação inválido.', secondFactorRequired: true });
      await issueSession(request, response, role, account, false, true, true);
      return response.status(200).json({ mfaSetup: true, mfaRecovery: true });
    }
    mfaVerified = Boolean(secret);
  } catch { return response.status(503).json({ error: 'Não foi possível verificar o segundo fator.' }); }
  try { await issueSession(request, response, role, account, mfaVerified); }
  catch { return response.status(503).json({ error: 'Acesso administrativo temporariamente indisponível.' }); }
  // Falha ao limpar o contador não invalida a sessão já concedida.
  void clearLoginAttempts(key).catch(() => {});
  return response.status(200).json({ ok: true, role, areas: account?.areas || [], accountId: account?.id || null });
}
