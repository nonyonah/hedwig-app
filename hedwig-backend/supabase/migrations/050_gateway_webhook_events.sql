-- Circle Gateway webhook event ledger.
--
-- Stores the raw payload + lookup metadata so we can:
--   1. Dedupe retried deliveries via Circle's `notificationId`.
--   2. Audit the timeline of a transfer (deposit -> mint forwarded -> mint finalized).
--   3. Replay processing for users who were offline when the event arrived.

CREATE TABLE IF NOT EXISTS gateway_webhook_events (
    id BIGSERIAL PRIMARY KEY,
    notification_id TEXT NOT NULL UNIQUE,
    subscription_id TEXT,
    notification_type TEXT NOT NULL,
    wallet_address TEXT,
    transfer_id TEXT,
    tx_hash TEXT,
    domain TEXT,
    env TEXT,
    user_id UUID,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    push_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gateway_webhook_events_wallet
    ON gateway_webhook_events (wallet_address);
CREATE INDEX IF NOT EXISTS idx_gateway_webhook_events_transfer
    ON gateway_webhook_events (transfer_id);
CREATE INDEX IF NOT EXISTS idx_gateway_webhook_events_type
    ON gateway_webhook_events (notification_type);
CREATE INDEX IF NOT EXISTS idx_gateway_webhook_events_user
    ON gateway_webhook_events (user_id);
