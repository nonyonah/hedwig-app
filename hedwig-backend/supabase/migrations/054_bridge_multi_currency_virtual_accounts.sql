-- 054_bridge_multi_currency_virtual_accounts.sql
-- Prepare Bridge virtual account storage for non-USD rails without enabling
-- the product surface yet. USD remains backed by user_usd_accounts until the
-- multi-currency rollout is explicitly enabled.

CREATE TABLE IF NOT EXISTS user_bridge_virtual_accounts (
    id TEXT PRIMARY KEY DEFAULT ('bridgeva_' || replace(gen_random_uuid()::text, '-', '')),
    user_id TEXT NOT NULL,
    bridge_customer_id TEXT,
    bridge_virtual_account_id TEXT UNIQUE,

    source_currency TEXT NOT NULL CHECK (source_currency IN ('USD', 'GBP', 'EUR', 'MXN')),
    source_rail TEXT,
    destination_currency TEXT NOT NULL DEFAULT 'USDC',
    destination_rail TEXT NOT NULL DEFAULT 'base',
    destination_address TEXT,

    provider_status TEXT NOT NULL DEFAULT 'not_started',
    feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    account_number_masked TEXT,
    routing_number_masked TEXT,
    iban_masked TEXT,
    bic_swift TEXT,
    sort_code_masked TEXT,
    clabe_masked TEXT,
    bank_name TEXT,
    bank_address TEXT,
    account_name TEXT,
    deposit_instructions JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_user_bridge_virtual_accounts_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_bridge_virtual_accounts_currency
    ON user_bridge_virtual_accounts (user_id, source_currency);

CREATE INDEX IF NOT EXISTS idx_user_bridge_virtual_accounts_user
    ON user_bridge_virtual_accounts (user_id);

CREATE INDEX IF NOT EXISTS idx_user_bridge_virtual_accounts_currency
    ON user_bridge_virtual_accounts (source_currency);

CREATE INDEX IF NOT EXISTS idx_user_bridge_virtual_accounts_status
    ON user_bridge_virtual_accounts (provider_status);

CREATE OR REPLACE FUNCTION trg_user_bridge_virtual_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_bridge_virtual_accounts_updated_at ON user_bridge_virtual_accounts;
CREATE TRIGGER user_bridge_virtual_accounts_updated_at
    BEFORE UPDATE ON user_bridge_virtual_accounts
    FOR EACH ROW
    EXECUTE FUNCTION trg_user_bridge_virtual_accounts_updated_at();

ALTER TABLE user_bridge_virtual_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_bridge_virtual_accounts_select_own_policy
    ON user_bridge_virtual_accounts
    FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM users
            WHERE supabase_id = auth.uid()::text
               OR privy_id = auth.uid()::text
               OR id = auth.uid()::text
        )
    );

COMMENT ON TABLE user_bridge_virtual_accounts IS
    'Bridge virtual account records for future multi-currency receive accounts. Non-USD currencies are disabled until product rollout.';

COMMENT ON COLUMN user_bridge_virtual_accounts.feature_enabled IS
    'Controls whether the currency account is visible/usable. GBP, EUR, and MXN remain false until enabled.';
