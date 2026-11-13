import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { deleteKey, getJson, setExpiring } from './kv-store.mjs';
import { findUserById } from './admin-users.mjs';
import { mfaIdentity, readMfaSecret, readMfaVersion } from './admin-mfa.mjs';

const COOKIE = 'ccn-admin-session';
const SESSION_SECONDS = 8 * 60 * 60;

function sessionSecret(request) {
  return process.env.CCN_ADMIN_SESSION_SECRET || '';
}

function secureCookie(request) {
  const host = String(request.headers.host || '').split(':')[0].toLowerCase();
  return ['localhost', '127.0.0.1'].includes(host) ? '' : '; Secure';
}

function equalText(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyCredentials(request, username, password) {
  return credentialRole(request, username, password) !== null;
}

export function credentialRole(request, username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || !sessionSecret(request)) return null;
  for (const [role, expectedUser, encodedHash] of [
    ['admin', process.env.CCN_LEGACY_ADMIN_DISABLED === 'true' ? '' : process.env.CCN_ADMIN_USERNAME || 'admin', process.env.CCN_ADMIN_PASSWORD_HASH || ''],
    ['developer', process.env.CCN_DEVELOPER_USERNAME || '', process.env.CCN_DEVELOPER_PASSWORD_HASH || ''],
  ]) {
    const [salt, expectedHash] = encodedHash.split(':');
    if (!expectedUser || !salt || !/^[a-f0-9]{128}$/i.test(expectedHash || '')) continue;
    const actualHash = scryptSync(password, salt, 64).toString('hex');
    if (equalText(username, expectedUser) && equalText(actualHash, expectedHash)) return role;
  }
  return null;
}

function signature(request, payload) {
  return createHmac('sha256', sessionSecret(request)).update(payload).digest('base64url');
}

export async function issueSession(request, response, role = 'admin', account = null, mfaVerified = false, mfaSetup = false, mfaRecovery = false) {
  if (!['admin', 'developer', 'editor', 'viewer'].includes(role)) throw new Error('Perfil inválido.');
  const id = randomBytes(24).toString('base64url');
  const lifetime = mfaSetup ? 10 * 60 : SESSION_SECONDS;
  const mfaVersion = mfaVerified || mfaRecovery ? await readMfaVersion(mfaIdentity(role, account)) : null;
  await setExpiring(`ccn-admin:session:${id}`, JSON.stringify({ role, accountId: account?.id || null, authVersion: account?.authVersion || null, mfaVerified, mfaSetup, mfaRecovery, mfaVersion }), lifetime);
  const payload = Buffer.from(JSON.stringify({ user: role, id, expires: Date.now() + lifetime * 1000 })).toString('base64url');
  const secure = secureCookie(request);
  response.setHeader('set-cookie', `${COOKIE}=${payload}.${signature(request, payload)}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${lifetime}${secure}`);
}

export async function clearSession(request, response) {
  const session = signedSession(request);
  if (session?.id) await deleteKey(`ccn-admin:session:${session.id}`);
  const secure = secureCookie(request);
  response.setHeader('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0${secure}`);
}

function signedSession(request) {
  if (!sessionSecret(request)) return null;
  const cookie = String(request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  const token = cookie?.slice(COOKIE.length + 1) || '';
  const [payload, sentSignature] = token.split('.');
  if (!payload || !sentSignature || !equalText(sentSignature, signature(request, payload))) return null;
  try { const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return ['admin', 'developer', 'editor', 'viewer'].includes(session.user) && typeof session.id === 'string' && /^[a-zA-Z0-9_-]{32}$/.test(session.id) && Number(session.expires) > Date.now() ? session : null; }
  catch { return null; }
}

export async function currentAdmin(request) {
  const session = signedSession(request);
  if (!session) return null;
  try {
    const stored = await getJson(`ccn-admin:session:${session.id}`);
    if (stored === 1) return null;
    if (stored?.role !== session.user) return null;
    if (stored.mfaSetup === true) return null;
    const identity = mfaIdentity(session.user, stored.accountId ? { id: stored.accountId } : null);
    if (stored.mfaVerified !== true && (process.env.CCN_ADMIN_MFA_REQUIRED === 'true' || await readMfaSecret(identity))) return null;
    if (stored.mfaVerified === true && stored.mfaVersion !== await readMfaVersion(identity)) return null;
    if (!stored.accountId) return (session.user === 'developer' || (session.user === 'admin' && process.env.CCN_LEGACY_ADMIN_DISABLED !== 'true')) ? { role: session.user, legacy: true, areas: [] } : null;
    const account = await findUserById(stored.accountId);
    return account?.active && account.role === session.user && account.auth_version === stored.authVersion
      ? { id: account.id, role: account.role, areas: account.areas, legacy: false } : null;
  } catch { return null; }
}

export async function currentMfaSetupActor(request) {
  const session = signedSession(request);
  if (!session) return null;
  try {
    const stored = await getJson(`ccn-admin:session:${session.id}`);
    if (stored?.role !== session.user || stored.mfaSetup !== true || stored.mfaVerified === true) return null;
    const identity = mfaIdentity(session.user, stored.accountId ? { id: stored.accountId } : null);
    if (!stored.mfaRecovery && await readMfaSecret(identity)) return null;
    if (stored.mfaRecovery && stored.mfaVersion !== await readMfaVersion(identity)) return null;
    if (!stored.accountId) return (session.user === 'developer' || (session.user === 'admin' && process.env.CCN_LEGACY_ADMIN_DISABLED !== 'true')) ? { role: session.user, legacy: true, areas: [], mfaSetup: true, mfaRecovery: stored.mfaRecovery === true } : null;
    const account = await findUserById(stored.accountId);
    return account?.active && account.role === session.user && account.auth_version === stored.authVersion
      ? { id: account.id, role: account.role, areas: account.areas, legacy: false, mfaSetup: true, mfaRecovery: stored.mfaRecovery === true } : null;
  } catch { return null; }
}

export async function authorized(request, role = 'admin') {
  const actor = await currentAdmin(request);
  return Boolean(actor && (role === 'content' ? ['admin', 'editor', 'viewer'].includes(actor.role) : actor.role === role));
}
