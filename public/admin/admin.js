const login = document.querySelector('#login');
const panel = document.querySelector('#panel');
const message = document.querySelector('#config-message');
const form = document.querySelector('#config-form');
let config;
let activeView = 'overview';
let dirty = false;
let currentRole = 'admin';
let sessionAccountId = null;
let allowedAreas = [];
let editingUserId = null;
let mailAvailable = false;
let manualLinkTimeout;
let lastDiagnostics = null;
let officialNewsItems = [];
const removedLinks = new Map();

const views = {
  overview: ['PAINEL', 'Visão geral', 'Acompanhe o conteúdo do aplicativo e escolha o que deseja editar.'],
  home: ['APARÊNCIA', 'Início do app', 'Escolha os cards da primeira tela e configure a localização.'],
  pages: ['CONTEÚDO', 'Páginas e busca', 'Atualize as páginas oficiais e os documentos que as pessoas encontram no app.'],
  services: ['ATENDIMENTO', 'Serviços', 'Organize reservas, solicitações e outros serviços do CCN.'],
  restricted: ['SISTEMAS', 'Acesso restrito', 'Gerencie os sistemas destinados ao público autorizado.'],
  council: ['GESTÃO', 'Conselho Departamental', 'Cadastre a composição e os avisos de término de mandato.'],
  news: ['COMUNICAÇÃO', 'Notícias', 'Acompanhe o portal oficial e publique notícias pelo painel.'],
  settings: ['APLICATIVO', 'Configurações', 'Contatos da página Sobre e atualização Android.'],
  users: ['ADMINISTRAÇÃO', 'Usuários e permissões', 'Gerencie o acesso da secretaria e dos demais setores.'],
  diagnostics: ['DESENVOLVEDOR', 'Funcionamento', 'Verifique os componentes e baixe um relatório técnico.'],
};
const coreLinks = [
  ['location', 'Localização', 'URL do projeto de localização'],
  ['restricted', 'Acesso restrito', 'URL do sistema principal'],
  ['restricted-classrooms', 'Gerenciamento de salas de aula', 'URL do sistema de salas'],
  ['restricted-materials', 'Solicitação de materiais e serviços', 'URL da solicitação'],
];
const serviceLinks = [
  ['service-auditorium', 'Reserva do Auditório Afonso Sena'],
  ['service-passages', 'Passagens e diárias'],
  ['service-transport', 'Transporte institucional'],
  ['service-forms', 'Formulários CCN'],
];
const menuDefaults = [
  ['Vida acadêmica', [['Graduação','https://ufpi.br/graduacao-ccn'],['Departamentos','https://ufpi.br/departamentos-ccn'],['Coordenações','https://ufpi.br/coordenacoes-ccn'],['Pós-graduação','https://ufpi.br/pos-graduacao-ccn'],['Extensão','https://ufpi.br/extensao-ccn'],['Apoio aos discentes','https://ufpi.br/apoio-aos-discentes-ccn']]],
  ['Conheça o CCN', [['Sobre o CCN','https://ufpi.br/sobre-o-ccn'],['Diretoria','https://ufpi.br/diretoria-ccn'],['Secretaria','https://ufpi.br/secretaria-ccn'],['Ouvidoria','https://ufpi.br/ouvidoria-ccn'],['Centros Acadêmicos','https://ufpi.br/centros-ccn']]],
  ['Informações e serviços', [['Espaços','https://ufpi.br/auditorios-ccn'],['Conselho Departamental','https://ufpi.br/conselheiros-ccn'],['Serviços','https://ufpi.br/formularios-e-documentos-ccn'],['Transparência','https://ufpi.br/relatorio-de-atividades-ccn'],['Assessorias','https://ufpi.br/ensino-ccn']]],
];
const catalogDefaults = [
  ['ppc-cursos','PPC — Projetos Pedagógicos dos Cursos','https://ufpi.br/projeto-pedagogico-do-curso-preg'],
  ['ppc-ciencias-natureza','PPC Ciências da Natureza','https://www.ufpi.br/images/Documentos%20CDAC/PPC%20LIC.%20CINCIAS%20DA%20NATUREZA.pdf'],
  ['ppc-computacao','PPC Ciência da Computação','https://ufpi.br/arquivos_download/arquivos/CCN/DOCUMENTOS_CURSOS/computacao_NDE_PP_2020.5.v4_PPC.pdf'],
  ['portarias','Portarias do CCN','https://ufpi.br/portarias-ccn-ufpi'],
  ['atas','Atas do Conselho Departamental','https://ufpi.br/atas-ccn'],
];
const areaDestinations = [
  ['Busca e documentos', 'Somente na busca'],
  ['Serviços do CCN', 'Serviços'],
  ['Acesso restrito', 'Acesso restrito'],
  ['Vida acadêmica', 'Página · Vida acadêmica'],
  ['Conheça o CCN', 'Página · Conheça o CCN'],
  ['Informações e serviços', 'Página · Informações e serviços'],
  ['Outras páginas', 'Página · Outras páginas'],
];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const appIcons = [
  ['document-text-outline', 'Documento'], ['school-outline', 'Graduação'], ['book-outline', 'Estudos'],
  ['library-outline', 'Biblioteca'], ['people-outline', 'Pessoas'], ['heart-outline', 'Apoio'],
  ['accessibility-outline', 'Acessibilidade'], ['business-outline', 'Departamento'], ['ribbon-outline', 'Pós-graduação'],
  ['flask-outline', 'Pesquisa'], ['briefcase-outline', 'Serviço'], ['calendar-outline', 'Agenda'],
  ['bus-outline', 'Transporte'], ['location-outline', 'Localização'], ['medkit-outline', 'Saúde'],
  ['mail-outline', 'E-mail'], ['call-outline', 'Telefone'], ['globe-outline', 'Site'],
  ['shield-checkmark-outline', 'Segurança'], ['lock-closed-outline', 'Acesso restrito'],
  ['folder-open-outline', 'Arquivos'], ['chatbubbles-outline', 'Atendimento'], ['megaphone-outline', 'Avisos'],
  ['documents-outline', 'Documentos'], ['reader-outline', 'Leitura'], ['information-circle-outline', 'Informações'],
  ['person-outline', 'Pessoa'], ['people-circle-outline', 'Equipe'], ['construct-outline', 'Manutenção'],
  ['stats-chart-outline', 'Dados'],
];

function areaLocationField(link) {
  const id = escapeHtml(link.id);
  const current = link.group || 'Outras páginas';
  const known = areaDestinations.some(([value]) => value === current);
  const options = areaDestinations.map(([value, label]) => `<option value="${escapeHtml(value)}" ${current === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  return `<label>Onde aparecer<select data-link-group="${id}">${options}${known ? '' : `<option value="${escapeHtml(current)}" selected>Página · ${escapeHtml(current)}</option>`}<option value="__new__">Criar novo setor na Página…</option></select></label><label data-new-group-wrapper="${id}" hidden>Nome do novo setor<input data-link-new-group="${id}" maxlength="60" placeholder="Ex.: Setor de limpeza"></label>`;
}

// Mensagem de status com tom visual: 'error' (vermelho), 'success' (verde), 'progress' (cinza).
function say(element, text, tone = '') {
  element.textContent = text;
  if (tone) element.dataset.tone = tone; else delete element.dataset.tone;
}

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Não foi possível concluir.');
    error.secondFactorRequired = body.secondFactorRequired === true;
    throw error;
  }
  return body;
}

async function loadNotifications() {
  const status = document.querySelector('#notifications-status');
  const list = document.querySelector('#notifications-list');
  const count = document.querySelector('#notifications-count');
  try {
    const { items } = await request('/api/admin/notifications');
    count.hidden = items.length === 0;
    count.textContent = items.length > 99 ? '99+' : String(items.length);
    status.textContent = items.length ? `${items.length} ${items.length === 1 ? 'aviso pendente' : 'avisos pendentes'}.` : 'Nenhum aviso pendente. Novos prazos aparecerão aqui.';
    list.innerHTML = items.map(item => `<div class="notification-item"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.sector)} · ${item.daysLeft === 0 ? 'termina hoje' : item.daysLeft === 1 ? 'termina amanhã' : `faltam ${item.daysLeft} dias`} · ${escapeHtml(item.endDate.split('-').reverse().join('/'))}</span><button type="button" data-notification-seen="${escapeHtml(item.id)}">Marcar como visto</button></div>`).join('');
  } catch {
    count.hidden = true;
    list.textContent = '';
    status.textContent = 'Não foi possível verificar os mandatos agora.';
  }
}

function ensureDefaults() {
  config.integratedLinks ||= {};
  for (const [id, title] of coreLinks) config.integratedLinks[id] ||= { id, title, url:'', internal:true };
  for (const [id, title] of serviceLinks) config.integratedLinks[id] ||= { id, title, url:'', internal:true, active:true };
  menuDefaults.forEach(([group, items], groupIndex) => items.forEach(([title, url], itemIndex) => {
    const id = `menu-${groupIndex}-${itemIndex}`;
    config.integratedLinks[id] ||= { id, title, url, group, order:itemIndex+1, active:true, internal:true };
  }));
  catalogDefaults.forEach(([id, title, url], index) => {
    config.integratedLinks[id] ||= { id, title, url, group:'Busca e documentos', order:index+1, active:true, internal:true };
  });
}

function editor(link, { category = '', activation = false, order = false, group = false, deletable = false, iconName = 'pages' } = {}) {
  const id = escapeHtml(link.id);
  const title = escapeHtml(link.title);
  const section = escapeHtml(category || link.group || '');
  const state = link.active === false ? '<span class="item-state off">Inativo</span>' : '<span class="item-state">Ativo</span>';
  const search = escapeHtml(`${link.title} ${link.group || ''} ${category}`.toLocaleLowerCase('pt-BR'));
  return `<details class="editor-item" data-search="${search}" data-editor-id="${id}">
    <summary><button type="button" class="drag-handle" draggable="true" data-drag-link="${id}" aria-label="Arrastar ${title} para mudar a ordem" title="Arraste para mudar a ordem">${icon('grip')}</button><span class="item-icon">${icon(iconName)}</span><span class="item-heading"><strong>${title}</strong><small>${section}</small></span>${activation ? state : ''}<span class="item-chevron" aria-hidden="true"></span></summary>
    <div class="editor-body">
      ${activation ? `<div class="switch-line"><div><strong>Exibir no aplicativo</strong><small>Desative para ocultar sem perder o endereço.</small></div><label class="switch" aria-label="Ativar ${title}"><input data-link-active="${id}" type="checkbox" ${link.active !== false ? 'checked' : ''}><span></span></label></div>` : ''}
      <div class="field-grid">
        <label>Nome exibido<input data-link-title="${id}" value="${title}" maxlength="160"></label>
        ${id.startsWith('custom-') ? `<label>Ícone do aplicativo<select data-link-icon="${id}">${appIcons.map(([value, label]) => `<option value="${value}" ${link.icon === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>` : ''}
        ${group ? areaLocationField(link) : ''}
        <label class="field-full">Endereço da página<input data-link="${id}" type="url" inputmode="url" placeholder="https://..." value="${escapeHtml(link.url)}"></label>
        ${id.startsWith('developer-') ? '' : `<label class="field-full">Onde abrir<select data-link-mode="${id}"><option value="app" ${(link.openMode || 'app') === 'app' ? 'selected' : ''}>Dentro do aplicativo</option><option value="direct" ${link.openMode === 'direct' ? 'selected' : ''}>Abrir diretamente no aplicativo</option><option value="browser" ${link.openMode === 'browser' ? 'selected' : ''}>Navegador do celular</option></select><small>Use a abertura direta quando um sistema não funcionar na visualização integrada. O site precisa permitir exibição no aplicativo.</small></label>`}
      </div>
      ${deletable ? `<div class="editor-actions"><button type="button" class="delete-button" data-delete-link="${id}">Excluir esta área</button></div>` : ''}
    </div>
  </details>`;
}

function renderManualNews() {
  config.manualNews ||= [];
  document.querySelector('#manual-news-list').innerHTML = config.manualNews.length ? config.manualNews.map(item => `<details class="editor-item" data-manual-news="${escapeHtml(item.id)}"><summary><span class="item-icon">${icon('news')}</span><span class="item-heading"><strong>${escapeHtml(item.title || 'Nova notícia')}</strong><small>${escapeHtml(item.publishedIso?.slice(0, 10) || 'Data não informada')} · ${item.active === false ? 'Oculta' : 'Visível'}</small></span><span class="item-chevron" aria-hidden="true"></span></summary><div class="editor-body"><div class="field-grid"><label>Título<input data-news-field="title" maxlength="180" value="${escapeHtml(item.title || '')}" required></label><label>Data<input data-news-field="publishedIso" type="date" value="${escapeHtml(item.publishedIso?.slice(0, 10) || '')}" required></label><label class="field-full">Resumo<input data-news-field="excerpt" maxlength="500" value="${escapeHtml(item.excerpt || '')}" required></label><label class="field-full">Texto da notícia<textarea data-news-field="body" rows="6" maxlength="10000" required>${escapeHtml(item.body || '')}</textarea></label><label class="field-full">URL da imagem (opcional)<input data-news-field="imageUrl" type="url" value="${escapeHtml(item.imageUrl || '')}" placeholder="https://..."></label><label class="field-full">Página oficial (opcional)<input data-news-field="sourceUrl" type="url" value="${escapeHtml(item.sourceUrl || '')}" placeholder="https://..."></label><label class="news-check"><input data-news-field="active" type="checkbox" ${item.active === false ? '' : 'checked'}> Exibir no aplicativo</label></div><div class="editor-actions"><button type="button" class="secondary-button" data-news-pin="${escapeHtml(item.id)}">${config.newsPresentation?.pinnedIds?.includes(item.id) ? 'Remover destaque' : 'Destacar'}</button><button type="button" class="delete-button" data-remove-manual-news="${escapeHtml(item.id)}">Excluir notícia</button></div></div></details>`).join('') : '<p class="empty-editor">Nenhuma notícia criada no painel. As notícias oficiais continuam automáticas.</p>';
}

function renderOfficialNews() {
  const hidden = new Set(config.newsPresentation?.hiddenIds || []);
  const pinned = new Set(config.newsPresentation?.pinnedIds || []);
  document.querySelector('#official-news-list').innerHTML = officialNewsItems.length ? officialNewsItems.map(item => `<div class="official-news-row"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.publishedAt)}</small></div><div class="official-news-actions"><button type="button" data-news-pin="${escapeHtml(item.id)}" aria-pressed="${pinned.has(item.id)}" ${currentRole === 'viewer' ? 'disabled' : ''}>${pinned.has(item.id) ? 'Remover destaque' : 'Destacar'}</button><button type="button" data-news-hide="${escapeHtml(item.id)}" aria-pressed="${hidden.has(item.id)}" ${currentRole === 'viewer' ? 'disabled' : ''}>${hidden.has(item.id) ? 'Mostrar' : 'Ocultar'}</button></div></div>`).join('') : '<p class="empty-editor">Nenhuma notícia oficial disponível agora.</p>';
}

function render() {
  ensureDefaults();
  config.council ||= { members: [], placement: 'restricted' };
  document.querySelector('#council-placement').value = config.council.placement || 'restricted';
  const councilSectors = new Map();
  for (const member of config.council.members) {
    const sector = member.sector || 'Novo setor';
    if (!councilSectors.has(sector)) councilSectors.set(sector, []);
    councilSectors.get(sector).push(member);
  }
  const memberEditor = (member) => `<details class="editor-item" data-council-id="${escapeHtml(member.id)}" data-council-search="${escapeHtml(`${member.name} ${member.sector} ${member.role}`.toLocaleLowerCase('pt-BR'))}"><summary><span class="item-icon">${icon('pages')}</span><span class="item-heading"><strong>${escapeHtml(member.name || 'Novo integrante')}</strong><small>${escapeHtml(member.role || 'Função não informada')}</small></span><span class="item-chevron" aria-hidden="true"></span></summary><div class="editor-body"><div class="field-grid"><label>Nome<input data-council-field="name" maxlength="160" value="${escapeHtml(member.name)}" required></label><label>Setor<input data-council-field="sector" maxlength="160" value="${escapeHtml(member.sector)}" list="council-sectors" required></label><label>Função<input data-council-field="role" maxlength="120" value="${escapeHtml(member.role)}"></label><label>Ato de designação<input data-council-field="designation" maxlength="60" value="${escapeHtml(member.designation || '')}"></label><label>Início do mandato<input data-council-field="startDate" type="date" value="${escapeHtml(member.startDate)}"></label><label>Fim do mandato<input data-council-field="endDate" type="date" value="${escapeHtml(member.endDate)}"></label></div><div class="editor-actions"><button type="button" class="delete-button" data-remove-council="${escapeHtml(member.id)}">Remover integrante</button></div></div></details>`;
  document.querySelector('#council-members').innerHTML = [...councilSectors].map(([sector, members]) => `<details class="page-group council-sector" data-council-sector="${escapeHtml(sector)}"><summary><span>${escapeHtml(sector)}</span><small>${members.length} ${members.length === 1 ? 'integrante' : 'integrantes'}</small><span class="item-chevron" aria-hidden="true"></span></summary><div class="page-group-items">${members.map(memberEditor).join('')}<button type="button" class="secondary-button add-in-sector" data-add-council-sector="${escapeHtml(sector)}">+ Adicionar integrante neste setor</button></div></details>`).join('') + '<datalist id="council-sectors">' + [...councilSectors.keys()].filter(sector => sector !== 'Novo setor').map(sector => `<option value="${escapeHtml(sector)}"></option>`).join('') + '</datalist>';
  document.querySelector('#news-enabled').checked = config.newsEnabled;
  renderManualNews();
  renderOfficialNews();
  document.querySelector('#release-version').value = config.appUpdate?.version || '';
  document.querySelector('#release-notes').value = config.appUpdate?.notes || '';
  document.querySelector('#release-url').value = config.appUpdate?.apkUrl || '';
  document.querySelector('#release-required').checked = config.appUpdate?.required === true;
  for (const key of ['director', 'viceDirector', 'technician', 'receptionist']) {
    document.querySelector(`[data-about-name="${key}"]`).value = config.aboutContacts?.[key]?.name || '';
    document.querySelector(`[data-about-email="${key}"]`).value = config.aboutContacts?.[key]?.email || '';
  }
  document.querySelector('#cards').innerHTML = [...config.homeCards].filter(card => card.id !== 'council' || config.council.placement === 'home').sort((a,b)=>a.order-b.order).map(card =>
    `<div class="home-row" data-home-card="${escapeHtml(card.id)}"><button type="button" class="drag-handle" draggable="true" data-drag-card="${escapeHtml(card.id)}" aria-label="Arrastar ${escapeHtml(card.title)} para mudar a ordem" title="Arraste para mudar a ordem">${icon('grip')}</button><div><strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(card.description)}</small></div><label class="switch" aria-label="Exibir ${escapeHtml(card.title)}"><input data-card-visible="${escapeHtml(card.id)}" type="checkbox" ${card.visible?'checked':''}><span></span></label></div>`
  ).join('');
  const location = config.integratedLinks.location;
  document.querySelector('#location-link').innerHTML = `<label>Endereço do mapa<input data-link="location" type="url" inputmode="url" placeholder="https://..." value="${escapeHtml(location.url)}"></label><label>Onde abrir<select data-link-mode="location"><option value="app" ${(location.openMode || 'app') === 'app' ? 'selected' : ''}>Dentro do aplicativo</option><option value="direct" ${location.openMode === 'direct' ? 'selected' : ''}>Abrir diretamente no aplicativo</option><option value="browser" ${location.openMode === 'browser' ? 'selected' : ''}>Navegador do celular</option></select></label>`;
  const catalogIds = new Set(catalogDefaults.map(([id]) => id));
  const added = Object.values(config.integratedLinks).filter(link => link.id.startsWith('custom-'));
  const pageLinks = added.filter(link => !['Serviços do CCN', 'Acesso restrito'].includes(link.group));
  const pages = Object.values(config.integratedLinks).filter(link => link.id.startsWith('menu-') || catalogIds.has(link.id)).concat(pageLinks).sort((a,b)=>(a.order||0)-(b.order||0));
  const pageGroups = new Map();
  for (const link of pages) { const group = link.group || 'Outras páginas'; if (!pageGroups.has(group)) pageGroups.set(group, []); pageGroups.get(group).push(link); }
  config.pageGroupOrder ||= ['Vida acadêmica', 'Conheça o CCN', 'Informações e serviços', 'Busca e documentos', 'Outras páginas'];
  for (const group of pageGroups.keys()) if (!config.pageGroupOrder.includes(group)) config.pageGroupOrder.push(group);
  const orderedGroups = [...pageGroups].sort((a,b)=>config.pageGroupOrder.indexOf(a[0])-config.pageGroupOrder.indexOf(b[0]));
  document.querySelector('#pages').innerHTML = orderedGroups.map(([group, items]) => `<details class="page-group" data-drop-group="${escapeHtml(group)}"><summary><button type="button" class="drag-handle" draggable="true" data-drag-group="${escapeHtml(group)}" aria-label="Arrastar o setor ${escapeHtml(group)}" title="Arraste para mudar a ordem">${icon('grip')}</button><span>${escapeHtml(group)}</span><small>${items.length} ${items.length === 1 ? 'item' : 'itens'}</small><button type="button" class="group-visibility" data-toggle-group="${escapeHtml(group)}" aria-pressed="${config.hiddenPageGroups?.includes(group) ? 'true' : 'false'}">${config.hiddenPageGroups?.includes(group) ? 'Oculto' : 'Visível'}</button><span class="item-chevron" aria-hidden="true"></span></summary><div class="page-group-items">${items.map(link => editor(link, { category:link.group, activation:true, group:link.id.startsWith('custom-'), deletable:link.id.startsWith('custom-') })).join('')}<button type="button" class="secondary-button add-in-sector" data-add-link-group="${escapeHtml(group)}">+ Novo link neste setor</button></div></details>`).join('');
  const services = [...serviceLinks.map(([id]) => config.integratedLinks[id]), ...added.filter(link => link.group === 'Serviços do CCN')].sort((a,b)=>(a.order||50)-(b.order||50));
  document.querySelector('#service-links').innerHTML = services.map(link => editor(link, { category:link.id.startsWith('custom-') ? link.group : 'Serviço interno', activation:true, group:link.id.startsWith('custom-'), deletable:link.id.startsWith('custom-'), iconName:'service' })).join('');
  const restricted = [...coreLinks.filter(([id]) => id === 'restricted-classrooms' || id === 'restricted-materials').map(([id]) => config.integratedLinks[id]), ...added.filter(link => link.group === 'Acesso restrito')].sort((a,b)=>(a.order||50)-(b.order||50));
  document.querySelector('#restricted-links').innerHTML = restricted.map(link => editor(link, { category:link.id.startsWith('custom-') ? link.group : 'Sistema autorizado', activation:link.id !== 'restricted', group:link.id.startsWith('custom-'), deletable:link.id.startsWith('custom-'), iconName:'lock' })).join('');
  const pendingRemovals = document.querySelector('#removed-links');
  pendingRemovals.hidden = removedLinks.size === 0;
  pendingRemovals.innerHTML = removedLinks.size ? `<div class="section-intro"><h2>Exclusões pendentes</h2><p>Estes links só serão excluídos quando você salvar.</p></div>${[...removedLinks].map(([id, link]) => `<div class="pending-delete"><span><strong>${escapeHtml(link.title)}</strong> será excluído ao salvar.</span><button type="button" data-undo-delete="${escapeHtml(id)}">Desfazer</button></div>`).join('')}` : '';
  filterPages();
  filterCouncil();
}

function filterCouncil() {
  const term = document.querySelector('#council-filter').value.trim().toLocaleLowerCase('pt-BR');
  document.querySelectorAll('[data-council-id]').forEach((row) => { row.hidden = Boolean(term) && !row.dataset.councilSearch.includes(term); });
  document.querySelectorAll('[data-council-sector]').forEach((sector) => {
    const sectorMatches = sector.dataset.councilSector.toLocaleLowerCase('pt-BR').includes(term);
    if (term && sectorMatches) sector.querySelectorAll('[data-council-id]').forEach((row) => { row.hidden = false; });
    sector.hidden = Boolean(term) && !sectorMatches && !sector.querySelector('[data-council-id]:not([hidden])');
    if (term && !sector.hidden) sector.open = true;
  });
}

function showView(view) {
  if (!views[view]) return;
  if (currentRole === 'developer' && view !== 'diagnostics') return;
  if (currentRole !== 'developer' && view === 'diagnostics') return;
  if (['users'].includes(view) && currentRole !== 'admin') return;
  if (['editor', 'viewer'].includes(currentRole) && !['overview', 'users'].includes(view) && !allowedAreas.includes(view)) return;
  activeView = view;
  document.querySelectorAll('[data-view-panel]').forEach(section => { section.hidden = section.dataset.viewPanel !== view; });
  document.querySelectorAll('#panel-nav [data-view]').forEach(button => {
    const selected = button.dataset.view === view;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const [kicker, title, description] = views[view];
  document.querySelector('#view-kicker').textContent = kicker;
  document.querySelector('#view-title').textContent = title;
  document.querySelector('#view-description').textContent = description;
  document.querySelector('#breadcrumb-current').textContent = title;
  if (view === 'users') void loadUsers();
  window.scrollTo({ top:0, behavior:'instant' });
}

function setDirty(value) {
  dirty = value;
  document.querySelector('#save-bar').hidden = !value;
  document.querySelector('#save-title').textContent = value ? 'Alterações não salvas' : 'Tudo salvo';
  document.querySelector('#save-detail').textContent = value ? 'Salve para atualizar o aplicativo.' : 'As configurações estão sincronizadas.';
  if (value) say(message, '');
}

function filterPages() {
  const term = (document.querySelector('#page-filter').value || '').trim().toLocaleLowerCase('pt-BR');
  document.querySelectorAll('#pages .editor-item').forEach(item => { item.hidden = Boolean(term) && !item.dataset.search.includes(term); });
  document.querySelectorAll('#pages .page-group').forEach(group => {
    const hasMatches = Boolean(group.querySelector('.editor-item:not([hidden])'));
    group.hidden = Boolean(term) && !hasMatches;
    if (term && hasMatches) group.open = true;
  });
}

function readFormIntoConfig() {
  config.manualNews = [...document.querySelectorAll('[data-manual-news]')].map(row => ({
    id: row.dataset.manualNews,
    ...Object.fromEntries([...row.querySelectorAll('[data-news-field]')].map(field => [field.dataset.newsField, field.type === 'checkbox' ? field.checked : field.value.trim()])),
  }));
  config.aboutContacts = Object.fromEntries(['director', 'viceDirector', 'technician', 'receptionist'].map(key => [key, {
    name: document.querySelector(`[data-about-name="${key}"]`).value.trim(),
    email: document.querySelector(`[data-about-email="${key}"]`).value.trim(),
  }]));
  config.council = { members: [...document.querySelectorAll('[data-council-id]')].map((row) => ({ id: row.dataset.councilId, ...Object.fromEntries([...row.querySelectorAll('[data-council-field]')].map((field) => [field.dataset.councilField, field.value.trim()])) })), placement: document.querySelector('#council-placement').value };
  config.newsEnabled = document.querySelector('#news-enabled').checked;
  const version = document.querySelector('#release-version').value.trim();
  config.appUpdate = version ? { version, notes:document.querySelector('#release-notes').value.trim(), apkUrl:document.querySelector('#release-url').value.trim(), required:document.querySelector('#release-required').checked, publishedAt:config.appUpdate?.version === version ? config.appUpdate.publishedAt : new Date().toISOString() } : null;
  for (const card of config.homeCards) card.visible = document.querySelector(`[data-card-visible="${card.id}"]`)?.checked ?? card.visible;
  for (const link of Object.values(config.integratedLinks)) {
    const id = link.id;
    const title = document.querySelector(`[data-link-title="${id}"]`);
    const url = document.querySelector(`[data-link="${id}"]`);
    const group = document.querySelector(`[data-link-group="${id}"]`);
    const newGroup = document.querySelector(`[data-link-new-group="${id}"]`);
    const order = document.querySelector(`[data-link-order="${id}"]`);
    const active = document.querySelector(`[data-link-active="${id}"]`);
    const mode = document.querySelector(`[data-link-mode="${id}"]`);
    const appIcon = document.querySelector(`[data-link-icon="${id}"]`);
    if (title) link.title = title.value.trim() || link.title;
    if (url) link.url = url.value.trim();
    if (group) link.group = group.value === '__new__' ? (newGroup?.value.trim() || link.group || 'Outras páginas') : group.value;
    if (order) link.order = Number(order.value);
    if (active) link.active = active.checked;
    if (mode) link.openMode = mode.value;
    if (appIcon) link.icon = appIcon.value;
  }
}

async function openPanel(identity = {}) {
  currentRole = identity.role || 'admin';
  sessionAccountId = identity.accountId || null;
  document.querySelector('#notifications-toggle').hidden = false;
  allowedAreas = identity.areas || [];
  const result = await request('/api/admin/config');
  config = result.config;
  removedLinks.clear();
  render();
  hideAuthScreens();
  panel.hidden = false;
  document.body.classList.add('panel-open');
  document.querySelector('#logout').hidden = false;
  document.querySelector('.sidebar-account span:last-child').textContent = currentRole === 'admin' ? 'Administrador' : currentRole === 'editor' ? 'Editor de setor' : 'Consulta';
  document.querySelectorAll('#panel-nav [data-view]').forEach(button => { button.hidden = button.dataset.view === 'diagnostics' || (['users'].includes(button.dataset.view) && currentRole !== 'admin') || (['editor', 'viewer'].includes(currentRole) && !['overview', 'users'].includes(button.dataset.view) && !allowedAreas.includes(button.dataset.view)); });
  document.querySelectorAll('[data-account-go]').forEach(button => { button.hidden = (button.dataset.accountGo === 'users' && currentRole !== 'admin') || (['editor', 'viewer'].includes(currentRole) && button.dataset.accountGo !== 'overview' && !allowedAreas.includes(button.dataset.accountGo)); });
  if (!result.storage.persistent) say(message, 'Não foi possível acessar os dados do painel. Tente novamente mais tarde.', 'error');
  if (currentRole === 'viewer') {
    document.querySelector('#config-form').classList.add('read-only');
    document.querySelectorAll('#config-form input, #config-form textarea, #config-form select, #config-form button').forEach(control => { control.disabled = true; });
  }
  setDirty(false);
  showView(activeView);
  void loadAccount();
  void loadNewsStatus();
  void loadNotifications();
  if (tourFits() && !tourSeen()) openTour();
}

// Tutorial de primeiro acesso: apresenta cada área que a pessoa pode usar. Fica salvo por conta neste navegador.
const tourSteps = [
  { kicker:'BEM-VINDO', icon:'#i-grid', title:'Conheça o painel do CCN Digital', text:'Tudo o que você altera aqui aparece no aplicativo CCN Digital, usado por estudantes, professores e servidores. Em poucos passos, mostramos para que serve cada área.', tips:['Use “Próximo” e “Voltar” para navegar ou “Pular tutorial” para começar já.', 'Você pode rever este tutorial quando quiser em “Ver tutorial”, no menu.'] },
  { view:'overview', title:'Visão geral', text:'É a página inicial do painel. Mostra um resumo do conteúdo do aplicativo e atalhos para as áreas que você pode editar.', tips:['A busca no topo encontra rapidamente uma página ou um link.', 'O sino mostra os mandatos do Conselho que estão perto do fim.'] },
  { view:'home', title:'Início do app', text:'Define os cards que aparecem na primeira tela do aplicativo, a ordem deles e o link da localização do CCN.', tips:['Deixe ativos só os cards que fazem sentido no momento.'] },
  { view:'pages', title:'Páginas e busca', text:'Reúne os links de cada setor, como coordenações, departamentos e documentos, que as pessoas encontram nas páginas e na busca do app.', tips:['Para cada link, escolha se ele abre dentro do aplicativo ou no navegador.', 'Ao cadastrar um link, você também pode criar um setor novo.'] },
  { view:'services', title:'Serviços', text:'Organiza reservas, solicitações e outros serviços oferecidos pelo CCN.', tips:['Mantenha ativos apenas os serviços disponíveis no momento.'] },
  { view:'restricted', title:'Acesso restrito', text:'Lista os sistemas destinados ao público autorizado, exibidos na área Acesso restrito do aplicativo.', tips:['Confira se cada endereço está correto antes de salvar.'] },
  { view:'council', title:'Conselho Departamental', text:'Cadastra a composição do Conselho por setor, com o mandato de cada integrante.', tips:['Quando faltam 30 dias ou menos para o fim de um mandato, o aviso aparece no sino.', 'Você escolhe em que lugar do aplicativo o Conselho é exibido.'] },
  { view:'news', title:'Notícias', text:'As notícias do portal oficial da UFPI chegam sozinhas. Aqui você publica notícias próprias e pode ocultar ou destacar notícias oficiais.', tips:['A notícia destacada aparece no começo do carrossel do aplicativo.'] },
  { view:'users', title:'Usuários e permissões', text:'Cadastra as pessoas que usam o painel e define o que cada uma pode fazer.', tips:['Administrador vê tudo. Editor de setor edita só as áreas marcadas. Somente consulta apenas visualiza.', 'Se alguém perder o autenticador, use “Redefinir autenticador” na lista.'] },
  { view:'settings', title:'Configurações', text:'Atualiza os contatos exibidos na página Sobre do aplicativo e o aviso de nova versão para Android.', tips:['Os contatos são apenas informativos: não mudam quem recebe e-mails do sistema.'] },
  { kicker:'ÚLTIMO PASSO', icon:'#i-arrow', title:'Salve para publicar no aplicativo', text:'Quando você altera algo, aparece a barra “Alterações não salvas”. Clique em “Salvar alterações” para a mudança chegar ao aplicativo.', tips:['Mensagens em vermelho explicam o que precisa ser corrigido; em verde, deu tudo certo.', 'No ícone de pessoa, no topo, ficam “Alterar senha” e “Segurança da conta”.'] },
];
let tourIndex = 0;
let tourActive = [];
let tourReturnFocus = null;
const tourKey = () => `ccn-admin-tour:v1:${sessionAccountId || currentRole}`;
function tourSeen() {
  try { return localStorage.getItem(tourKey()) === 'done'; } catch { return true; }
}
const tourFits = () => matchMedia('(min-width: 901px)').matches;
function navButton(view) { return document.querySelector(`#panel-nav [data-view="${view}"]`); }
function openTour() {
  tourActive = tourSteps.filter(step => !step.view || (navButton(step.view) && !navButton(step.view).hidden));
  if (currentRole === 'viewer') {
    tourActive[tourActive.length - 1] = { kicker:'ÚLTIMO PASSO', icon:'#i-eye', title:'Seu perfil é de consulta', text:'Você pode ver todas as áreas liberadas, mas não alterar o conteúdo. Se precisar editar algo, peça a um administrador para mudar seu perfil.', tips:['No ícone de pessoa, no topo, ficam “Alterar senha” e “Segurança da conta”.'] };
  }
  tourIndex = 0;
  tourReturnFocus = document.activeElement;
  document.querySelector('#account-menu').hidden = true;
  document.querySelector('#tour').hidden = false;
  document.body.classList.add('tour-open');
  renderTour();
}
function renderTour() {
  const step = tourActive[tourIndex];
  const last = tourIndex === tourActive.length - 1;
  showView(step.view || 'overview');
  document.querySelectorAll('#panel-nav .tour-focus').forEach(button => button.classList.remove('tour-focus'));
  const button = step.view && navButton(step.view);
  if (button) { button.classList.add('tour-focus'); button.scrollIntoView({ block:'nearest', inline:'center' }); }
  document.querySelector('#tour-kicker').textContent = step.kicker || `PASSO ${tourIndex} DE ${tourActive.length - 2}`;
  document.querySelector('#tour-icon').setAttribute('href', step.icon || button?.querySelector('use')?.getAttribute('href') || '#i-grid');
  document.querySelector('#tour-title').textContent = step.title;
  document.querySelector('#tour-text').textContent = step.text;
  document.querySelector('#tour-tips').replaceChildren(...step.tips.map(tip => Object.assign(document.createElement('li'), { textContent: tip })));
  document.querySelector('#tour-dots').replaceChildren(...tourActive.map((_, index) => Object.assign(document.createElement('span'), { className: index === tourIndex ? 'active' : '' })));
  document.querySelector('#tour-back').hidden = tourIndex === 0;
  document.querySelector('#tour-next').textContent = last ? 'Começar a usar' : tourIndex === 0 ? 'Começar tutorial' : 'Próximo';
  document.querySelector('#tour-skip').hidden = last;
  document.querySelector('#tour-next').focus();
}
function closeTour() {
  try { localStorage.setItem(tourKey(), 'done'); } catch { /* Sem armazenamento local, o tutorial volta no próximo acesso. */ }
  document.querySelector('#tour').hidden = true;
  document.body.classList.remove('tour-open');
  document.querySelectorAll('#panel-nav .tour-focus').forEach(button => button.classList.remove('tour-focus'));
  showView('overview');
  tourReturnFocus?.focus?.();
}
document.querySelector('#tour-next').addEventListener('click', () => {
  if (tourIndex >= tourActive.length - 1) return closeTour();
  tourIndex++;
  renderTour();
});
document.querySelector('#tour-back').addEventListener('click', () => { if (tourIndex > 0) { tourIndex--; renderTour(); } });
document.querySelector('#tour-skip').addEventListener('click', closeTour);
document.querySelector('#tour').addEventListener('keydown', event => {
  if (event.key === 'Escape') closeTour();
  else if (event.key === 'ArrowRight' && event.target.tagName !== 'INPUT') document.querySelector('#tour-next').click();
  else if (event.key === 'ArrowLeft' && tourIndex > 0) document.querySelector('#tour-back').click();
  else if (event.key === 'Tab') {
    const focusable = [...document.querySelectorAll('#tour button:not([hidden])')];
    const edge = event.shiftKey ? focusable[0] : focusable[focusable.length - 1];
    if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus(); }
  }
});
document.querySelectorAll('[data-tour-open]').forEach(button => button.addEventListener('click', () => {
  if (currentRole === 'developer' || !tourFits()) return;
  if (dirty && !confirm('Há alterações não salvas. O tutorial troca de área, mas mantém o que você editou. Continuar?')) return;
  openTour();
}));

async function openDeveloperPanel() {
  currentRole = 'developer';
  document.querySelector('#notifications-toggle').hidden = true;
  hideAuthScreens();
  panel.hidden = false;
  document.body.classList.add('panel-open');
  document.querySelector('#logout').hidden = false;
  document.querySelector('.sidebar-account span:last-child').textContent = 'Desenvolvedor';
  document.querySelectorAll('[data-tour-open]').forEach(button => { button.hidden = true; });
  document.querySelectorAll('#panel-nav [data-view]').forEach(button => { button.hidden = button.dataset.view !== 'diagnostics'; });
  document.querySelector('#save-bar').hidden = true;
  showView('diagnostics');
  void loadAccount();
  await loadDiagnostics();
}

async function loadAccount() {
  try {
    const account = await request('/api/admin/me');
    document.querySelector('#account-name').textContent = account.profile?.name || 'Minha conta';
    document.querySelector('#account-role').textContent = account.role === 'developer' ? 'Desenvolvedor' : account.role === 'editor' ? 'Editor de setor' : account.role === 'viewer' ? 'Somente consulta' : 'Administrador';
    document.querySelector('#account-email').textContent = account.profile?.email || account.profile?.username || '';
    document.querySelector('#account-password').disabled = account.legacy === true;
    document.querySelector('#account-managed').hidden = account.legacy !== true;
  } catch {
    document.querySelector('#account-name').textContent = 'Minha conta';
    document.querySelector('#account-role').textContent = 'Dados indisponíveis agora';
    document.querySelector('#account-password').disabled = true;
  }
}

async function loadDiagnostics() {
  const status = document.querySelector('#diagnostics-message');
  say(status, 'Verificando os serviços…', 'progress');
  try {
    lastDiagnostics = await request('/api/admin/diagnostics');
    document.querySelector('#diagnostics-summary').textContent = `${lastDiagnostics.summary.ok} verificações normais · ${lastDiagnostics.summary.attention} pontos de atenção`;
    document.querySelector('#diagnostics-list').innerHTML = lastDiagnostics.checks.map(item => `<article class="diagnostics-check" data-status="${escapeHtml(item.status)}"><strong>${item.status === 'ok' ? '✓' : '!'} ${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><small>${escapeHtml(item.action)}</small></article>`).join('');
    document.querySelector('#download-diagnostics').disabled = false;
    say(status, `Verificação concluída em ${new Date(lastDiagnostics.generatedAt).toLocaleString('pt-BR')}.`);
  } catch (error) {
    lastDiagnostics = null;
    document.querySelector('#download-diagnostics').disabled = true;
    say(status, error.message, 'error');
  }
}

function downloadDiagnostics() {
  if (!lastDiagnostics) return;
  const date = new Date(lastDiagnostics.generatedAt).toLocaleString('pt-BR');
  const rows = lastDiagnostics.checks.map(item => `<section class="check ${item.status}"><h2>${escapeHtml(item.title)} <span>${item.status === 'ok' ? 'Normal' : 'Atenção'}</span></h2><p>${escapeHtml(item.detail)}</p><p><b>Próximo passo:</b> ${escapeHtml(item.action)}</p></section>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Diagnóstico CCN Digital</title><style>body{font:15px Arial,sans-serif;color:#11283d;max-width:800px;margin:40px auto;padding:0 24px}header{background:#062d55;color:white;padding:30px;border-radius:14px}h1{margin:0}header p{margin-bottom:0}.summary{font-weight:bold;margin:24px 0}.check{break-inside:avoid;border:1px solid #d3e0e9;border-left:5px solid #13896b;border-radius:9px;padding:13px 18px;margin:12px 0}.check.attention{border-left-color:#c47c17}h2{font-size:17px;margin:0 0 8px}h2 span{float:right;font-size:12px}p{line-height:1.5}footer{margin:24px 0;color:#607688;font-size:12px}@media print{body{margin:0;max-width:none}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style><header><h1>CCN Digital</h1><p>Relatório de funcionamento · ${escapeHtml(date)}</p></header><p class="summary">${lastDiagnostics.summary.ok} verificações normais · ${lastDiagnostics.summary.attention} pontos de atenção</p>${rows}<footer>${escapeHtml(lastDiagnostics.scope)}<br>Arquivo gerado pelo painel do desenvolvedor. Não contém senhas, IPs ou dados de usuários.</footer></html>`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  link.download = `ccn-digital-diagnostico-${lastDiagnostics.generatedAt.slice(0,10)}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function loadNewsStatus() {
  const status = document.querySelector('#news-source-message');
  const button = document.querySelector('#refresh-news');
  say(status, '');
  button.disabled = true;
  try {
    const body = await request(`/api/admin/config?news=1&_=${Date.now()}`);
    officialNewsItems = body.items || [];
    renderOfficialNews();
    if (body.stale) say(status, 'O portal oficial está temporariamente indisponível. As notícias salvas continuam disponíveis.');
    else if (!officialNewsItems.length) say(status, 'Nenhuma notícia foi encontrada no portal oficial.');
  } catch { say(status, 'Não foi possível consultar as notícias agora. Tente novamente mais tarde.', 'error'); }
  finally { button.disabled = false; }
}

document.querySelector('#toggle-password').addEventListener('click', () => {
  const input = document.querySelector('#login-form [name="password"]');
  const button = document.querySelector('#toggle-password');
  input.type = input.type === 'password' ? 'text' : 'password';
  const label = input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha';
  button.setAttribute('aria-label', label);
  button.title = label;
});
let pendingLogin = null;
let authFlowStarted = false;
function showMfaQr(secretId, dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('Não foi possível gerar o QR Code.');
  const secret = document.querySelector(secretId);
  let manual = secret.closest('details');
  if (!manual) {
    manual = document.createElement('details');
    manual.className = 'mfa-manual';
    const summary = document.createElement('summary');
    summary.textContent = 'Não consigo escanear · usar chave manual';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'secondary-button mfa-copy-key';
    copy.textContent = 'Copiar chave';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(secret.textContent.trim()); copy.textContent = 'Chave copiada ✓'; }
      catch { getSelection().selectAllChildren(secret); copy.textContent = 'Selecionada · use Ctrl+C'; }
      setTimeout(() => { copy.textContent = 'Copiar chave'; }, 2500);
    });
    secret.before(manual);
    manual.append(summary, secret, copy);
  }
  manual.open = false;
  let qr = manual.previousElementSibling;
  if (!qr?.classList.contains('mfa-qr')) {
    qr = document.createElement('img');
    qr.className = 'mfa-qr';
    qr.alt = 'QR Code para cadastrar o autenticador';
    qr.referrerPolicy = 'no-referrer';
    manual.before(qr);
  }
  qr.src = dataUrl;
}
function clearMfaQr(secretId) {
  const secret = document.querySelector(secretId);
  const qr = secret.closest('details')?.previousElementSibling;
  if (qr?.classList.contains('mfa-qr')) qr.removeAttribute('src');
}
async function finishLogin(code = '', action = undefined) {
  const result = await request('/api/admin/login', { method:'POST', body:JSON.stringify({ ...pendingLogin, code, action }) });
  pendingLogin = null;
  document.querySelector('#login-form').reset();
  if (result.mfaSetup) {
    authScreen('mfa-enrollment');
    void startEnrollment();
    return;
  }
  if (result.role === 'developer') await openDeveloperPanel(); else await openPanel(result);
}
document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  authFlowStarted = true;
  const form = event.currentTarget;
  const data = new FormData(form);
  pendingLogin = { username:String(data.get('username')||'').trim(), password:String(data.get('password')||'') };
  const status = document.querySelector('#login-message');
  say(status, '');
  try { await finishLogin(); }
  catch (error) {
    if (error.secondFactorRequired) {
      authScreen('mfa-challenge');
      document.querySelector('#mfa-challenge > p').textContent = 'Digite o código do autenticador. Se perdeu o celular, use um código de recuperação salvo no cadastro.';
      document.querySelector('#mfa-challenge-form').reset();
      document.querySelector('#mfa-backup-field').hidden = true;
      setMfaEmailMode(false);
      document.querySelector('#mfa-digits').hidden = false;
      document.querySelector('#mfa-backup-input').required = false;
      document.querySelector('#mfa-use-backup').textContent = 'Usar código de recuperação';
      document.querySelectorAll('#mfa-digits input').forEach(input => { input.disabled = false; });
      document.querySelector('#mfa-challenge-message').textContent = '';
      document.querySelector('#mfa-digits input').focus();
    } else {
      pendingLogin = null;
      form.elements.password.value = '';
      say(status, error.message, 'error');
      form.elements.password.focus();
    }
  }
});
const mfaDigits = [...document.querySelectorAll('#mfa-digits input')];
mfaDigits.forEach((input, index) => {
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 1); if (input.value) mfaDigits[index + 1]?.focus(); });
  input.addEventListener('keydown', event => { if (event.key === 'Backspace' && !input.value) mfaDigits[index - 1]?.focus(); });
});
document.querySelector('#mfa-digits').addEventListener('paste', event => {
  const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6);
  if (!pasted) return;
  event.preventDefault();
  mfaDigits.forEach((input, index) => { input.value = pasted[index] || ''; });
  mfaDigits[Math.min(pasted.length, 6) - 1]?.focus();
});
function setMfaEmailMode(active) {
  document.querySelector('#mfa-email-field').hidden = !active;
  document.querySelector('#mfa-email-input').required = active;
  document.querySelector('#mfa-email-input').value = '';
  document.querySelector('#mfa-lost').textContent = active ? 'Reenviar código por e-mail' : 'Perdi o autenticador e os códigos de recuperação';
  if (!active) return;
  document.querySelector('#mfa-backup-field').hidden = true;
  document.querySelector('#mfa-backup-input').required = false;
  document.querySelector('#mfa-digits').hidden = true;
  mfaDigits.forEach(input => { input.disabled = true; });
  document.querySelector('#mfa-use-backup').textContent = 'Usar aplicativo autenticador';
  document.querySelector('#mfa-challenge > p').textContent = 'Digite o código de 6 dígitos que enviamos ao seu e-mail. Em seguida, você vai cadastrar o autenticador de novo.';
  document.querySelector('#mfa-email-input').focus();
}
document.querySelector('#mfa-lost').addEventListener('click', async () => {
  const status = document.querySelector('#mfa-challenge-message');
  if (!pendingLogin) { say(status, 'A verificação expirou. Volte ao login e entre novamente.', 'error'); return; }
  say(status, 'Enviando código para o seu e-mail…', 'progress');
  try {
    const result = await request('/api/admin/login', { method:'POST', body:JSON.stringify({ ...pendingLogin, action:'mfa-email-send' }) });
    setMfaEmailMode(true);
    say(status, result.message, 'success');
  } catch (error) {
    if (!error.secondFactorRequired) pendingLogin = null;
    say(status, error.message, 'error');
  }
});
document.querySelector('#mfa-use-backup').addEventListener('click', event => {
  if (!document.querySelector('#mfa-email-field').hidden) {
    setMfaEmailMode(false);
    document.querySelector('#mfa-backup-field').hidden = false;
  }
  const field = document.querySelector('#mfa-backup-field');
  field.hidden = !field.hidden;
  document.querySelector('#mfa-digits').hidden = !field.hidden;
  mfaDigits.forEach(input => { input.disabled = !field.hidden; });
  document.querySelector('#mfa-backup-input').required = !field.hidden;
  event.currentTarget.textContent = field.hidden ? 'Usar código de recuperação' : 'Usar aplicativo autenticador';
  document.querySelector('#mfa-challenge > p').textContent = field.hidden
    ? 'Digite o código do autenticador. Se perdeu o celular, use um código de recuperação salvo no cadastro.'
    : 'Digite um dos três códigos de recuperação. Depois você cadastrará outro autenticador.';
  (field.hidden ? mfaDigits[0] : document.querySelector('#mfa-backup-input')).focus();
});
document.querySelector('#mfa-cancel').addEventListener('click', () => {
  pendingLogin = null;
  document.querySelector('#login-form').reset();
  authScreen('login');
});
document.querySelector('#mfa-challenge-form').addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.querySelector('#mfa-challenge-message');
  const emailMode = !document.querySelector('#mfa-email-field').hidden;
  const code = emailMode ? document.querySelector('#mfa-email-input').value.trim()
    : document.querySelector('#mfa-backup-field').hidden ? mfaDigits.map(input => input.value).join('') : document.querySelector('#mfa-backup-input').value.trim();
  say(status, 'Verificando…', 'progress');
  try { await finishLogin(code, emailMode ? 'mfa-email-verify' : undefined); }
  catch (error) {
    say(status, error.message, 'error');
    if (!error.secondFactorRequired) pendingLogin = null;
    mfaDigits.forEach(input => { input.value = ''; });
    document.querySelector('#mfa-backup-input').value = '';
  }
});
document.querySelector('#mfa-enrollment-begin').addEventListener('submit', async event => {
  event.preventDefault();
  await startEnrollment();
});
document.querySelector('#mfa-enrollment-begin label')?.remove();
document.querySelector('#mfa-enrollment-begin button').textContent = 'Tentar gerar QR Code novamente';
async function startEnrollment() {
  const form = document.querySelector('#mfa-enrollment-begin');
  const status = document.querySelector('#mfa-enrollment-message');
  form.hidden = true;
  say(status, 'Preparando o QR Code…', 'progress');
  try {
    const result = await request('/api/admin/mfa', { method:'POST', body:JSON.stringify({ action:'begin' }) });
    document.querySelector('#mfa-enrollment-secret').textContent = result.secret;
    showMfaQr('#mfa-enrollment-secret', result.qrDataUrl);
    document.querySelector('#mfa-enrollment-confirm > p').textContent = '1. Escaneie o QR Code no autenticador. 2. Digite abaixo os seis dígitos que aparecerem no celular.';
    document.querySelector('#mfa-enrollment-confirm').hidden = false;
    say(status, '');
  } catch (error) { say(status, error.message, 'error'); form.hidden = false; }
}
document.querySelector('#mfa-enrollment-code').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#mfa-enrollment-message');
  say(status, '');
  try {
    const result = await request('/api/admin/mfa', { method:'POST', body:JSON.stringify({ action:'confirm', code:form.elements.code.value.trim() }) });
    form.reset();
    document.querySelector('#mfa-enrollment-secret').textContent = '';
    clearMfaQr('#mfa-enrollment-secret');
    document.querySelector('#mfa-enrollment-confirm').hidden = true;
    document.querySelector('#mfa-enrollment-begin').hidden = true;
    document.querySelector('#mfa-enrollment-backup-codes').textContent = result.backupCodes.join('\n');
    document.querySelector('#mfa-enrollment-backup').hidden = false;
    document.querySelector('#mfa-enrollment-backup > p').textContent = '3. Guarde os três códigos. Se perder o autenticador, escolha “Usar código de recuperação” depois da senha. Um código permitirá cadastrar outro autenticador.';
  } catch (error) { say(status, error.message, 'error'); }
});
document.querySelector('#mfa-enrollment-done').addEventListener('click', () => {
  document.querySelector('#mfa-enrollment-backup-codes').textContent = '';
  clearMfaQr('#mfa-enrollment-secret');
  document.querySelector('#mfa-enrollment-backup').hidden = true;
  document.querySelector('#mfa-enrollment-begin').hidden = false;
  authScreen('login');
});
document.querySelector('#panel-nav').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) showView(button.dataset.view); });
document.querySelector('#panel-search').addEventListener('input', event => {
  const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
  document.querySelectorAll('#panel-nav [data-view]').forEach(button => {
    if (currentRole === 'developer' && button.dataset.view !== 'diagnostics') return;
    if (button.dataset.view === 'diagnostics' && currentRole !== 'developer') return;
    if (['users'].includes(button.dataset.view) && currentRole !== 'admin') return;
    if (['editor', 'viewer'].includes(currentRole) && !['overview', 'users'].includes(button.dataset.view) && !allowedAreas.includes(button.dataset.view)) return;
    button.hidden = Boolean(term) && !button.textContent.toLocaleLowerCase('pt-BR').includes(term);
  });
});
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showView(button.dataset.go)));
function addCouncilMember(sector = '') {
  readFormIntoConfig();
  const id = `member-${crypto.randomUUID()}`;
  config.council.members.push({ id, name:'', sector, role:'', designation:'', startDate:'', endDate:'' });
  document.querySelector('#council-filter').value = '';
  render();
  showView('council');
  document.querySelector(`[data-council-id="${id}"]`)?.closest('[data-council-sector]')?.setAttribute('open', '');
  document.querySelector(`[data-council-id="${id}"]`)?.setAttribute('open', '');
  document.querySelector(`[data-council-id="${id}"] [data-council-field="name"]`)?.focus();
  setDirty(true);
}
document.querySelector('#add-council-member').addEventListener('click', () => addCouncilMember());
document.querySelector('#council-members').addEventListener('click', (event) => {
  const add = event.target.closest('[data-add-council-sector]');
  if (add) { addCouncilMember(add.dataset.addCouncilSector === 'Novo setor' ? '' : add.dataset.addCouncilSector); return; }
  const remove = event.target.closest('[data-remove-council]');
  if (!remove) return;
  readFormIntoConfig();
  config.council.members = config.council.members.filter((member) => member.id !== remove.dataset.removeCouncil);
  render();
  setDirty(true);
});
form.addEventListener('input', event => { if (!event.target.closest('#user-editor, #mfa-reset-panel') && !['page-filter', 'council-filter'].includes(event.target.id)) setDirty(true); });
form.addEventListener('change', event => {
  if (event.target.matches('[data-link-group]')) {
    const id = event.target.dataset.linkGroup;
    const wrapper = document.querySelector(`[data-new-group-wrapper="${id}"]`);
    wrapper.hidden = event.target.value !== '__new__';
    if (!wrapper.hidden) wrapper.querySelector('input')?.focus();
  }
  if (!event.target.closest('#user-editor, #mfa-reset-panel') && !['page-filter', 'council-filter'].includes(event.target.id)) setDirty(true);
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#save-button');
  button.disabled = true;
  say(message, 'Salvando alterações…', 'progress');
  try {
    readFormIntoConfig();
    const pendingName = document.querySelector('[data-link-group] option[value="__new__"]:checked')?.closest('select')?.parentElement?.nextElementSibling?.querySelector('input');
    if (pendingName && !pendingName.value.trim()) throw new Error('Informe o nome do novo setor antes de salvar.');
    const result = await request('/api/admin/config', { method:'PUT', body:JSON.stringify({ newsEnabled:config.newsEnabled, newsPresentation:config.newsPresentation, manualNews:config.manualNews, homeCards:config.homeCards, pageGroupOrder:config.pageGroupOrder, hiddenPageGroups:config.hiddenPageGroups, integratedLinks:config.integratedLinks, removedLinkIds:[...removedLinks.keys()], appUpdate:config.appUpdate, aboutContacts:config.aboutContacts, council:config.council }) });
    config = result.config;
    removedLinks.clear();
    render();
    void loadNotifications();
    setDirty(false);
    say(message, 'Alterações salvas e disponíveis no aplicativo.', 'success');
  } catch (error) { setDirty(true); say(message, error.message, 'error'); }
  finally { button.disabled = false; }
});
function editorView(group) {
  return group === 'Serviços do CCN' ? 'services' : group === 'Acesso restrito' ? 'restricted' : 'pages';
}
function openLinkEditor(id) {
  const link = config.integratedLinks[id];
  if (!link) return;
  showView(editorView(link.group));
  const item = document.querySelector(`[data-editor-id="${id}"]`);
  if (!item) return;
  item.closest('.page-group')?.setAttribute('open', '');
  item.open = true;
  item.querySelector('[data-link-title]')?.focus();
}
function addLink(group) {
  readFormIntoConfig();
  document.querySelector('#page-filter').value = '';
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  config.integratedLinks[id] = { id, title:'Novo link', url:'', icon:'document-text-outline', group, order:50, active:true, internal:true, openMode:'app' };
  render();
  setDirty(true);
  openLinkEditor(id);
}
form.addEventListener('click', event => {
  if (event.target.closest('.drag-handle')) { event.preventDefault(); return; }
  const add = event.target.closest('[data-add-link-group]');
  const remove = event.target.closest('[data-delete-link]');
  const undo = event.target.closest('[data-undo-delete]');
  if (add) { addLink(add.dataset.addLinkGroup); return; }
  if (!remove && !undo) return;
  readFormIntoConfig();
  if (remove) {
    const id = remove.dataset.deleteLink;
    removedLinks.set(id, config.integratedLinks[id]);
    delete config.integratedLinks[id];
  } else {
    const id = undo.dataset.undoDelete;
    config.integratedLinks[id] = removedLinks.get(id);
    removedLinks.delete(id);
  }
  render();
  setDirty(true);
});
let dragging = null;
form.addEventListener('dragstart', event => {
  const handle = event.target.closest('[data-drag-group], [data-drag-link], [data-drag-card]');
  if (!handle) return;
  if (document.querySelector('#page-filter').value.trim()) { event.preventDefault(); return; }
  const item = handle.closest('.editor-item');
  dragging = handle.dataset.dragGroup ? { kind:'group', id:handle.dataset.dragGroup } : handle.dataset.dragCard ? { kind:'card', id:handle.dataset.dragCard } : { kind:'link', id:handle.dataset.dragLink, container:item?.parentElement?.id || item?.closest('.page-group')?.dataset.dropGroup || '' };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragging.id);
});
form.addEventListener('dragover', event => {
  if (!dragging) return;
  const target = dragging.kind === 'group' ? event.target.closest('[data-drop-group]') : dragging.kind === 'card' ? event.target.closest('[data-home-card]') : event.target.closest('.editor-item');
  if (!target) return;
  if (dragging.kind === 'link') {
    const container = target.parentElement?.id || target.closest('.page-group')?.dataset.dropGroup || '';
    if (container !== dragging.container) return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
});
form.addEventListener('drop', event => {
  if (!dragging) return;
  const source = dragging;
  dragging = null;
  const target = source.kind === 'group' ? event.target.closest('[data-drop-group]') : source.kind === 'card' ? event.target.closest('[data-home-card]') : event.target.closest('.editor-item');
  if (!target) return;
  event.preventDefault();
  readFormIntoConfig();
  if (source.kind === 'group') {
    const names = [...document.querySelectorAll('#pages [data-drop-group]')].map(item => item.dataset.dropGroup);
    const from = names.indexOf(source.id);
    const to = names.indexOf(target.dataset.dropGroup);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = names.splice(from, 1);
    names.splice(to, 0, moved);
    config.pageGroupOrder = [...names, ...config.pageGroupOrder.filter(name => !names.includes(name))];
  } else if (source.kind === 'card') {
    const ids = [...document.querySelectorAll('#cards [data-home-card]')].map(item => item.dataset.homeCard);
    const from = ids.indexOf(source.id);
    const to = ids.indexOf(target.dataset.homeCard);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    ids.forEach((id, index) => { config.homeCards.find(card => card.id === id).order = index + 1; });
  } else {
    const container = target.parentElement?.id || target.closest('.page-group')?.dataset.dropGroup || '';
    if (container !== source.container) return;
    const items = [...target.parentElement.children].filter(item => item.matches('.editor-item')).map(item => item.dataset.editorId);
    const from = items.indexOf(source.id);
    const to = items.indexOf(target.dataset.editorId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    items.forEach((id, index) => { config.integratedLinks[id].order = index + 1; });
  }
  render();
  setDirty(true);
});
form.addEventListener('dragend', () => { dragging = null; });
document.querySelector('#page-filter').addEventListener('input', filterPages);
document.querySelector('#council-filter').addEventListener('input', filterCouncil);
document.querySelector('#refresh-news').addEventListener('click', loadNewsStatus);
document.querySelector('#add-manual-news').addEventListener('click', () => {
  readFormIntoConfig();
  const id = `manual-${crypto.randomUUID()}`;
  config.manualNews.push({ id, title:'', excerpt:'', body:'', imageUrl:'', sourceUrl:'', publishedIso:new Date().toISOString(), active:true });
  renderManualNews();
  const row = document.querySelector(`[data-manual-news="${id}"]`);
  row.open = true;
  row.querySelector('[data-news-field="title"]')?.focus();
  setDirty(true);
});
document.querySelector('#manual-news-list').addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-manual-news]');
  const pin = event.target.closest('[data-news-pin]');
  if (!remove && !pin) return;
  readFormIntoConfig();
  config.newsPresentation ||= { hiddenIds:[], pinnedIds:[] };
  if (remove) {
    config.manualNews = config.manualNews.filter(item => item.id !== remove.dataset.removeManualNews);
    config.newsPresentation.pinnedIds = config.newsPresentation.pinnedIds.filter(id => id !== remove.dataset.removeManualNews);
  } else {
    const id = pin.dataset.newsPin;
    config.newsPresentation.pinnedIds = config.newsPresentation.pinnedIds.includes(id) ? config.newsPresentation.pinnedIds.filter(value => value !== id) : [...config.newsPresentation.pinnedIds, id];
  }
  renderManualNews();
  setDirty(true);
});
document.querySelector('#official-news-list').addEventListener('click', event => {
  const pin = event.target.closest('[data-news-pin]');
  const hide = event.target.closest('[data-news-hide]');
  if (!pin && !hide) return;
  readFormIntoConfig();
  config.newsPresentation ||= { hiddenIds:[], pinnedIds:[] };
  const id = pin?.dataset.newsPin || hide.dataset.newsHide;
  if (hide) {
    config.newsPresentation.hiddenIds = config.newsPresentation.hiddenIds.includes(id) ? config.newsPresentation.hiddenIds.filter(value => value !== id) : [...config.newsPresentation.hiddenIds, id];
    config.newsPresentation.pinnedIds = config.newsPresentation.pinnedIds.filter(value => value !== id);
  } else {
    config.newsPresentation.pinnedIds = config.newsPresentation.pinnedIds.includes(id) ? config.newsPresentation.pinnedIds.filter(value => value !== id) : [...config.newsPresentation.pinnedIds, id];
    config.newsPresentation.hiddenIds = config.newsPresentation.hiddenIds.filter(value => value !== id);
  }
  renderOfficialNews();
  setDirty(true);
});
document.querySelector('#pages').addEventListener('click', event => {
  const toggle = event.target.closest('[data-toggle-group]');
  if (!toggle) return;
  event.preventDefault();
  readFormIntoConfig();
  config.hiddenPageGroups ||= [];
  const group = toggle.dataset.toggleGroup;
  config.hiddenPageGroups = config.hiddenPageGroups.includes(group) ? config.hiddenPageGroups.filter(value => value !== group) : [...config.hiddenPageGroups, group];
  toggle.textContent = config.hiddenPageGroups.includes(group) ? 'Oculto' : 'Visível';
  toggle.setAttribute('aria-pressed', String(config.hiddenPageGroups.includes(group)));
  setDirty(true);
});
async function signOut() {
  await request('/api/admin/logout', { method:'POST' }).catch(() => {});
  location.reload();
}
document.querySelector('#logout').addEventListener('click', signOut);
document.querySelectorAll('[data-account-go]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.accountGo;
  if ((view === 'users' && currentRole !== 'admin') || (['editor', 'viewer'].includes(currentRole) && view !== 'overview' && !allowedAreas.includes(view))) return;
  closeAccountMenu();
  showView(view);
}));
const accountToggle = document.querySelector('#account-toggle');
const accountMenu = document.querySelector('#account-menu');
const notificationsToggle = document.querySelector('#notifications-toggle');
const notificationsPanel = document.querySelector('#notifications-panel');
document.querySelector('#notifications-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-notification-seen]');
  if (!button || button.disabled) return;
  button.disabled = true;
  const status = document.querySelector('#notifications-status');
  status.textContent = 'Confirmando leitura…';
  try {
    await request('/api/admin/notifications', { method:'POST', body:JSON.stringify({ id:button.dataset.notificationSeen }) });
    await loadNotifications();
  } catch (error) {
    say(status, error.message, 'error');
    button.disabled = false;
  }
});
notificationsToggle.addEventListener('click', () => {
  notificationsPanel.hidden = !notificationsPanel.hidden;
  notificationsToggle.setAttribute('aria-expanded', String(!notificationsPanel.hidden));
  if (!notificationsPanel.hidden) void loadNotifications();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.notification-wrap')) {
    notificationsPanel.hidden = true;
    notificationsToggle.setAttribute('aria-expanded', 'false');
  }
});
setInterval(() => { if (!panel.hidden && currentRole !== 'developer') void loadNotifications(); }, 60 * 60 * 1000);
function closeAccountMenu() {
  accountMenu.hidden = true;
  accountToggle.setAttribute('aria-expanded', 'false');
  document.querySelector('#account-password-form').hidden = true;
  document.querySelector('#account-mfa-panel').hidden = true;
  document.querySelector('#account-mfa-secret').textContent = '';
  clearMfaQr('#account-mfa-secret');
  document.querySelector('#account-mfa-confirm').hidden = true;
  document.querySelector('#account-mfa-backup-codes').textContent = '';
  document.querySelector('#account-mfa-backup').hidden = true;
}
accountToggle.addEventListener('click', () => {
  accountMenu.hidden = !accountMenu.hidden;
  accountToggle.setAttribute('aria-expanded', String(!accountMenu.hidden));
});
document.addEventListener('click', event => { if (!event.target.closest('.account-menu-wrap')) closeAccountMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAccountMenu(); });
document.querySelector('#account-password').addEventListener('click', () => {
  const passwordForm = document.querySelector('#account-password-form');
  passwordForm.hidden = !passwordForm.hidden;
  document.querySelector('#account-password-message').textContent = '';
  if (!passwordForm.hidden) passwordForm.elements.currentPassword.focus();
});
document.querySelector('#account-mfa').addEventListener('click', async () => {
  const section = document.querySelector('#account-mfa-panel');
  section.hidden = !section.hidden;
  if (section.hidden) return;
  const status = document.querySelector('#account-mfa-status');
  status.textContent = 'Verificando a segurança da conta…';
  try {
    const result = await request('/api/admin/mfa');
    status.textContent = result.enabled ? 'Autenticador ativo. Para trocá-lo, confirme senha e código atual ou de recuperação.'
      : result.available ? 'Cadastre um autenticador para proteger seu próximo login.'
      : 'A TI precisa configurar a chave privada de MFA no servidor.';
    document.querySelector('#account-mfa-begin').hidden = !result.available;
    document.querySelector('#account-mfa-proof').hidden = !result.enabled;
    document.querySelector('#account-mfa-proof input').required = result.enabled;
    document.querySelector('#account-mfa-begin button').textContent = result.enabled ? 'Trocar autenticador' : 'Cadastrar autenticador';
    document.querySelector('#account-mfa-confirm').hidden = true;
    document.querySelector('#account-mfa-backup').hidden = true;
  } catch (error) { say(status, error.message, 'error'); }
});
document.querySelector('#account-mfa-begin').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#account-mfa-message');
  say(status, '');
  try {
    const result = await request('/api/admin/mfa', { method:'POST', body:JSON.stringify({ action:'begin', password:form.elements.password.value, proofCode:form.elements.proofCode.value.trim() }) });
    form.reset();
    document.querySelector('#account-mfa-secret').textContent = result.secret;
    showMfaQr('#account-mfa-secret', result.qrDataUrl);
    document.querySelector('#account-mfa-confirm > p').textContent = 'Escaneie o QR Code no autenticador e confirme com o código gerado.';
    document.querySelector('#account-mfa-confirm').hidden = false;
    say(status, 'Insira a chave no autenticador e confirme com o código gerado.');
  } catch (error) { say(status, error.message, 'error'); }
});
document.querySelector('#account-mfa-code-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#account-mfa-message');
  try {
    const result = await request('/api/admin/mfa', { method:'POST', body:JSON.stringify({ action:'confirm', code:form.elements.code.value.trim() }) });
    form.reset();
    document.querySelector('#account-mfa-secret').textContent = '';
    clearMfaQr('#account-mfa-secret');
    document.querySelector('#account-mfa-confirm').hidden = true;
    document.querySelector('#account-mfa-begin').hidden = true;
    document.querySelector('#account-mfa-status').textContent = 'Autenticador ativo. Guarde os novos códigos e entre novamente com o novo fator.';
    document.querySelector('#account-mfa-backup-codes').textContent = result.backupCodes.join('\n');
    document.querySelector('#account-mfa-backup').hidden = false;
    say(status, '');
  } catch (error) { say(status, error.message, 'error'); }
});
document.querySelector('#account-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const passwordForm = event.currentTarget;
  const status = document.querySelector('#account-password-message');
  const currentPassword = passwordForm.elements.currentPassword.value;
  const newPassword = passwordForm.elements.newPassword.value;
  if (newPassword !== passwordForm.elements.confirmation.value) { say(status, 'As novas senhas não conferem.', 'error'); return; }
  const saveButton = passwordForm.querySelector('[type="submit"]');
  saveButton.disabled = true;
  say(status, '');
  try {
    await request('/api/admin/me', { method:'PATCH', body:JSON.stringify({ currentPassword, newPassword }) });
    passwordForm.reset();
    closeAccountMenu();
    panel.hidden = true;
    document.body.classList.remove('panel-open');
    authScreen('login');
    document.querySelector('#login-message').textContent = 'Senha alterada. Entre novamente.';
  } catch (error) { say(status, error.message, 'error'); }
  finally { saveButton.disabled = false; }
});
document.querySelector('#refresh-diagnostics').addEventListener('click', loadDiagnostics);
document.querySelector('#download-diagnostics').addEventListener('click', downloadDiagnostics);

const areaLabels = { home:'Início do app', pages:'Páginas e busca', services:'Serviços', restricted:'Acesso restrito', council:'Conselho Departamental', news:'Notícias', settings:'Configurações' };
function authScreen(id) {
  for (const node of [login, document.querySelector('#mfa-challenge'), document.querySelector('#mfa-enrollment'), document.querySelector('#recovery'), document.querySelector('#reset-password')]) node.hidden = node.id !== id;
  panel.hidden = true;
  document.body.classList.remove('panel-open');
}
function hideAuthScreens() {
  for (const node of [login, document.querySelector('#mfa-challenge'), document.querySelector('#mfa-enrollment'), document.querySelector('#recovery'), document.querySelector('#reset-password')]) node.hidden = true;
}
let recoveryMode = 'password';
document.querySelectorAll('[data-recover]').forEach(button => button.addEventListener('click', () => {
  recoveryMode = button.dataset.recover;
  authScreen('recovery');
  document.querySelector('#recovery-title').textContent = recoveryMode === 'password' ? 'Redefinir senha' : 'Recuperar nome de usuário';
  document.querySelector('#recovery-description').textContent = recoveryMode === 'password' ? 'Informe seu e-mail cadastrado para receber um link de redefinição.' : 'Enviaremos seu nome de usuário para o e-mail cadastrado.';
  document.querySelectorAll('.recovery-tabs button').forEach(tab => tab.classList.toggle('active', tab.dataset.recover === recoveryMode));
  document.querySelector('#recovery-message').textContent = '';
  void refreshRecoveryAvailability();
}));
async function refreshRecoveryAvailability() {
  const recoveryForm = document.querySelector('#recovery-form');
  const note = document.querySelector('#recovery .auth-note');
  recoveryForm.hidden = true;
  note.textContent = '';
  try {
    const result = await request('/api/admin/recovery');
    recoveryForm.hidden = !result.available;
    note.textContent = result.available
      ? 'Se houver uma conta vinculada a este e-mail, você receberá as instruções.'
      : 'Peça ajuda ao administrador do painel. Após confirmar sua identidade, ele pode entregar um link temporário para redefinir a senha ou informar seu usuário.';
  } catch {
    note.textContent = 'A recuperação por e-mail está temporariamente indisponível.';
  }
}
document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => authScreen('login')));
document.querySelector('#recovery-form').addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.querySelector('#recovery-message');
  say(status, 'Enviando solicitação…', 'progress');
  try {
    const email = event.currentTarget.elements.email.value.trim();
    const result = await request('/api/admin/recovery', { method:'POST', body:JSON.stringify({ action:recoveryMode, email }) });
    say(status, result.message);
    event.currentTarget.reset();
  } catch (error) { say(status, error.message, 'error'); }
});
const resetToken = new URLSearchParams(location.hash.slice(1)).get('token');
if (resetToken) {
  history.replaceState(null, '', location.pathname + location.search);
  authScreen('reset-password');
}
if (!resetToken) {
  void request('/api/admin/me').then(identity => {
    if (authFlowStarted) return;
    return identity.role === 'developer' ? openDeveloperPanel() : openPanel(identity);
  }).catch(() => {});
}
document.querySelector('#reset-form').addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.querySelector('#reset-message');
  const password = event.currentTarget.elements.password.value;
  if (password !== event.currentTarget.elements.confirmation.value) { say(status, 'As senhas não conferem.', 'error'); return; }
  say(status, 'Salvando…', 'progress');
  try {
    await request('/api/admin/recovery', { method:'POST', body:JSON.stringify({ action:'reset', token:resetToken, password }) });
    event.currentTarget.reset();
    say(status, 'Senha definida. Volte ao login para entrar.', 'success');
  } catch (error) { say(status, error.message, 'error'); }
});

async function loadUsers() {
  const list = document.querySelector('#users-list');
  const status = document.querySelector('#users-message');
  list.textContent = 'Carregando usuários…';
  try {
    const result = await request('/api/admin/users');
    mailAvailable = result.mailAvailable === true;
    list.innerHTML = result.users.length ? result.users.map(user => `<div class="user-row"><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.username)} · ${escapeHtml(user.email)}</small></div><span>${escapeHtml(user.sector)}</span><span>${user.role === 'admin' ? 'Administrador' : user.role === 'editor' ? 'Editor de setor' : 'Consulta'}</span><span class="user-status ${user.ready && user.active ? '' : 'pending'}">${!user.active ? 'Desativado' : user.ready ? 'Ativo' : 'Convite pendente'}</span><div><button type="button" data-edit-user="${user.id}">Editar</button>${!user.ready && user.active && mailAvailable ? `<button type="button" data-invite-user="${user.id}">Reenviar convite</button>` : ''}${user.active ? `<button type="button" data-manual-user="${user.id}">Gerar link seguro</button>` : ''}${user.active && user.ready && user.id !== sessionAccountId ? `<button type="button" data-reset-mfa-user="${user.id}">Redefinir autenticador</button>` : ''}</div></div>`).join('') : '<p>Nenhum usuário cadastrado ainda. Use “+ Novo usuário” para criar o primeiro.</p>';
    list._users = result.users;
    const activityLabels = { 'user.create':'Usuário criado', 'user.create.manual':'Usuário criado com entrega pessoal', 'user.manual.invite':'Link de convite gerado', 'user.manual.reset':'Link de recuperação gerado', 'user.mfa.reset':'Autenticador redefinido', 'account.mfa.email-reset':'Autenticador trocado pelo e-mail', 'account.mfa.enabled':'Autenticador cadastrado', 'account.password':'Senha alterada', 'user.update':'Usuário atualizado', 'user.invite':'Convite reenviado', 'config.update':'Conteúdo atualizado', 'recovery.password':'Redefinição solicitada', 'recovery.username':'Usuário solicitado' };
    document.querySelector('#users-activity').innerHTML = result.activity?.length ? result.activity.map(item => `<div><strong>${escapeHtml(activityLabels[item.action] || item.action)}</strong><span>${escapeHtml(item.actor)} · ${new Date(item.at).toLocaleString('pt-BR')}</span></div>`).join('') : '<p>Nenhuma atividade recente.</p>';
    say(status, '');
  } catch (error) { list.textContent = ''; say(status, error.message, 'error'); }
}
function editUser(user = null) {
  editingUserId = user?.id || null;
  document.querySelector('#user-editor').hidden = false;
  document.querySelector('#user-editor-title').textContent = user ? `Editar ${user.name}` : 'Novo usuário administrativo';
  for (const field of ['name','email','username','sector','role']) document.querySelector(`#user-${field}`).value = user?.[field] || (field === 'role' ? 'editor' : '');
  document.querySelector('#user-active').value = String(user?.active !== false);
  document.querySelector('#user-active-row').hidden = !user;
  document.querySelector('#user-delivery-row').hidden = Boolean(user);
  const emailOption = document.querySelector('#user-delivery option[value="email"]');
  emailOption.disabled = !mailAvailable;
  document.querySelector('#user-delivery').value = mailAvailable ? 'email' : 'manual';
  document.querySelector('#user-areas').innerHTML = Object.entries(areaLabels).map(([id,label]) => `<label><input type="checkbox" value="${id}" ${user?.areas?.includes(id) ? 'checked' : ''}>${label}</label>`).join('');
  document.querySelector('#save-user').textContent = user ? 'Salvar usuário' : mailAvailable ? 'Criar usuário e enviar convite' : 'Criar usuário e gerar link';
  document.querySelector('#user-editor-message').textContent = '';
  document.querySelector('#user-editor').scrollIntoView({ behavior:'smooth', block:'start' });
}
document.querySelector('#new-user').addEventListener('click', () => editUser());
// Sugere o nome de usuário a partir do e-mail (parte antes do @, sem acentos) enquanto o campo estiver vazio ou sugerido.
document.querySelector('#user-email').addEventListener('input', event => {
  const username = document.querySelector('#user-username');
  if (editingUserId || (username.value && username.dataset.suggested !== username.value)) return;
  const suggestion = event.target.value.split('@')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 80);
  username.value = suggestion;
  username.dataset.suggested = suggestion;
});
document.querySelector('#user-delivery').addEventListener('change', event => { if (!editingUserId) document.querySelector('#save-user').textContent = event.target.value === 'manual' ? 'Criar usuário e gerar link' : 'Criar usuário e enviar convite'; });
document.querySelector('#cancel-user').addEventListener('click', () => { document.querySelector('#user-editor').hidden = true; });
document.querySelector('#user-editor').addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
function showManualLink(url, hours) {
  const container = document.querySelector('#manual-access-link');
  document.querySelector('#manual-access-url').value = url;
  document.querySelector('#manual-access-expiry').textContent = `Válido por ${hours} ${hours === 1 ? 'hora' : 'horas'}; só pode ser usado uma vez. Não envie em grupos ou canais públicos.`;
  container.hidden = false;
  clearTimeout(manualLinkTimeout);
  manualLinkTimeout = setTimeout(() => { document.querySelector('#manual-access-url').value = ''; container.hidden = true; }, 5 * 60 * 1000);
  container.scrollIntoView({ behavior:'smooth', block:'center' });
}
document.querySelector('#copy-manual-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.querySelector('#manual-access-url').value); document.querySelector('#users-message').textContent = 'Link copiado. Entregue após confirmar a identidade da pessoa.'; }
  catch { document.querySelector('#users-message').textContent = 'Selecione o link e copie manualmente.'; }
});
document.querySelector('#close-manual-link').addEventListener('click', () => { clearTimeout(manualLinkTimeout); document.querySelector('#manual-access-url').value = ''; document.querySelector('#manual-access-link').hidden = true; });
document.querySelector('#users-list').addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit-user]');
  if (edit) return editUser(document.querySelector('#users-list')._users.find(user => user.id === edit.dataset.editUser));
  const resetMfaButton = event.target.closest('[data-reset-mfa-user]');
  if (resetMfaButton) {
    const user = document.querySelector('#users-list')._users.find(item => item.id === resetMfaButton.dataset.resetMfaUser);
    if (!user) return;
    document.querySelector('#mfa-reset-user').textContent = user.name;
    document.querySelector('#mfa-reset-id').value = user.id;
    clearMfaResetFields();
    say(document.querySelector('#mfa-reset-message'), '');
    document.querySelector('#mfa-reset-panel').hidden = false;
    document.querySelector('#mfa-reset-panel').scrollIntoView({ behavior:'smooth', block:'center' });
    return;
  }
  const manual = event.target.closest('[data-manual-user]');
  if (manual) {
    const status = document.querySelector('#users-message');
    try { const result = await request('/api/admin/users', { method:'POST', body:JSON.stringify({ action:'manual-link', id:manual.dataset.manualUser }) }); showManualLink(result.url, result.expiresInHours); say(status, 'Link gerado. Confirme a identidade da pessoa antes de entregar.', 'success'); }
    catch (error) { say(status, error.message, 'error'); }
    return;
  }
  const invite = event.target.closest('[data-invite-user]');
  if (!invite) return;
  const status = document.querySelector('#users-message');
  try { await request('/api/admin/users', { method:'POST', body:JSON.stringify({ action:'resend', id:invite.dataset.inviteUser }) }); say(status, 'Convite reenviado.', 'success'); }
  catch (error) { say(status, error.message, 'error'); }
});
// A confirmação fica dentro do formulário de configurações; por isso usa um bloco comum em vez de outro <form>.
function clearMfaResetFields() {
  document.querySelector('#mfa-reset-password').value = '';
  document.querySelector('#mfa-reset-code').value = '';
}
document.querySelector('#cancel-mfa-reset').addEventListener('click', () => {
  clearMfaResetFields();
  document.querySelector('#mfa-reset-panel').hidden = true;
});
document.querySelector('#mfa-reset-form').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.target.tagName !== 'INPUT') return;
  event.preventDefault();
  document.querySelector('#confirm-mfa-reset').click();
});
document.querySelector('#confirm-mfa-reset').addEventListener('click', async () => {
  const status = document.querySelector('#mfa-reset-message');
  const password = document.querySelector('#mfa-reset-password').value;
  const code = document.querySelector('#mfa-reset-code').value.trim();
  if (!password || !/^\d{6}$/.test(code)) { say(status, 'Informe sua senha atual e os 6 dígitos do seu autenticador.', 'error'); return; }
  say(status, 'Confirmando…', 'progress');
  try {
    const result = await request('/api/admin/users', { method:'POST', body:JSON.stringify({ action:'reset-mfa', id:document.querySelector('#mfa-reset-id').value, password, code }) });
    clearMfaResetFields();
    document.querySelector('#mfa-reset-panel').hidden = true;
    await loadUsers();
    showManualLink(result.url, result.expiresInHours);
    say(document.querySelector('#users-message'), result.emailed ? 'Senha antiga e autenticador revogados. O link também foi enviado ao e-mail da pessoa.' : 'Senha antiga e autenticador revogados. Entregue o link após confirmar a identidade da pessoa.', 'success');
  } catch (error) { say(status, error.message, 'error'); }
});
// O cadastro fica dentro do formulário de configurações: Enter salva o usuário, não as configurações.
document.querySelector('#user-editor').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.target.tagName !== 'INPUT') return;
  event.preventDefault();
  document.querySelector('#save-user').click();
});
document.querySelector('#save-user').addEventListener('click', async () => {
  const status = document.querySelector('#user-editor-message');
  const data = Object.fromEntries(['name','email','username','sector','role'].map(field => [field, document.querySelector(`#user-${field}`).value.trim()]));
  data.areas = [...document.querySelectorAll('#user-areas input:checked')].map(input => input.value);
  data.active = document.querySelector('#user-active').value === 'true';
  if (!editingUserId) data.delivery = document.querySelector('#user-delivery').value;
  if (editingUserId) data.id = editingUserId;
  say(status, 'Salvando…', 'progress');
  try {
    const result = await request('/api/admin/users', { method:editingUserId ? 'PUT' : 'POST', body:JSON.stringify(data) });
    document.querySelector('#user-editor').hidden = true;
    await loadUsers();
    if (result.url) showManualLink(result.url, result.expiresInHours);
    say(document.querySelector('#users-message'), editingUserId ? 'Usuário atualizado.' : result.url ? 'Usuário criado. Entregue o link após confirmar a identidade da pessoa.' : 'Usuário criado e convite enviado.', 'success');
  } catch (error) { say(status, error.message, 'error'); await loadUsers(); }
});
