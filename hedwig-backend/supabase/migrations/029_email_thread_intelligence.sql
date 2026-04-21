-- Add intelligence columns to email_threads for Magic Inbox
ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS status         VARCHAR(20) NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS attachment_count INT        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detected_type  VARCHAR(50),           -- 'invoice' | 'contract' | 'receipt' | 'proposal' | 'other'
  ADD COLUMN IF NOT EXISTS detected_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS detected_currency VARCHAR(10),
  ADD COLUMN IF NOT EXISTS detected_due_date DATE;

-- Back-fill status for already-matched threads
UPDATE email_threads SET status = 'matched' WHERE matched_client_id IS NOT NULL AND status = 'needs_review';

CREATE INDEX IF NOT EXISTS idx_email_threads_status       ON email_threads(status);
CREATE INDEX IF NOT EXISTS idx_email_threads_detected_type ON email_threads(detected_type) WHERE detected_type IS NOT NULL;
