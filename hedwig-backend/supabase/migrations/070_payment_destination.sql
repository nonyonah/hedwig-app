-- Migration 070: Add payment destination routing for invoices and payment links
-- When a payment is made against an invoice or payment link, it should route
-- to the workspace treasury if the creator has an active workspace.

-- Extend treasury_tx_source enum to include invoice and payment_link sources
ALTER TYPE treasury_tx_source ADD VALUE IF NOT EXISTS 'invoice';
ALTER TYPE treasury_tx_source ADD VALUE IF NOT EXISTS 'payment_link';

-- Add columns to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS payment_destination TEXT NOT NULL DEFAULT 'personal'
    CHECK (payment_destination IN ('personal', 'treasury')),
  ADD COLUMN IF NOT EXISTS destination_wallet_address TEXT;

-- Backfill: existing records route to the creator's personal wallet
UPDATE documents
SET
  payment_destination = 'personal',
  destination_wallet_address = (
    SELECT COALESCE(ethereum_wallet_address, solana_address) FROM users WHERE users.id = documents.user_id
  )
WHERE destination_wallet_address IS NULL
  AND user_id IS NOT NULL;

-- For documents where we can't resolve the user's wallet, leave as NULL
-- (these would be orphaned records, but still set destination to personal)
UPDATE documents
SET payment_destination = 'personal'
WHERE payment_destination IS NULL;
