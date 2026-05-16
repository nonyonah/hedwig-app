-- 053_gateway_auto_deposit_preference.sql
-- Persist the Aggregated USDC opt-in setting so web can reflect the mobile
-- controlled state without allowing web-side changes yet.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS gateway_auto_deposit_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.gateway_auto_deposit_enabled IS
    'Mobile-controlled preference. When true, new incoming USDC is eligible for automatic deposit into Circle Gateway aggregated balance.';
