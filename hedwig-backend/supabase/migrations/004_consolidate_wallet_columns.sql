-- Consolidate EVM wallet addresses into single ethereum_wallet_address column
-- Since all EVM chains use the same address, we don't need separate columns for Base and Celo

-- Add new ethereum_wallet_address column
ALTER TABLE users ADD COLUMN IF NOT EXISTS ethereum_wallet_address TEXT;

-- Copy data from base_wallet_address to ethereum_wallet_address
UPDATE users 
SET ethereum_wallet_address = base_wallet_address 
WHERE base_wallet_address IS NOT NULL;

-- Drop the old redundant columns
ALTER TABLE users DROP COLUMN IF EXISTS base_wallet_address;
ALTER TABLE users DROP COLUMN IF EXISTS celo_wallet_address;

-- Optional: Add index for faster wallet lookups
CREATE INDEX IF NOT EXISTS idx_users_ethereum_wallet ON users(ethereum_wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_solana_wallet ON users(solana_wallet_address);
