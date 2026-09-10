-- 104_virtual_accounts_providers_types.sql — allow the flutterwave provider
-- and the Nigerian-style `current` account type.

ALTER TABLE virtual_accounts
  DROP CONSTRAINT IF EXISTS virtual_accounts_provider_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'virtual_accounts_provider_check'
  ) THEN
    ALTER TABLE virtual_accounts
      ADD CONSTRAINT virtual_accounts_provider_check
      CHECK (provider IN ('hedwig','bridge','strails','flutterwave'));
  END IF;
END $$;

ALTER TABLE virtual_accounts
  DROP CONSTRAINT IF EXISTS virtual_accounts_account_type_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'virtual_accounts_account_type_check'
  ) THEN
    ALTER TABLE virtual_accounts
      ADD CONSTRAINT virtual_accounts_account_type_check
      CHECK (account_type IN ('checking','savings','payroll','stablecoin','current'));
  END IF;
END $$;
