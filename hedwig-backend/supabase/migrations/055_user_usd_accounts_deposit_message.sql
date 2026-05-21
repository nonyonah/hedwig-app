-- 055_user_usd_accounts_deposit_message.sql
-- Bridge static memo/template deposit instructions can include a
-- deposit_message that payers must include for reliable reconciliation.

ALTER TABLE user_usd_accounts
    ADD COLUMN IF NOT EXISTS deposit_message TEXT;

COMMENT ON COLUMN user_usd_accounts.deposit_message IS
    'Bridge deposit message / memo / reference that payers must include when present.';
