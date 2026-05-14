-- 052_device_tokens_user_id_text.sql
-- The app's users.id values are text ids (for example user_xxx), while the
-- original device_tokens migration used UUID. Expo push registration stores
-- the internal user id here, so the column must match users.id.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'device_tokens'
    ) THEN
        ALTER TABLE device_tokens
            DROP CONSTRAINT IF EXISTS device_tokens_user_id_fkey;

        ALTER TABLE device_tokens
            ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

        ALTER TABLE device_tokens
            ADD CONSTRAINT device_tokens_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_user_token_unique
            ON device_tokens(user_id, expo_push_token);

        CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id
            ON device_tokens(user_id);

        CREATE INDEX IF NOT EXISTS idx_device_tokens_expo_push_token
            ON device_tokens(expo_push_token);
    END IF;
END $$;

