-- 063: Workspace treasury — multi-chain wallets + payouts
-- Treasury wallets generated via Privy (Base EVM + Solana).
-- Invoices from org workspaces route payments to treasury.
-- Payouts send USDC to members' personal wallets on supported chains.

-- ─── Add treasury addresses to workspaces ─────────────────────────────────
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS treasury_solana_address TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS treasury_base_address TEXT;

-- ─── Workspace payouts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_payouts (
  id TEXT PRIMARY KEY DEFAULT 'payout_' || replace(gen_random_uuid()::text, '-', ''),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  initiated_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  fee_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspace_payouts_workspace ON workspace_payouts(workspace_id);

-- ─── Payout line items per member ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_payout_items (
  id TEXT PRIMARY KEY DEFAULT 'pi_' || replace(gen_random_uuid()::text, '-', ''),
  payout_id TEXT NOT NULL REFERENCES workspace_payouts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  destination_address TEXT NOT NULL,
  reason TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_items_payout ON workspace_payout_items(payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_items_user ON workspace_payout_items(user_id);
