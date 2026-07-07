-- Migration: Stellar treasury wallet columns on workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stellar_treasury_public_key TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stellar_treasury_encrypted_seed TEXT;
