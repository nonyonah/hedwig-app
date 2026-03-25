-- Add cadence tracking for recurring product feature re-engagement nudges.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_feature_nudge_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_feature_nudge_at ON users(last_feature_nudge_at);

COMMENT ON COLUMN users.last_feature_nudge_at IS 'Timestamp of most recent product feature highlight nudge';
