-- Add soft-delete columns for GDPR-compliant account deletion
-- Users have 90 days to recover their account before permanent deletion

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient querying of scheduled deletions
CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled ON users (deletion_scheduled_for) WHERE deletion_scheduled_for IS NOT NULL;

-- Create a function to permanently delete user data
CREATE OR REPLACE FUNCTION permanently_delete_scheduled_users()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete all related data for users past their deletion date
    -- Order matters due to foreign keys
    
    -- Delete documents
    DELETE FROM documents WHERE user_id IN (
        SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    );
    
    -- Delete transactions
    DELETE FROM transactions WHERE user_id IN (
        SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    );
    
    -- Delete clients
    DELETE FROM clients WHERE user_id IN (
        SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    );
    
    -- Delete offramp orders
    DELETE FROM offramp_orders WHERE user_id IN (
        SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    );
    
    -- Delete conversations and messages
    DELETE FROM messages WHERE conversation_id IN (
        SELECT id FROM conversations WHERE user_id IN (
            SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
        )
    );
    DELETE FROM conversations WHERE user_id IN (
        SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    );
    
    -- Delete calendar events
    DELETE FROM calendar_events WHERE user_id IN (
        SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    );
    
    -- Delete notifications
    DELETE FROM notifications WHERE user_id IN (
        SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    );
    
    -- Delete beneficiaries
    DELETE FROM beneficiaries WHERE user_id IN (
        SELECT id FROM users WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    );
    
    -- Finally delete users
    DELETE FROM users 
    WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < NOW()
    RETURNING 1;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON FUNCTION permanently_delete_scheduled_users() IS 'Permanently deletes users and all their data who have passed their 90-day grace period. Should be called daily via pg_cron or external scheduler.';

-- Enable pg_cron extension (if available in your Supabase plan)
-- Note: pg_cron requires Supabase Pro plan
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('delete-expired-users', '0 2 * * *', 'SELECT permanently_delete_scheduled_users()');
