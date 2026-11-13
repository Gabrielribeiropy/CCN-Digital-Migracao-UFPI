import assert from 'node:assert/strict';
import test from 'node:test';
import { articleImageUrl, parseNews } from '../api/_lib/news-service.mjs';

test('recupera a foto da notícia no esquema da página oficial', () => {
  const html = '<script type="application/ld+json">{"@type":"Article","thumbnailUrl":"images/CCN/Imagens/THEoremas%202.png"}</script>';
  assert.equal(articleImageUrl(html), 'https://ufpi.br/images/CCN/Imagens/THEoremas%202.png');
});

test('ignora URL de página inicial usada como imagem e preserva foto válida', () => {
  const xml = `<rss><channel><item><title>Teste</title><link>https://ufpi.br/noticias-ccn/1</link><description><![CDATA[<p><img src="https://ufpi.br/" /></p>]]></description><pubDate>Wed, 21 Oct 2026 11:12:12 -0300</pubDate></item><item><title>Foto</title><link>https://ufpi.br/noticias-ccn/2</link><description><![CDATA[<img src="/images/CH.jpg" />]]></description><pubDate>Wed, 21 Oct 2026 11:12:12 -0300</pubDate></item></channel></rss>`;
  const news = parseNews(xml);
  assert.equal(news.find((item) => item.id === '1')?.imageUrl, '');
  assert.equal(news.find((item) => item.id === '2')?.imageUrl, 'https://ufpi.br/images/CH.jpg');
});
