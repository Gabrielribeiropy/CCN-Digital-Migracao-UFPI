import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createBackupCodes, createMfaSecret, mfaIdentity, provisioningUri, resetMfa, totpAt, useBackupCode, verifyTotp } from '../api/_lib/admin-mfa.mjs';

test('TOTP segue o vetor público RFC 6238 e rejeita códigos inválidos', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpAt(secret, 59_000), '287082');
  assert.equal(verifyTotp(secret, '287082', 59_000), true);
  assert.equal(verifyTotp(secret, '287082', 180_000), false);
  assert.equal(verifyTotp(secret, '12345a', 59_000), false);
});

test('cada conta recebe identidade própria e chave compatível com autenticador', () => {
  const secret = createMfaSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(mfaIdentity('admin', { id: '3f117681-58a1-4a31-b916-0b94460d9ba1' }), 'user:3f117681-58a1-4a31-b916-0b94460d9ba1');
  assert.equal(mfaIdentity('admin', null), 'legacy:admin');
  assert.match(provisioningUri(secret, 'gestor'), /^otpauth:\/\/totp\/CCN%20Digital%3Agestor\?secret=/);
});

test('códigos de recuperação são individuais, de uso único e substituíveis', async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, key: process.env.CCN_MFA_ENCRYPTION_KEY };
  const records = new Map();
  process.env.KV_REST_API_URL = 'https://example.invalid/redis';
  process.env.KV_REST_API_TOKEN = 'test-only';
  process.env.CCN_MFA_ENCRYPTION_KEY = 'e'.repeat(64);
  globalThis.fetch = async (_url, options) => {
    const [action, ...args] = JSON.parse(options.body);
    let result;
    if (action === 'SET') { records.set(args[0], args[1]); result = 'OK'; }
    else if (action === 'GET') result = records.get(args[0]) ?? null;
    else if (action === 'DEL') { result = Number(records.delete(args[0])); }
    else if (action === 'EVAL') { const key = args[2]; result = records.get(key) ?? null; records.delete(key); }
    else throw new Error(`Comando inesperado: ${action}`);
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    const codes = await createBackupCodes('legacy:admin');
    assert.equal(codes.length, 3);
    assert.equal(new Set(codes).size, 3);
    assert.match(codes[0], /^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/);
    assert.equal(await useBackupCode('legacy:developer', codes[0]), false);
    assert.deepEqual(await Promise.all([useBackupCode('legacy:admin', codes[0]), useBackupCode('legacy:admin', codes[0])]), [true, false]);
    const replacement = await createBackupCodes('legacy:admin');
    assert.equal(await useBackupCode('legacy:admin', codes[1]), false);
    assert.equal(await useBackupCode('legacy:admin', replacement[0]), true);
    await resetMfa('legacy:admin');
    assert.equal(await useBackupCode('legacy:admin', replacement[1]), false);
    assert.equal([...records.keys()].some(key => key.includes('ccn-admin:mfa:legacy:admin')), false);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [name, value] of [['KV_REST_API_URL', previous.url], ['KV_REST_API_TOKEN', previous.token], ['CCN_MFA_ENCRYPTION_KEY', previous.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
