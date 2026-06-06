-- 058: Add workspace_id to calendar_events, notifications, expenses, recurring_invoices
-- Extends workspace isolation from 057 to remaining entity tables

-- ─── calendar_events ────────────────────────────────────────────────────────
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace_id ON calendar_events(workspace_id);

-- ─── notifications ──────────────────────────────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON notifications(workspace_id);

-- ─── expenses ───────────────────────────────────────────────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_workspace_id ON expenses(workspace_id);

-- ─── recurring_invoices ─────────────────────────────────────────────────────
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_workspace_id ON recurring_invoices(workspace_id);

-- ─── offramp_orders ─────────────────────────────────────────────────────────
ALTER TABLE offramp_orders ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_offramp_orders_workspace_id ON offramp_orders(workspace_id);

-- ─── onramp_orders ──────────────────────────────────────────────────────────
ALTER TABLE onramp_orders ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_onramp_orders_workspace_id ON onramp_orders(workspace_id);

-- ─── Backfill: assign all existing records to the user's personal workspace ──
UPDATE calendar_events ce
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = ce.user_id AND w.type = 'personal'
AND ce.workspace_id IS NULL;

UPDATE notifications n
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = n.user_id AND w.type = 'personal'
AND n.workspace_id IS NULL;

UPDATE expenses e
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = e.user_id AND w.type = 'personal'
AND e.workspace_id IS NULL;

UPDATE recurring_invoices ri
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = ri.user_id AND w.type = 'personal'
AND ri.workspace_id IS NULL;

UPDATE offramp_orders oo
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = oo.user_id AND w.type = 'personal'
AND oo.workspace_id IS NULL;

UPDATE onramp_orders oo
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = oo.user_id AND w.type = 'personal'
AND oo.workspace_id IS NULL;
