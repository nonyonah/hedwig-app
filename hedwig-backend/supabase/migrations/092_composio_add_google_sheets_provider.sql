-- Extend composio_connections provider enum with google_sheets (and any
-- providers added by migration 071 that never reached production).
-- The prod constraint predates 071, so google_sheets rows can't be inserted
-- even though the remote Composio connection exists.

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
  'linear',
  'google_sheets'
));