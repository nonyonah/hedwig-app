-- 042_user_bank_accounts.sql
-- External payout bank account that the user owns (manual/off-platform).
-- Distinct from user_usd_accounts (Bridge-assigned ACH receive account).
-- One row per user; country-specific fields validated at the app layer.

CREATE TABLE IF NOT EXISTS user_bank_accounts (
    id TEXT PRIMARY KEY DEFAULT ('bank_' || replace(uuid_generate_v4()::text, '-', '')),
    user_id TEXT NOT NULL UNIQUE,

    country TEXT NOT NULL CHECK (country IN ('NG', 'US', 'UK', 'GH')),
    currency TEXT NOT NULL,                      -- NGN / USD / GBP / GHS
    account_holder_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    bank_code TEXT,                              -- Paystack/GoCardless lookup id

    account_number TEXT,                         -- NG/GH/US/UK; UK = 8-digit
    routing_number TEXT,                         -- US ABA (9-digit)
    sort_code TEXT,                              -- UK (6-digit)
    iban TEXT,                                   -- UK alt
    swift_bic TEXT,                              -- intl, optional
    account_type TEXT CHECK (account_type IN ('checking', 'savings') OR account_type IS NULL),

    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verification_method TEXT,                    -- 'paystack', 'gocardless', 'manual'

    -- User can opt to hide bank details on a per-document basis. Default is
    -- to show on every invoice/payment-link unless overridden.
    show_on_invoice BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_user_bank_accounts_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_country
    ON user_bank_accounts (country);

CREATE OR REPLACE FUNCTION trg_user_bank_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_bank_accounts_updated_at ON user_bank_accounts;
CREATE TRIGGER user_bank_accounts_updated_at
    BEFORE UPDATE ON user_bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION trg_user_bank_accounts_updated_at();

COMMENT ON TABLE user_bank_accounts IS
    'External payout bank account (manual entry). Shown on invoices and payment links so payers can transfer fiat directly to the user.';
COMMENT ON COLUMN user_bank_accounts.country IS 'ISO-like 2-letter country code limited to NG, US, UK, GH.';
COMMENT ON COLUMN user_bank_accounts.is_verified IS 'True after a successful verification call (Paystack /bank/resolve, GoCardless modulus, or manual confirmation).';
