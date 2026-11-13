import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { query, transaction } from './postgres-store.mjs';
import { createInstitutionalMailer } from './institutional-mail.mjs';

export const ADMIN_AREAS = ['home', 'pages', 'services', 'restricted', 'council', 'news', 'settings'];
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function passwordHash(password) {
  const salt = randomBytes(24).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function passwordValid(password, encoded) {
  const [salt, expected] = String(encoded || '').split(':');
  if (!/^[a-f0-9]{48}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(expected || '')) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

const publicFields = 'id, name, username, email, sector, role, areas, active, password_hash IS NOT NULL AS ready, created_at';
const cleanUser = row => ({ id: row.id, name: row.name, username: row.username, email: row.email, sector: row.sector, role: row.role, areas: row.areas, active: row.active, ready: row.ready, createdAt: row.created_at });

export async function listUsers() {
  const { rows } = await query(`SELECT ${publicFields} FROM ccn_admin_users ORDER BY name`);
  return rows.map(cleanUser);
}

export async function findUserById(id) {
  const { rows } = await query('SELECT id, username, role, areas, active, auth_version FROM ccn_admin_users WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function findOwnProfile(id) {
  const { rows } = await query('SELECT name, username, email, sector FROM ccn_admin_users WHERE id=$1 AND active=TRUE', [id]);
  return rows[0] || null;
}

export async function changeOwnPassword(id, currentPassword, newPassword) {
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 1024 || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256) {
    throw new Error('Informe a senha atual e uma nova senha de 12 a 256 caracteres.');
  }
  return transaction(async q => {
    const { rows } = await q('SELECT password_hash FROM ccn_admin_users WHERE id=$1 AND active=TRUE FOR UPDATE', [id]);
    if (!rows[0]?.password_hash || !passwordValid(currentPassword, rows[0].password_hash)) return false;
    await q('UPDATE ccn_admin_users SET password_hash=$2, auth_version=auth_version+1, updated_at=NOW() WHERE id=$1', [id, passwordHash(newPassword)]);
    return true;
  });
}

export async function findMailUserById(id) {
  const { rows } = await query('SELECT id, name, username, email, active, password_hash IS NOT NULL AS ready FROM ccn_admin_users WHERE id=$1', [id]);
  return rows[0] || null;
}

export async function invalidateUserSessions(id) {
  const { rowCount } = await query('UPDATE ccn_admin_users SET password_hash=NULL, auth_version=auth_version+1, updated_at=NOW() WHERE id=$1 AND active=TRUE', [id]);
  return rowCount === 1;
}

export async function authenticateUser(identifier, password) {
  if (!process.env.DATABASE_URL) return null;
  const { rows } = await query('SELECT id, username, role, areas, active, auth_version, password_hash FROM ccn_admin_users WHERE lower(username) = lower($1) OR lower(email) = lower($1) LIMIT 1', [identifier]);
  const user = rows[0];
  if (!user?.active || !user.password_hash || !passwordValid(password, user.password_hash)) return null;
  return { id: user.id, username: user.username, role: user.role, areas: user.areas, authVersion: user.auth_version };
}

export function validateUser(input) {
  const name = String(input?.name || '').trim().slice(0, 160);
  const username = String(input?.username || '').trim().toLowerCase();
  const email = String(input?.email || '').trim().toLowerCase();
  const sector = String(input?.sector || '').trim().slice(0, 100);
  const role = String(input?.role || 'viewer');
  const areas = [...new Set(Array.isArray(input?.areas) ? input.areas.filter(x => ADMIN_AREAS.includes(x)) : [])];
  if (name.length < 2 || !/^[a-z0-9._-]{3,80}$/.test(username) || !EMAIL.test(email) || email.length > 254 || sector.length < 2 || !['admin', 'editor', 'viewer'].includes(role)) throw new Error('Confira nome, usuário, e-mail, setor e perfil.');
  const domains = String(process.env.CCN_ADMIN_EMAIL_DOMAINS || 'ufpi.edu.br').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
  if (!domains.includes(email.split('@')[1])) throw new Error('Use um e-mail institucional autorizado.');
  if ([process.env.CCN_ADMIN_USERNAME, process.env.CCN_DEVELOPER_USERNAME].filter(Boolean).some(value => value.toLowerCase() === username)) throw new Error('Este nome de usuário está reservado.');
  if (role === 'editor' && !areas.length) throw new Error('Selecione ao menos uma área para o editor.');
  return { name, username, email, sector, role, areas: role === 'admin' ? ADMIN_AREAS : areas };
}

export async function createUser(input) {
  const user = validateUser(input);
  const id = randomUUID();
  await query('INSERT INTO ccn_admin_users (id, name, username, email, sector, role, areas) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, user.name, user.username, user.email, user.sector, user.role, user.areas]);
  return id;
}

export async function updateUser(id, input) {
  const user = validateUser(input);
  const { rows } = await query("SELECT count(*)::integer AS total FROM ccn_admin_users WHERE role='admin' AND active=TRUE AND id<>$1", [id]);
  if ((user.role !== 'admin' || input.active === false) && rows[0].total === 0) {
    const { rows: target } = await query('SELECT role, active FROM ccn_admin_users WHERE id=$1', [id]);
    if (target[0]?.role === 'admin' && target[0]?.active) throw new Error('Mantenha pelo menos um administrador ativo.');
  }
  const { rowCount } = await query('UPDATE ccn_admin_users SET name=$2, username=$3, email=$4, sector=$5, role=$6, areas=$7, active=$8, auth_version=auth_version+1, updated_at=NOW() WHERE id=$1', [id, user.name, user.username, user.email, user.sector, user.role, user.areas, input.active !== false]);
  return rowCount === 1;
}

function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }

export async function issueAccessToken(userId, purpose) {
  const token = randomBytes(32).toString('base64url');
  const duration = purpose === 'invite' ? 48 : 1;
  await transaction(async q => {
    await q('DELETE FROM ccn_admin_tokens WHERE user_id=$1 AND used_at IS NULL', [userId]);
    await q('INSERT INTO ccn_admin_tokens (token_hash,user_id,purpose,expires_at) VALUES ($1,$2,$3,NOW()+$4::integer * INTERVAL \'1 hour\')', [tokenHash(token), userId, purpose, duration]);
  });
  return token;
}

export async function consumeAccessToken(token, password) {
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{40,60}$/.test(token)) return false;
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Use uma senha de 12 a 256 caracteres.');
  return transaction(async q => {
    const { rows } = await q('SELECT user_id FROM ccn_admin_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE', [tokenHash(token)]);
    if (!rows[0]) return false;
    const result = await q('UPDATE ccn_admin_users SET password_hash=$2, auth_version=auth_version+1, updated_at=NOW() WHERE id=$1 AND active=TRUE', [rows[0].user_id, passwordHash(password)]);
    if (result.rowCount !== 1) return false;
    await q('UPDATE ccn_admin_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL', [rows[0].user_id]);
    return true;
  });
}

export async function findRecoveryUser(email) {
  const { rows } = await query('SELECT id, name, username, email FROM ccn_admin_users WHERE lower(email)=lower($1) AND active=TRUE LIMIT 1', [email]);
  return rows[0] || null;
}

export function accessLink(token) {
  const origin = process.env.CCN_PUBLIC_ORIGIN;
  if (!origin || new URL(origin).protocol !== 'https:') throw new Error('Origem HTTPS institucional não configurada.');
  return `${origin.replace(/\/$/, '')}/admin#token=${encodeURIComponent(token)}`;
}

export async function sendAccessEmail(user, purpose, token) {
  const mailer = await createInstitutionalMailer();
  try {
    const url = accessLink(token);
    const subject = purpose === 'invite' ? 'Convite para o painel CCN Digital' : 'Redefinição de senha — CCN Digital';
    const intro = purpose === 'invite' ? 'Você recebeu um convite para o painel CCN Digital.' : 'Foi solicitada a redefinição da sua senha no painel CCN Digital.';
    await mailer.send({ to: user.email, subject, text: `${intro}\n\nAbra o link para definir sua senha:\n${url}\n\nO link é individual e expira em ${purpose === 'invite' ? '48 horas' : '1 hora'}. Se você não solicitou esta mensagem, ignore-a.`, headers: { 'X-Auto-Response-Suppress': 'All' } });
  } finally { mailer.close(); }
}

export async function logActivity(actorId, action, targetId = null) {
  await query('INSERT INTO ccn_admin_activity (actor_id,action,target_id) VALUES ($1,$2,$3)', [actorId, action, targetId]);
}

export async function listActivity() {
  const { rows } = await query('SELECT a.action, a.created_at, u.name AS actor_name FROM ccn_admin_activity a LEFT JOIN ccn_admin_users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 30');
  return rows.map(row => ({ action: row.action, actor: row.actor_name || 'Conta de transição', at: row.created_at }));
}
