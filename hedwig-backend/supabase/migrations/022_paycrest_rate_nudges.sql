-- Track cadence for Paycrest USD->NGN/GHS rate update nudges.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_rate_nudge_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_rate_nudge_at ON users(last_rate_nudge_at);

COMMENT ON COLUMN users.last_rate_nudge_at IS 'Timestamp of most recent Paycrest USD/NGN/GHS rate update nudge';
