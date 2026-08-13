-- 095_financial_brief_dunning.sql
-- Phase 3+4: Financial Brief cadence prefs + staged dunning engine state.
--
-- 1) users gains three preference columns:
--    - asst_revenue_brief: cadence for the on-page/email Financial Brief
--      ('off' | 'daily' | 'weekly'; default 'weekly' — matches the weekly
--      assistant summary cadence the AI layer already ships on).
--    - asst_dunning_emails: master switch for the staged dunning sequence
--      (default true — mirrors legacy client_reminders_enabled behavior).
--    - notif_preferences: JSONB channel-matrix overrides (event→channel map,
--      e.g. {"overdue":{"email":"immediate","push":"off"}}). Empty object
--      means "use the default matrix" so existing users are unaffected.
-- 2) dunning_state: per-document sequence state for the dunning state
--    machine (pre-due → due → overdue → escalation → final). One row per
--    document; a document's sequence is only ever driven by this row, so
--    the legacy "remind every 7 days" path and the staged engine can't
--    double-deliver (the engine sets content.dunning_active).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS asst_revenue_brief TEXT NOT NULL DEFAULT 'weekly',
    ADD COLUMN IF NOT EXISTS asst_dunning_emails BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notif_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.asst_revenue_brief IS
    'Financial Brief cadence: off | daily | weekly. Weekly is the default (matches asst_weekly_summary_email).';
COMMENT ON COLUMN users.asst_dunning_emails IS
    'Master switch for the staged dunning email sequence (pre-due/due/overdue/escalation/final).';
COMMENT ON COLUMN users.notif_preferences IS
    'Channel-matrix overrides: {"category": {"email": "immediate|weekly|off", "push": "immediate|digest|off"}}. Empty = defaults.';

CREATE TABLE IF NOT EXISTS dunning_state (
    id TEXT PRIMARY KEY DEFAULT ('ds_' || uuid_generate_v4()),
    document_id TEXT NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT,
    entity_type TEXT NOT NULL,
    current_stage TEXT NOT NULL,
    send_count INTEGER NOT NULL DEFAULT 0,
    last_email_sent_at TIMESTAMPTZ,
    paused BOOLEAN NOT NULL DEFAULT false,
    pause_reason TEXT,
    promised_payment_date TIMESTAMPTZ,
    cancelled_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_state_stage
    ON dunning_state (current_stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dunning_state_user
    ON dunning_state (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dunning_state_paused
    ON dunning_state (paused);

ALTER TABLE dunning_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dunning state"
    ON dunning_state FOR SELECT
    USING (user_id = current_user);

CREATE POLICY "Users can manage their own dunning state"
    ON dunning_state FOR ALL
    USING (user_id = current_user);

NOTIFY pgrst, 'reload schema';
