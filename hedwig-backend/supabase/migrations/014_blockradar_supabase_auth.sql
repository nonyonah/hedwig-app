-- Migration: Add Blockradar and Supabase Auth support
-- This migration adds columns for Blockradar wallet addresses and Supabase Auth integration

-- Add Supabase Auth ID column to users (replaces privy_id as primary auth identity)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS supabase_id TEXT UNIQUE;

-- Add Blockradar address columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS blockradar_address_id TEXT,
  ADD COLUMN IF NOT EXISTS blockradar_address TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_supabase_id ON users(supabase_id);
CREATE INDEX IF NOT EXISTS idx_users_blockradar_address_id ON users(blockradar_address_id);

-- User balances table (cached from Blockradar webhooks for fast queries)
CREATE TABLE IF NOT EXISTS user_balances (
  id TEXT PRIMARY KEY DEFAULT ('bal_' || replace(uuid_generate_v4()::text, '-', '')),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, chain, asset)
);

-- Index for balance lookups
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON user_balances(user_id);

-- Blockradar webhook events log (for auditing and debugging)
CREATE TABLE IF NOT EXISTS blockradar_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  address_id TEXT,
  transaction_id TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for event lookups
CREATE INDEX IF NOT EXISTS idx_blockradar_events_type ON blockradar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_blockradar_events_address ON blockradar_events(address_id);
CREATE INDEX IF NOT EXISTS idx_blockradar_events_processed ON blockradar_events(processed_at);

-- Enable RLS on new tables
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockradar_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_balances (users can only see their own balances)
CREATE POLICY "Users can view their own balances"
    ON user_balances FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE supabase_id = auth.uid()::text OR privy_id = auth.uid()::text));

-- Service role can do anything with blockradar_events (no user access needed)
CREATE POLICY "Service role full access to blockradar_events"
    ON blockradar_events FOR ALL
    USING (true)
    WITH CHECK (true);

-- Update RLS policies on users table to also check supabase_id
CREATE POLICY "Users can view own data via supabase_id"
    ON users FOR SELECT
    USING (auth.uid()::text = supabase_id OR auth.uid()::text = privy_id);

-- Comment for documentation
COMMENT ON COLUMN users.supabase_id IS 'Supabase Auth user ID (UUID format)';
COMMENT ON COLUMN users.blockradar_address_id IS 'Blockradar dedicated address ID for this user';
COMMENT ON COLUMN users.blockradar_address IS 'Blockradar dedicated address (0x...) for receiving deposits';
COMMENT ON TABLE user_balances IS 'Cached user balances from Blockradar webhooks';
COMMENT ON TABLE blockradar_events IS 'Audit log of all Blockradar webhook events received';
