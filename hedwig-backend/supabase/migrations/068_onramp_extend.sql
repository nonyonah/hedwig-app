-- 068: Extend onramp_orders for Paycrest multi-corridor onramp

-- Add workspace_id for workspace treasury onramps
ALTER TABLE onramp_orders ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;

-- Store full Paycrest providerAccount + refundAccount as JSONB
ALTER TABLE onramp_orders ADD COLUMN IF NOT EXISTS provider_account JSONB;
ALTER TABLE onramp_orders ADD COLUMN IF NOT EXISTS refund_account JSONB;

-- Add direction explicitly (always 'onramp' for this table)
ALTER TABLE onramp_orders ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'onramp' CHECK (direction = 'onramp');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onramp_orders_workspace ON onramp_orders(workspace_id);
