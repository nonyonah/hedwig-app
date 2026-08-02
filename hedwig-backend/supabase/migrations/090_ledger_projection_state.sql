-- 090_ledger_projection_state.sql
-- Checkpoint tracking for the ledger projection (financial_events → ledger_entries).
-- One row per (user, workspace); last_recorded_at advances as the incremental
-- projector syncs events. Absence of a row triggers a full replay.

CREATE TABLE ledger_projection_state (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    last_recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, workspace_id)
);

ALTER TABLE ledger_projection_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projection state"
    ON ledger_projection_state FOR SELECT
    USING (user_id = current_user);

NOTIFY pgrst, 'reload schema';
