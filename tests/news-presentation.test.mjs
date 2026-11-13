import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../api/_lib/config-store.mjs';
import { presentNews } from '../api/_lib/news-presentation.mjs';

test('mantém o feed oficial, adiciona notícias do painel e respeita destaque e ocultação', () => {
  const manual = { id:'manual-abc', title:'Aviso do CCN', excerpt:'Resumo', body:'Primeiro parágrafo.\n\nSegundo parágrafo.', imageUrl:'', sourceUrl:'', publishedIso:'2026-11-11', active:true };
  const config = normalizeConfig({ manualNews:[manual], newsPresentation:{ hiddenIds:['oficial-1'], pinnedIds:['manual-abc'] } });
  const official = [
    { id:'oficial-1', title:'Oculta', publishedIso:'2026-11-12T10:00:00.000Z' },
    { id:'oficial-2', title:'Visível', publishedIso:'2026-11-10T10:00:00.000Z' },
  ];
  const result = presentNews(official, config.newsPresentation, config.manualNews);
  assert.deepEqual(result.map(item => item.id), ['manual-abc', 'oficial-2']);
  assert.deepEqual(result[0].body, ['Primeiro parágrafo.', 'Segundo parágrafo.']);
});

test('ocultar um setor remove sua exibição sem apagar os links salvos', () => {
  const config = normalizeConfig({ hiddenPageGroups:['Vida acadêmica'], integratedLinks:{ 'menu-0-0':{ id:'menu-0-0', title:'Graduação', url:'https://ufpi.br/graduacao-ccn', group:'Vida acadêmica' } } });
  assert.deepEqual(config.hiddenPageGroups, ['Vida acadêmica']);
  assert.ok(config.integratedLinks['menu-0-0']);
});
