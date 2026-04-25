-- Add SIGNED status to document_status enum for contract approvals
ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'SIGNED';
