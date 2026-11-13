import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL antes da limpeza.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
try {
  const result = await pool.query('DELETE FROM ccn_kv WHERE expires_at <= NOW()');
  await pool.query('DELETE FROM ccn_admin_tokens WHERE expires_at <= NOW() OR used_at < NOW() - INTERVAL \'7 days\'');
  await pool.query('DELETE FROM ccn_admin_activity WHERE created_at < NOW() - INTERVAL \'365 days\'');
  console.log(`Registros temporários vencidos removidos: ${result.rowCount}.`);
} finally { await pool.end(); }
