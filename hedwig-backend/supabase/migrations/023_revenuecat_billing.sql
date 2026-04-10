-- RevenueCat billing groundwork:
-- - stores normalized entitlement state per App User ID
-- - stores immutable webhook events for audit/debug

CREATE TABLE IF NOT EXISTS billing_subscription_states (
    app_user_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    entitlement_id TEXT,
    entitlement_ids TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT false,
    product_id TEXT,
    store TEXT,
    environment TEXT,
    period_type TEXT,
    ownership_type TEXT,
    will_renew BOOLEAN,
    is_trial BOOLEAN NOT NULL DEFAULT false,
    billing_issue_detected BOOLEAN NOT NULL DEFAULT false,
    latest_event_type TEXT,
    latest_event_id TEXT,
    event_timestamp_ms BIGINT,
    purchased_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    raw_event JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_subscription_states_user_unique
    ON billing_subscription_states(user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_subscription_states_active
    ON billing_subscription_states(is_active);

CREATE INDEX IF NOT EXISTS idx_billing_subscription_states_updated_at
    ON billing_subscription_states(updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_revenuecat_events (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    app_user_id TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    event_timestamp_ms BIGINT,
    product_id TEXT,
    store TEXT,
    environment TEXT,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_revenuecat_events_user_id
    ON billing_revenuecat_events(user_id);

CREATE INDEX IF NOT EXISTS idx_billing_revenuecat_events_app_user_id
    ON billing_revenuecat_events(app_user_id);

CREATE INDEX IF NOT EXISTS idx_billing_revenuecat_events_created_at
    ON billing_revenuecat_events(created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_billing_subscription_states_updated_at'
    ) THEN
        CREATE TRIGGER update_billing_subscription_states_updated_at
            BEFORE UPDATE ON billing_subscription_states
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

