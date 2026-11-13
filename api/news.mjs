import { syncNews } from './_lib/news-service.mjs';
import { readConfig } from './_lib/config-store.mjs';
import { presentNews } from './_lib/news-presentation.mjs';

export const config = { maxDuration: 30 };

export default async function handler(request, response) {
  response.setHeader('access-control-allow-origin', '*');
  try {
    const limit = Math.min(Math.max(Number(request.query.limit || 30), 1), 100);
    const appConfig = await readConfig();
    const result = await syncNews().catch((error) => {
      if (!appConfig.manualNews.some(item => item.active)) throw error;
      return { items: [], syncedAt: null, stale: true, sourceStatus: 'offline' };
    });
    const items = presentNews(result.items, appConfig.newsPresentation, appConfig.manualNews);
    response.setHeader('cache-control', 'no-store, max-age=0');
    return response.status(200).json({ ...result, items: items.slice(0, limit) });
  } catch (error) {
    response.setHeader('cache-control', 'no-store, max-age=0');
    return response.status(503).json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar as notícias agora.', sourceStatus: 'offline' });
  }
}
