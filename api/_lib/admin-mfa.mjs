import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { deleteKey, getJson, setExpiring, setJson, takeKey } from './kv-store.mjs';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encryptionKey() {
  const value = process.env.CCN_MFA_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Chave privada de autenticação não configurada.');
  return Buffer.from(value, 'hex');
}

function base32(bytes) {
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += ALPHABET[(value >>> (bits -= 5)) & 31]; }
  }
  if (bits) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function unbase32(input) {
  let bits = 0, value = 0;
  const bytes = [];
  for (const character of input.toUpperCase()) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Chave TOTP inválida.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits -= 8)) & 255); }
  }
  return Buffer.from(bytes);
}

export function createMfaSecret() { return base32(randomBytes(20)); }

export function totpAt(secret, time = Date.now()) {
  const counter = Math.floor(time / 30_000);
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', unbase32(secret)).update(value).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

export function verifyTotp(secret, code, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const candidate = Buffer.from(code);
  return [-1, 0, 1].some(offset => timingSafeEqual(candidate, Buffer.from(totpAt(secret, now + offset * 30_000))));
}

export function mfaIdentity(role, account) {
  return account?.id ? `user:${account.id}` : `legacy:${role}`;
}

function storageKey(identity) {
  if (!/^(user:[a-f0-9-]{36}|legacy:(admin|developer))$/i.test(identity)) throw new Error('Conta inválida.');
  return `ccn-admin:mfa:${identity}`;
}

function encrypt(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64url'), data: data.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
}

function decrypt(record) {
  if (record?.v !== 1) throw new Error('Registro de autenticação inválido.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(record.data, 'base64url')), decipher.final()]).toString('utf8');
}

export async function readMfaSecret(identity) {
  const record = await getJson(storageKey(identity));
  return record ? decrypt(record) : null;
}

export async function saveMfaSecret(identity, secret) {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Chave TOTP inválida.');
  await setJson(storageKey(identity), encrypt(secret));
}

export async function savePendingMfa(identity, secret) {
  await setExpiring(`${storageKey(identity)}:pending`, JSON.stringify(encrypt(secret)), 600);
}

export async function readPendingMfa(identity) {
  const record = await getJson(`${storageKey(identity)}:pending`);
  return record ? decrypt(record) : null;
}

export async function clearPendingMfa(identity) { await deleteKey(`${storageKey(identity)}:pending`); }

export async function resetMfa(identity) {
  const key = storageKey(identity);
  const set = await getJson(`${key}:backup-set`);
  // Revogue os códigos primeiro: nenhum código antigo pode recuperar o fator removido.
  await deleteKey(`${key}:backup-set`);
  await deleteKey(`${key}:pending`);
  await deleteKey(`${key}:email-code`);
  await deleteKey(key);
  if (set?.id && Array.isArray(set.digests)) {
    for (const digest of set.digests) await deleteKey(`${backupPrefix(identity, set.id)}${digest}`);
  }
}

function backupPrefix(identity, setId) { return `${storageKey(identity)}:backup:${setId}:`; }
function backupDigest(code) { return createHmac('sha256', encryptionKey()).update(code).digest('hex'); }
function normalizedBackupCode(code) {
  if (typeof code !== 'string') return null;
  const value = code.replace(/-/g, '').trim().toUpperCase();
  return /^[A-F0-9]{32}$/.test(value) ? value : null;
}

export async function createBackupCodes(identity) {
  const key = `${storageKey(identity)}:backup-set`;
  const previous = await getJson(key);
  const setId = randomBytes(16).toString('hex');
  const codes = Array.from({ length: 3 }, () => randomBytes(16).toString('hex').toUpperCase());
  const digests = codes.map(backupDigest);
  for (const digest of digests) await setJson(`${backupPrefix(identity, setId)}${digest}`, 1);
  await setJson(key, { v: 1, id: setId, digests });
  if (previous?.id && Array.isArray(previous.digests)) {
    for (const digest of previous.digests) void deleteKey(`${backupPrefix(identity, previous.id)}${digest}`).catch(() => {});
  }
  return codes.map(code => code.match(/.{1,8}/g).join('-'));
}

export async function useBackupCode(identity, input) {
  const code = normalizedBackupCode(input);
  if (!code) return false;
  const set = await getJson(`${storageKey(identity)}:backup-set`);
  if (set?.v !== 1 || !/^[a-f0-9]{32}$/.test(set.id || '')) return false;
  const digest = backupDigest(code);
  if (!Array.isArray(set.digests) || !set.digests.includes(digest)) return false;
  const used = (await takeKey(`${backupPrefix(identity, set.id)}${digest}`)) !== null;
  return used && (await readMfaVersion(identity)) === set.id;
}

// Código de 6 dígitos enviado ao e-mail cadastrado quando a pessoa perdeu autenticador e códigos de recuperação.
const EMAIL_CODE_SECONDS = 600;
const EMAIL_CODE_TRIES = 5;

export async function createEmailRecoveryCode(identity) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await setExpiring(`${storageKey(identity)}:email-code`, JSON.stringify({ digest: backupDigest(`email:${code}`), tries: 0, expires: Date.now() + EMAIL_CODE_SECONDS * 1000 }), EMAIL_CODE_SECONDS);
  return code;
}

export async function useEmailRecoveryCode(identity, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const key = `${storageKey(identity)}:email-code`;
  const record = await getJson(key);
  if (!record?.digest) return false;
  const expected = Buffer.from(backupDigest(`email:${code}`));
  if (Buffer.byteLength(record.digest) === expected.length && timingSafeEqual(Buffer.from(record.digest), expected)) {
    // Consumo atômico: dois envios simultâneos do mesmo código não liberam duas sessões.
    return (await takeKey(key)) !== null;
  }
  const remaining = Math.floor((record.expires - Date.now()) / 1000);
  if (record.tries + 1 >= EMAIL_CODE_TRIES || remaining < 1) await deleteKey(key);
  else await setExpiring(key, JSON.stringify({ ...record, tries: record.tries + 1 }), remaining);
  return false;
}

export async function readMfaVersion(identity) {
  const set = await getJson(`${storageKey(identity)}:backup-set`);
  return set?.v === 1 && /^[a-f0-9]{32}$/.test(set.id || '') ? set.id : null;
}

export function mfaAvailable() { return /^[a-f0-9]{64}$/i.test(process.env.CCN_MFA_ENCRYPTION_KEY || ''); }
export function mfaRequired() { return process.env.CCN_ADMIN_MFA_REQUIRED === 'true'; }

export function provisioningUri(secret, username) {
  const label = `CCN Digital:${String(username || 'Administrador').slice(0, 80)}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent('CCN Digital')}&algorithm=SHA1&digits=6&period=30`;
}
