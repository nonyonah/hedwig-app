-- 033_expenses.sql
-- Expense tracking table for the Revenue module

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY DEFAULT ('exp_' || replace(uuid_generate_v4()::text, '-', '')),
    user_id TEXT NOT NULL,
    amount NUMERIC(18, 6) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    converted_amount_usd NUMERIC(18, 6) NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    project_id TEXT,
    client_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual',
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_expenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_expenses_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_expenses_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_client_id ON expenses(client_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON expenses(project_id);

CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
