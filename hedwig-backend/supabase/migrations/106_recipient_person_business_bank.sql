-- 106_recipient_person_business_bank.sql — recipients can be crypto
-- (address+chain) or bank (bank details), owned by a person or business.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_recipients' AND column_name = 'recipient_type'
  ) THEN
    ALTER TABLE wallet_recipients
      ADD COLUMN recipient_type TEXT NOT NULL DEFAULT 'person';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wallet_recipients' AND column_name = 'bank_code'
  ) THEN
    ALTER TABLE wallet_recipients
      ADD COLUMN bank_code TEXT,
      ADD COLUMN bank_name TEXT,
      ADD COLUMN account_number TEXT,
      ADD COLUMN currency TEXT,
      ADD COLUMN country TEXT;
  END IF;

  -- Bank recipients carry account details instead of a chain address.
  ALTER TABLE wallet_recipients ALTER COLUMN address DROP NOT NULL;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_recipients_chain_check'
  ) THEN
    ALTER TABLE wallet_recipients DROP CONSTRAINT wallet_recipients_chain_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_recipients_chain_check2'
  ) THEN
    ALTER TABLE wallet_recipients
      ADD CONSTRAINT wallet_recipients_chain_check2
      CHECK (chain IN ('base','solana','bank'));
  END IF;
END $$;
