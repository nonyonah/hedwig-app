-- 101_virtual_accounts.sql — unified currency accounts ledger (stablecoin +
-- fiat virtual accounts). Balances are cached snapshots updated by provider
-- webhooks; the stablecoin row is auto-provisioned on first read.

CREATE TABLE IF NOT EXISTS virtual_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('USDC','USD','NGN','EUR','MXN')),
  account_type TEXT NOT NULL DEFAULT 'checking'
    CHECK (account_type IN ('checking','savings','payroll','stablecoin')),
  provider TEXT NOT NULL DEFAULT 'hedwig'
    CHECK (provider IN ('hedwig','bridge','strails')),
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','pending','provisioning','frozen')),
  label TEXT,
  balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  balance_usd NUMERIC(20,2) NOT NULL DEFAULT 0,
  account_number_masked TEXT,
  bank_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id, currency, account_type)
);
CREATE INDEX IF NOT EXISTS idx_virtual_accounts_user ON virtual_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_virtual_accounts_workspace ON virtual_accounts(workspace_id);
