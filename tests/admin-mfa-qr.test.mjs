import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toQR } from 'toqr';
import { mfaQrDataUrl } from '../api/_lib/mfa-qr.mjs';
import { provisioningUri } from '../api/_lib/admin-mfa.mjs';

test('QR de cadastro representa a mesma matriz TOTP e mantém margem legível', () => {
  const uri = provisioningUri('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', 'secretaria@ufpi.edu.br');
  const svg = Buffer.from(mfaQrDataUrl(uri).split(',')[1], 'base64').toString('utf8');
  const matrix = toQR(uri);
  const size = Math.sqrt(matrix.length);
  assert.match(svg, new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
  const pixels = [...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(([, x, y]) => `${x},${y}`);
  const expected = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (matrix[y * size + x]) expected.push(`${x + 4},${y + 4}`);
  assert.deepEqual(pixels, expected);
  assert.throws(() => mfaQrDataUrl('https://example.com/secret'));
});
