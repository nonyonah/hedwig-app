-- 103_virtual_account_number.sql — store the full receiving account number
-- (needed to display/copy it; account numbers are public receiving
-- credentials, unlike the masked variant used in lists).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'virtual_accounts' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE virtual_accounts ADD COLUMN account_number TEXT;
  END IF;
END $$;
