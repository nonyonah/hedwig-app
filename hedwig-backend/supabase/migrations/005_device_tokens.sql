-- Create device_tokens table for push notification tokens
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    platform TEXT CHECK (platform IN ('ios', 'android')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, expo_push_token)
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);

-- Enable RLS
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own device tokens"
    ON device_tokens FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own device tokens"
    ON device_tokens FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own device tokens"
    ON device_tokens FOR DELETE
    USING (user_id = auth.uid());

-- Service role can do everything (for backend)
CREATE POLICY "Service role has full access to device_tokens"
    ON device_tokens FOR ALL
    USING (auth.role() = 'service_role');
