-- Upgrade assistant suggestions from AI-generated queue items to
-- contextual, rules-based workspace suggestions.

ALTER TABLE assistant_suggestions
  DROP CONSTRAINT IF EXISTS assistant_suggestions_type_check;

ALTER TABLE assistant_suggestions
  DROP CONSTRAINT IF EXISTS assistant_suggestions_status_check;

ALTER TABLE assistant_suggestions
  DROP CONSTRAINT IF EXISTS assistant_suggestions_confidence_check;

ALTER TABLE assistant_suggestions
  RENAME COLUMN explanation TO description;

ALTER TABLE assistant_suggestions
  RENAME COLUMN confidence TO confidence_score;

ALTER TABLE assistant_suggestions
  RENAME COLUMN affected_entities TO related_entities;

ALTER TABLE assistant_suggestions
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS surface TEXT NOT NULL DEFAULT 'assistant_panel',
  ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suggestion_key TEXT,
  ADD COLUMN IF NOT EXISTS last_shown_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shown_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE assistant_suggestions
SET type = CASE type
  WHEN 'send_invoice_reminder' THEN 'invoice_reminder'
  WHEN 'link_invoice_to_project' THEN 'project_action'
  WHEN 'create_client_from_invoice' THEN 'import_match'
  WHEN 'categorize_expense' THEN 'expense_categorization'
  WHEN 'add_calendar_event' THEN 'calendar_event'
  ELSE type
END;

UPDATE assistant_suggestions
SET status = CASE status
  WHEN 'pending' THEN 'active'
  WHEN 'rejected' THEN 'dismissed'
  ELSE status
END;

UPDATE assistant_suggestions
SET priority = CASE
  WHEN type = 'invoice_reminder' THEN 'high'
  WHEN type IN ('import_match', 'expense_categorization', 'calendar_event', 'project_action') THEN 'medium'
  ELSE 'low'
END,
surface = CASE
  WHEN type = 'invoice_reminder' THEN 'inline'
  ELSE 'assistant_panel'
END,
related_entities = CASE
  WHEN jsonb_typeof(related_entities) = 'array'
    THEN jsonb_build_object('entities', related_entities)
  WHEN related_entities IS NULL
    THEN '{}'::jsonb
  ELSE related_entities
END;

ALTER TABLE assistant_suggestions
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN confidence_score SET DEFAULT 0.8,
  ALTER COLUMN related_entities SET DEFAULT '{}'::jsonb;

ALTER TABLE assistant_suggestions
  ADD CONSTRAINT assistant_suggestions_type_check CHECK (type IN (
    'invoice_reminder',
    'import_match',
    'expense_categorization',
    'calendar_event',
    'project_action',
    'tax_review'
  )),
  ADD CONSTRAINT assistant_suggestions_priority_check CHECK (priority IN ('high', 'medium', 'low')),
  ADD CONSTRAINT assistant_suggestions_status_check CHECK (status IN ('active', 'dismissed', 'approved', 'rejected')),
  ADD CONSTRAINT assistant_suggestions_surface_check CHECK (surface IN ('inline', 'assistant_panel', 'notification')),
  ADD CONSTRAINT assistant_suggestions_confidence_score_check CHECK (confidence_score >= 0 AND confidence_score <= 1);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_suggestions_user_key_idx
  ON assistant_suggestions(user_id, suggestion_key)
  WHERE suggestion_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS assistant_suggestions_surface_idx
  ON assistant_suggestions(user_id, surface, status);

CREATE INDEX IF NOT EXISTS assistant_suggestions_priority_idx
  ON assistant_suggestions(user_id, priority, status);
