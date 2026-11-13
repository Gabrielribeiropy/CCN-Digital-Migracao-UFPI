import { findRecoveryUser, issueAccessToken, sendAccessEmail, consumeAccessToken, logActivity } from '../_lib/admin-users.mjs';
import { sameOrigin, limitAdminRequest } from '../_lib/admin-request.mjs';
import { institutionalMailSettings } from '../_lib/institutional-mail.mjs';

export function resetAvailable() {
  if (!process.env.DATABASE_URL || !process.env.CCN_PUBLIC_ORIGIN) return false;
  try {
    return new URL(process.env.CCN_PUBLIC_ORIGIN).protocol === 'https:';
  } catch { return false; }
}

export function recoveryAvailable() {
  if (!resetAvailable()) return false;
  try { institutionalMailSettings(); return true; }
  catch { return false; }
}

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store');
  if (request.method === 'GET') return response.status(200).json({ available: recoveryAvailable() });
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  if (!sameOrigin(request)) return response.status(403).json({ error: 'Origem não permitida.' });
  const action = request.body?.action;
  if (action === 'reset' ? !resetAvailable() : !recoveryAvailable()) return response.status(503).json({ error: action === 'reset' ? 'Redefinição indisponível até a configuração do PostgreSQL e do endereço HTTPS.' : 'Recuperação por e-mail indisponível até a configuração do PostgreSQL e do e-mail institucional.' });
  try {
    const attempt = await limitAdminRequest(request, 'recovery', 5, 3600);
    if (!attempt.allowed) return response.status(429).json({ error: 'Muitas solicitações. Tente mais tarde.' });
    if (action === 'reset') {
      const ok = await consumeAccessToken(request.body?.token, request.body?.password);
      if (!ok) return response.status(400).json({ error: 'Link inválido ou vencido. Solicite outro.' });
      return response.status(200).json({ ok: true });
    }
    if (!['password', 'username'].includes(action)) return response.status(400).json({ error: 'Solicitação inválida.' });
    const email = String(request.body?.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return response.status(400).json({ error: 'Informe um e-mail válido.' });
    const user = await findRecoveryUser(email);
    if (user) {
      if (action === 'password') {
        const token = await issueAccessToken(user.id, 'reset');
        await sendAccessEmail(user, 'reset', token);
      } else {
        const { createInstitutionalMailer } = await import('../_lib/institutional-mail.mjs');
        const mailer = await createInstitutionalMailer();
        try { await mailer.send({ to: user.email, subject: 'Seu usuário — CCN Digital', text: `Seu nome de usuário para o painel CCN Digital é: ${user.username}\n\nSe você não solicitou esta mensagem, ignore-a.` }); }
        finally { mailer.close(); }
      }
      await logActivity(user.id, `recovery.${action}`, user.id);
    }
    return response.status(200).json({ ok: true, message: 'Se houver uma conta vinculada a este e-mail, você receberá as instruções.' });
  } catch (error) {
    if (error?.message?.startsWith('Use uma senha')) return response.status(400).json({ error: error.message });
    if (request.body?.action !== 'reset') return response.status(200).json({ ok: true, message: 'Se houver uma conta vinculada a este e-mail, você receberá as instruções.' });
    return response.status(503).json({ error: 'Não foi possível processar agora. Tente mais tarde.' });
  }
}
