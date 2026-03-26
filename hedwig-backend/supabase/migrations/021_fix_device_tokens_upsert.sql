-- Ensure device token upsert target exists for backend registration flow.
-- This supports:
--   .upsert(..., { onConflict: 'user_id,expo_push_token' })

DO $$
BEGIN
    -- If the table does not exist yet in a given environment, skip safely.
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'device_tokens'
    ) THEN
        -- Guarantee the expected unique key for upsert conflict target.
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'device_tokens'
              AND indexname = 'idx_device_tokens_user_token_unique'
        ) THEN
            CREATE UNIQUE INDEX idx_device_tokens_user_token_unique
                ON device_tokens(user_id, expo_push_token);
        END IF;

        -- Optional helper index for faster token cleanup/removal lookups.
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'device_tokens'
              AND indexname = 'idx_device_tokens_expo_push_token'
        ) THEN
            CREATE INDEX idx_device_tokens_expo_push_token
                ON device_tokens(expo_push_token);
        END IF;
    END IF;
END $$;
