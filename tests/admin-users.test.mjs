import test from 'node:test';
import assert from 'node:assert/strict';
import { changeOwnPassword, UserInputError, validateUser } from '../api/_lib/admin-users.mjs';
import { allowedChanges } from '../api/admin/config.mjs';
import recoveryHandler from '../api/admin/recovery.mjs';
import { randomUUID } from 'node:crypto';
import { authenticateUser, createUser, invalidateUserSessions, issueAccessToken, consumeAccessToken } from '../api/_lib/admin-users.mjs';
import { query } from '../api/_lib/postgres-store.mjs';

test('contas exigem dados válidos e área para editor', () => {
  const valid = { name:'Ana Silva', username:'ana.silva', email:'ana@ufpi.edu.br', sector:'Matemática', role:'editor', areas:['pages'] };
  assert.deepEqual(validateUser(valid).areas, ['pages']);
  assert.throws(() => validateUser({ ...valid, areas:['areas'] }), /área/);
  assert.throws(() => validateUser({ ...valid, areas:[] }), /área/);
  assert.throws(() => validateUser({ ...valid, email:'sem-email' }), /Confira/);
  assert.equal(validateUser({ ...valid, email:'ana@gmail.com' }).email, 'ana@gmail.com');
  assert.throws(() => validateUser({ ...valid, role:'developer' }), /Confira/);
});

test('todo erro de preenchimento chega à tela como UserInputError', () => {
  const valid = { name:'Ana Silva', username:'ana.silva', email:'ana@ufpi.edu.br', sector:'Matemática', role:'viewer', areas:[] };
  for (const invalid of [{ email:'ana@' }, { username:'Ána' }, { sector:'' }, { name:'' }, { role:'editor' }]) {
    assert.throws(() => validateUser({ ...valid, ...invalid }), UserInputError);
  }
});

test('troca da própria senha exige senha atual e nova senha longa', async () => {
  await assert.rejects(changeOwnPassword('id', '', 'nova-senha-segura'), /senha atual/);
  await assert.rejects(changeOwnPassword('id', 'senha-atual', 'curta'), /12 a 256/);
});

test('recuperação informa indisponibilidade sem PostgreSQL e SMTP', async () => {
  const original = { database:process.env.DATABASE_URL, origin:process.env.CCN_PUBLIC_ORIGIN };
  delete process.env.DATABASE_URL;
  delete process.env.CCN_PUBLIC_ORIGIN;
  const response = { code:200, setHeader(){}, status(code){ this.code=code; return this; }, json(body){ this.body=body; return this; } };
  try {
    await recoveryHandler({ method:'GET', headers:{} }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.available, false);
  } finally {
    if (original.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=original.database;
    if (original.origin === undefined) delete process.env.CCN_PUBLIC_ORIGIN; else process.env.CCN_PUBLIC_ORIGIN=original.origin;
  }
});

test('redefinição do autenticador revoga senha anterior e exige link único para nova senha', { skip: !process.env.CCN_TEST_DATABASE_URL }, async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.CCN_TEST_DATABASE_URL;
  const suffix = randomUUID().slice(0, 8);
  let id;
  try {
    id = await createUser({ name:'Teste Recuperação', username:`mfa.${suffix}`, email:`mfa.${suffix}@ufpi.edu.br`, sector:'Teste', role:'viewer', areas:[] });
    const firstToken = await issueAccessToken(id, 'invite');
    assert.equal(await consumeAccessToken(firstToken, 'senha-inicial-segura-123'), true);
    assert.equal((await authenticateUser(`mfa.${suffix}`, 'senha-inicial-segura-123'))?.id, id);
    assert.equal(await invalidateUserSessions(id), true);
    assert.equal(await authenticateUser(`mfa.${suffix}`, 'senha-inicial-segura-123'), null);
    const resetToken = await issueAccessToken(id, 'reset');
    assert.equal(await consumeAccessToken(resetToken, 'senha-nova-segura-456'), true);
    assert.equal(await consumeAccessToken(resetToken, 'outra-senha-segura-789'), false);
    assert.equal((await authenticateUser(`mfa.${suffix}`, 'senha-nova-segura-456'))?.id, id);
  } finally {
    if (id) await query('DELETE FROM ccn_admin_users WHERE id=$1', [id]);
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  }
});

test('editor não altera configuração nem exclui links de outra área', () => {
  const before = { homeCards:[], pageGroupOrder:[], newsEnabled:true, council:{ members:[] }, appUpdate:null,
    integratedLinks:{
      'custom-page':{ id:'custom-page', group:'Vida acadêmica', title:'Página' },
      'custom-service':{ id:'custom-service', group:'Serviços do CCN', title:'Serviço' },
    } };
  assert.equal(allowedChanges(before, { ...before, integratedLinks:{ ...before.integratedLinks, 'custom-page':{ ...before.integratedLinks['custom-page'], title:'Nova página' } } }, ['pages']), true);
  assert.equal(allowedChanges(before, { ...before, newsEnabled:false }, ['pages']), false);
  assert.equal(allowedChanges(before, { ...before, aboutContacts: { director: { name: 'Diretor', email: 'novo@ufpi.edu.br' } } }, ['pages']), false);
  assert.equal(allowedChanges(before, { ...before, removedLinkIds:['custom-service'] }, ['pages']), false);
  assert.equal(allowedChanges(before, { ...before, integratedLinks:{ ...before.integratedLinks, 'custom-page':{ ...before.integratedLinks['custom-page'], group:'Serviços do CCN' } } }, ['pages']), false);
  assert.equal(allowedChanges(before, { ...before, integratedLinks:{ ...before.integratedLinks, 'custom-extra':{ id:'custom-extra', group:'Novo setor', title:'Página' } } }, ['pages']), true);
  assert.equal(allowedChanges(before, { ...before, integratedLinks:{ ...before.integratedLinks, 'custom-extra':{ id:'custom-extra', group:'Novo setor', title:'Página' } } }, ['areas']), false);
});
