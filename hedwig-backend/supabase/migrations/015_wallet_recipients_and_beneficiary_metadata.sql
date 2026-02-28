-- Wallet recipients (address book) for send flow
CREATE TABLE IF NOT EXISTS wallet_recipients (
    id TEXT PRIMARY KEY DEFAULT ('rec_' || replace(gen_random_uuid()::text, '-', '')),
    user_id TEXT NOT NULL,
    address TEXT NOT NULL,
    chain TEXT NOT NULL CHECK (chain IN ('base', 'solana')),
    label TEXT,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_wallet_recipients_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT unique_wallet_recipient UNIQUE (user_id, address)
);

CREATE INDEX IF NOT EXISTS idx_wallet_recipients_user_id ON wallet_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_recipients_last_used ON wallet_recipients(user_id, last_used_at DESC);

-- RLS policy parity with existing backend service-role access pattern
ALTER TABLE wallet_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_recipients_select_policy ON wallet_recipients
    FOR SELECT USING (true);

CREATE POLICY wallet_recipients_insert_policy ON wallet_recipients
    FOR INSERT WITH CHECK (true);

CREATE POLICY wallet_recipients_update_policy ON wallet_recipients
    FOR UPDATE USING (true);

CREATE POLICY wallet_recipients_delete_policy ON wallet_recipients
    FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION update_wallet_recipients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_wallet_recipients_timestamp ON wallet_recipients;
CREATE TRIGGER update_wallet_recipients_timestamp
    BEFORE UPDATE ON wallet_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_recipients_updated_at();

-- Beneficiary metadata extensions for better UX round-tripping
ALTER TABLE beneficiaries
    ADD COLUMN IF NOT EXISTS bank_code TEXT,
    ADD COLUMN IF NOT EXISTS country_id TEXT,
    ADD COLUMN IF NOT EXISTS network_id TEXT;
