let poolPromise;

async function pool() {
  if (!process.env.DATABASE_URL) throw new Error('PostgreSQL não configurado.');
  if (!poolPromise) {
    poolPromise = import('pg').then(({ default: pg }) => new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    })).catch((error) => { poolPromise = undefined; throw error; });
  }
  return poolPromise;
}

export async function query(sql, parameters) {
  return (await pool()).query(sql, parameters);
}

export async function transaction(callback) {
  const client = await (await pool()).connect();
  try {
    await client.query('BEGIN');
    const result = await callback((sql, parameters) => client.query(sql, parameters));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function pgReserveAttempt(key, limit, windowSeconds, cost = 1) {
  const { rows } = await query(`
    INSERT INTO ccn_kv (key, value, expires_at)
    VALUES ($1, $3::integer::text, NOW() + $2::integer * INTERVAL '1 second')
    ON CONFLICT (key) DO UPDATE SET
      value = CASE WHEN ccn_kv.expires_at <= NOW()
        THEN $3::integer::text ELSE ((ccn_kv.value)::integer + $3::integer)::text END,
      expires_at = CASE WHEN ccn_kv.expires_at <= NOW()
        THEN NOW() + $2::integer * INTERVAL '1 second' ELSE ccn_kv.expires_at END
    RETURNING value::integer AS attempts,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())))::integer) AS retry_after
  `, [key, windowSeconds, cost]);
  const { attempts, retry_after: retryAfter } = rows[0];
  return { allowed: attempts <= limit, retryAfter };
}

export async function pgSet(key, value, seconds = null) {
  await query(`
    INSERT INTO ccn_kv (key, value, expires_at)
    VALUES ($1, $2, CASE WHEN $3::integer IS NULL THEN NULL ELSE NOW() + $3::integer * INTERVAL '1 second' END)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
  `, [key, value, seconds]);
}

export async function pgGet(key) {
  const { rows } = await query('SELECT value FROM ccn_kv WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())', [key]);
  return rows[0]?.value ?? null;
}

export async function pgDelete(key) {
  await query('DELETE FROM ccn_kv WHERE key = $1', [key]);
}

export async function pgTake(key) {
  const { rows } = await query('DELETE FROM ccn_kv WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW()) RETURNING value', [key]);
  return rows[0]?.value ?? null;
}

export async function pgAcquireLease(key, token, seconds) {
  const { rowCount } = await query(`
    INSERT INTO ccn_kv (key, value, expires_at)
    VALUES ($1, $2, NOW() + $3::integer * INTERVAL '1 second')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
    WHERE ccn_kv.expires_at <= NOW()
    RETURNING key
  `, [key, token, seconds]);
  return rowCount === 1;
}

export async function pgReleaseLease(key, token) {
  await query('DELETE FROM ccn_kv WHERE key = $1 AND value = $2', [key, token]);
}
