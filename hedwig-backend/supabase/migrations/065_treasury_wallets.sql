-- 065: Dedicated treasury wallets + transaction ledger
-- Separate Privy-created wallets for workspace treasuries.
-- Transactions track all inflows/outflows with status tracking.

-- ─── Treasury wallets ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treasury_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  privy_wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT uq_treasury_wallets_workspace UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_treasury_wallets_workspace ON treasury_wallets(workspace_id);

-- ─── Treasury transactions ────────────────────────────────────────────────
CREATE TYPE treasury_tx_type AS ENUM ('inflow', 'payroll_out', 'manual_transfer');
CREATE TYPE treasury_tx_source AS ENUM ('ngn_account', 'usd_account', 'direct_crypto', 'manual');
CREATE TYPE treasury_tx_status AS ENUM ('pending', 'completed', 'failed', 'pending_convert');

CREATE TABLE IF NOT EXISTS treasury_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type treasury_tx_type NOT NULL,
  source treasury_tx_source NOT NULL,
  original_amount NUMERIC,
  original_currency TEXT,
  usdc_amount NUMERIC NOT NULL,
  conversion_rate NUMERIC,
  status treasury_tx_status NOT NULL DEFAULT 'pending',
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treasury_tx_workspace ON treasury_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_treasury_tx_created ON treasury_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_treasury_tx_status ON treasury_transactions(status);
