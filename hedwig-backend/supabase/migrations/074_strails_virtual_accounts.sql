-- Migration: Add Strails columns for virtual account and NGN payment support
-- strails_user_id: The userHash returned by Strails after BVN onboarding
-- strails_va_*: The user's permanent virtual account details

ALTER TABLE users ADD COLUMN IF NOT EXISTS strails_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strails_va_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strails_va_bank TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strails_va_holder TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strails_onboarded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_strails_user_id ON users(strails_user_id);

-- Add Strails virtual account fields to documents (for invoice payments)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS strails_request_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS strails_va_number TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS strails_va_bank TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS strails_va_holder TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS strails_va_amount NUMERIC;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS strails_va_fees NUMERIC;

CREATE INDEX IF NOT EXISTS idx_documents_strails_request_id ON documents(strails_request_id);
