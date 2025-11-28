-- Add chain column to documents table
ALTER TABLE documents ADD COLUMN chain chain;

-- Update existing documents to default to BASE (optional, but good for data integrity)
UPDATE documents SET chain = 'BASE' WHERE chain IS NULL;
