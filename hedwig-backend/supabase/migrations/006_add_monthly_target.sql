-- Add monthly_target column to users table
-- This allows users to set their monthly earnings goal

ALTER TABLE users
ADD COLUMN monthly_target DOUBLE PRECISION DEFAULT 10000;

COMMENT ON COLUMN users.monthly_target IS 'User-configurable monthly earnings goal in USD';