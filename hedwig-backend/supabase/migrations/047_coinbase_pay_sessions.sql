-- 047_coinbase_pay_sessions.sql
-- Track Coinbase-hosted onramp/offramp sessions for US users.
-- Coinbase owns KYC, bank selection, and the hosted checkout/cash-out UI; this
-- table keeps Hedwig activity, webhook updates, and status polling in sync.

CREATE TABLE IF NOT EXISTS coinbase_pay_sessions (
    id TEXT PRIMARY KEY DEFAULT ('cbpay_' || replace(uuid_generate_v4()::text, '-', '')),
    user_id TEXT NOT NULL,

    direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
    partner_user_ref TEXT NOT NULL,
    coinbase_transaction_id TEXT UNIQUE,

    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),

    chain TEXT NOT NULL DEFAULT 'base',
    token TEXT NOT NULL DEFAULT 'USDC',
    wallet_address TEXT NOT NULL,
    tx_hash TEXT,

    fiat_currency TEXT NOT NULL DEFAULT 'USD',
    fiat_amount DOUBLE PRECISION,
    crypto_amount DOUBLE PRECISION,
    exchange_rate DOUBLE PRECISION,
    service_fee DOUBLE PRECISION,

    payment_method TEXT,
    launch_url TEXT,
    error_message TEXT,
    raw_payload JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT fk_coinbase_pay_sessions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coinbase_pay_sessions_user
    ON coinbase_pay_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coinbase_pay_sessions_partner_ref
    ON coinbase_pay_sessions(partner_user_ref);

CREATE INDEX IF NOT EXISTS idx_coinbase_pay_sessions_status
    ON coinbase_pay_sessions(status);

CREATE INDEX IF NOT EXISTS idx_coinbase_pay_sessions_tx_hash
    ON coinbase_pay_sessions(tx_hash)
    WHERE tx_hash IS NOT NULL;

DROP TRIGGER IF EXISTS update_coinbase_pay_sessions_updated_at ON coinbase_pay_sessions;
CREATE TRIGGER update_coinbase_pay_sessions_updated_at
    BEFORE UPDATE ON coinbase_pay_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE coinbase_pay_sessions IS
    'Coinbase-hosted US onramp/offramp sessions and webhook status updates.';
COMMENT ON COLUMN coinbase_pay_sessions.partner_user_ref IS
    'Partner user reference passed to Coinbase Pay URLs. Used for Offramp Transaction Status polling.';
