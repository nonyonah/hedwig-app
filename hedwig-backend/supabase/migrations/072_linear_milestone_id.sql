-- Add linear_milestone_id column to milestones table for bidirectional sync
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS linear_milestone_id TEXT;
CREATE INDEX IF NOT EXISTS idx_milestones_linear_milestone_id ON milestones(linear_milestone_id);
