-- Stores mobile OAuth state nonces so the callback can identify the user
-- without relying on browser session cookies.
CREATE TABLE IF NOT EXISTS oauth_pending_states (
    state        TEXT PRIMARY KEY,
    provider     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    access_token TEXT NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_states_expires_at
    ON oauth_pending_states(expires_at);
