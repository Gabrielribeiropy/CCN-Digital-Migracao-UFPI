import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUpstream, isPublicIPv4, lookupPinnedAddress, publicHttpUrl } from '../api/_lib/fetch-upstream.mjs';

test('entrega IP fixado no formato pedido pelo cliente HTTP', () => {
  lookupPinnedAddress('8.8.8.8', { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]);
  });
  lookupPinnedAddress('8.8.8.8', {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, '8.8.8.8');
    assert.equal(family, 4);
  });
});

test('recusa endereços privados, reservados e IPv6 no proxy', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.51.100.4', '203.0.113.1', '224.0.0.1']) {
    assert.equal(isPublicIPv4(address), false, address);
    assert.equal(publicHttpUrl(`http://${address}/`), null, address);
  }
  assert.equal(publicHttpUrl('http://[::1]/'), null);
  assert.equal(publicHttpUrl('http://user:pass@example.com/'), null);
  assert.equal(publicHttpUrl('http://example.com:8080/'), null);
  assert.equal(isPublicIPv4('8.8.8.8'), true);
  assert.equal(publicHttpUrl('https://ufpi.br/')?.hostname, 'ufpi.br');
});

test('bloqueia IP privado antes de abrir conexão', async () => {
  await assert.rejects(fetchUpstream('http://127.0.0.1/'), /não permitida/);
  await assert.rejects(fetchUpstream('http://[::ffff:127.0.0.1]/'), /não permitida/);
});
