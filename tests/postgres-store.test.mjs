import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pgAcquireLease, pgDelete, pgGet, pgReleaseLease, pgReserveAttempt, pgSet } from '../api/_lib/postgres-store.mjs';

test('PostgreSQL preserva dados, expira sessão e limita tentativas de forma atômica', { skip: !process.env.CCN_TEST_DATABASE_URL }, async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.CCN_TEST_DATABASE_URL;
  const prefix = `ccn-test:${randomUUID()}`;
  try {
    await pgSet(`${prefix}:config`, JSON.stringify({ link: 'https://ufpi.br/' }));
    assert.deepEqual(JSON.parse(await pgGet(`${prefix}:config`)), { link: 'https://ufpi.br/' });
    const attempts = await Promise.all(Array.from({ length: 6 }, () => pgReserveAttempt(`${prefix}:attempts`, 5, 900)));
    assert.equal(attempts.filter((item) => item.allowed).length, 5);
    await pgSet(`${prefix}:session`, '1', 1);
    assert.equal(await pgGet(`${prefix}:session`), '1');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(await pgGet(`${prefix}:session`), null);
    const leases = await Promise.all(Array.from({ length: 20 }, (_, index) => pgAcquireLease(`${prefix}:lease`, `owner-${index}`, 30)));
    assert.equal(leases.filter(Boolean).length, 1);
    const owner = `owner-${leases.findIndex(Boolean)}`;
    await pgReleaseLease(`${prefix}:lease`, 'not-owner');
    assert.equal(await pgAcquireLease(`${prefix}:lease`, 'other', 30), false);
    await pgReleaseLease(`${prefix}:lease`, owner);
    assert.equal(await pgAcquireLease(`${prefix}:lease`, 'other', 30), true);
  } finally {
    await Promise.all(['config', 'attempts', 'session', 'lease'].map((name) => pgDelete(`${prefix}:${name}`)));
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  }
});
