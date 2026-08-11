-- Track when a thread's contents were pushed into the ledger (bank alerts,
-- receipt imports). Guards against duplicate expenses/credits on re-sync.

ALTER TABLE email_threads
ADD COLUMN IF NOT EXISTS bookkeeping_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_threads_bookkeeping_synced_at
  ON email_threads (bookkeeping_synced_at)
  WHERE bookkeeping_synced_at IS NOT NULL;