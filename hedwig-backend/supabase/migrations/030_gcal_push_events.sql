-- Migration: Add google_event_id to calendar_events for bidirectional Google Calendar sync
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_calendar_events_google_event_id
  ON calendar_events(google_event_id)
  WHERE google_event_id IS NOT NULL;
