import test from 'node:test';
import assert from 'node:assert/strict';
import { resetAvailable, recoveryAvailable } from '../api/admin/recovery.mjs';

test('link manual de recuperação funciona sem SMTP quando há banco e HTTPS', () => {
  const names = ['DATABASE_URL', 'CCN_PUBLIC_ORIGIN', 'CCN_SMTP_HOST', 'CCN_SMTP_USER', 'CCN_SMTP_PASSWORD', 'CCN_SMTP_FROM'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.DATABASE_URL = 'postgres://unused/ccn';
    process.env.CCN_PUBLIC_ORIGIN = 'https://ccn.example.org';
    for (const name of names.slice(2)) delete process.env[name];
    assert.equal(resetAvailable(), true);
    assert.equal(recoveryAvailable(), false);
    process.env.CCN_PUBLIC_ORIGIN = 'http://ccn.example.org';
    assert.equal(resetAvailable(), false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
