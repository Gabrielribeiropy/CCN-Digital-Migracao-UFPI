import { clearSession, currentAdmin } from '../admin-auth.mjs';
import { changeOwnPassword, findOwnProfile, logActivity, notifyAccountChange } from '../admin-users.mjs';
import { limitAdminRequest, sameOrigin } from '../admin-request.mjs';

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store');
  const actor = await currentAdmin(request);
  if (!actor) return response.status(401).json({ error: 'Sessão encerrada.' });
  if (request.method === 'GET') {
    try {
      const profile = actor.id ? await findOwnProfile(actor.id) : null;
      return response.status(200).json({ role: actor.role, areas: actor.areas, accountId: actor.id || null, legacy: actor.legacy,
        profile: profile || { name: actor.role === 'developer' ? 'Desenvolvedor' : 'Administrador', username: actor.role === 'developer' ? process.env.CCN_DEVELOPER_USERNAME || '' : process.env.CCN_ADMIN_USERNAME || 'admin', email: null, sector: null } });
    } catch { return response.status(503).json({ error: 'Não foi possível carregar sua conta.' }); }
  }
  if (request.method !== 'PATCH') return response.status(405).json({ error: 'Método não permitido.' });
  if (!sameOrigin(request)) return response.status(403).json({ error: 'Origem não permitida.' });
  if (!actor.id) return response.status(403).json({ error: 'Esta senha é administrada na hospedagem institucional.' });
  try {
    const attempt = await limitAdminRequest(request, 'own-password', 5, 900);
    if (!attempt.allowed) return response.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const changed = await changeOwnPassword(actor.id, request.body?.currentPassword, request.body?.newPassword);
    if (!changed) return response.status(400).json({ error: 'Senha atual incorreta.' });
    await clearSession(request, response).catch(() => {});
    void logActivity(actor.id, 'account.password').catch(() => {});
    await notifyAccountChange(await findOwnProfile(actor.id), 'Sua senha foi alterada — CCN Digital', {
      title: 'Senha alterada',
      paragraphs: ['A senha da sua conta no painel CCN Digital acabou de ser alterada. Use a nova senha no próximo acesso.'],
      note: 'Se não foi você, use "Esqueci minha senha" na tela de login e avise a coordenação do CCN.',
    });
    return response.status(200).json({ ok: true });
  } catch (error) {
    if (error?.message?.startsWith('Informe a senha')) return response.status(400).json({ error: error.message });
    return response.status(503).json({ error: 'Não foi possível alterar a senha agora.' });
  }
}
