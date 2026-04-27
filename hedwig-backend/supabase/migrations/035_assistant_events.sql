-- Assistant events table for tracking workspace-level AI-detected events
CREATE TABLE IF NOT EXISTS assistant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'unpaid_invoice', 'overdue_invoice', 'pending_payment_link',
    'project_deadline', 'document_review'
  )),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'urgent')),
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id TEXT,
  href TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assistant_events_user_id_idx ON assistant_events(user_id);
CREATE INDEX IF NOT EXISTS assistant_events_type_idx ON assistant_events(type);
CREATE INDEX IF NOT EXISTS assistant_events_unresolved_idx ON assistant_events(user_id, resolved_at) WHERE resolved_at IS NULL;
