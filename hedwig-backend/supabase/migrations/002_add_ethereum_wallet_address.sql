-- Add ethereum_wallet_address column to users table
-- This migration adds support for storing the user's Ethereum wallet address

ALTER TABLE users
ADD COLUMN ethereum_wallet_address TEXT UNIQUE;

-- Create index for better query performance
CREATE INDEX idx_users_ethereum_wallet ON users(ethereum_wallet_address);

-- Add comment to document the column
COMMENT ON COLUMN users.ethereum_wallet_address IS 'User''s Ethereum wallet address from Privy embedded wallet';
