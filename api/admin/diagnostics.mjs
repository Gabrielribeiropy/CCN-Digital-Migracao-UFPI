import { authorized } from '../_lib/admin-auth.mjs';
import { collectDiagnostics } from '../_lib/diagnostics.mjs';

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('x-content-type-options', 'nosniff');
  if (!await authorized(request, 'developer')) return response.status(403).json({ error: 'Área exclusiva do desenvolvedor.' });
  if (request.method !== 'GET') return response.status(405).json({ error: 'Método não permitido.' });
  try { return response.status(200).json(await collectDiagnostics()); }
  catch { return response.status(503).json({ error: 'Não foi possível gerar o diagnóstico agora.' }); }
}
