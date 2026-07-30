-- ─── Personal expense categories ──────────────────────────────────────────
-- Add everyday personal categories alongside business ones.
-- New categories: shopping, entertainment, groceries, utilities, health,
--                 education, transportation, rent, personal_care

-- Backfill any expenses already recorded as 'other' that match the new labels
-- (This is informational — no automated recategorization since we can't
--  reliably guess which 'other' expenses belong to which new category.)

DROP TRIGGER IF EXISTS expenses_category_check_trigger ON expenses;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'software', 'contractors', 'marketing', 'travel',
    'meals', 'office', 'operations', 'taxes', 'subscriptions',
    'shopping', 'entertainment', 'groceries', 'utilities',
    'health', 'education', 'transportation', 'rent', 'personal_care',
    'other'
  ));

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
