-- Engagement nudge tracking columns for new scheduler nudge types.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_client_reactivation_nudge_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_recurring_upsell_nudge_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_integration_teaser_at        TIMESTAMPTZ;

-- Index to avoid full scans when filtering by cadence in each nudge job.
CREATE INDEX IF NOT EXISTS idx_users_last_client_reactivation_nudge_at ON users (last_client_reactivation_nudge_at);
CREATE INDEX IF NOT EXISTS idx_users_last_recurring_upsell_nudge_at    ON users (last_recurring_upsell_nudge_at);
CREATE INDEX IF NOT EXISTS idx_users_last_integration_teaser_at        ON users (last_integration_teaser_at);
