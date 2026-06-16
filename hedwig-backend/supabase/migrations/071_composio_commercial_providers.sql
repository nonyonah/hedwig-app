-- Add commercial integration providers to composio_connections
-- QuickBooks already exists in the enum; add Xero and Linear.

ALTER TABLE composio_connections
DROP CONSTRAINT IF EXISTS composio_connections_provider_check;

ALTER TABLE composio_connections
ADD CONSTRAINT composio_connections_provider_check
CHECK (provider IN (
  'slack',
  'gmail',
  'google_calendar',
  'google_drive',
  'google_docs',
  'quickbooks',
  'xero',
  'linear'
));

-- Add sync_settings column for per-integration preferences
ALTER TABLE composio_connections
ADD COLUMN IF NOT EXISTS sync_settings JSONB DEFAULT '{}'::jsonb;
