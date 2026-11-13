import { credentialRole, currentAdmin } from '../_lib/admin-auth.mjs';
import { sameOrigin, limitAdminRequest } from '../_lib/admin-request.mjs';
import { accessLink, authenticateUser, createUser, findOwnProfile, invalidateUserSessions, issueAccessToken, listUsers, listActivity, logActivity, updateUser, findRecoveryUser, findMailUserById, sendAccessEmail } from '../_lib/admin-users.mjs';
import { mfaIdentity, readMfaSecret, resetMfa, verifyTotp } from '../_lib/admin-mfa.mjs';
import { institutionalMailSettings } from '../_lib/institutional-mail.mjs';

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store');
  const actor = await currentAdmin(request);
  if (actor?.role !== 'admin') return response.status(403).json({ error: 'Acesso reservado ao administrador.' });
  if (request.method === 'GET') {
    if (!process.env.DATABASE_URL) return response.status(503).json({ error: 'Cadastro de usuários requer PostgreSQL.' });
    try {
      let mailAvailable = false;
      try { institutionalMailSettings(); mailAvailable = true; } catch { /* O envio manual continua disponível. */ }
      return response.status(200).json({ users: await listUsers(), activity: await listActivity(), mailAvailable });
    }
    catch { return response.status(503).json({ error: 'Usuários temporariamente indisponíveis.' }); }
  }
  if (!['POST', 'PUT'].includes(request.method)) return response.status(405).json({ error: 'Método não permitido.' });
  if (!sameOrigin(request)) return response.status(403).json({ error: 'Origem não permitida.' });
  if (!process.env.DATABASE_URL) return response.status(503).json({ error: 'Cadastro de usuários requer PostgreSQL.' });
  try {
    const attempt = await limitAdminRequest(request, 'users', 20, 3600);
    if (!attempt.allowed) return response.status(429).json({ error: 'Muitas alterações. Aguarde.' });
    if (request.method === 'POST' && request.body?.action === 'reset-mfa') {
      const id = String(request.body.id || '');
      if (!/^[a-f0-9-]{36}$/i.test(id) || id === actor.id) return response.status(400).json({ error: 'Escolha outra conta administrativa válida.' });
      const recipient = await findMailUserById(id);
      if (!recipient?.active || !recipient.ready) return response.status(404).json({ error: 'Conta ativa não encontrada.' });
      const password = request.body.password;
      const code = request.body.code;
      if (typeof password !== 'string' || !password || password.length > 1024 || typeof code !== 'string') return response.status(400).json({ error: 'Confirme sua senha e o código do autenticador.' });
      const profile = actor.id ? await findOwnProfile(actor.id) : null;
      const validPassword = actor.id ? (await authenticateUser(profile?.username || '', password))?.id === actor.id
        : credentialRole(request, process.env.CCN_ADMIN_USERNAME || 'admin', password) === 'admin';
      const ownSecret = await readMfaSecret(mfaIdentity('admin', actor));
      if (!validPassword || !ownSecret || !verifyTotp(ownSecret, code)) return response.status(401).json({ error: 'Confirmação do administrador inválida.' });
      accessLink('check');
      if (!await invalidateUserSessions(id)) return response.status(404).json({ error: 'Conta ativa não encontrada.' });
      await resetMfa(mfaIdentity('user', { id }));
      const token = await issueAccessToken(id, 'reset');
      await logActivity(actor.id || null, 'user.mfa.reset', id);
      return response.status(200).json({ ok: true, url: accessLink(token), expiresInHours: 1 });
    }
    if (request.method === 'POST' && request.body?.action === 'resend') {
      const recipient = await findMailUserById(String(request.body.id || ''));
      if (!recipient?.active || recipient.ready) return response.status(400).json({ error: 'Convite não disponível para este usuário.' });
      const token = await issueAccessToken(recipient.id, 'invite');
      await sendAccessEmail(recipient, 'invite', token);
      await logActivity(actor.id || null, 'user.invite', recipient.id);
      return response.status(200).json({ ok: true });
    }
    if (request.method === 'POST' && request.body?.action === 'manual-link') {
      accessLink('check');
      const recipient = await findMailUserById(String(request.body.id || ''));
      if (!recipient?.active) return response.status(404).json({ error: 'Usuário ativo não encontrado.' });
      const purpose = recipient.ready ? 'reset' : 'invite';
      const token = await issueAccessToken(recipient.id, purpose);
      await logActivity(actor.id || null, `user.manual.${purpose}`, recipient.id);
      return response.status(200).json({ url: accessLink(token), expiresInHours: purpose === 'invite' ? 48 : 1 });
    }
    if (request.method === 'POST') {
      const delivery = request.body?.delivery === 'manual' ? 'manual' : 'email';
      if (delivery === 'email') institutionalMailSettings();
      accessLink('check');
      const id = await createUser(request.body);
      const token = await issueAccessToken(id, 'invite');
      if (delivery === 'manual') {
        await logActivity(actor.id || null, 'user.create.manual', id);
        return response.status(201).json({ ok: true, id, url: accessLink(token), expiresInHours: 48 });
      }
      const recipient = await findRecoveryUser(request.body.email);
      try { await sendAccessEmail(recipient, 'invite', token); }
      catch { return response.status(503).json({ error: 'Usuário criado, mas o convite não foi enviado. Configure o SMTP e reenvie pelo painel.', userId: id }); }
      await logActivity(actor.id || null, 'user.create', id);
      return response.status(201).json({ ok: true, id });
    }
    const id = String(request.body?.id || '');
    if (!/^[a-f0-9-]{36}$/i.test(id)) return response.status(400).json({ error: 'Usuário inválido.' });
    if (id === actor.id && (request.body.active === false || request.body.role !== 'admin')) return response.status(400).json({ error: 'Não é possível remover o próprio acesso administrativo.' });
    const updated = await updateUser(id, request.body);
    if (!updated) return response.status(404).json({ error: 'Usuário não encontrado.' });
    await logActivity(actor.id || null, 'user.update', id);
    return response.status(200).json({ ok: true });
  } catch (error) {
    if (error?.code === '23505') return response.status(409).json({ error: 'Usuário ou e-mail já cadastrado.' });
    if (error instanceof Error && /^(Confira nome|Este nome|Selecione ao menos|Mantenha pelo menos|Origem HTTPS)/.test(error.message)) return response.status(400).json({ error: error.message });
    return response.status(503).json({ error: 'Não foi possível concluir agora. Verifique o banco e o envio de e-mail.' });
  }
}
