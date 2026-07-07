-- Migration: Stellar wallet columns for server-side keypair management
-- Phase 1 of Stellar integration — each user gets a Stellar keypair alongside EVM and Solana

ALTER TABLE users ADD COLUMN IF NOT EXISTS stellar_public_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stellar_encrypted_seed TEXT;

CREATE INDEX IF NOT EXISTS idx_users_stellar_public_key ON users(stellar_public_key);
