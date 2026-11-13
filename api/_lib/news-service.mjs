import { createHash, randomUUID } from 'node:crypto';
import { acquireLease, getJson, kvReady, releaseLease, setJson } from './kv-store.mjs';
import { fetchUpstream } from './fetch-upstream.mjs';

const NEWS_KEY = 'ccn-mobile:news:v1';
const REFRESH_INTERVAL_MS = 60_000;
const REFRESH_LEASE_KEY = 'ccn-mobile:news:refresh-lease';
const FEED_URLS = [
  'https://ufpi.br/ultimas-noticias-ccn?format=feed&type=rss',
  'https://www.ufpi.br/ultimas-noticias-ccn?format=feed&type=rss',
];

function decode(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function text(value = '') {
  return decode(value).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function field(xml, name) {
  return decode(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '').trim();
}

function absolute(value) {
  if (!value?.trim()) return '';
  try { return new URL(value.trim(), 'https://ufpi.br').toString(); } catch { return ''; }
}

function imageUrl(value) {
  const url = absolute(value);
  if (!url) return '';
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname === '/' || !/\.(?:png|jpe?g|gif|webp|avif)$/i.test(parsed.pathname)) return '';
  return url;
}

export function articleImageUrl(html) {
  const candidates = [
    html.match(/"thumbnailUrl"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)?.[1],
    html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/i)?.[1],
  ];
  return candidates.map((value) => imageUrl((value || '').replace(/\\\//g, '/'))).find(Boolean) || '';
}

export function parseNews(xml) {
  const unique = new Map();
  for (const [, itemXml] of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const sourceUrl = absolute(field(itemXml, 'link') || field(itemXml, 'guid'));
    if (!sourceUrl || unique.has(sourceUrl)) continue;
    const description = field(itemXml, 'description');
    const image = [description.match(/<img[^>]+(?:src|data-src)=["']([^"']+)/i)?.[1], itemXml.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)/i)?.[1], itemXml.match(/<enclosure[^>]+url=["']([^"']+)[^>]+type=["']image\//i)?.[1]].map((value) => imageUrl(value || '')).find(Boolean) || '';
    const attachments = [...description.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(([, href, label], index) => {
      const url = absolute(href);
      const extension = new URL(url || 'https://ufpi.br').pathname.split('.').pop()?.toUpperCase() || 'LINK';
      return { id: `${sourceUrl}#${index}`, title: text(label) || `Arquivo ${index + 1}`, url, type: extension };
    }).filter((attachment) => attachment.url);
    const body = text(description).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const published = new Date(field(itemXml, 'pubDate'));
    const joinedBody = body.join(' ');
    unique.set(sourceUrl, {
      id: sourceUrl.match(/\/noticias-ccn\/(\d+)/)?.[1] || createHash('sha256').update(sourceUrl).digest('hex').slice(0, 18),
      title: text(field(itemXml, 'title')),
      excerpt: joinedBody.slice(0, 187).trim() + (joinedBody.length > 190 ? '…' : ''),
      body, imageUrl: image,
      publishedAt: Number.isNaN(published.getTime()) ? 'Data não informada' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Fortaleza' }).format(published),
      publishedIso: Number.isNaN(published.getTime()) ? new Date(0).toISOString() : published.toISOString(),
      category: 'Notícias CCN', attachments, sourceUrl,
    });
  }
  return [...unique.values()].sort((a, b) => b.publishedIso.localeCompare(a.publishedIso));
}

export async function readNewsCache() {
  if (!kvReady()) return null;
  try { return await getJson(NEWS_KEY); } catch { return null; }
}

export async function syncNews(dependencies = {}) {
  const storage = dependencies.storage || { getJson, setJson, acquireLease, releaseLease };
  const fetcher = dependencies.fetcher || fetchUpstream;
  const cached = dependencies.storage ? await storage.getJson(NEWS_KEY) : await readNewsCache();
  const cacheAge = Date.now() - Date.parse(cached?.syncedAt || '');
  if (cached?.items?.length && Number.isFinite(cacheAge) && cacheAge >= 0 && cacheAge < REFRESH_INTERVAL_MS) {
    return { ...cached, stale: false, sourceStatus: 'online' };
  }
  if (!dependencies.storage && !kvReady()) throw new Error('Armazenamento de notícias indisponível.');
  const token = randomUUID();
  let acquired;
  try { acquired = await storage.acquireLease(REFRESH_LEASE_KEY, token, 45); }
  catch { throw new Error('Armazenamento de notícias indisponível.'); }
  if (!acquired) {
    if (cached?.items?.length) return { ...cached, stale: false, sourceStatus: 'updating' };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const fresh = await storage.getJson(NEWS_KEY);
      if (fresh?.items?.length) return { ...fresh, stale: false, sourceStatus: 'online' };
    }
    throw new Error('As notícias estão sendo atualizadas. Tente novamente em instantes.');
  }
  const errors = [];
  try {
  for (const feedUrl of FEED_URLS) {
    try {
      const upstream = await fetcher(feedUrl, { headers: { 'user-agent': 'CCN-Mobile/1.0 (+https://ufpi.br/ccn)', accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5' }, signal: AbortSignal.timeout(12_000) });
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
      const items = parseNews(await upstream.text());
      if (!items.length) throw new Error('feed sem notícias reconhecíveis');
      const missing = items.filter((item) => !item.imageUrl).slice(0, 8);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
        while (next < missing.length) {
          const item = missing[next++];
          try {
            const article = await fetcher(item.sourceUrl, { signal: AbortSignal.timeout(8_000) });
            if (article.ok && /text\/html/i.test(article.headers.get('content-type') || '')) item.imageUrl = articleImageUrl(await article.text());
          } catch { /* A notícia continua disponível com a imagem substituta. */ }
        }
      }));
      const previousImages = new Map((cached?.items || []).filter((item) => item.imageUrl).map((item) => [item.id, item.imageUrl]));
      for (const item of items) if (!item.imageUrl) item.imageUrl = previousImages.get(item.id) || '';
      const result = { items, syncedAt: new Date().toISOString(), sourceUrl: feedUrl };
      await storage.setJson(NEWS_KEY, result);
      return { ...result, stale: false, sourceStatus: 'online' };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'falha desconhecida');
    }
  }
  if (cached?.items?.length) return { ...cached, stale: true, sourceStatus: 'offline', sourceError: errors.join('; ') };
  throw new Error('A fonte oficial está indisponível e ainda não existe uma sincronização salva.');
  } finally {
    try { await storage.releaseLease(REFRESH_LEASE_KEY, token); } catch { /* O prazo da trava também garante a liberação. */ }
  }
}
