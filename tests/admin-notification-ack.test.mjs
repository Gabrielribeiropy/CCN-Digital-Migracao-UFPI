import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueSession } from '../api/_lib/admin-auth.mjs';
import notifications from '../api/_lib/handlers/notifications.mjs';
import { setJson } from '../api/_lib/kv-store.mjs';

test('confirmação individual persiste, oculta o aviso e nova data gera novo aviso', async () => {
  const names = ['CCN_ADMIN_SESSION_SECRET', 'CCN_ADMIN_MFA_REQUIRED', 'CCN_LEGACY_ADMIN_DISABLED', 'CCN_MFA_ENCRYPTION_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'DATABASE_URL', 'REDIS_URL', 'CCN_PREVIEW_NAMESPACE'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const records = new Map();
  Object.assign(process.env, { CCN_ADMIN_SESSION_SECRET:'test-session-secret', CCN_ADMIN_MFA_REQUIRED:'false', CCN_LEGACY_ADMIN_DISABLED:'false', CCN_MFA_ENCRYPTION_KEY:'f'.repeat(64), KV_REST_API_URL:'https://example.invalid/redis', KV_REST_API_TOKEN:'test-token' });
  for (const name of ['DATABASE_URL', 'REDIS_URL', 'CCN_PREVIEW_NAMESPACE']) delete process.env[name];
  globalThis.fetch = async (_url, options) => {
    const [operation, ...args] = JSON.parse(options.body);
    let result;
    if (operation === 'SET') { records.set(args[0], args[1]); result = 'OK'; }
    else if (operation === 'GET') result = records.get(args[0]) ?? null;
    else if (operation === 'EVAL') result = [1, 60];
    else throw new Error(`Comando inesperado: ${operation}`);
    return { ok:true, json:async () => ({ result }) };
  };
  const makeResponse = () => ({ statusCode:200, headers:{}, setHeader(key, value) { this.headers[key] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const request = (method, body = {}, cookie = '', origin = 'https://example.org') => ({ method, body, headers:{ host:'example.org', origin, cookie, 'x-ccn-client-ip':'203.0.113.10' } });
  const call = async (method, body, cookie, origin) => { const response = makeResponse(); await notifications(request(method, body, cookie, origin), response); return response; };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const base = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const date = offset => new Date(base + offset * 86400000).toISOString().slice(0, 10);
  const members = [{ id:'prof-a', name:'Professor A', sector:'Matemática', role:'Chefe', endDate:date(15) }, { id:'prof-b', name:'Professor B', sector:'Física', role:'Chefe', endDate:date(20) }];
  try {
    await setJson('ccn-mobile:app-config:v1', { council:{ members } });
    const session = makeResponse();
    await issueSession(request('GET'), session, 'admin');
    const cookie = session.headers['set-cookie'].split(';')[0];
    const before = await call('GET', {}, cookie);
    assert.equal(before.body.items.length, 2);
    const id = before.body.items.find(item => item.name === 'Professor A').id;
    assert.equal((await call('POST', { id:'inventado' }, cookie)).statusCode, 404);
    assert.equal((await call('POST', { id }, cookie, 'https://outro.example')).statusCode, 403);
    assert.equal((await call('POST', { id }, cookie)).statusCode, 200);
    assert.deepEqual((await call('GET', {}, cookie)).body.items.map(item => item.name), ['Professor B']);
    const nextSession = makeResponse();
    await issueSession(request('GET'), nextSession, 'admin');
    assert.deepEqual((await call('GET', {}, nextSession.headers['set-cookie'].split(';')[0])).body.items.map(item => item.name), ['Professor B']);
    members[0].endDate = date(16);
    await setJson('ccn-mobile:app-config:v1', { council:{ members } });
    assert.equal((await call('GET', {}, cookie)).body.items.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
});
