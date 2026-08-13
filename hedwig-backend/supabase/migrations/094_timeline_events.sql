-- 094_timeline_events.sql
-- Timeline Events journal: non-money events for the unified Financial Timeline.
--
-- Design notes (mirrors 089_financial_events.sql):
-- - financial_events is deliberately MONEY-ONLY (it feeds the ledger_entries CQRS
--   projection with REPLACE semantics). Timeline-only events — invoice sent/viewed,
--   contract signed, reminder sent, statement imported — must NEVER enter that
--   journal or they would corrupt the projection.
-- - timeline_events is a separate, lightweight append-only journal for those
--   non-money facts. The feed reads BOTH journals (union); the ledger projection
--   is untouched and never reads this table.
-- - fingerprint (sha256 of kind.verb|entity_type|entity_id|version) makes emission
--   idempotent against retries and double-delivered actions, exactly like the
--   money journal.
-- - `context` carries lightweight display metadata (title, amount, due date,
--   client name, ...) so feed rows stay dumb clients. No frozen-USD columns:
--   timeline events are facts, not money, and carry no ledger implication.

CREATE TABLE timeline_events (
    id TEXT PRIMARY KEY DEFAULT ('te_' || uuid_generate_v4()),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT,
    kind TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    verb TEXT NOT NULL,
    title TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    fingerprint TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_timeline_events_workspace_occurred
    ON timeline_events (workspace_id, occurred_at DESC);
CREATE INDEX idx_timeline_events_entity
    ON timeline_events (entity_type, entity_id);
CREATE INDEX idx_timeline_events_user
    ON timeline_events (user_id, occurred_at DESC);

ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own timeline events"
    ON timeline_events FOR SELECT
    USING (user_id = current_user);

NOTIFY pgrst, 'reload schema';
