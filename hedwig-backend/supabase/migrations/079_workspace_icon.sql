-- Add icon column to workspaces table for custom emoji/symbol support
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS icon TEXT;
