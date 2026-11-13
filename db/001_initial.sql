-- Instalar uma vez no banco exclusivo do CCN Digital.
CREATE TABLE IF NOT EXISTS ccn_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ccn_kv_expires_at_idx
  ON ccn_kv (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS ccn_admin_users (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  sector VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  areas TEXT[] NOT NULL DEFAULT '{}',
  password_hash TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  auth_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ccn_admin_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES ccn_admin_users(id) ON DELETE CASCADE,
  purpose VARCHAR(16) NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ccn_admin_tokens_user_idx ON ccn_admin_tokens (user_id);
CREATE INDEX IF NOT EXISTS ccn_admin_tokens_expires_idx ON ccn_admin_tokens (expires_at);

CREATE TABLE IF NOT EXISTS ccn_admin_activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID,
  action VARCHAR(48) NOT NULL,
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
