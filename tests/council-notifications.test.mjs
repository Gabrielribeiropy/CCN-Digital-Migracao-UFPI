import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { councilNotifications } from '../api/_lib/council-notifications.mjs';

test('avisa no painel entre 30 dias e a data final, inclusive após mudança de dia no Piauí', () => {
  const members = [
    { id: 'a', name: 'Professor A', sector: 'Matemática', endDate: '2026-12-12' },
    { id: 'b', name: 'Professor B', sector: 'Física', endDate: '2026-12-13' },
    { id: 'c', name: 'Professor C', sector: 'Química', endDate: '2026-11-11' },
    { id: 'd', name: 'Professor D', sector: 'Biologia', endDate: '' },
  ];
  assert.deepEqual(councilNotifications(members, new Date('2026-11-12T03:30:00Z')).map(item => [item.id, item.daysLeft]), [['a:2026-12-12', 30]]);
  assert.deepEqual(councilNotifications(members, new Date('2026-12-12T16:00:00Z')).map(item => [item.id, item.daysLeft]), [['a:2026-12-12', 0], ['b:2026-12-13', 1]]);
});
