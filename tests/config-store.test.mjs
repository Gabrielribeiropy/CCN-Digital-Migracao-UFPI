import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeConfig, readConfig, saveConfig } from '../api/_lib/config-store.mjs';

test('ordena os cards da tela inicial com posições únicas', () => {
  const config = normalizeConfig({ homeCards: [
    { id: 'page', order: 3 },
    { id: 'location', order: 2 },
    { id: 'services', order: 1 },
    { id: 'restricted', order: 4 },
  ] });
  assert.deepEqual(config.homeCards.map(({ id, order }) => [id, order]), [
    ['services', 1], ['location', 2], ['page', 3], ['restricted', 4], ['council', 5],
  ]);
});

test('contatos de Sobre mantêm os padrões e validam e-mails editados', () => {
  const initial = normalizeConfig();
  assert.equal(initial.aboutContacts.director.email, 'humberto@ufpi.edu.br');
  const changed = normalizeConfig({ aboutContacts: { director: { name: 'Diretor', email: 'diretor@ufpi.edu.br' } } });
  assert.equal(changed.aboutContacts.director.email, 'diretor@ufpi.edu.br');
  assert.equal(changed.aboutContacts.receptionist.email, 'ccn_diretoria@ufpi.edu.br');
});

test('o Conselho aparece somente no local escolhido e rejeita locais inválidos', () => {
  assert.equal(normalizeConfig().council.placement, 'restricted');
  assert.equal(normalizeConfig({ council: { placement: 'home' } }).council.placement, 'home');
  assert.equal(normalizeConfig({ council: { placement: 'menu' } }).council.placement, 'menu');
  assert.equal(normalizeConfig({ council: { placement: 'services' } }).council.placement, 'services');
  assert.equal(normalizeConfig({ council: { placement: 'location' } }).council.placement, 'location');
  assert.equal(normalizeConfig({ council: { placement: 'outro' } }).council.placement, 'restricted');
});

test('preserva o modo de abertura dos links criados em cada setor', () => {
  const config = normalizeConfig({ integratedLinks: {
    'custom-busca': { id: 'custom-busca', title: 'Documento', url: 'https://ufpi.br/documento', group: 'Busca e documentos', openMode: 'app' },
    'custom-servico': { id: 'custom-servico', title: 'Reserva', url: 'https://exemplo.org/reserva', group: 'Serviços do CCN', openMode: 'app' },
    'custom-restrito': { id: 'custom-restrito', title: 'Sistema', url: 'https://exemplo.org/sistema', group: 'Acesso restrito', openMode: 'browser' },
    'custom-direto': { id: 'custom-direto', title: 'Sistema novo', url: 'https://novo.ufpi.br/login', group: 'Acesso restrito', openMode: 'direct' },
  } });
  assert.equal(config.integratedLinks['custom-busca'].group, 'Busca e documentos');
  assert.equal(config.integratedLinks['custom-servico'].openMode, 'app');
  assert.equal(config.integratedLinks['custom-restrito'].openMode, 'browser');
  assert.equal(config.integratedLinks['custom-direto'].openMode, 'direct');
});

test('corrige o endereço HTTP antigo do sistema de salas sem perder a rota do mapa', () => {
  const config = normalizeConfig({ integratedLinks: {
    location: { url: 'https://ccndigital.ufpi.br/#/mapa', openMode: 'app' },
    'restricted-classrooms': { url: 'http://ccndigital.ufpi.br/', openMode: 'app' },
  } });
  assert.equal(config.integratedLinks.location.url, 'https://ccndigital.ufpi.br/#/mapa');
  assert.equal(config.integratedLinks['restricted-classrooms'].url, 'https://ccndigital.ufpi.br/');
});

test('mantém apenas ícones conhecidos nos novos links', () => {
  const config = normalizeConfig({ integratedLinks: {
    'custom-apoio': { title: 'Apoio aos discentes', icon: 'heart-outline', group: 'Busca e documentos', url: 'https://ufpi.br/apoio-aos-discentes-ccn' },
    'custom-invalid': { title: 'Outro', icon: 'not-an-icon', group: 'Busca e documentos', url: 'https://ufpi.br/' },
  } });
  assert.equal(config.integratedLinks['custom-apoio'].icon, 'heart-outline');
  assert.equal(config.integratedLinks['custom-invalid'].icon, 'document-text-outline');
  assert.equal(config.integratedLinks['service-auditorium'].icon, undefined);
});

test('só aceita atualização obrigatória com APK HTTPS', () => {
  assert.throws(() => normalizeConfig({ appUpdate: { version: '0.2.0', required: true, apkUrl: 'https://exemplo.org/pagina' } }), /APK/);
  assert.throws(() => normalizeConfig({ appUpdate: { version: '0.2.0', required: true, apkUrl: '' } }), /APK/);
  const config = normalizeConfig({ appUpdate: { version: '0.2.0', required: true, apkUrl: 'https://expo.dev/ccn.apk' } });
  assert.equal(config.appUpdate.required, true);
});

test('preserva a ordem escolhida dos setores e mantém Vida acadêmica no topo por padrão', () => {
  const initial = normalizeConfig();
  assert.equal(initial.pageGroupOrder[0], 'Vida acadêmica');
  const moved = normalizeConfig({ pageGroupOrder: ['Conheça o CCN', 'Vida acadêmica'] });
  assert.deepEqual(moved.pageGroupOrder.slice(0, 2), ['Conheça o CCN', 'Vida acadêmica']);
});

test('recupera títulos padrão gravados com caracteres quebrados', () => {
  const config = normalizeConfig({ integratedLinks: {
    'service-auditorium': { title: 'Reserva do Audit\uFFFDório Afonso Sena' },
    'restricted-materials': { title: 'Solicita\uFFFD\uFFFDão de material e servi\uFFFDços' },
  } });
  assert.equal(config.integratedLinks['service-auditorium'].title, 'Reserva do Auditório Afonso Sena');
  assert.equal(config.integratedLinks['restricted-materials'].title, 'Solicitação de materiais e serviços');
});

test('não sobrescreve configuração quando a leitura do banco falha', async () => {
  const oldUrl = process.env.KV_REST_API_URL;
  const oldToken = process.env.KV_REST_API_TOKEN;
  const oldFetch = globalThis.fetch;
  let calls = 0;
  try {
    process.env.KV_REST_API_URL = 'https://example.invalid/redis';
    process.env.KV_REST_API_TOKEN = 'local-test-token';
    globalThis.fetch = async () => { calls += 1; return new Response('', { status: 503 }); };
    await assert.rejects(saveConfig({ homeCards: [] }), /indisponível/);
    assert.equal(calls, 1);
  } finally {
    if (oldUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = oldUrl;
    if (oldToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = oldToken;
    globalThis.fetch = oldFetch;
  }
});

test('não troca links salvos pelos padrões quando o banco fica indisponível', async () => {
  const oldUrl = process.env.KV_REST_API_URL;
  const oldToken = process.env.KV_REST_API_TOKEN;
  const oldFetch = globalThis.fetch;
  try {
    process.env.KV_REST_API_URL = 'https://example.invalid/redis';
    process.env.KV_REST_API_TOKEN = 'local-test-token';
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(readConfig(), /indisponível/);
  } finally {
    if (oldUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = oldUrl;
    if (oldToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = oldToken;
    globalThis.fetch = oldFetch;
  }
});
