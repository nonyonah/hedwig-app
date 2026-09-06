-- 099_assistant_suggestion_types.sql — widen the type check to include the
-- Phase 3/5 suggestion types that the code already emits (runway_alert,
-- duplicate_payment, spending_anomaly, client_concentration). Without this,
-- those inserts fail the 037 check constraint and the suggestions never persist.

ALTER TABLE assistant_suggestions
  DROP CONSTRAINT IF EXISTS assistant_suggestions_type_check;

ALTER TABLE assistant_suggestions
  ADD CONSTRAINT assistant_suggestions_type_check CHECK (type IN (
    'invoice_reminder',
    'import_match',
    'expense_categorization',
    'calendar_event',
    'project_action',
    'tax_review',
    'runway_alert',
    'duplicate_payment',
    'spending_anomaly',
    'client_concentration'
  ));
