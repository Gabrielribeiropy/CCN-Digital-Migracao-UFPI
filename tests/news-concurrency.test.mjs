import assert from 'node:assert/strict';
import test from 'node:test';
import { syncNews } from '../api/_lib/news-service.mjs';

const feed = `<rss><channel><item><title>Notícia de teste</title><link>https://ufpi.br/noticias-ccn/123</link><description><![CDATA[<img src="https://ufpi.br/imagem.jpg">Texto]]></description><pubDate>Thu, 22 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;

test('vinte consultas simultâneas executam uma única coleta do RSS', async () => {
  let cache;
  let locked = false;
  let feedRequests = 0;
  const storage = {
    async getJson() { return cache; },
    async setJson(_key, value) { cache = value; },
    async acquireLease() { if (locked) return false; locked = true; return true; },
    async releaseLease() { locked = false; },
  };
  const fetcher = async () => {
    feedRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return new Response(feed, { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  };
  const results = await Promise.all(Array.from({ length: 20 }, () => syncNews({ storage, fetcher })));
  assert.equal(feedRequests, 1);
  assert.ok(results.every((result) => result.items.length === 1));
  assert.ok(cache.syncedAt);
});
