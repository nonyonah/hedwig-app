-- Agent-initiated spend requests (staged, approval-gated, executed on approval).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_suggestions_type_check'
  ) THEN
    ALTER TABLE assistant_suggestions DROP CONSTRAINT assistant_suggestions_type_check;
  END IF;

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
      'client_concentration',
      'agent_spend_request'
    ));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
