import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowPublicRequest } from '../api/_lib/public-rate-limit.mjs';

test('proxy público não libera tráfego sem limite de requisições disponível', async () => {
  const oldUrl = process.env.KV_REST_API_URL;
  const oldToken = process.env.KV_REST_API_TOKEN;
  const oldRedis = process.env.REDIS_URL;
  try {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.REDIS_URL;
    const result = await allowPublicRequest({ headers: {}, socket: { remoteAddress: '203.0.113.8' } }, 'portal');
    assert.equal(result.allowed, false);
    assert.equal(result.retryAfter, 60);
  } finally {
    for (const [key, value] of [['KV_REST_API_URL', oldUrl], ['KV_REST_API_TOKEN', oldToken], ['REDIS_URL', oldRedis]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('proxy público aplica cota por IP, global e por domínio', async () => {
  const previous = [process.env.DATABASE_URL, process.env.REDIS_URL, process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN, globalThis.fetch];
  const counters = new Map();
  try {
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    process.env.KV_REST_API_URL = 'https://storage.example.test';
    process.env.KV_REST_API_TOKEN = 'test';
    globalThis.fetch = async (_url, options) => {
      const [, , , key, , cost] = JSON.parse(options.body);
      const count = (counters.get(key) || 0) + Number(cost || 1);
      counters.set(key, count);
      return new Response(JSON.stringify({ result: [count, 60] }), { status: 200 });
    };
    const request = { headers: {}, socket: { remoteAddress: '198.51.100.8' } };
    const target = new URL('https://ufpi.br/arquivo.jpg');
    for (let index = 0; index < 20; index += 1) assert.equal((await allowPublicRequest(request, 'portal', target)).allowed, true);
    assert.equal((await allowPublicRequest(request, 'portal', target)).allowed, false);
    assert.equal([...counters.keys()].filter((key) => key.includes(':global')).length, 2);
    assert.equal([...counters.keys()].filter((key) => key.includes(':host:')).length, 2);
    const globalKey = [...counters.keys()].find((key) => key.includes(':global') && !key.includes(':bytes:'));
    const hostKey = [...counters.keys()].find((key) => key.includes(':host:') && !key.includes(':bytes:'));
    const otherIp = { headers: {}, socket: { remoteAddress: '198.51.100.9' } };
    counters.set(globalKey, 600);
    assert.equal((await allowPublicRequest(otherIp, 'portal', target)).allowed, false);
    counters.set(globalKey, 0);
    counters.set(hostKey, 300);
    assert.equal((await allowPublicRequest(otherIp, 'portal', target)).allowed, false);
    counters.set(hostKey, 0);
    const byteGlobalKey = [...counters.keys()].find((key) => key.includes(':bytes:global'));
    counters.set(byteGlobalKey, 1200);
    assert.equal((await allowPublicRequest(otherIp, 'portal', target)).allowed, false);
  } finally {
    for (const [key, value] of [['DATABASE_URL', previous[0]], ['REDIS_URL', previous[1]], ['KV_REST_API_URL', previous[2]], ['KV_REST_API_TOKEN', previous[3]]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    globalThis.fetch = previous[4];
  }
});
