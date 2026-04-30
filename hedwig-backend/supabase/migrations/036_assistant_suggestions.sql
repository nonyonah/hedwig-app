-- Suggested actions that the assistant proposes — never auto-executed
CREATE TABLE IF NOT EXISTS assistant_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'send_invoice_reminder',
    'link_invoice_to_project',
    'create_client_from_invoice',
    'categorize_expense',
    'add_calendar_event'
  )),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT,
  affected_entities JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  edited_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assistant_suggestions_user_id_idx ON assistant_suggestions(user_id);
CREATE INDEX IF NOT EXISTS assistant_suggestions_pending_idx ON assistant_suggestions(user_id, status) WHERE status = 'pending';

-- Assistant notification preferences (extend existing users table)
ALTER TABLE users ADD COLUMN IF NOT EXISTS asst_daily_brief_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS asst_weekly_summary_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS asst_invoice_alerts BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS asst_deadline_alerts BOOLEAN NOT NULL DEFAULT true;
