-- Migration: Recurring Invoices
-- Templates that auto-generate invoices on a schedule

CREATE TYPE recurring_frequency AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual');
CREATE TYPE recurring_status AS ENUM ('active', 'paused', 'cancelled');

CREATE TABLE IF NOT EXISTS recurring_invoices (
    id TEXT PRIMARY KEY DEFAULT ('rec_' || replace(uuid_generate_v4()::text, '-', '')),

    user_id TEXT NOT NULL,
    client_id TEXT,
    project_id TEXT,

    -- Client info snapshot (in case client is deleted)
    client_name TEXT,
    client_email TEXT,

    -- Invoice template fields
    title TEXT NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USDC',
    chain TEXT NOT NULL DEFAULT 'BASE',
    memo TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Schedule
    frequency recurring_frequency NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    next_due_date DATE NOT NULL,

    -- State
    status recurring_status NOT NULL DEFAULT 'active',
    auto_send BOOLEAN NOT NULL DEFAULT FALSE,
    generated_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_recurring_invoices_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TRIGGER update_recurring_invoices_updated_at
    BEFORE UPDATE ON recurring_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_recurring_invoices_user_id ON recurring_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_next_due ON recurring_invoices(next_due_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_status ON recurring_invoices(status);

-- RLS
ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass recurring_invoices"
    ON recurring_invoices
    USING (true)
    WITH CHECK (true);
