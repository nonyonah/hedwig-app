-- Remove strict check constraint on notification types to allow new types (contract_approved, proposal_sent, etc.)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- verify column names (no-op, just for documentation)
-- columns are: id, user_id, type, title, message, metadata, is_read, created_at
