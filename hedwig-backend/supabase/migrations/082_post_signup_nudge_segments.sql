-- Track post-signup nudge segmentation for the web onboarding sequence.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_post_signup_nudge_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS post_signup_nudge_day INTEGER DEFAULT 0;

COMMENT ON COLUMN users.last_post_signup_nudge_at IS 'When the last post-signup nudge email was sent';
COMMENT ON COLUMN users.post_signup_nudge_day IS 'Highest nudge day sent (1, 4, 7, or 14)';
