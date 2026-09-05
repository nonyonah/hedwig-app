-- 098_mcp_oauth_partner_accounts.sql — Nche port: MCP OAuth provider tables +
-- partner product activations.

CREATE TABLE IF NOT EXISTS mcp_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL DEFAULT 'MCP client',
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES mcp_clients(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'hedwig:read',
  code_challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES mcp_clients(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'hedwig:read',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_refresh_user ON mcp_refresh_tokens(user_id);

-- Partner product activations (USD account / card / bank transfer / wallet)
CREATE TABLE IF NOT EXISTS partner_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  product TEXT NOT NULL CHECK (product IN ('USD_ACCOUNT','CARD','BANK_TRANSFER','STABLECOIN_WALLET')),
  provider TEXT NOT NULL DEFAULT 'BRIDGE',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REJECTED')),
  provider_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product, provider)
);
CREATE INDEX IF NOT EXISTS idx_partner_user ON partner_accounts(user_id);
