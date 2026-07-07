-- Phase 8: Stellar Anchor Off-Ramp Tracking
-- Records off-ramps initiated via Stellar anchors (Cowrie, Kotani Pay)

CREATE TABLE IF NOT EXISTS stellar_offramps (
    id TEXT PRIMARY KEY DEFAULT ('so_' || replace(uuid_generate_v4()::text, '-', '')),

    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,

    -- Anchor
    anchor TEXT NOT NULL,

    -- Source (Stellar USDC)
    source_asset TEXT NOT NULL DEFAULT 'USDC',
    source_amount DOUBLE PRECISION NOT NULL,

    -- Destination (fiat)
    dest_asset TEXT NOT NULL,
    dest_amount DOUBLE PRECISION NOT NULL,

    -- Bank details
    bank_name TEXT NOT NULL,
    bank_account_number TEXT NOT NULL,
    bank_sort_code TEXT NOT NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending_auth',
    anchor_tx_id TEXT,
    stellar_tx_hash TEXT,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stellar_offramps_user ON stellar_offramps(user_id);
CREATE INDEX IF NOT EXISTS idx_stellar_offramps_status ON stellar_offramps(status);

ALTER TABLE stellar_offramps ENABLE ROW LEVEL SECURITY;

-- RLS: users can see their own off-ramps
CREATE POLICY stellar_offramps_select ON stellar_offramps
    FOR SELECT
    USING (user_id = current_setting('app.user_id', true)::text);

CREATE POLICY stellar_offramps_insert ON stellar_offramps
    FOR INSERT
    WITH CHECK (user_id = current_setting('app.user_id', true)::text);
