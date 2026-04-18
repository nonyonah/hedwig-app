-- Store R2 object key for documents so generated PDFs can be cached and retrieved
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS r2_key  TEXT,
  ADD COLUMN IF NOT EXISTS r2_url  TEXT,
  ADD COLUMN IF NOT EXISTS r2_uploaded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_r2_key ON documents(r2_key) WHERE r2_key IS NOT NULL;
