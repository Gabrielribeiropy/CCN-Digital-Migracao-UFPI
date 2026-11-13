const DAY = 86_400_000;

function campusDate(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day));
}

export function councilNotifications(members = [], now = new Date()) {
  const today = campusDate(now);
  return members.flatMap(member => {
    const endDate = member?.endDate;
    if (typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return [];
    const end = Date.parse(`${endDate}T00:00:00Z`);
    if (!Number.isFinite(end) || new Date(end).toISOString().slice(0, 10) !== endDate) return [];
    const daysLeft = Math.round((end - today) / DAY);
    if (daysLeft < 0 || daysLeft > 30) return [];
    return [{ id: `${member.id}:${endDate}`, name: member.name, sector: member.sector, role: member.role,
      endDate, daysLeft }];
  }).sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name, 'pt-BR'));
}
