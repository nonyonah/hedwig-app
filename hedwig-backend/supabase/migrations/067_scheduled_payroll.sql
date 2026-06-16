-- 067: Scheduled (recurring) payroll

-- ─── Scheduled payroll configs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL DEFAULT 'fixed' CHECK (run_type IN ('fixed', 'project')),
  items JSONB NOT NULL DEFAULT '[]',
  frequency TEXT NOT NULL CHECK (frequency IN ('minute', 'weekly', 'biweekly', 'monthly')),
  day_of_month INTEGER,
  day_of_week INTEGER,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  last_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If table already exists, drop old constraint and add new one
DO $$ BEGIN
  ALTER TABLE scheduled_payrolls DROP CONSTRAINT IF EXISTS scheduled_payrolls_frequency_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE scheduled_payrolls ADD CONSTRAINT scheduled_payrolls_frequency_check CHECK (frequency IN ('minute', 'weekly', 'biweekly', 'monthly'));

CREATE INDEX IF NOT EXISTS idx_scheduled_payrolls_workspace ON scheduled_payrolls(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payrolls_next_run ON scheduled_payrolls(next_run_at) WHERE status = 'active';

-- ─── Link payroll runs to their schedule ────────────────────────────────
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS scheduled_payroll_id UUID REFERENCES scheduled_payrolls(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_runs_scheduled ON payroll_runs(scheduled_payroll_id);
