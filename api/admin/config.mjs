import { readConfig, saveConfig, storeStatus } from '../_lib/config-store.mjs';
import { currentAdmin } from '../_lib/admin-auth.mjs';
import { logActivity } from '../_lib/admin-users.mjs';
import { syncNews } from '../_lib/news-service.mjs';

export const config = { maxDuration: 30 };

function areaOf(link) {
  if (link?.id === 'location') return 'home';
  const group = String(link?.group || '');
  if (group === 'Serviços do CCN') return 'services';
  if (group === 'Acesso restrito') return 'restricted';
  if (group === 'Busca e documentos' || group === 'Vida acadêmica' || group === 'Conheça o CCN' || group === 'Informações e serviços') return 'pages';
  return 'pages';
}

function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }

export function allowedChanges(before, after, areas) {
  const can = area => areas.includes(area);
  for (const [key, area] of [['homeCards','home'], ['pageGroupOrder','pages'], ['hiddenPageGroups','pages'], ['newsEnabled','news'], ['newsPresentation','news'], ['manualNews','news'], ['council','council'], ['appUpdate','settings'], ['aboutContacts','settings']]) {
    if (changed(before[key], after[key]) && !can(area)) return false;
  }
  const oldLinks = before.integratedLinks || {};
  const newLinks = after.integratedLinks || {};
  if (!Array.isArray(after.removedLinkIds || [])) return false;
  for (const id of after.removedLinkIds || []) if (!oldLinks[id] || !can(areaOf(oldLinks[id]))) return false;
  for (const id of new Set([...Object.keys(oldLinks), ...Object.keys(newLinks)])) {
    if (changed(oldLinks[id], newLinks[id]) && (!can(areaOf(oldLinks[id] || newLinks[id])) || !can(areaOf(newLinks[id] || oldLinks[id])))) return false;
  }
  return true;
}

export default async function handler(request, response) {
  response.setHeader('cache-control', 'no-store, max-age=0');
  const actor = await currentAdmin(request);
  if (!actor || actor.role === 'developer') return response.status(401).json({ error: 'Acesso administrativo não autorizado.' });
  if (request.method === 'GET') {
    if (request.query?.news === '1') {
      if (actor.role === 'editor' && !actor.areas.includes('news')) return response.status(403).json({ error: 'Área não autorizada.' });
      const news = await syncNews().catch(() => ({ items: [], syncedAt: null, stale: true }));
      return response.status(200).json({ items: news.items.slice(0, 100), syncedAt: news.syncedAt, stale: news.stale });
    }
    try { return response.status(200).json({ config: await readConfig(), storage: storeStatus() }); }
    catch { return response.status(503).json({ error: 'Configuração temporariamente indisponível.' }); }
  }
  if (request.method !== 'PUT') return response.status(405).json({ error: 'Método não permitido.' });
  if (actor.role === 'viewer') return response.status(403).json({ error: 'Perfil somente de consulta.' });
  const origin = request.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== String(request.headers['x-forwarded-host'] || request.headers.host || '')) return response.status(403).json({ error: 'Origem não permitida.' }); }
    catch { return response.status(403).json({ error: 'Origem não permitida.' }); }
  }
  try {
    if (actor.role === 'editor' && !allowedChanges(await readConfig(), request.body || {}, actor.areas)) return response.status(403).json({ error: 'Alteração fora das áreas autorizadas.' });
    const config = await saveConfig(request.body || {});
    if (actor.id) void logActivity(actor.id, 'config.update').catch(() => {});
    return response.status(200).json({ config, storage: storeStatus() });
  }
  catch (error) { return response.status(503).json({ error: error instanceof Error ? error.message : 'Não foi possível salvar.' }); }
}
