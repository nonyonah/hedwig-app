-- 057: Workspaces — Multi-tenant organization support
-- Creates workspaces, workspace_members, workspace_invitations tables
-- Adds workspace_id to existing entities
-- Creates personal workspaces for all existing users

-- ─── Workspaces table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY DEFAULT 'ws_' || replace(gen_random_uuid()::text, '-', ''),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'organization' CHECK (type IN ('personal', 'organization')),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_type ON workspaces(type);

-- ─── Workspace Members table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);

-- ─── Workspace Invitations table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id TEXT PRIMARY KEY DEFAULT 'inv_' || replace(gen_random_uuid()::text, '-', ''),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace_id ON workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_status ON workspace_invitations(status);

-- ─── Add workspace_id to existing entities ─────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_workspace_id ON clients(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_transactions_workspace_id ON transactions(workspace_id);

-- ─── Create personal workspaces for all existing users ─────────────────────
-- Each user gets their own personal workspace, and all their existing data
-- is linked to that workspace.
INSERT INTO workspaces (id, name, type, owner_id, created_at, updated_at)
SELECT
  'ws_personal_' || id,
  COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email, 'My Workspace'),
  'personal',
  id,
  created_at,
  NOW()
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM workspaces WHERE owner_id = users.id AND type = 'personal'
);

-- Add all users as owner members of their personal workspace
INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
SELECT
  w.id,
  w.owner_id,
  'owner',
  w.created_at
FROM workspaces w
WHERE w.type = 'personal'
AND NOT EXISTS (
  SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = w.owner_id
);

-- Backfill workspace_id on existing clients
UPDATE clients c
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = c.user_id AND w.type = 'personal'
AND c.workspace_id IS NULL;

-- Backfill workspace_id on existing projects (via client's workspace)
UPDATE projects p
SET workspace_id = c.workspace_id
FROM clients c
WHERE c.id = p.client_id
AND p.workspace_id IS NULL;

-- Backfill workspace_id on existing documents
UPDATE documents d
SET workspace_id = c.workspace_id
FROM clients c
WHERE c.id = d.client_id
AND d.workspace_id IS NULL;

-- For documents without a client, use the user's personal workspace
UPDATE documents d
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = d.user_id AND w.type = 'personal'
AND d.workspace_id IS NULL;

-- Backfill workspace_id on existing transactions
UPDATE transactions t
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = t.user_id AND w.type = 'personal'
AND t.workspace_id IS NULL;

-- ─── RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Workspace access: owner and members can read
CREATE POLICY "Members can read workspaces"
  ON workspaces FOR SELECT
  USING (
    owner_id = auth.uid()::text
    OR id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text)
  );

-- Only owner can update workspace
CREATE POLICY "Owner can update workspaces"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid()::text)
  WITH CHECK (owner_id = auth.uid()::text);

-- Only owner can delete workspace
CREATE POLICY "Owner can delete workspaces"
  ON workspaces FOR DELETE
  USING (owner_id = auth.uid()::text);

-- Members can read workspace members
CREATE POLICY "Members can read workspace_members"
  ON workspace_members FOR SELECT
  USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text)
  );

-- Owner and admin can manage members
CREATE POLICY "Owner and admin can manage workspace_members"
  ON workspace_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_members.workspace_id
      AND m.user_id = auth.uid()::text
      AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owner and admin can update workspace_members"
  ON workspace_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_members.workspace_id
      AND m.user_id = auth.uid()::text
      AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owner and admin can delete workspace_members"
  ON workspace_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_members.workspace_id
      AND m.user_id = auth.uid()::text
      AND m.role IN ('owner', 'admin')
    )
  );

-- Members can read invitations
CREATE POLICY "Members can read workspace_invitations"
  ON workspace_invitations FOR SELECT
  USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()::text)
  );

-- Owner and admin can create/cancel invitations
CREATE POLICY "Owner and admin can create workspace_invitations"
  ON workspace_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_invitations.workspace_id
      AND m.user_id = auth.uid()::text
      AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owner and admin can update workspace_invitations"
  ON workspace_invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_invitations.workspace_id
      AND m.user_id = auth.uid()::text
      AND m.role IN ('owner', 'admin')
    )
  );
