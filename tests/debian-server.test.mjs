import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createCcnServer } from '../server/debian.mjs';

test('servidor Debian entrega painel e protege diagnóstico do desenvolvedor', async () => {
  const server = createCcnServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const panel = await fetch(`${base}/admin`);
    assert.equal(panel.status, 200);
    assert.match(await panel.text(), /Painel administrativo/);
    const diagnosis = await fetch(`${base}/api/admin/diagnostics`);
    assert.equal(diagnosis.status, 403);
    const removedGate = await fetch(`${base}/api/restricted-access`);
    assert.equal(removedGate.status, 404);
    const traversal = await fetch(`${base}/admin/..%2f..%2fpackage.json`);
    assert.equal(traversal.status, 404);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
