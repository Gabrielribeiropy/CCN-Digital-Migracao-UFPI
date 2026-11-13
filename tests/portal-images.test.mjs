import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import { proxyHtml } from '../api/portal.mjs';

test('encaminha fotos institucionais para o proxy e preserva o layout móvel', () => {
  const html = '<html><head></head><body><main><img src="/images/CH.jpg" loading="lazy" srcset="/images/CH.jpg 2x"></main></body></html>';
  const rendered = proxyHtml(html, new URL('https://ufpi.br/diretoria-ccn'), 'https://painel.exemplo.edu.br');
  assert.match(rendered, /api\/media\?url=https%3A%2F%2Fufpi\.br%2Fimages%2FCH\.jpg/);
  assert.match(rendered, /data-ccn-original-src="https:\/\/ufpi\.br\/images\/CH\.jpg"/);
  assert.match(rendered, /img\.dataset\.ccnDirectAttempt='1';img\.removeAttribute\('srcset'\);img\.src=direct\.href/);
  assert.doesNotMatch(rendered, /srcset=|loading="lazy"/);
  assert.match(rendered, /max-width:100%/);
  assert.match(rendered, /scrollbar:horizontal\{height:0/);
});

test('não envia SVG decorativo para a rota de fotos raster', () => {
  const html = '<html><head></head><body><img src="/media/templates/site/govbr-ds/img/acesso_footer.svg"></body></html>';
  const rendered = proxyHtml(html, new URL('https://ufpi.br/diretoria-ccn'), 'https://painel.exemplo.edu.br');
  assert.match(rendered, /src="\/media\/templates\/site\/govbr-ds\/img\/acesso_footer\.svg"/);
  assert.doesNotMatch(rendered, /api\/media\?url=.*acesso_footer/);
});

test('substitui ícones ausentes por rótulos legíveis sem quebrar o script do portal', () => {
  const html = '<html><head></head><body><main><img src="/images/IMAGEN_LINK_PDF20180222144617.png" alt="IMAGEN LINK PDF20180222144617"></main></body></html>';
  const rendered = proxyHtml(html, new URL('https://ufpi.br/projeto-pedagogico-do-curso-preg'), 'https://painel.exemplo.edu.br');
  assert.match(rendered, /ccn-image-fallback/);
  assert.match(rendered, /Imagem indisponível na fonte oficial/);
  const bridge = rendered.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(bridge);
  assert.doesNotThrow(() => new Script(bridge));
});
