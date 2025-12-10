-- Add Stacks wallet address column to users table
-- Stacks wallets are generated client-side using Stacks.js and stored here
ALTER TABLE users ADD COLUMN IF NOT EXISTS stacks_wallet_address TEXT;

-- Add index for Stacks wallet address lookups
CREATE INDEX IF NOT EXISTS idx_users_stacks_wallet_address ON users(stacks_wallet_address);
