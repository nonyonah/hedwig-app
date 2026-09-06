-- 100_workspace_icon.sql — the API and frontend already read/write
-- workspaces.icon (workspace switcher, updateWorkspace), but the column was
-- never created. Without it, workspace listing and icon updates fail.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'icon'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN icon TEXT;
  END IF;
END $$;
