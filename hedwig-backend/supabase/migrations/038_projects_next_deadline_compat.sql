-- Compatibility shim for older runtime paths that still query projects.next_deadline_at.
-- Canonical field remains projects.deadline.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS next_deadline_at TIMESTAMPTZ;

UPDATE projects
SET next_deadline_at = deadline
WHERE next_deadline_at IS DISTINCT FROM deadline;

CREATE OR REPLACE FUNCTION sync_projects_deadline_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deadline IS NULL AND NEW.next_deadline_at IS NOT NULL THEN
    NEW.deadline := NEW.next_deadline_at;
  END IF;

  NEW.next_deadline_at := NEW.deadline;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_projects_deadline_columns_trigger ON projects;

CREATE TRIGGER sync_projects_deadline_columns_trigger
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION sync_projects_deadline_columns();
