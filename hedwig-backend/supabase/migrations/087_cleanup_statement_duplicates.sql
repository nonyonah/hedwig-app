-- ─── Clean up duplicate expenses/documents from repeated confirm clicks ─────
-- The confirm handler was creating records but failing to respond (error handler
-- crash), causing clients to retry and create duplicates.
-- Keep the oldest record per (workspace_id, amount, currency, date, description)
-- group and delete later ones.

-- 1. Clean up duplicate expenses from statement imports
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, amount, currency, date, note, source_type
           ORDER BY created_at ASC
         ) AS rn
  FROM expenses
  WHERE source_type = 'transaction_import'
)
DELETE FROM expenses
WHERE id IN (SELECT id FROM dupes WHERE rn > 1);

-- 2. Clean up duplicate documents from statement imports
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, amount, currency, title,
           (content->>'created_from')
           ORDER BY created_at ASC
         ) AS rn
  FROM documents
  WHERE content->>'created_from' = 'statement_import'
)
DELETE FROM documents
WHERE id IN (SELECT id FROM dupes WHERE rn > 1);

-- 3. Reset imported_transactions stuck in 'expensed' with no matching expense
-- (happens if the process crashed after marking 'expensed' but before creating the record)
UPDATE imported_transactions
SET status = 'pending', updated_at = now()
WHERE status = 'expensed'
  AND id NOT IN (
    SELECT DISTINCT t.id
    FROM imported_transactions t
    LEFT JOIN expenses e ON e.user_id = t.user_id
      AND e.workspace_id = t.workspace_id
      AND e.amount = t.amount
      AND e.currency = t.currency
      AND DATE(e.date) = t.transaction_date  -- both sides converge to a date
    WHERE t.status = 'expensed'
      AND e.source_type = 'transaction_import'
      AND e.id IS NOT NULL
  );

-- 4. Also reset credit-type 'expensed' transactions (revenue docs, not expenses)
UPDATE imported_transactions
SET status = 'pending', updated_at = now()
WHERE status = 'expensed'
  AND type = 'credit'
  AND id NOT IN (
    SELECT DISTINCT d.content->>'transactionId'
    FROM documents d
    WHERE d.content->>'created_from' = 'statement_import'
      AND d.content->>'transactionId' IS NOT NULL
  );

-- 5. Deduplicate statement_imports — merge child transactions into the kept row,
--    then delete duplicates. Keep the one with the most transactions per group
--    (same bank_name, start_date, end_date, currency).
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY COALESCE(bank_name, ''), start_date, end_date, currency
           ORDER BY transaction_count DESC, created_at ASC
         ) AS keep_id
  FROM statement_imports
  WHERE start_date IS NOT NULL
),
dupes AS (
  SELECT id, keep_id FROM ranked WHERE id <> keep_id
)
UPDATE imported_transactions
SET statement_id = dupes.keep_id
FROM dupes
WHERE imported_transactions.statement_id = dupes.id;

WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY COALESCE(bank_name, ''), start_date, end_date, currency
           ORDER BY transaction_count DESC, created_at ASC
         ) AS keep_id
  FROM statement_imports
  WHERE start_date IS NOT NULL
)
DELETE FROM statement_imports
WHERE id IN (SELECT id FROM ranked WHERE id <> keep_id);

NOTIFY pgrst, 'reload schema';
