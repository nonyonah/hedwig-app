-- 107_transaction_categories.sql — user-defined transaction categories.
-- The picker merges these with built-in defaults plus values already in use.

CREATE TABLE IF NOT EXISTS transaction_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  kind TEXT NOT NULL DEFAULT 'both' CHECK (kind IN ('expense','income','both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_categories_name
  ON transaction_categories(user_id, workspace_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_transaction_categories_user
  ON transaction_categories(user_id);
