-- Bridge USD Accounts v1
-- ACH receive details + auto-settlement metadata + per-deposit fee ledger

CREATE TABLE IF NOT EXISTS user_usd_accounts (
    id TEXT PRIMARY KEY DEFAULT ('usdacc_' || replace(gen_random_uuid()::text, '-', '')),
    user_id TEXT NOT NULL UNIQUE,
    bridge_customer_id TEXT UNIQUE,
    bridge_virtual_account_id TEXT UNIQUE,
    bridge_kyc_status TEXT NOT NULL DEFAULT 'not_started',
    provider_status TEXT NOT NULL DEFAULT 'not_started',
    ach_account_number_masked TEXT,
    ach_routing_number_masked TEXT,
    bank_name TEXT,
    settlement_chain TEXT NOT NULL DEFAULT 'BASE',
    settlement_token TEXT NOT NULL DEFAULT 'USDC',
    feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_user_usd_accounts_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_usd_accounts_user_id ON user_usd_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_usd_accounts_provider_status ON user_usd_accounts(provider_status);

CREATE TABLE IF NOT EXISTS bridge_webhook_events (
    id TEXT PRIMARY KEY DEFAULT ('bridgeevt_' || replace(gen_random_uuid()::text, '-', '')),
    provider_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    processing_error TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bridge_webhook_events_event_type ON bridge_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_bridge_webhook_events_processed ON bridge_webhook_events(processed);

CREATE TABLE IF NOT EXISTS bridge_usd_transfers (
    id TEXT PRIMARY KEY DEFAULT ('bridgexfer_' || replace(gen_random_uuid()::text, '-', '')),
    user_id TEXT NOT NULL,
    bridge_transfer_id TEXT NOT NULL UNIQUE,
    bridge_event_id TEXT UNIQUE,
    direction TEXT NOT NULL DEFAULT 'inbound',
    status TEXT NOT NULL DEFAULT 'pending',
    usd_amount_gross DOUBLE PRECISION NOT NULL DEFAULT 0,
    hedwig_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    provider_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    usd_amount_net DOUBLE PRECISION NOT NULL DEFAULT 0,
    usdc_amount_settled DOUBLE PRECISION NOT NULL DEFAULT 0,
    usdc_tx_hash TEXT,
    settlement_wallet_address TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT fk_bridge_usd_transfers_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bridge_usd_transfers_user_id ON bridge_usd_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_bridge_usd_transfers_status ON bridge_usd_transfers(status);
CREATE INDEX IF NOT EXISTS idx_bridge_usd_transfers_created_at ON bridge_usd_transfers(created_at DESC);

CREATE TABLE IF NOT EXISTS usd_fee_ledger (
    id TEXT PRIMARY KEY DEFAULT ('usdfee_' || replace(gen_random_uuid()::text, '-', '')),
    user_id TEXT NOT NULL,
    transfer_id TEXT NOT NULL UNIQUE,
    fee_percent DOUBLE PRECISION NOT NULL,
    fee_usd DOUBLE PRECISION NOT NULL,
    gross_usd DOUBLE PRECISION NOT NULL,
    net_usd DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_usd_fee_ledger_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_usd_fee_ledger_transfer
        FOREIGN KEY (transfer_id)
        REFERENCES bridge_usd_transfers(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usd_fee_ledger_user_id ON usd_fee_ledger(user_id);

ALTER TABLE user_usd_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_usd_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE usd_fee_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_usd_accounts_select_policy ON user_usd_accounts
    FOR SELECT USING (true);
CREATE POLICY user_usd_accounts_insert_policy ON user_usd_accounts
    FOR INSERT WITH CHECK (true);
CREATE POLICY user_usd_accounts_update_policy ON user_usd_accounts
    FOR UPDATE USING (true);
CREATE POLICY user_usd_accounts_delete_policy ON user_usd_accounts
    FOR DELETE USING (true);

CREATE POLICY bridge_webhook_events_select_policy ON bridge_webhook_events
    FOR SELECT USING (true);
CREATE POLICY bridge_webhook_events_insert_policy ON bridge_webhook_events
    FOR INSERT WITH CHECK (true);
CREATE POLICY bridge_webhook_events_update_policy ON bridge_webhook_events
    FOR UPDATE USING (true);
CREATE POLICY bridge_webhook_events_delete_policy ON bridge_webhook_events
    FOR DELETE USING (true);

CREATE POLICY bridge_usd_transfers_select_policy ON bridge_usd_transfers
    FOR SELECT USING (true);
CREATE POLICY bridge_usd_transfers_insert_policy ON bridge_usd_transfers
    FOR INSERT WITH CHECK (true);
CREATE POLICY bridge_usd_transfers_update_policy ON bridge_usd_transfers
    FOR UPDATE USING (true);
CREATE POLICY bridge_usd_transfers_delete_policy ON bridge_usd_transfers
    FOR DELETE USING (true);

CREATE POLICY usd_fee_ledger_select_policy ON usd_fee_ledger
    FOR SELECT USING (true);
CREATE POLICY usd_fee_ledger_insert_policy ON usd_fee_ledger
    FOR INSERT WITH CHECK (true);
CREATE POLICY usd_fee_ledger_update_policy ON usd_fee_ledger
    FOR UPDATE USING (true);
CREATE POLICY usd_fee_ledger_delete_policy ON usd_fee_ledger
    FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION update_user_usd_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_usd_accounts_timestamp ON user_usd_accounts;
CREATE TRIGGER update_user_usd_accounts_timestamp
    BEFORE UPDATE ON user_usd_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_user_usd_accounts_updated_at();

CREATE OR REPLACE FUNCTION update_bridge_usd_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bridge_usd_transfers_timestamp ON bridge_usd_transfers;
CREATE TRIGGER update_bridge_usd_transfers_timestamp
    BEFORE UPDATE ON bridge_usd_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_bridge_usd_transfers_updated_at();
