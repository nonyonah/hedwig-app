-- Composio-managed connections. One row per (user_id, provider).
-- Composio holds the OAuth tokens; we only store IDs and surfaceable status.

CREATE TABLE IF NOT EXISTS composio_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'slack',
    'gmail',
    'google_calendar',
    'google_drive',
    'google_docs',
    'quickbooks'
  )),
  composio_entity_id TEXT NOT NULL,
  composio_connected_account_id TEXT,
  composio_integration_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'active',
    'expired',
    'revoked',
    'error'
  )),
  account_label TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_composio_connections_user
  ON composio_connections (user_id);

CREATE INDEX IF NOT EXISTS idx_composio_connections_account
  ON composio_connections (composio_connected_account_id);
