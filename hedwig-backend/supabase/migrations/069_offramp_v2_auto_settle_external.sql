-- External payroll recipients table (must exist before payroll_items FK)
CREATE TABLE IF NOT EXISTS external_payroll_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  display_name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_external_recipient_workspace_address UNIQUE (workspace_id, wallet_address)
);

-- Offramp v2: extend offramp_orders for new statuses and v2 fields
ALTER TYPE offramp_status ADD VALUE IF NOT EXISTS 'initiated';
ALTER TYPE offramp_status ADD VALUE IF NOT EXISTS 'deposited';
ALTER TYPE offramp_status ADD VALUE IF NOT EXISTS 'validated';
ALTER TYPE offramp_status ADD VALUE IF NOT EXISTS 'settled';
ALTER TYPE offramp_status ADD VALUE IF NOT EXISTS 'refunding';
ALTER TYPE offramp_status ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE offramp_status ADD VALUE IF NOT EXISTS 'expired';

-- New columns for offramp v2
ALTER TABLE offramp_orders ADD COLUMN IF NOT EXISTS offramp_source TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE offramp_orders ADD COLUMN IF NOT EXISTS recipient JSONB;
ALTER TABLE offramp_orders ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE offramp_orders ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE offramp_orders ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE offramp_orders ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Auto-settlement columns on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_settle BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_settle_bank_account JSONB;

-- External recipient support for payroll
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS recipient_type TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS external_recipient_id UUID REFERENCES external_payroll_recipients(id) ON DELETE SET NULL;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS external_wallet_address TEXT;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS auto_settle_triggered BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS auto_settle_status TEXT;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS auto_settle_offramp_order_id TEXT REFERENCES offramp_orders(id) ON DELETE SET NULL;

-- Make recipient_user_id nullable (external recipients don't have a user)
ALTER TABLE payroll_items ALTER COLUMN recipient_user_id DROP NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_external_recipients_workspace ON external_payroll_recipients(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_external_recipient ON payroll_items(external_recipient_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_auto_settle ON payroll_items(auto_settle_offramp_order_id);
CREATE INDEX IF NOT EXISTS idx_offramp_orders_offramp_source ON offramp_orders(offramp_source);
