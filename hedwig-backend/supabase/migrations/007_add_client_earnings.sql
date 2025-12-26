-- Add earnings tracking columns to clients table
-- Migration: 007_add_client_earnings.sql

-- Add total earnings column (calculated from paid invoices/payments)
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(18, 2) DEFAULT 0;

-- Add outstanding balance column (unpaid invoices)
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS outstanding_balance DECIMAL(18, 2) DEFAULT 0;

-- Add notes field for additional client info
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_user_earnings 
ON clients(user_id, total_earnings DESC);

-- Comment for documentation
COMMENT ON COLUMN clients.total_earnings IS 'Total amount earned from this client (sum of paid invoices)';
COMMENT ON COLUMN clients.outstanding_balance IS 'Total amount owed by this client (sum of unpaid invoices)';
