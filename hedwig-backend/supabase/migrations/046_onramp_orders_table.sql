-- 046_onramp_orders_table.sql
-- Onramp (fiat -> crypto) order tracking for Paycrest sender API integration.
-- Mirrors offramp_orders shape but with provider/refund bank slots flipped:
-- the user funds a Paycrest-issued virtual account and receives crypto at
-- their primary wallet. Status enum is reused from offramp_status.

CREATE TABLE IF NOT EXISTS onramp_orders (
    id TEXT PRIMARY KEY DEFAULT ('onramp_' || replace(uuid_generate_v4()::text, '-', '')),

    user_id TEXT NOT NULL,

    -- Paycrest order details
    paycrest_order_id TEXT UNIQUE NOT NULL,
    reference TEXT,
    status offramp_status NOT NULL DEFAULT 'PENDING',

    -- Crypto side (what the user receives)
    chain chain NOT NULL,
    token TEXT NOT NULL DEFAULT 'USDC',
    crypto_amount DOUBLE PRECISION,
    recipient_address TEXT NOT NULL,
    tx_hash TEXT,

    -- Fiat side (what the user pays in)
    fiat_currency TEXT NOT NULL,
    fiat_amount DOUBLE PRECISION NOT NULL,
    exchange_rate DOUBLE PRECISION,
    service_fee DOUBLE PRECISION DEFAULT 0,

    -- Paycrest-issued virtual deposit account (the bank the user funds).
    provider_institution TEXT,
    provider_account_number TEXT,
    provider_account_name TEXT,
    provider_amount_to_transfer DOUBLE PRECISION,
    valid_until TIMESTAMPTZ,

    -- User's own bank used for refunds if Paycrest needs to return funds.
    refund_institution TEXT,
    refund_account_number TEXT,
    refund_account_name TEXT,

    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT fk_onramp_orders_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_onramp_orders_user_id ON onramp_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_onramp_orders_status ON onramp_orders(status);
CREATE INDEX IF NOT EXISTS idx_onramp_orders_paycrest_id ON onramp_orders(paycrest_order_id);
CREATE INDEX IF NOT EXISTS idx_onramp_orders_created_at ON onramp_orders(created_at DESC);

CREATE TRIGGER update_onramp_orders_updated_at
    BEFORE UPDATE ON onramp_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
