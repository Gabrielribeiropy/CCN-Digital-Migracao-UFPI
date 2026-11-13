export function materializeManualNews(items = []) {
  return items.filter(item => item.active !== false).map(item => ({
    id: item.id,
    title: item.title,
    excerpt: item.excerpt,
    body: item.body.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean),
    imageUrl: item.imageUrl,
    sourceUrl: item.sourceUrl,
    publishedIso: item.publishedIso,
    publishedAt: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Fortaleza' }).format(new Date(item.publishedIso)),
    category: 'Notícias CCN',
    attachments: [],
  }));
}

export function presentNews(items, presentation = {}, manualNews = []) {
  const hidden = new Set(presentation.hiddenIds || []);
  const pinned = new Map((presentation.pinnedIds || []).map((id, index) => [id, index]));
  return [...materializeManualNews(manualNews), ...items].filter(item => !hidden.has(item.id)).sort((a, b) => {
    const aPin = pinned.get(a.id);
    const bPin = pinned.get(b.id);
    if (aPin !== undefined || bPin !== undefined) return (aPin ?? Number.MAX_SAFE_INTEGER) - (bPin ?? Number.MAX_SAFE_INTEGER);
    return b.publishedIso.localeCompare(a.publishedIso);
  });
}
