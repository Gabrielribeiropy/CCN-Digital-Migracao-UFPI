import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import test from 'node:test';
import handler from '../api/admin/login.mjs';
import { authorized, clearSession, currentMfaSetupActor } from '../api/_lib/admin-auth.mjs';
import diagnosticsHandler from '../api/admin/diagnostics.mjs';
import configHandler from '../api/admin/config.mjs';
import { createBackupCodes, saveMfaSecret, totpAt } from '../api/_lib/admin-mfa.mjs';

const old = {
  fetch: globalThis.fetch,
  secret: process.env.CCN_ADMIN_SESSION_SECRET,
  hash: process.env.CCN_ADMIN_PASSWORD_HASH,
  user: process.env.CCN_ADMIN_USERNAME,
  developerUser: process.env.CCN_DEVELOPER_USERNAME,
  developerHash: process.env.CCN_DEVELOPER_PASSWORD_HASH,
  kvUrl: process.env.KV_REST_API_URL,
  kvToken: process.env.KV_REST_API_TOKEN,
  mfaKey: process.env.CCN_MFA_ENCRYPTION_KEY,
  mfaRequired: process.env.CCN_ADMIN_MFA_REQUIRED,
};

process.env.CCN_ADMIN_SESSION_SECRET = 'local-test-secret-not-for-production';
process.env.CCN_ADMIN_USERNAME = 'admin';
process.env.CCN_ADMIN_PASSWORD_HASH = `test-salt:${scryptSync('correct-password', 'test-salt', 64).toString('hex')}`;
process.env.CCN_DEVELOPER_USERNAME = 'dev';
process.env.CCN_DEVELOPER_PASSWORD_HASH = `dev-salt:${scryptSync('dev-password', 'dev-salt', 64).toString('hex')}`;
process.env.KV_REST_API_URL = 'https://example.invalid/redis';
process.env.KV_REST_API_TOKEN = 'local-test-token';

const attempts = new Map();
const sessions = new Map();
globalThis.fetch = async (_url, options) => {
  const parts = JSON.parse(options.body);
  const [operation, , , key] = parts;
  if (operation === 'EVAL') {
    if (String(parts[1]).includes('redis.call("GET"')) {
      const value = sessions.get(key) || null;
      sessions.delete(key);
      return { ok: true, json: async () => ({ result: value }) };
    }
    const count = (attempts.get(key) || 0) + 1;
    attempts.set(key, count);
    return { ok: true, json: async () => ({ result: [count, 900] }) };
  }
  if (operation === 'DEL') {
    attempts.delete(JSON.parse(options.body)[1]);
    sessions.delete(parts[1]);
    return { ok: true, json: async () => ({ result: 1 }) };
  }
  if (operation === 'SET') {
    sessions.set(parts[1], parts[2]);
    return { ok: true, json: async () => ({ result: 'OK' }) };
  }
  if (operation === 'GET') {
    return { ok: true, json: async () => ({ result: sessions.get(parts[1]) || null }) };
  }
  throw new Error(`Comando inesperado: ${operation}`);
};

function response() {
  return {
    headers: {}, statusCode: 200,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function login(ip, password, username = 'admin', code = '') {
  const result = response();
  await handler({ method: 'POST', headers: { 'x-ccn-client-ip': ip, host: 'example.org' }, body: { username, password, code } }, result);
  return result;
}

test('limita tentativas por IP, mantém outros IPs e limpa após sucesso', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login('203.0.113.10', 'wrong')).statusCode, 401);
  const blocked = await login('203.0.113.10', 'correct-password');
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['retry-after'], '900');
  assert.equal((await login('203.0.113.11', 'correct-password')).statusCode, 200);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await login('203.0.113.11', 'wrong')).statusCode, 401);
});

test('falha fechada quando o contador distribuído está indisponível', async () => {
  const workingFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('storage offline'); };
  const result = await login('203.0.113.12', 'correct-password');
  assert.equal(result.statusCode, 503);
  assert.equal(result.headers['set-cookie'], undefined);
  globalThis.fetch = workingFetch;
});

test('logout revoga a sessão no armazenamento', async () => {
  const result = await login('203.0.113.13', 'correct-password');
  assert.equal(result.statusCode, 200);
  const cookie = result.headers['set-cookie'].split(';')[0];
  const request = { headers: { host: 'example.org', cookie } };
  assert.equal(await authorized(request), true);
  await clearSession(request, response());
  assert.equal(await authorized(request), false);
});

test('desenvolvedor acessa apenas diagnóstico; administrador não acessa relatório técnico', async () => {
  const dev = await login('203.0.113.14', 'dev-password', 'dev');
  assert.equal(dev.statusCode, 200);
  assert.equal(dev.body.role, 'developer');
  const devRequest = { method: 'GET', headers: { host: 'example.org', cookie: dev.headers['set-cookie'].split(';')[0] } };
  assert.equal(await authorized(devRequest, 'developer'), true);
  assert.equal(await authorized(devRequest, 'admin'), false);
  const editorResponse = response();
  await configHandler(devRequest, editorResponse);
  assert.equal(editorResponse.statusCode, 401);
  const admin = await login('203.0.113.15', 'correct-password');
  const adminRequest = { method: 'GET', headers: { host: 'example.org', cookie: admin.headers['set-cookie'].split(';')[0] } };
  const reportResponse = response();
  await diagnosticsHandler(adminRequest, reportResponse);
  assert.equal(reportResponse.statusCode, 403);
});

test('segundo fator cadastrado é obrigatório antes de emitir sessão', async () => {
  process.env.CCN_MFA_ENCRYPTION_KEY = 'd'.repeat(64);
  process.env.CCN_ADMIN_MFA_REQUIRED = 'true';
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  await saveMfaSecret('legacy:admin', secret);
  const withoutCode = await login('203.0.113.21', 'correct-password');
  assert.equal(withoutCode.statusCode, 401);
  assert.equal(withoutCode.headers['set-cookie'], undefined);
  const withCode = await login('203.0.113.22', 'correct-password', 'admin', totpAt(secret));
  assert.equal(withCode.statusCode, 200);
  assert.equal(await authorized({ headers: { host:'example.org', cookie:withCode.headers['set-cookie'].split(';')[0] } }), true);
});

test('backup autentica uma vez e novo usuário só recebe sessão de cadastro', async () => {
  const codes = await createBackupCodes('legacy:admin');
  const first = await login('203.0.113.23', 'correct-password', 'admin', codes[0]);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.mfaRecovery, true);
  const recoveryRequest = { headers: { host:'example.org', cookie:first.headers['set-cookie'].split(';')[0] } };
  assert.equal(await authorized(recoveryRequest), false);
  assert.equal((await currentMfaSetupActor(recoveryRequest))?.mfaRecovery, true);
  const replay = await login('203.0.113.24', 'correct-password', 'admin', codes[0]);
  assert.equal(replay.statusCode, 401);
  const setup = await login('203.0.113.25', 'dev-password', 'dev');
  assert.equal(setup.statusCode, 200);
  assert.equal(setup.body.mfaSetup, true);
  const request = { headers: { host:'example.org', cookie:setup.headers['set-cookie'].split(';')[0] } };
  assert.equal(await authorized(request), false);
  assert.equal((await currentMfaSetupActor(request))?.mfaSetup, true);
});

test.after(() => {
  globalThis.fetch = old.fetch;
  for (const [name, value] of [
    ['CCN_ADMIN_SESSION_SECRET', old.secret], ['CCN_ADMIN_PASSWORD_HASH', old.hash],
    ['CCN_ADMIN_USERNAME', old.user], ['KV_REST_API_URL', old.kvUrl], ['KV_REST_API_TOKEN', old.kvToken],
    ['CCN_DEVELOPER_USERNAME', old.developerUser], ['CCN_DEVELOPER_PASSWORD_HASH', old.developerHash],
    ['CCN_MFA_ENCRYPTION_KEY', old.mfaKey], ['CCN_ADMIN_MFA_REQUIRED', old.mfaRequired],
  ]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
