-- 060: Add payout_amount to workspace_project_assignments
ALTER TABLE workspace_project_assignments ADD COLUMN IF NOT EXISTS payout_amount NUMERIC DEFAULT NULL;
