import { createClient } from 'redis';
import { pgAcquireLease, pgDelete, pgGet, pgReleaseLease, pgReserveAttempt, pgSet, pgTake } from './postgres-store.mjs';

let redisClient;
let redisConnection;

function storageKey(key) {
  return process.env.CCN_PREVIEW_NAMESPACE === 'true' ? `ccn-preview:${key}` : key;
}

function credentials() {
  const base = process.env.KV_REST_API_URL?.replace(/\/$/, '');
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) throw new Error('Armazenamento persistente não configurado.');
  return { base, token };
}

export function kvReady() {
  return Boolean(process.env.DATABASE_URL || process.env.REDIS_URL || (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN));
}

export function storeProvider() {
  if (process.env.DATABASE_URL) return 'PostgreSQL';
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return 'Redis REST';
  if (process.env.REDIS_URL) return 'Redis';
  return 'Não configurado';
}

export async function storageHealthy() {
  if (!kvReady()) return false;
  try { await getJson('ccn-system:health-check'); return true; }
  catch { return false; }
}

async function tcpClient() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 10_000 } });
    redisClient.on('error', () => {});
  }
  if (!redisClient.isOpen) {
    if (!redisConnection) redisConnection = redisClient.connect().finally(() => { redisConnection = undefined; });
    await redisConnection;
  }
  return redisClient;
}

async function command(parts) {
  if (process.env.REDIS_URL && !(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)) {
    const client = await tcpClient();
    return client.sendCommand(parts.map(String));
  }
  const { base, token } = credentials();
  const response = await fetch(base, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(parts),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Armazenamento persistente indisponível (${response.status}).`);
  const result = await response.json();
  if (result.error) throw new Error('O armazenamento persistente recusou a operação.');
  return result.result;
}

export async function reserveLoginAttempt(key, limit = 5, windowSeconds = 900, cost = 1) {
  if (!Number.isSafeInteger(cost) || cost < 1) throw new Error('Custo de reserva inválido.');
  key = storageKey(key);
  if (process.env.DATABASE_URL) return pgReserveAttempt(key, limit, windowSeconds, cost);
  const script = 'local n=redis.call("INCRBY",KEYS[1],ARGV[2]); if n==tonumber(ARGV[2]) then redis.call("EXPIRE",KEYS[1],ARGV[1]); end; return {n,redis.call("TTL",KEYS[1])}';
  const result = await command(['EVAL', script, 1, key, windowSeconds, cost]);
  if (!Array.isArray(result) || result.length !== 2) throw new Error('Resposta inválida do limitador de acesso.');
  const attempts = Number(result[0]);
  const retryAfter = Number(result[1]);
  if (!Number.isInteger(attempts) || !Number.isInteger(retryAfter)) throw new Error('Resposta inválida do limitador de acesso.');
  return { allowed: attempts <= limit, retryAfter: Math.max(1, retryAfter) };
}

export async function clearLoginAttempts(key) {
  key = storageKey(key);
  if (process.env.DATABASE_URL) return pgDelete(key);
  await command(['DEL', key]);
}

export async function setExpiring(key, value, seconds) {
  key = storageKey(key);
  if (process.env.DATABASE_URL) return pgSet(key, value, seconds);
  await command(['SET', key, value, 'EX', seconds]);
}

export async function deleteKey(key) {
  key = storageKey(key);
  if (process.env.DATABASE_URL) return pgDelete(key);
  await command(['DEL', key]);
}

export async function takeKey(key) {
  key = storageKey(key);
  if (process.env.DATABASE_URL) return pgTake(key);
  return command(['EVAL', 'local v=redis.call("GET",KEYS[1]); if v then redis.call("DEL",KEYS[1]); end; return v', 1, key]);
}

export async function getJson(key) {
  key = storageKey(key);
  const value = process.env.DATABASE_URL ? await pgGet(key) : await command(['GET', key]);
  if (typeof value !== 'string' || !value) return null;
  return JSON.parse(value);
}

export async function setJson(key, value) {
  key = storageKey(key);
  if (process.env.DATABASE_URL) return pgSet(key, JSON.stringify(value));
  await command(['SET', key, JSON.stringify(value)]);
}

export async function acquireLease(key, token, seconds) {
  key = storageKey(key);
  if (process.env.DATABASE_URL) return pgAcquireLease(key, token, seconds);
  return (await command(['SET', key, token, 'NX', 'EX', seconds])) === 'OK';
}

export async function releaseLease(key, token) {
  key = storageKey(key);
  if (process.env.DATABASE_URL) return pgReleaseLease(key, token);
  await command(['EVAL', 'if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end', 1, key, token]);
}
