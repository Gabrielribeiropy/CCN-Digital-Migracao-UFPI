import assert from 'node:assert/strict';
import test from 'node:test';
import { validateVpsEnvironment } from '../scripts/verify-vps-env.mjs';

const valid = {
  HOST: '127.0.0.1', PORT: '3000', CCN_TRUST_PROXY: 'loopback',
  CCN_PUBLIC_ORIGIN: 'https://ccn.ufpi.br',
  DATABASE_URL: 'postgresql://ccn_app:senha-de-teste@127.0.0.1:5432/ccn_digital',
  CCN_ADMIN_USERNAME: 'administrador_ccn',
  CCN_ADMIN_PASSWORD_HASH: `${'a'.repeat(32)}:${'b'.repeat(128)}`,
  CCN_ADMIN_SESSION_SECRET: 'c'.repeat(64),
  CCN_MFA_ENCRYPTION_KEY: 'd'.repeat(64),
  CCN_ADMIN_MFA_REQUIRED: 'true',
};

test('valida configuração completa da VPS sem acessar o banco', () => {
  assert.deepEqual(validateVpsEnvironment(valid), []);
});

test('recusa marcadores, Redis e exposição da porta Node', () => {
  const errors = validateVpsEnvironment({
    ...valid,
    HOST: '0.0.0.0',
    CCN_PUBLIC_ORIGIN: 'https://ccn.exemplo.ufpi.br',
    DATABASE_URL: 'postgresql://ccn_app:SUBSTITUIR@127.0.0.1:5432/ccn_digital',
    CCN_ADMIN_PASSWORD_HASH: 'GERAR_HASH',
    REDIS_URL: 'redis://127.0.0.1:6379',
  });
  assert.ok(errors.length >= 5);
  assert.ok(errors.some((error) => error.includes('HOST')));
  assert.ok(errors.some((error) => error.includes('Redis')));
});

test('SMTP para convites e recuperação é opcional, mas precisa estar completo quando ativado', () => {
  assert.deepEqual(validateVpsEnvironment(valid), []);
  const errors = validateVpsEnvironment({ ...valid, CCN_SMTP_HOST: 'smtp.ufpi.br' });
  assert.ok(errors.some((error) => error.includes('CCN_SMTP_PASSWORD')));
  assert.deepEqual(validateVpsEnvironment({ ...valid, CCN_SMTP_HOST: 'smtp.ufpi.br', CCN_SMTP_PORT: '587', CCN_SMTP_USER: 'ccn-digital', CCN_SMTP_PASSWORD: 'senha-de-teste', CCN_SMTP_FROM: 'ccn-digital@ufpi.edu.br' }), []);
});

test('exige MFA obrigatório e chave privada válida na VPS', () => {
  assert.ok(validateVpsEnvironment({ ...valid, CCN_ADMIN_MFA_REQUIRED:'false' }).some(error => error.includes('CCN_ADMIN_MFA_REQUIRED')));
  assert.ok(validateVpsEnvironment({ ...valid, CCN_MFA_ENCRYPTION_KEY:'curta' }).some(error => error.includes('CCN_MFA_ENCRYPTION_KEY')));
});

test('permite desligar conta de transição depois do administrador nominativo', () => {
  const { CCN_ADMIN_USERNAME, CCN_ADMIN_PASSWORD_HASH, ...withoutLegacy } = valid;
  assert.deepEqual(validateVpsEnvironment({ ...withoutLegacy, CCN_LEGACY_ADMIN_DISABLED:'true' }), []);
  assert.ok(validateVpsEnvironment(withoutLegacy).some(error => error.includes('CCN_ADMIN_USERNAME')));
});
