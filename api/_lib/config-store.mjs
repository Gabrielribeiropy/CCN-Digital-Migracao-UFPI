import { getJson, kvReady, setJson, storeProvider } from './kv-store.mjs';
import { councilSeed } from './council-seed.mjs';

const CONFIG_KEY = 'ccn-mobile:app-config:v1';
const LINK_ICONS = new Set(['school-outline', 'business-outline', 'people-outline', 'ribbon-outline', 'flask-outline', 'heart-outline', 'information-circle-outline', 'person-outline', 'folder-open-outline', 'chatbubbles-outline', 'megaphone-outline', 'location-outline', 'people-circle-outline', 'construct-outline', 'stats-chart-outline', 'briefcase-outline', 'document-text-outline', 'documents-outline', 'reader-outline', 'calendar-outline', 'book-outline', 'library-outline', 'medkit-outline', 'accessibility-outline', 'bus-outline', 'mail-outline', 'call-outline', 'globe-outline', 'shield-checkmark-outline', 'lock-closed-outline']);

export const defaultConfig = {
  newsEnabled: true,
  newsPresentation: { hiddenIds: [], pinnedIds: [] },
  manualNews: [],
  appUpdate: null,
  aboutContacts: {
    director: { name: 'Carlos Humberto Soares Júnior', email: 'humberto@ufpi.edu.br' },
    viceDirector: { name: 'Fábio Barros Britto', email: 'fbbritto@ufpi.edu.br' },
    technician: { name: 'Rayra Leal', email: 'ccn_diretoria@ufpi.edu.br' },
    receptionist: { name: 'Ilana Raquel Irene Miranda', email: 'ccn_diretoria@ufpi.edu.br' },
  },
  council: { members: councilSeed, placement: 'restricted' },
  pageGroupOrder: ['Vida acadêmica', 'Conheça o CCN', 'Informações e serviços', 'Busca e documentos', 'Outras páginas'],
  hiddenPageGroups: [],
  homeCards: [
    { id: 'page', title: 'Página', description: 'Conheça o CCN e encontre informações institucionais.', icon: 'document-text-outline', visible: true, order: 1, targetType: 'route', target: '/(tabs)/menu' },
    { id: 'location', title: 'Localização', description: 'Acesse o mapa e encontre espaços do Centro.', icon: 'location-outline', visible: true, order: 2, targetType: 'link', target: 'location' },
    { id: 'services', title: 'Serviços', description: 'Formulários, documentos e solicitações internas.', icon: 'briefcase-outline', visible: true, order: 3, targetType: 'route', target: '/servicos' },
    { id: 'restricted', title: 'Acesso restrito', description: 'Acesse os sistemas institucionais autorizados.', icon: 'lock-closed-outline', visible: true, order: 4, targetType: 'route', target: '/acesso-restrito' },
    { id: 'council', title: 'Conselho Departamental', description: 'Consulte a composição do Conselho por setor.', icon: 'people-outline', visible: true, order: 5, targetType: 'route', target: '/conselho-departamental' }
  ],
  integratedLinks: {
    location: { id: 'location', title: 'Localização do CCN', url: '', internal: true },
    services: { id: 'services', title: 'Formulários e Documentos', url: 'https://ufpi.br/formularios-e-documentos-ccn', internal: true },
    'service-auditorium': { id: 'service-auditorium', title: 'Reserva do Auditório Afonso Sena', url: 'https://ufpi.br/auditorios-ccn', internal: true, active: true, group: 'Serviços do CCN', order: 1 },
    'service-passages': { id: 'service-passages', title: 'Passagens e Diárias', url: 'https://ufpi.br/passagens-e-diarias-ccn', internal: true, active: true, group: 'Serviços do CCN', order: 2 },
    'service-transport': { id: 'service-transport', title: 'Transporte institucional', url: 'https://ufpi.br/formularios-e-documentos-ccn', internal: true, active: true, group: 'Serviços do CCN', order: 3 },
    'service-forms': { id: 'service-forms', title: 'Formulários CCN', url: 'https://ufpi.br/formularios-e-documentos-ccn', internal: true, active: true, group: 'Serviços do CCN', order: 4 },
    restricted: { id: 'restricted', title: 'Acesso restrito', url: '', internal: true, group: 'Acesso restrito', order: 1 },
    'restricted-classrooms': { id: 'restricted-classrooms', title: 'Sistema de Gerenciamento de Salas de Aula - CCN/UFPI', url: '', internal: true, active: true, group: 'Acesso restrito', order: 2 },
    'restricted-materials': { id: 'restricted-materials', title: 'Solicitação de materiais e serviços', url: '', internal: true, active: true, group: 'Acesso restrito', order: 3 }
  },
  updatedAt: '2026-09-24T15:00:00.000Z'
};

function cleanText(value, fallback = '', maxLength = 160) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return (normalized || fallback).slice(0, maxLength);
}

function normalizeNewsPresentation(value, strict = false) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const ids = (key) => {
    if (strict && (!Array.isArray(raw[key]) || raw[key].length > 100)) throw new Error('Confira a seleção de notícias.');
    return [...new Set((Array.isArray(raw[key]) ? raw[key] : []).filter(id => typeof id === 'string' && /^[a-z0-9-]{1,64}$/i.test(id)))].slice(0, 100);
  };
  const hiddenIds = ids('hiddenIds');
  return { hiddenIds, pinnedIds: ids('pinnedIds').filter(id => !hiddenIds.includes(id)) };
}

function normalizeHiddenPageGroups(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(group => typeof group === 'string' && group.length <= 60))].slice(0, 100);
}

function normalizeManualNews(value, strict = false) {
  if (strict && (!Array.isArray(value) || value.length > 50)) throw new Error('Limite de 50 notícias manuais.');
  const items = Array.isArray(value) ? value.slice(0, 50) : [];
  const normalized = items.flatMap((item) => {
    const id = String(item?.id || '');
    const title = cleanText(item?.title, '', 180);
    const excerpt = cleanText(item?.excerpt, '', 500);
    const body = typeof item?.body === 'string' ? item.body.trim().slice(0, 10000) : '';
    const date = new Date(item?.publishedIso || '');
    if (!/^manual-[a-z0-9-]{1,50}$/i.test(id) || !title || !excerpt || !body || Number.isNaN(date.getTime())) {
      if (strict) throw new Error('Informe título, resumo, texto e data de cada notícia manual.');
      return [];
    }
    return [{
      publishedIso: date.toISOString(),
      id, title, excerpt, body,
      imageUrl: cleanUrl(item?.imageUrl, { strict }),
      sourceUrl: cleanUrl(item?.sourceUrl, { strict }),
      active: item?.active !== false,
    }];
  });
  if (strict && new Set(normalized.map(item => item.id)).size !== normalized.length) throw new Error('Há notícias manuais repetidas.');
  return [...new Map(normalized.map(item => [item.id, item])).values()];
}

function normalizeAboutContacts(value, strict = false) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const contacts = {};
  for (const [key, fallback] of Object.entries(defaultConfig.aboutContacts)) {
    const item = input[key] && typeof input[key] === 'object' ? input[key] : {};
    if (strict && (Object.hasOwn(item, 'name') && !String(item.name || '').trim() || Object.hasOwn(item, 'email') && !String(item.email || '').trim())) throw new Error('Confira o nome e o e-mail de cada contato em Sobre.');
    const name = cleanText(item.name, fallback.name, 160);
    const email = cleanText(item.email, fallback.email, 254).toLowerCase();
    if (strict && (!name || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) throw new Error('Confira o nome e o e-mail de cada contato em Sobre.');
    contacts[key] = { name, email: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : fallback.email };
  }
  return contacts;
}

function cleanUrl(value, { strict = false } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    return parsed.toString().slice(0, 2048);
  } catch {
    if (strict) throw new Error('Informe somente URLs válidas iniciadas por http:// ou https://.');
    return '';
  }
}

function institutionalUrl(value, options) {
  const url = cleanUrl(value, options);
  if (!url) return url;
  const parsed = new URL(url);
  if (parsed.hostname.toLowerCase() === 'ccndigital.ufpi.br') parsed.protocol = 'https:';
  return parsed.toString();
}

function normalizeLink(id, value = {}, fallback = {}, strict = false) {
  const title = cleanText(value.title, fallback.title || id);
  const group = cleanText(value.group, fallback.group || 'Outras páginas', 60);
  if (strict && (title.includes('\uFFFD') || group.includes('\uFFFD'))) throw new Error('Há letras inválidas no título ou setor. Corrija o texto antes de salvar.');
  const url = institutionalUrl(value.url ?? fallback.url, { strict });
  if (strict && value.openMode === 'direct' && url && !url.startsWith('https://')) throw new Error('A abertura direta exige um endereço HTTPS.');
  return {
    ...fallback,
    id,
    title: title.includes('\uFFFD') && fallback.title ? fallback.title : title,
    ...(LINK_ICONS.has(value.icon) || LINK_ICONS.has(fallback.icon) || id.startsWith('custom-')
      ? { icon: LINK_ICONS.has(value.icon) ? value.icon : LINK_ICONS.has(fallback.icon) ? fallback.icon : 'document-text-outline' }
      : {}),
    url,
    internal: !id.startsWith('developer-'),
    openMode: ['app', 'direct', 'browser'].includes(value.openMode) ? value.openMode : ['app', 'direct', 'browser'].includes(fallback.openMode) ? fallback.openMode : (id.startsWith('developer-') ? 'browser' : 'app'),
    ...(value.group || fallback.group || id.startsWith('custom-') || id.startsWith('menu-') ? { group, order: Math.min(100, Math.max(1, Number(value.order ?? fallback.order) || 50)) } : {}),
    ...(typeof value.active === 'boolean' || typeof fallback.active === 'boolean'
      ? { active: typeof value.active === 'boolean' ? value.active : fallback.active !== false }
      : {}),
  };
}

function normalizeAppUpdate(value) {
  if (!value || typeof value !== 'object' || !cleanText(value.version)) return null;
  const version = cleanText(value.version, '', 32);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Informe a versão no formato 1.2.3.');
  const apkUrl = cleanUrl(value.apkUrl, { strict: true });
  if (value.required === true) {
    if (!apkUrl) throw new Error('Informe o link do APK antes de exigir a atualização.');
    const parsedApk = new URL(apkUrl);
    if (parsedApk.protocol !== 'https:' || !parsedApk.pathname.toLowerCase().endsWith('.apk')) throw new Error('A atualização obrigatória precisa de um link HTTPS para um arquivo APK.');
  }
  return {
    version,
    notes: cleanText(value.notes, '', 500),
    apkUrl,
    required: value.required === true,
    publishedAt: cleanText(value.publishedAt, new Date().toISOString(), 40),
  };
}

function normalizeCouncil(value, strict = false) {
  const raw = value && typeof value === 'object' ? value : {};
  const placement = raw.placement ?? defaultConfig.council.placement;
  if (strict && !['restricted', 'home', 'menu', 'services', 'location', 'hidden'].includes(placement)) throw new Error('Escolha um local válido para o Conselho.');
  const members = Array.isArray(raw.members) ? raw.members : defaultConfig.council.members;
  if (strict && members.length > 100) throw new Error('Limite de integrantes excedido.');
  const normalizedMembers = members.slice(0, 100).map((member) => {
    const item = member && typeof member === 'object' ? member : {};
    const id = cleanText(item.id, '', 64);
    const name = cleanText(item.name, '', 160).replace(/[\x00-\x1f\x7f]/g, ' ');
    const sector = cleanText(item.sector, '', 160).replace(/[\x00-\x1f\x7f]/g, ' ');
    const role = cleanText(item.role, '', 120).replace(/[\x00-\x1f\x7f]/g, ' ');
    const designation = cleanText(item.designation, '', 60).replace(/[\x00-\x1f\x7f]/g, ' ');
    const startDate = cleanText(item.startDate, '', 10);
    const endDate = cleanText(item.endDate, '', 10);
    const validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
    if (strict && (!/^[a-z0-9-]{1,64}$/i.test(id) || !name || !sector || (startDate && !validDate(startDate)) || (endDate && !validDate(endDate)) || (startDate && endDate && endDate < startDate))) throw new Error('Confira nome, setor e datas do mandato de cada integrante.');
    return { id, name, sector, role, designation, startDate, endDate };
  }).filter((item) => item.id && item.name && item.sector);
  if (strict && new Set(normalizedMembers.map((item) => item.id)).size !== normalizedMembers.length) throw new Error('Há integrantes com identificadores repetidos.');
  return { members: normalizedMembers, placement: ['restricted', 'home', 'menu', 'services', 'location', 'hidden'].includes(placement) ? placement : defaultConfig.council.placement };
}

export function normalizeConfig(value = {}) {
  const savedCards = new Map((Array.isArray(value.homeCards) ? value.homeCards : []).map((card) => [card.id, card]));
  const rawLinks = value.integratedLinks && typeof value.integratedLinks === 'object' ? value.integratedLinks : {};
  const integratedLinks = {};
  for (const [id, fallback] of Object.entries(defaultConfig.integratedLinks)) integratedLinks[id] = normalizeLink(id, rawLinks[id], fallback);
  for (const [id, link] of Object.entries(rawLinks).slice(0, 200)) {
    if (id.startsWith('developer-')) continue;
    if (/^[a-z0-9][a-z0-9-]{0,63}$/i.test(id) && !integratedLinks[id]) integratedLinks[id] = normalizeLink(id, link);
  }
  const requestedGroupOrder = Array.isArray(value.pageGroupOrder) ? value.pageGroupOrder : [];
  const pageGroupOrder = [...new Set([...requestedGroupOrder, ...defaultConfig.pageGroupOrder].filter((group) => typeof group === 'string' && group.length <= 60 && !group.includes('\uFFFD')))].slice(0, 100);
  return {
    ...defaultConfig,
    newsEnabled: typeof value.newsEnabled === 'boolean' ? value.newsEnabled : defaultConfig.newsEnabled,
    newsPresentation: normalizeNewsPresentation(value.newsPresentation),
    manualNews: normalizeManualNews(value.manualNews),
    appUpdate: normalizeAppUpdate(value.appUpdate),
    aboutContacts: normalizeAboutContacts(value.aboutContacts),
    council: normalizeCouncil(value.council),
    pageGroupOrder,
    hiddenPageGroups: normalizeHiddenPageGroups(value.hiddenPageGroups),
    homeCards: defaultConfig.homeCards.map((card) => {
      const saved = savedCards.get(card.id) || {};
      return { ...card, visible: typeof saved.visible === 'boolean' ? saved.visible : card.visible, order: Math.min(20, Math.max(1, Number.isFinite(Number(saved.order)) ? Math.trunc(Number(saved.order)) : card.order)) };
    }).sort((a, b) => a.order - b.order).map((card, index) => ({ ...card, order: index + 1 })),
    integratedLinks,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : defaultConfig.updatedAt,
  };
}

export async function readConfig() {
  if (!kvReady()) return defaultConfig;
  const saved = await getJson(CONFIG_KEY);
  return saved ? normalizeConfig(saved) : defaultConfig;
}

export async function saveConfig(payload) {
  if (!kvReady()) throw new Error('Configure o armazenamento persistente antes de salvar alterações pelo painel.');
  // Uma falha temporária na leitura não pode trocar a configuração salva pelos padrões.
  const stored = await getJson(CONFIG_KEY);
  const current = stored ? normalizeConfig(stored) : defaultConfig;
  const requestedLinks = payload.integratedLinks && typeof payload.integratedLinks === 'object' ? payload.integratedLinks : {};
  const integratedLinks = { ...current.integratedLinks };
  const removedLinkIds = Array.isArray(payload.removedLinkIds) ? payload.removedLinkIds : [];
  if (removedLinkIds.length > 200 || removedLinkIds.some((id) => typeof id !== 'string' || !/^custom-[a-z0-9-]{1,57}$/i.test(id))) throw new Error('Somente áreas criadas no painel podem ser excluídas.');
  for (const id of removedLinkIds) delete integratedLinks[id];
  for (const [id, link] of Object.entries(requestedLinks).slice(0, 200)) {
    if (removedLinkIds.includes(id)) continue;
    if (id.startsWith('developer-')) continue;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(id) || !link || typeof link !== 'object') throw new Error('Identificador de integração inválido.');
    integratedLinks[id] = normalizeLink(id, link, current.integratedLinks[id], true);
  }
  const next = normalizeConfig({
    ...current,
    newsEnabled: typeof payload.newsEnabled === 'boolean' ? payload.newsEnabled : current.newsEnabled,
    newsPresentation: Object.hasOwn(payload, 'newsPresentation') ? normalizeNewsPresentation(payload.newsPresentation, true) : current.newsPresentation,
    manualNews: Object.hasOwn(payload, 'manualNews') ? normalizeManualNews(payload.manualNews, true) : current.manualNews,
    appUpdate: Object.hasOwn(payload, 'appUpdate') ? payload.appUpdate : current.appUpdate,
    aboutContacts: Object.hasOwn(payload, 'aboutContacts') ? normalizeAboutContacts(payload.aboutContacts, true) : current.aboutContacts,
    council: Object.hasOwn(payload, 'council') ? normalizeCouncil(payload.council, true) : current.council,
    pageGroupOrder: Array.isArray(payload.pageGroupOrder) ? payload.pageGroupOrder : current.pageGroupOrder,
    hiddenPageGroups: Array.isArray(payload.hiddenPageGroups) ? normalizeHiddenPageGroups(payload.hiddenPageGroups) : current.hiddenPageGroups,
    homeCards: Array.isArray(payload.homeCards) ? payload.homeCards : current.homeCards,
    integratedLinks,
    updatedAt: new Date().toISOString(),
  });
  await setJson(CONFIG_KEY, next);
  return next;
}

export function storeStatus() { return { persistent: kvReady(), provider: storeProvider() }; }
