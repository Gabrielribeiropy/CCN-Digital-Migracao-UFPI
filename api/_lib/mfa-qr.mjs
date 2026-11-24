import { toQR } from 'toqr';

// Gera a imagem no servidor local: a chave TOTP nunca passa por um serviço de QR externo.
export function mfaQrDataUrl(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('otpauth://totp/') || uri.length > 512) throw new Error('Cadastro TOTP inválido.');
  const pixels = toQR(uri);
  const size = Math.sqrt(pixels.length);
  if (!Number.isInteger(size) || size < 21 || size > 177) throw new Error('QR inválido.');
  const margin = 4;
  const total = size + margin * 2;
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pixels[y * size + x]) cells.push(`M${x + margin} ${y + margin}h1v1h-1z`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${total}v${total}H0z"/><path fill="#000" d="${cells.join('')}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
