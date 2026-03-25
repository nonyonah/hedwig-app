-- Engagement + OneSignal tracking support

-- Track app lifecycle checkpoints for re-engagement nudges.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_app_opened_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS kyc_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_dormant_nudge_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_kyc_nudge_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_app_opened_at ON users(last_app_opened_at);
CREATE INDEX IF NOT EXISTS idx_users_kyc_started_at ON users(kyc_started_at);
CREATE INDEX IF NOT EXISTS idx_users_last_dormant_nudge_at ON users(last_dormant_nudge_at);
CREATE INDEX IF NOT EXISTS idx_users_last_kyc_nudge_at ON users(last_kyc_nudge_at);

COMMENT ON COLUMN users.last_app_opened_at IS 'Last time the mobile app emitted app_opened for this user';
COMMENT ON COLUMN users.kyc_started_at IS 'Timestamp when user started KYC flow';
COMMENT ON COLUMN users.last_dormant_nudge_at IS 'Timestamp of most recent dormant-user re-engagement nudge';
COMMENT ON COLUMN users.last_kyc_nudge_at IS 'Timestamp of most recent KYC reminder nudge';

-- Store OneSignal subscription mapping explicitly so we can target users
-- even when alias resolution fails.
CREATE TABLE IF NOT EXISTS onesignal_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL UNIQUE,
    onesignal_token TEXT,
    platform TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_onesignal_subscriptions_user_id ON onesignal_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_onesignal_subscriptions_external_id ON onesignal_subscriptions(external_id);
CREATE INDEX IF NOT EXISTS idx_onesignal_subscriptions_last_seen_at ON onesignal_subscriptions(last_seen_at);

ALTER TABLE onesignal_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own onesignal subscriptions" ON onesignal_subscriptions;
CREATE POLICY "Users can view their own onesignal subscriptions"
    ON onesignal_subscriptions FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can insert their own onesignal subscriptions" ON onesignal_subscriptions;
CREATE POLICY "Users can insert their own onesignal subscriptions"
    ON onesignal_subscriptions FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can update their own onesignal subscriptions" ON onesignal_subscriptions;
CREATE POLICY "Users can update their own onesignal subscriptions"
    ON onesignal_subscriptions FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can delete their own onesignal subscriptions" ON onesignal_subscriptions;
CREATE POLICY "Users can delete their own onesignal subscriptions"
    ON onesignal_subscriptions FOR DELETE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

DROP POLICY IF EXISTS "Service role has full access to onesignal_subscriptions" ON onesignal_subscriptions;
CREATE POLICY "Service role has full access to onesignal_subscriptions"
    ON onesignal_subscriptions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_onesignal_subscriptions_updated_at
    BEFORE UPDATE ON onesignal_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
