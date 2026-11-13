import { readConfig } from './_lib/config-store.mjs';

export default async function handler(request, response) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('cache-control', 'no-store, max-age=0');
  try {
    const config = await readConfig();
    const { manualNews, newsPresentation, ...publicConfig } = config;
    response.status(200).json({ ...publicConfig, council: { members: config.council.members, placement: config.council.placement } });
  }
  catch { response.status(503).json({ error: 'Configuração temporariamente indisponível.' }); }
}
