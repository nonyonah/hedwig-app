-- 066: Payroll module + treasury wallet enhancements

-- ─── Add privy_wallet_id to treasury_wallets ──────────────────────────────
ALTER TABLE treasury_wallets ADD COLUMN IF NOT EXISTS privy_wallet_id TEXT;

-- ─── Payroll runs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  initiated_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL CHECK (run_type IN ('fixed', 'project')),
  total_amount_usdc NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'reserved', 'executing', 'completed', 'partial_failed')),
  reservation_tx_id UUID REFERENCES treasury_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_workspace ON payroll_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(workspace_id, status);

-- ─── Payroll line items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_usdc NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_recipient ON payroll_items(recipient_user_id);
