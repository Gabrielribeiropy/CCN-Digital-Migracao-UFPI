import { clearSession } from '../_lib/admin-auth.mjs';

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  try { await clearSession(request, response); }
  catch { return response.status(503).json({ error: 'Não foi possível encerrar a sessão. Tente novamente.' }); }
  return response.status(200).json({ ok: true });
}
