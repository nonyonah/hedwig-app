-- 043_user_bank_accounts_multi.sql
-- Allow multiple payout bank accounts per user. Drops the UNIQUE constraint
-- on user_id and adds an is_default flag with a partial unique index so that
-- exactly one default account exists per user.

-- 1. Drop the old single-account constraint (name auto-generated as
--    user_bank_accounts_user_id_key by Postgres for the UNIQUE on user_id).
ALTER TABLE user_bank_accounts
    DROP CONSTRAINT IF EXISTS user_bank_accounts_user_id_key;

-- 2. Add is_default column.
ALTER TABLE user_bank_accounts
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Backfill: every existing row becomes the user's default.
UPDATE user_bank_accounts
SET is_default = TRUE
WHERE is_default = FALSE
  AND user_id IN (
      SELECT user_id FROM user_bank_accounts GROUP BY user_id HAVING COUNT(*) = 1
  );

-- 4. Partial unique index — only one row per user can have is_default = TRUE.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_bank_default
    ON user_bank_accounts (user_id)
    WHERE is_default = TRUE;

-- 5. Helpful indexes for list / lookup paths.
CREATE INDEX IF NOT EXISTS idx_user_bank_user
    ON user_bank_accounts (user_id);

CREATE INDEX IF NOT EXISTS idx_user_bank_user_currency
    ON user_bank_accounts (user_id, currency);

COMMENT ON COLUMN user_bank_accounts.is_default IS
    'Exactly one row per user_id may have is_default = TRUE. Used as the preselected payout when rendering invoices and payment links.';
