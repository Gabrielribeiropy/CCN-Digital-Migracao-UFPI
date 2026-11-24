import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailRecoveryCode, resetMfa, useEmailRecoveryCode } from '../api/_lib/admin-mfa.mjs';
import { institutionalMessage } from '../api/_lib/institutional-mail.mjs';

function withMemoryStore(run) {
  return async () => {
    const names = ['CCN_MFA_ENCRYPTION_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'DATABASE_URL', 'REDIS_URL'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    const originalFetch = globalThis.fetch;
    const records = new Map();
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    Object.assign(process.env, { CCN_MFA_ENCRYPTION_KEY: 'e'.repeat(64), KV_REST_API_URL: 'https://example.invalid/redis', KV_REST_API_TOKEN: 'test-only' });
    globalThis.fetch = async (_url, options) => {
      const [operation, ...args] = JSON.parse(options.body);
      let result = null;
      if (operation === 'SET') { records.set(args[0], args[1]); result = 'OK'; }
      else if (operation === 'GET') result = records.get(args[0]) ?? null;
      else if (operation === 'DEL') result = Number(records.delete(args[0]));
      else if (operation === 'EVAL') { result = records.get(args[2]) ?? null; records.delete(args[2]); }
      return { ok: true, json: async () => ({ result }) };
    };
    try { await run(records); }
    finally {
      globalThis.fetch = originalFetch;
      for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    }
  };
}

const identity = 'user:00000000-0000-4000-8000-000000000001';

test('código por e-mail vale uma única vez', withMemoryStore(async () => {
  const code = await createEmailRecoveryCode(identity);
  assert.match(code, /^\d{6}$/);
  assert.equal(await useEmailRecoveryCode(identity, code), true);
  assert.equal(await useEmailRecoveryCode(identity, code), false);
}));

test('cinco códigos errados invalidam o código enviado', withMemoryStore(async () => {
  const code = await createEmailRecoveryCode(identity);
  const wrong = code === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(await useEmailRecoveryCode(identity, wrong), false);
  assert.equal(await useEmailRecoveryCode(identity, code), false);
}));

test('redefinir o autenticador descarta o código por e-mail pendente', withMemoryStore(async () => {
  const code = await createEmailRecoveryCode(identity);
  await resetMfa(identity);
  assert.equal(await useEmailRecoveryCode(identity, code), false);
}));

test('e-mail institucional escapa HTML e traz versão em texto', () => {
  const message = institutionalMessage({ title: 'Teste <b>', name: 'Ana <script> Silva', paragraphs: ['Linha & outra'], code: '123456', action: { label: 'Abrir', url: 'https://example.org/admin#token=a"b' } });
  assert.doesNotMatch(message.html, /<script>|<b>/);
  assert.match(message.html, /Linha &amp; outra/);
  assert.match(message.html, /123456/);
  assert.match(message.html, /token=a&quot;b/);
  assert.match(message.text, /Código: 123456/);
  assert.match(message.text, /Abrir: https:\/\/example\.org\/admin#token=a"b/);
});
