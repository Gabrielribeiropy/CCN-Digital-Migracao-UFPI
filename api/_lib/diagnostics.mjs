import { readConfig, storeStatus } from './config-store.mjs';
import { readNewsCache } from './news-service.mjs';
import { storageHealthy } from './kv-store.mjs';
import { fetchUpstream } from './fetch-upstream.mjs';

const check = (id, title, status, detail, action) => ({ id, title, status, detail, action });

async function officialSite(url, id, title) {
  try {
    // Destinos fixos: um usuário do painel não pode fornecer URLs para esta verificação.
    const response = await fetchUpstream(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'text/html,application/rss+xml' } });
    const ok = response.status >= 200 && response.status < 400;
    return check(id, title, ok ? 'ok' : 'attention', `Resposta HTTP ${response.status}. A resposta não confirma que o login ou as imagens funcionam.`, ok ? 'Validar o fluxo no aplicativo quando houver relato de erro.' : 'Conferir o serviço oficial e repetir a verificação.');
  } catch {
    return check(id, title, 'attention', 'O servidor não conseguiu consultar esta fonte agora.', 'Conferir disponibilidade, DNS e saída HTTPS da hospedagem.');
  }
}

export async function collectDiagnostics() {
  const [storage, config, cache, rooms, feed] = await Promise.all([
    storageHealthy(),
    readConfig().then((value) => ({ ok: true, updatedAt: value.updatedAt })).catch(() => ({ ok: false })),
    readNewsCache(),
    officialSite('https://salasccn.ufpi.br/', 'salas', 'Sistema de salas'),
    officialSite('https://ufpi.br/ultimas-noticias-ccn?format=feed&type=rss', 'fonte-noticias', 'Fonte oficial de notícias'),
  ]);
  const cacheDate = cache?.syncedAt ? Date.parse(cache.syncedAt) : NaN;
  const cacheHours = Number.isFinite(cacheDate) ? Math.round((Date.now() - cacheDate) / 3_600_000) : null;
  const checks = [
    check('api', 'API do CCN Digital', 'ok', 'A API respondeu à consulta de diagnóstico.', 'Nenhuma ação necessária.'),
    check('banco', 'Banco de dados', storage ? 'ok' : 'attention', storage ? `Conexão com ${storeStatus().provider} ativa.` : 'Não foi possível confirmar a conexão com o armazenamento.', storage ? 'Manter backups e monitoramento da hospedagem.' : 'Verificar serviço do banco, credenciais no servidor e migrações.'),
    check('configuracao', 'Configuração do aplicativo', config.ok && storage ? 'ok' : 'attention', config.ok && storage ? `Leitura disponível. Última alteração: ${config.updatedAt || 'não informada'}.` : 'A leitura persistente não foi confirmada.', 'Verificar o banco e a rota /api/app-config.'),
    check('noticias', 'Cache de notícias', cache?.items?.length && cacheHours !== null && cacheHours < 24 ? 'ok' : 'attention', cache?.items?.length ? `${cache.items.length} notícias armazenadas; última sincronização há cerca de ${cacheHours ?? '?'} h.` : 'Nenhuma notícia armazenada foi confirmada.', 'Verificar a fonte oficial, a sincronização e a rota /api/news.'),
    rooms,
    feed,
  ];
  return {
    generatedAt: new Date().toISOString(),
    summary: { ok: checks.filter((item) => item.status === 'ok').length, attention: checks.filter((item) => item.status === 'attention').length },
    checks,
    scope: 'Verificações do servidor no momento da consulta. Não substituem testes de uso no Android nem monitoramento de falhas passadas.',
  };
}
