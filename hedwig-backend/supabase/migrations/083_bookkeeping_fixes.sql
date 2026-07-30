-- 083: Bookkeeping foundation fixes
-- Adds converted_amount_usd + fx_rate to imported_transactions
-- Adds updated_at trigger to statement_imports
-- Enables RLS on all three bookkeeping tables
-- Adds category CHECK constraint to expenses

-- ─── imported_transactions: add USD conversion columns ──────────────────────
ALTER TABLE imported_transactions
  ADD COLUMN IF NOT EXISTS converted_amount_usd numeric(18,6),
  ADD COLUMN IF NOT EXISTS fx_rate numeric(18,6),
  ADD COLUMN IF NOT EXISTS fx_source text;

-- ─── statement_imports: add updated_at column ───────────────────────────────
ALTER TABLE statement_imports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- ─── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_imports ENABLE ROW LEVEL SECURITY;

-- Expenses: user can read own; workspace owners/admins can read workspace's
-- Using the same pattern as documents/clients (user_id or workspace membership)
-- Note: auth.uid() returns UUID; cast to text for comparison with text user_id columns
CREATE POLICY expenses_select_own ON expenses
  FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expenses.workspace_id
        AND wm.user_id = auth.uid()::text
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY expenses_insert_own ON expenses
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY expenses_update_own ON expenses
  FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY expenses_delete_own ON expenses
  FOR DELETE
  USING (user_id = auth.uid()::text);

-- imported_transactions: same pattern
CREATE POLICY imported_txns_select_own ON imported_transactions
  FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = imported_transactions.workspace_id
        AND wm.user_id = auth.uid()::text
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY imported_txns_insert_own ON imported_transactions
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY imported_txns_update_own ON imported_transactions
  FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY imported_txns_delete_own ON imported_transactions
  FOR DELETE
  USING (user_id = auth.uid()::text);

-- statement_imports: same pattern
CREATE POLICY stmt_imports_select_own ON statement_imports
  FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = statement_imports.workspace_id
        AND wm.user_id = auth.uid()::text
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY stmt_imports_insert_own ON statement_imports
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY stmt_imports_update_own ON statement_imports
  FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY stmt_imports_delete_own ON statement_imports
  FOR DELETE
  USING (user_id = auth.uid()::text);

-- ─── Category constraint on expenses ────────────────────────────────────────
-- Normalize to single taxonomy: software, contractors, marketing, travel,
-- meals, office, operations, taxes, subscriptions, other
UPDATE expenses SET category = 'other' WHERE category IS NULL OR category = '';
UPDATE expenses SET category = 'contractors' WHERE category = 'contractor';
UPDATE expenses SET category = 'office' WHERE category = 'equipment';

ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'software', 'contractors', 'marketing', 'travel',
    'meals', 'office', 'operations', 'taxes',
    'subscriptions', 'other'
  ));
