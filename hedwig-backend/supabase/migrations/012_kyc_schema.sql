-- KYC Schema Migration
-- Adds KYC verification fields to users table for Sumsub integration

-- Create KYC status enum
CREATE TYPE kyc_status AS ENUM (
    'not_started',
    'pending', 
    'approved',
    'rejected',
    'retry_required'
);

-- Add KYC columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS kyc_status kyc_status NOT NULL DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS kyc_applicant_id TEXT,
ADD COLUMN IF NOT EXISTS kyc_level TEXT DEFAULT 'basic_kyc',
ADD COLUMN IF NOT EXISTS kyc_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS kyc_rejection_labels JSONB;

-- Create index for faster KYC status lookups
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_kyc_applicant_id ON users(kyc_applicant_id);

-- Comment for documentation
COMMENT ON COLUMN users.kyc_status IS 'Current KYC verification status';
COMMENT ON COLUMN users.kyc_applicant_id IS 'Sumsub applicant ID';
COMMENT ON COLUMN users.kyc_level IS 'Verification level name in Sumsub';
COMMENT ON COLUMN users.kyc_reviewed_at IS 'Timestamp of last KYC review';
COMMENT ON COLUMN users.kyc_rejection_labels IS 'Internal rejection reasons from Sumsub (not exposed to user)';
