-- Add SIGNED status to document_status enum for contract approvals
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'SIGNED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_status')
    ) THEN
        ALTER TYPE document_status ADD VALUE 'SIGNED' AFTER 'VIEWED';
    END IF;
END
$$;

-- Add APPROVED status as well for backwards compatibility
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'APPROVED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_status')
    ) THEN
        ALTER TYPE document_status ADD VALUE 'APPROVED' AFTER 'SIGNED';
    END IF;
END
$$;
