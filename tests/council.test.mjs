import assert from 'node:assert/strict';
import test from 'node:test';
import { councilSeed } from '../api/_lib/council-seed.mjs';
import { councilNotifications } from '../api/_lib/council-notifications.mjs';
import { normalizeConfig } from '../api/_lib/config-store.mjs';

test('o cadastro inicial preserva os setores do documento sem inventar datas ausentes', () => {
  const config = normalizeConfig({});
  assert.equal(config.council.members.length, councilSeed.length);
  assert.equal(config.council.members.length, 63);
  assert.equal(config.council.members.find((member) => member.name === 'Márcio Cleto Soares de Moura')?.endDate, '');
  assert.equal(Object.hasOwn(config.council, 'reminderRecipients'), false);
});

test('aviso interno entra na janela de 30 dias e ignora mandatos encerrados ou sem término', () => {
  const members = [
    { id: 'a', name: 'A', endDate: '2026-11-20' }, { id: 'b', name: 'B', endDate: '2026-12-06' },
    { id: 'c', name: 'C', endDate: '2026-11-04' }, { id: 'd', name: 'D', endDate: '' },
  ];
  assert.deepEqual(councilNotifications(members, new Date('2026-11-05T12:00:00Z')).map(item => item.id), ['a:2026-11-20']);
});
