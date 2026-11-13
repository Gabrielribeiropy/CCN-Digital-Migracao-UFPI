import { clearSession, currentAdmin, currentMfaSetupActor, credentialRole } from '../admin-auth.mjs';
import { authenticateUser, findOwnProfile, logActivity } from '../admin-users.mjs';
import { limitAdminRequest, sameOrigin } from '../admin-request.mjs';
import { clearPendingMfa, createBackupCodes, createMfaSecret, mfaAvailable, mfaIdentity, mfaRequired, provisioningUri, readMfaSecret, readPendingMfa, saveMfaSecret, savePendingMfa, useBackupCode, verifyTotp } from '../admin-mfa.mjs';
import { mfaQrDataUrl } from '../mfa-qr.mjs';

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store');
  const actor = await currentAdmin(request) || await currentMfaSetupActor(request);
  if (!actor) return response.status(401).json({ error: 'Sessão encerrada.' });
  const identity = mfaIdentity(actor.role, actor);
  if (request.method === 'GET') {
    try { return response.status(200).json({ enabled: Boolean(await readMfaSecret(identity)), available: mfaAvailable(), required: mfaRequired() }); }
    catch { return response.status(503).json({ error: 'Não foi possível consultar o segundo fator.' }); }
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  if (!sameOrigin(request)) return response.status(403).json({ error: 'Origem não permitida.' });
  if (!mfaAvailable()) return response.status(503).json({ error: 'A TI precisa configurar a chave privada de autenticação na hospedagem.' });
  try {
    const attempt = await limitAdminRequest(request, 'mfa-setup', 8, 900);
    if (!attempt.allowed) return response.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const action = request.body?.action;
    if (action === 'begin') {
      const enrolled = await readMfaSecret(identity);
      const password = request.body?.password;
      const profile = actor.id ? await findOwnProfile(actor.id) : null;
      if (!actor.mfaSetup) {
        if (typeof password !== 'string' || !password || password.length > 1024) return response.status(400).json({ error: 'Informe a senha atual.' });
        const valid = actor.id ? (await authenticateUser(profile?.username || '', password))?.id === actor.id
          : credentialRole(request, actor.role === 'developer' ? process.env.CCN_DEVELOPER_USERNAME || '' : process.env.CCN_ADMIN_USERNAME || 'admin', password) === actor.role;
        if (!valid) return response.status(401).json({ error: 'Senha atual incorreta.' });
      }
      if (enrolled && !actor.mfaRecovery && !verifyTotp(enrolled, request.body?.proofCode) && !await useBackupCode(identity, request.body?.proofCode)) {
        return response.status(401).json({ error: 'Informe um código atual ou um código de recuperação não utilizado.' });
      }
      const secret = createMfaSecret();
      const uri = provisioningUri(secret, profile?.username || (actor.role === 'developer' ? process.env.CCN_DEVELOPER_USERNAME : process.env.CCN_ADMIN_USERNAME));
      const qrDataUrl = mfaQrDataUrl(uri);
      await savePendingMfa(identity, secret);
      return response.status(200).json({ secret, uri, qrDataUrl });
    }
    if (action === 'confirm') {
      const secret = await readPendingMfa(identity);
      if (!secret) return response.status(400).json({ error: 'A configuração expirou. Comece novamente.' });
      if (!verifyTotp(secret, request.body?.code)) return response.status(400).json({ error: 'Código incorreto. Confira o horário do celular e tente novamente.' });
      const backupCodes = await createBackupCodes(identity);
      await saveMfaSecret(identity, secret);
      await clearPendingMfa(identity);
      if (actor.mfaSetup) await clearSession(request, response);
      if (actor.id) void logActivity(actor.id, 'account.mfa.enabled').catch(() => {});
      return response.status(200).json({ enabled: true, backupCodes });
    }
    return response.status(400).json({ error: 'Ação inválida.' });
  } catch { return response.status(503).json({ error: 'Não foi possível configurar o autenticador agora.' }); }
}
