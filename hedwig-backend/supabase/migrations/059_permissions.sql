-- 059: Enhanced permissions model — project assignments + role enforcement
-- Owner: everything. Admin: everything except ownership controls.
-- Member: only assigned projects, own payouts, relevant client info.

-- ─── workspace_project_assignments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_project_assignments (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wp_assignments_user_id ON workspace_project_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_wp_assignments_workspace ON workspace_project_assignments(workspace_id);

-- RLS: members can read their own assignments; owner/admin can manage all
ALTER TABLE workspace_project_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own assignments"
  ON workspace_project_assignments FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Owner and admin can manage assignments"
  ON workspace_project_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspace_project_assignments.workspace_id
      AND user_id = auth.uid()::text
      AND role IN ('owner', 'admin')
    )
  );
