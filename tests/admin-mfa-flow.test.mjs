import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import login from '../api/admin/login.mjs';
import mfa from '../api/_lib/handlers/mfa.mjs';
import { authorized } from '../api/_lib/admin-auth.mjs';
import { totpAt } from '../api/_lib/admin-mfa.mjs';

test('primeiro acesso exige cadastro TOTP, fornece backup e invalida código usado', async () => {
  const names = ['CCN_ADMIN_SESSION_SECRET', 'CCN_ADMIN_USERNAME', 'CCN_ADMIN_PASSWORD_HASH', 'CCN_ADMIN_MFA_REQUIRED', 'CCN_MFA_ENCRYPTION_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const records = new Map();
  const attempts = new Map();
  Object.assign(process.env, {
    CCN_ADMIN_SESSION_SECRET: 'test-session-secret-not-for-production',
    CCN_ADMIN_USERNAME: 'admin',
    CCN_ADMIN_PASSWORD_HASH: `test-salt:${scryptSync('test-password', 'test-salt', 64).toString('hex')}`,
    CCN_ADMIN_MFA_REQUIRED: 'true',
    CCN_MFA_ENCRYPTION_KEY: 'f'.repeat(64),
    KV_REST_API_URL: 'https://example.invalid/redis',
    KV_REST_API_TOKEN: 'test-only',
  });
  globalThis.fetch = async (_url, options) => {
    const [operation, ...args] = JSON.parse(options.body);
    let result;
    if (operation === 'SET') { records.set(args[0], args[1]); result = 'OK'; }
    else if (operation === 'GET') result = records.get(args[0]) ?? null;
    else if (operation === 'DEL') result = Number(records.delete(args[0]));
    else if (operation === 'EVAL' && String(args[0]).includes('INCRBY')) {
      const key = args[2];
      const count = (attempts.get(key) || 0) + 1;
      attempts.set(key, count);
      result = [count, 900];
    } else if (operation === 'EVAL') {
      const key = args[2];
      result = records.get(key) ?? null;
      records.delete(key);
    } else throw new Error(`Comando inesperado: ${operation}`);
    return { ok: true, json: async () => ({ result }) };
  };
  const makeResponse = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const request = (method, body = {}, cookie = '', ip = '203.0.113.80') => ({ method, body, headers: { host: 'example.org', origin: 'https://example.org', 'x-vercel-forwarded-for': ip, cookie } });
  const doLogin = async (code, ip) => { const response = makeResponse(); await login(request('POST', { username: 'admin', password: 'test-password', code }, '', ip), response); return response; };
  try {
    const first = await doLogin('');
    assert.equal(first.body.mfaSetup, true);
    const cookie = first.headers['set-cookie'].split(';')[0];
    assert.equal(await authorized(request('GET', {}, cookie)), false);
    const begin = makeResponse();
    await mfa(request('POST', { action: 'begin' }, cookie), begin);
    assert.equal(begin.statusCode, 200);
    assert.match(begin.body.uri, /^otpauth:\/\/totp\//);
    assert.match(begin.body.qrDataUrl, /^data:image\/svg\+xml;base64,/);
    const qrSvg = Buffer.from(begin.body.qrDataUrl.split(',')[1], 'base64').toString('utf8');
    assert.match(qrSvg, /viewBox="0 0 \d+ \d+"/);
    assert.match(qrSvg, /fill="#fff"/);
    const confirm = makeResponse();
    await mfa(request('POST', { action: 'confirm', code: totpAt(begin.body.secret) }, cookie), confirm);
    assert.equal(confirm.statusCode, 200);
    assert.equal(confirm.body.backupCodes.length, 3);
    assert.match(confirm.headers['set-cookie'], /Max-Age=0/);
    assert.equal(await authorized(request('GET', {}, cookie)), false);
    const missingCode = await doLogin('');
    assert.equal(missingCode.body.secondFactorRequired, true);
    const withTotp = await doLogin(totpAt(begin.body.secret));
    assert.equal(withTotp.statusCode, 200);
    assert.equal(await authorized(request('GET', {}, withTotp.headers['set-cookie'].split(';')[0])), true);
    const activeCookie = withTotp.headers['set-cookie'].split(';')[0];
    const rotate = makeResponse();
    await mfa(request('POST', { action: 'begin', password: 'test-password', proofCode: totpAt(begin.body.secret) }, activeCookie), rotate);
    assert.equal(rotate.statusCode, 200);
    const rotated = makeResponse();
    await mfa(request('POST', { action: 'confirm', code: totpAt(rotate.body.secret) }, activeCookie), rotated);
    assert.equal(rotated.statusCode, 200);
    assert.equal(await authorized(request('GET', {}, activeCookie)), false);
    assert.equal((await doLogin(confirm.body.backupCodes[1], '203.0.113.81')).statusCode, 401);
    const backup = await doLogin(rotated.body.backupCodes[0], '203.0.113.81');
    assert.equal(backup.body.mfaRecovery, true);
    const recoveryCookie = backup.headers['set-cookie'].split(';')[0];
    assert.equal(await authorized(request('GET', {}, recoveryCookie)), false);
    assert.equal((await doLogin(rotated.body.backupCodes[0], '203.0.113.81')).statusCode, 401);
    const recover = makeResponse();
    await mfa(request('POST', { action: 'begin' }, recoveryCookie), recover);
    assert.equal(recover.statusCode, 200);
    const recovered = makeResponse();
    await mfa(request('POST', { action: 'confirm', code: totpAt(recover.body.secret) }, recoveryCookie), recovered);
    assert.equal(recovered.body.backupCodes.length, 3);
    assert.equal(await authorized(request('GET', {}, recoveryCookie)), false);
    assert.equal((await doLogin(totpAt(recover.body.secret), '203.0.113.82')).statusCode, 200);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
});
