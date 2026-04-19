-- Global user preferences
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS client_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;
