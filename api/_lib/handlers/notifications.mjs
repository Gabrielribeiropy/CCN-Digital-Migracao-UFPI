import { createHash } from 'node:crypto';
import { currentAdmin } from '../admin-auth.mjs';
import { mfaIdentity } from '../admin-mfa.mjs';
import { limitAdminRequest, sameOrigin } from '../admin-request.mjs';
import { readConfig } from '../config-store.mjs';
import { councilNotifications } from '../council-notifications.mjs';
import { getJson, setExpiring } from '../kv-store.mjs';

function seenKey(actor, id) {
  const identity = mfaIdentity(actor.role, actor);
  const digest = createHash('sha256').update(id).digest('hex');
  return `ccn-admin:council-seen:v1:${identity}:${digest}`;
}

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store');
  if (!['GET', 'POST'].includes(request.method)) return response.status(405).json({ error: 'Método não permitido.' });
  const actor = await currentAdmin(request);
  if (!actor || actor.role === 'developer' || (['editor', 'viewer'].includes(actor.role) && !actor.areas.includes('council'))) return response.status(403).json({ error: 'Acesso não autorizado.' });
  try {
    const config = await readConfig();
    const active = councilNotifications(config.council.members);
    if (request.method === 'POST') {
      if (!sameOrigin(request)) return response.status(403).json({ error: 'Origem não permitida.' });
      const id = request.body?.id;
      if (typeof id !== 'string' || id.length > 160) return response.status(400).json({ error: 'Aviso inválido.' });
      const item = active.find(entry => entry.id === id);
      if (!item) return response.status(404).json({ error: 'Este aviso já não está disponível.' });
      const attempt = await limitAdminRequest(request, 'notice-seen', 60, 60);
      if (!attempt.allowed) return response.status(429).json({ error: 'Muitas confirmações. Aguarde um minuto.' });
      await setExpiring(seenKey(actor, id), JSON.stringify({ seenAt: new Date().toISOString() }), (item.daysLeft + 2) * 86400);
      return response.status(200).json({ ok: true, id });
    }
    const visibility = await Promise.all(active.map(item => getJson(seenKey(actor, item.id))));
    return response.status(200).json({ items: active.filter((_, index) => !visibility[index]), checkedAt: new Date().toISOString() });
  } catch { return response.status(503).json({ error: 'Não foi possível verificar os mandatos agora.' }); }
}
