import { credentialRole, issueSession } from '../_lib/admin-auth.mjs';
import { createHmac } from 'node:crypto';
import { clearLoginAttempts, reserveLoginAttempt } from '../_lib/kv-store.mjs';
import { authenticateUser, findMailUserById, logActivity, notifyAccountChange } from '../_lib/admin-users.mjs';
import { createEmailRecoveryCode, mfaAvailable, mfaIdentity, mfaRequired, readMfaSecret, resetMfa, useBackupCode, useEmailRecoveryCode, verifyTotp } from '../_lib/admin-mfa.mjs';
import { institutionalMailSettings, sendInstitutionalMail } from '../_lib/institutional-mail.mjs';

function attemptKey(request) {
  // A Vercel sobrescreve este cabeçalho e impede que o cliente escolha outro IP.
  const ip = String(request.headers['x-vercel-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const secret = process.env.CCN_ADMIN_SESSION_SECRET || '';
  return `ccn-admin:login:v1:${createHmac('sha256', secret).update(ip).digest('hex')}`;
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

// Perdeu autenticador e códigos: com a senha já conferida, um código enviado ao e-mail cadastrado libera novo cadastro.
async function emailRecovery(request, response, action, role, account, code) {
  const keep = { secondFactorRequired: true };
  if (!account?.id) return response.status(400).json({ ...keep, error: 'Esta conta não tem e-mail cadastrado. Use um código de recuperação ou peça ajuda ao suporte técnico.' });
  const identity = mfaIdentity(role, account);
  if (!await readMfaSecret(identity)) return response.status(400).json({ ...keep, error: 'Esta conta ainda não tem autenticador cadastrado.' });
  const user = await findMailUserById(account.id);
  if (action === 'mfa-email-send') {
    try { institutionalMailSettings(); }
    catch { return response.status(503).json({ ...keep, error: 'O envio de e-mail ainda não está configurado no servidor. Peça a um administrador para redefinir seu autenticador em "Usuários e permissões".' }); }
    await sendInstitutionalMail(user.email, 'Código para trocar o autenticador — CCN Digital', {
      title: 'Código de verificação', name: user.name,
      paragraphs: ['Recebemos um pedido para trocar o aplicativo autenticador da sua conta no painel CCN Digital.', 'Digite o código abaixo na tela do painel. Em seguida, você vai cadastrar o autenticador novamente.'],
      code: await createEmailRecoveryCode(identity),
      note: 'O código vale por 10 minutos e só pode ser usado uma vez. Ninguém do CCN vai pedir este código por telefone ou mensagem.',
    });
    return response.status(200).json({ ok: true, message: `Enviamos um código de 6 dígitos para ${maskEmail(user.email)}. Ele vale por 10 minutos.` });
  }
  if (!await useEmailRecoveryCode(identity, code)) return response.status(401).json({ ...keep, error: 'Código do e-mail incorreto ou vencido. Confira ou peça um novo.' });
  await resetMfa(identity);
  await issueSession(request, response, role, account, false, true);
  await logActivity(account.id, 'account.mfa.email-reset', account.id);
  await notifyAccountChange(user, 'Seu autenticador foi removido — CCN Digital', {
    title: 'Autenticador removido',
    paragraphs: ['O aplicativo autenticador da sua conta no painel CCN Digital foi removido com um código enviado para este e-mail.', 'No próximo acesso, o painel vai pedir que você cadastre o autenticador de novo.'],
    note: 'Se não foi você, troque sua senha imediatamente e avise a coordenação do CCN.',
  });
  return response.status(200).json({ mfaSetup: true });
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
  const action = request.body?.action;
  if (action === 'mfa-email-send' || action === 'mfa-email-verify') {
    try { return await emailRecovery(request, response, action, role, account, code); }
    catch (error) {
      console.error('[admin/login]', error instanceof Error ? error.message : error);
      return response.status(503).json({ secondFactorRequired: true, error: 'Não foi possível enviar ou conferir o código agora. Tente de novo em instantes.' });
    }
  }
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
