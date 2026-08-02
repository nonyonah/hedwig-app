-- 089_financial_events.sql
-- Financial Event Engine: append-only journal of financial events + ledger projection.
--
-- Design notes:
-- - financial_events is the system of record for "what happened with money".
--   Events are immutable facts; corrections are NEW events (never updates).
-- - Money facts are denormalized onto the event (amount, currency, amount_usd,
--   fx_rate_usd, fx_source) so the USD reference is FROZEN at event time and
--   never re-rated at read time (fixes historical P&L drift).
-- - amount/currency is the native (transactional) amount; amount_usd is a
--   presentation reference only — USD is NOT treated as canonical.
-- - ledger_entries is a projection (CQRS read model) rebuilt from events by
--   the projector. It is derived data: deletable and replayable.
-- - fingerprint (sha256 of event_type|entity_type|entity_id|version) makes
--   emission idempotent against webhook replays and retries.

CREATE TABLE financial_events (
    id TEXT PRIMARY KEY DEFAULT ('fe_' || uuid_generate_v4()),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    occurred_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    amount NUMERIC(18,6),
    currency TEXT,
    amount_usd NUMERIC(18,6),
    fx_rate_usd NUMERIC(18,10),
    fx_source TEXT,
    direction TEXT NOT NULL DEFAULT 'none' CHECK (direction IN ('in', 'out', 'none')),
    source TEXT,
    correlation_id TEXT,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_financial_events_workspace_occurred
    ON financial_events (workspace_id, occurred_at DESC);
CREATE INDEX idx_financial_events_entity
    ON financial_events (entity_type, entity_id);
CREATE INDEX idx_financial_events_type
    ON financial_events (workspace_id, event_type, occurred_at DESC);
CREATE INDEX idx_financial_events_user
    ON financial_events (user_id, occurred_at DESC);

-- Ledger projection — mirrors the /api/revenue/ledger entry contract, plus
-- native currency columns for future functional-currency reporting.
CREATE TABLE ledger_entries (
    id TEXT PRIMARY KEY DEFAULT ('le_' || uuid_generate_v4()),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT,
    event_id TEXT NOT NULL UNIQUE REFERENCES financial_events(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT,
    account TEXT,
    debit NUMERIC(18,6) NOT NULL DEFAULT 0,
    credit NUMERIC(18,6) NOT NULL DEFAULT 0,
    type TEXT NOT NULL CHECK (type IN ('revenue', 'expense', 'credit', 'transfer')),
    reference_id TEXT,
    category TEXT,
    -- native (transactional) amount, kept alongside the USD projection columns
    currency TEXT NOT NULL DEFAULT 'USD',
    amount NUMERIC(18,6) NOT NULL DEFAULT 0,
    amount_currency TEXT,
    fx_rate_usd NUMERIC(18,10),
    fx_source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_entries_workspace_date
    ON ledger_entries (workspace_id, date DESC);
CREATE INDEX idx_ledger_entries_user
    ON ledger_entries (user_id, date DESC);
CREATE INDEX idx_ledger_entries_type
    ON ledger_entries (workspace_id, type, date DESC);

ALTER TABLE financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own financial events"
    ON financial_events FOR SELECT
    USING (user_id = current_user);

CREATE POLICY "Users can view their own ledger entries"
    ON ledger_entries FOR SELECT
    USING (user_id = current_user);

NOTIFY pgrst, 'reload schema';
