-- Migration: Add source column to documents for tracking import origin
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source TEXT;
