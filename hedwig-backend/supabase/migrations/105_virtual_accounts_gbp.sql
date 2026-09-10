-- 105_virtual_accounts_gbp.sql — offer GBP alongside NGN/USD/EUR
-- (MXN stays in the constraint harmlessly; it is simply not offered).

ALTER TABLE virtual_accounts
  DROP CONSTRAINT IF EXISTS virtual_accounts_currency_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'virtual_accounts_currency_check'
  ) THEN
    ALTER TABLE virtual_accounts
      ADD CONSTRAINT virtual_accounts_currency_check
      CHECK (currency IN ('USDC','USD','NGN','EUR','MXN','GBP'));
  END IF;
END $$;
