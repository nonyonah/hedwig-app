-- Migration: Projects and Milestones Enhancement
-- Adds milestones table and updates projects table

-- Create milestone_status enum
CREATE TYPE milestone_status AS ENUM ('pending', 'invoiced', 'paid');

-- Add deadline column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

-- Update project_status enum with new values (we need to handle existing data)
-- First, alter the existing enum to add new values
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'ONGOING';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'PAID';

-- Create milestones table
CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY DEFAULT ('milestone_' || replace(uuid_generate_v4()::text, '-', '')),
    
    project_id TEXT NOT NULL,
    
    -- Milestone details
    title TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    due_date TIMESTAMPTZ,
    status milestone_status NOT NULL DEFAULT 'pending',
    
    -- Reference to generated invoice (if any)
    invoice_id TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_milestones_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_milestones_invoice
        FOREIGN KEY (invoice_id)
        REFERENCES documents(id)
        ON DELETE SET NULL
);

-- Apply updated_at trigger to milestones
CREATE TRIGGER update_milestones_updated_at
    BEFORE UPDATE ON milestones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for milestones
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_due_date ON milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_milestones_invoice_id ON milestones(invoice_id);

-- Enable Row Level Security on milestones
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policies for milestones table (access through project -> client -> user chain)
CREATE POLICY "Users can view milestones of their projects"
    ON milestones FOR SELECT
    USING (project_id IN (
        SELECT p.id FROM projects p
        JOIN clients c ON p.client_id = c.id
        JOIN users u ON c.user_id = u.id
        WHERE u.privy_id = auth.uid()::text
    ));

CREATE POLICY "Users can create milestones for their projects"
    ON milestones FOR INSERT
    WITH CHECK (project_id IN (
        SELECT p.id FROM projects p
        JOIN clients c ON p.client_id = c.id
        JOIN users u ON c.user_id = u.id
        WHERE u.privy_id = auth.uid()::text
    ));

CREATE POLICY "Users can update milestones of their projects"
    ON milestones FOR UPDATE
    USING (project_id IN (
        SELECT p.id FROM projects p
        JOIN clients c ON p.client_id = c.id
        JOIN users u ON c.user_id = u.id
        WHERE u.privy_id = auth.uid()::text
    ));

CREATE POLICY "Users can delete milestones of their projects"
    ON milestones FOR DELETE
    USING (project_id IN (
        SELECT p.id FROM projects p
        JOIN clients c ON p.client_id = c.id
        JOIN users u ON c.user_id = u.id
        WHERE u.privy_id = auth.uid()::text
    ));

-- Add user_id column to projects for direct user ownership lookup
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Update existing projects to have user_id from their client's user_id
UPDATE projects p
SET user_id = c.user_id
FROM clients c
WHERE p.client_id = c.id AND p.user_id IS NULL;

-- Create index for user_id on projects
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
