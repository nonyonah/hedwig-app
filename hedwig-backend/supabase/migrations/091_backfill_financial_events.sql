-- 091_backfill_financial_events.sql
-- SQL port of scripts/backfillFinancialEvents.ts.
--
-- Backfills financial_events from pre-existing data so the ledger projection
-- can be built without running a script. Idempotent and re-runnable:
-- fingerprints are byte-identical to the JS helper (sha256 hex of
-- event_type|entity_type|entity_id|version) and inserts use
-- ON CONFLICT (fingerprint) DO NOTHING, so rows already emitted by webhooks
-- or a prior script run are never duplicated.
--
-- Timestamps in fingerprints use the same representation as
-- new Date(x).toISOString(): UTC, milliseconds truncated (not rounded),
-- 'YYYY-MM-DDTHH:MM:SS.mmmZ'. date_trunc('milliseconds', ts AT TIME ZONE 'UTC')
-- truncates toward zero exactly like JS Date does.
--
-- FX handling (frozen at event time):
--  - USD / USDC / USDT (or NULL currency on documents, which the legacy read
--    path treats as USD) -> identity: amount_usd = amount, rate 1, 'identity'
--  - expenses -> stored converted_amount_usd (NOT NULL), fx_source 'stored'
--    (the write-time conversion rate was not captured on expenses)
--  - imported_transactions -> stored converted_amount_usd / fx_rate / fx_source
--  - Non-USD documents (e.g. NGN invoices) have NO stored conversion and no
--    live FX is available in SQL, so they are intentionally NOT backfilled
--    here. Run `npm run backfill:financial-events` (idempotent) to fill those
--    with a live FX rate.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper: JS-compatible ISO-8601 (UTC, ms truncated, 'Z' suffix).
-- Not a function: kept as an expression so the migration stays plain SQL.
-- iso_ms(ts) = to_char(date_trunc('milliseconds', ts AT TIME ZONE 'UTC'),
--                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')

-- ---------------------------------------------------------------------------
-- 1) documents (INVOICE / PAYMENT_LINK, PAID) -> document.paid
--    Only USD-pegged (or NULL-currency) documents; see header note for others.
-- ---------------------------------------------------------------------------
INSERT INTO financial_events (
    user_id, workspace_id, event_type, entity_type, entity_id, fingerprint,
    occurred_at, recorded_at, payload, amount, currency, amount_usd,
    fx_rate_usd, fx_source, direction, source, version
)
SELECT
    d.user_id,
    d.workspace_id,
    'document.paid',
    'document',
    d.id,
    encode(
        sha256(convert_to(
            'document.paid' || '|' || 'document' || '|' || d.id || '|' ||
            COALESCE(
                NULLIF(d.content->>'tx_hash', ''),
                COALESCE(
                    NULLIF(d.content->>'paid_at', ''),
                    NULLIF(d.content->>'paidAt', ''),
                    NULLIF(d.content->>'payment_date', ''),
                    to_char(date_trunc('milliseconds', d.updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                    to_char(date_trunc('milliseconds', d.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                ),
                'backfill'
            ),
            'UTF8'
        )),
        'hex'
    ),
    COALESCE(
        (NULLIF(d.content->>'paid_at', ''))::timestamptz,
        (NULLIF(d.content->>'paidAt', ''))::timestamptz,
        (NULLIF(d.content->>'payment_date', ''))::timestamptz,
        d.updated_at,
        d.created_at,
        now()
    ),
    now(),
    jsonb_build_object(
        'title', d.title,
        'doc_type', d.type,
        'backfilled', true,
        'bookkeeping_only', COALESCE((d.content->>'bookkeeping_only')::boolean, false)
    ),
    d.amount,
    COALESCE(NULLIF(upper(trim(d.currency)), ''), 'USD'),
    d.amount,
    1,
    'identity',
    'in',
    'backfill',
    1
FROM documents d
WHERE d.type IN ('INVOICE', 'PAYMENT_LINK')
  AND d.status = 'PAID'
  AND d.amount IS NOT NULL
  AND COALESCE(upper(trim(d.currency)), 'USD') IN ('USD', 'USDC', 'USDT')
ON CONFLICT (fingerprint) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) expenses -> expense.created (converted_amount_usd is NOT NULL)
-- ---------------------------------------------------------------------------
INSERT INTO financial_events (
    user_id, workspace_id, event_type, entity_type, entity_id, fingerprint,
    occurred_at, recorded_at, payload, amount, currency, amount_usd,
    fx_rate_usd, fx_source, direction, source, version
)
SELECT
    e.user_id,
    e.workspace_id,
    'expense.created',
    'expense',
    e.id,
    encode(
        sha256(convert_to(
            'expense.created' || '|' || 'expense' || '|' || e.id || '|' ||
            to_char(date_trunc('milliseconds', e.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'UTF8'
        )),
        'hex'
    ),
    COALESCE(e.date, e.created_at),
    now(),
    jsonb_build_object('category', e.category, 'note', e.note, 'backfilled', true),
    e.amount,
    COALESCE(NULLIF(upper(trim(e.currency)), ''), 'USD'),
    e.converted_amount_usd,
    NULL,
    'stored',
    'out',
    'backfill',
    1
FROM expenses e
ON CONFLICT (fingerprint) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) imported_transactions -> imported_transaction.created
--    + imported_transaction.updated for terminal states (expensed/skipped)
-- ---------------------------------------------------------------------------
INSERT INTO financial_events (
    user_id, workspace_id, event_type, entity_type, entity_id, fingerprint,
    occurred_at, recorded_at, payload, amount, currency, amount_usd,
    fx_rate_usd, fx_source, direction, source, version
)
SELECT
    t.user_id,
    t.workspace_id,
    'imported_transaction.created',
    'imported_transaction',
    t.id,
    encode(sha256(convert_to('imported_transaction.created' || '|' || 'imported_transaction' || '|' || t.id || '|' || '1', 'UTF8')), 'hex'),
    COALESCE(t.transaction_date, t.created_at),
    now(),
    jsonb_build_object(
        'description', t.description,
        'type', t.type,
        'category', t.category,
        'backfilled', true
    ),
    t.amount,
    COALESCE(NULLIF(upper(trim(t.currency)), ''), 'USD'),
    COALESCE(
        t.converted_amount_usd,
        CASE WHEN COALESCE(upper(trim(t.currency)), 'USD') IN ('USD', 'USDC', 'USDT') THEN t.amount END
    ),
    COALESCE(
        t.fx_rate,
        CASE WHEN COALESCE(upper(trim(t.currency)), 'USD') IN ('USD', 'USDC', 'USDT') THEN 1 END
    ),
    COALESCE(
        t.fx_source,
        CASE WHEN COALESCE(upper(trim(t.currency)), 'USD') IN ('USD', 'USDC', 'USDT') THEN 'identity' END
    ),
    CASE WHEN t.type = 'debit' THEN 'out' ELSE 'in' END,
    'backfill',
    1
FROM imported_transactions t
ON CONFLICT (fingerprint) DO NOTHING;

INSERT INTO financial_events (
    user_id, workspace_id, event_type, entity_type, entity_id, fingerprint,
    occurred_at, recorded_at, payload, amount, currency, amount_usd,
    fx_rate_usd, fx_source, direction, source, version
)
SELECT
    t.user_id,
    t.workspace_id,
    'imported_transaction.updated',
    'imported_transaction',
    t.id,
    encode(
        sha256(convert_to(
            'imported_transaction.updated' || '|' || 'imported_transaction' || '|' || t.id || '|' ||
            to_char(date_trunc('milliseconds', t.updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            || '|' || t.status,
            'UTF8'
        )),
        'hex'
    ),
    COALESCE(t.transaction_date, t.created_at),
    now(),
    jsonb_build_object(
        'status', t.status,
        'type', t.type,
        'category', t.category,
        'description', t.description,
        'backfilled', true
    ),
    t.amount,
    COALESCE(NULLIF(upper(trim(t.currency)), ''), 'USD'),
    COALESCE(
        t.converted_amount_usd,
        CASE WHEN COALESCE(upper(trim(t.currency)), 'USD') IN ('USD', 'USDC', 'USDT') THEN t.amount END
    ),
    COALESCE(
        t.fx_rate,
        CASE WHEN COALESCE(upper(trim(t.currency)), 'USD') IN ('USD', 'USDC', 'USDT') THEN 1 END
    ),
    COALESCE(
        t.fx_source,
        CASE WHEN COALESCE(upper(trim(t.currency)), 'USD') IN ('USD', 'USDC', 'USDT') THEN 'identity' END
    ),
    'none',
    'backfill',
    1
FROM imported_transactions t
WHERE t.status IN ('expensed', 'skipped')
ON CONFLICT (fingerprint) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) offramp_orders (COMPLETED) -> offramp.settled
--    token is the crypto currency (e.g. USDC); settledAt = updated_at
--    (the table has no completed_at column)
-- ---------------------------------------------------------------------------
INSERT INTO financial_events (
    user_id, workspace_id, event_type, entity_type, entity_id, fingerprint,
    occurred_at, recorded_at, payload, amount, currency, amount_usd,
    fx_rate_usd, fx_source, direction, source, correlation_id, version
)
SELECT
    o.user_id,
    o.workspace_id,
    'offramp.settled',
    'offramp_order',
    o.id,
    encode(
        sha256(convert_to(
            'offramp.settled' || '|' || 'offramp_order' || '|' || o.id || '|' ||
            to_char(date_trunc('milliseconds', COALESCE(o.updated_at, o.created_at) AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'UTF8'
        )),
        'hex'
    ),
    COALESCE(o.updated_at, o.created_at),
    now(),
    jsonb_build_object(
        'fiat_amount', o.fiat_amount,
        'fiat_currency', o.fiat_currency,
        'bank_name', o.bank_name,
        'account_number', o.account_number,
        'tx_hash', o.tx_hash,
        'backfilled', true
    ),
    o.crypto_amount,
    COALESCE(NULLIF(upper(trim(o.token)), ''), 'USDC'),
    CASE WHEN COALESCE(upper(trim(o.token)), 'USDC') IN ('USD', 'USDC', 'USDT') THEN o.crypto_amount END,
    CASE WHEN COALESCE(upper(trim(o.token)), 'USDC') IN ('USD', 'USDC', 'USDT') THEN 1 END,
    CASE WHEN COALESCE(upper(trim(o.token)), 'USDC') IN ('USD', 'USDC', 'USDT') THEN 'identity' END,
    'out',
    'backfill',
    o.tx_hash,
    1
FROM offramp_orders o
WHERE o.status = 'COMPLETED'
ON CONFLICT (fingerprint) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) transactions (PAYMENT_RECEIVED, CONFIRMED, USDC, no document, tx hash)
--    -> wallet.deposit.received (unmatched wallet deposits)
-- ---------------------------------------------------------------------------
INSERT INTO financial_events (
    user_id, workspace_id, event_type, entity_type, entity_id, fingerprint,
    occurred_at, recorded_at, payload, amount, currency, amount_usd,
    fx_rate_usd, fx_source, direction, source, correlation_id, version
)
SELECT
    t.user_id,
    NULL,
    'wallet.deposit.received',
    'transaction',
    t.tx_hash,
    encode(sha256(convert_to('wallet.deposit.received' || '|' || 'transaction' || '|' || t.tx_hash || '|' || '1', 'UTF8')), 'hex'),
    COALESCE(t.timestamp, t.created_at),
    now(),
    jsonb_build_object(
        'chain', t.chain,
        'from_address', t.from_address,
        'to_address', t.to_address,
        'tx_hash', t.tx_hash,
        'backfilled', true
    ),
    t.amount,
    'USDC',
    t.amount,
    1,
    'identity',
    'in',
    'backfill',
    t.tx_hash,
    1
FROM transactions t
WHERE t.type = 'PAYMENT_RECEIVED'
  AND t.status = 'CONFIRMED'
  AND t.token = 'USDC'
  AND t.document_id IS NULL
  AND t.tx_hash IS NOT NULL
ON CONFLICT (fingerprint) DO NOTHING;
