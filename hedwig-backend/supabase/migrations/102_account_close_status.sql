-- 102_account_close_status.sql — allow closing virtual accounts (history
-- preserved; rows are never deleted).

ALTER TABLE virtual_accounts
  DROP CONSTRAINT IF EXISTS virtual_accounts_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'virtual_accounts_status_check'
  ) THEN
    ALTER TABLE virtual_accounts
      ADD CONSTRAINT virtual_accounts_status_check
      CHECK (status IN ('active','pending','provisioning','frozen','closed'));
  END IF;
END $$;
