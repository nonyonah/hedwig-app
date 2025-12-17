-- Beneficiaries table for storing saved bank accounts
CREATE TABLE IF NOT EXISTS beneficiaries (
    id TEXT PRIMARY KEY DEFAULT ('ben_' || replace(gen_random_uuid()::text, '-', '')),
    user_id TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    currency TEXT DEFAULT 'NGN',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT fk_beneficiaries_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    
    -- Each user can only have one entry per account number
    CONSTRAINT unique_user_account UNIQUE(user_id, account_number)
);

-- Index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_id ON beneficiaries(user_id);

-- RLS Policies
ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;

-- Users can only see their own beneficiaries
CREATE POLICY beneficiaries_select_policy ON beneficiaries
    FOR SELECT USING (true);

-- Users can only insert their own beneficiaries
CREATE POLICY beneficiaries_insert_policy ON beneficiaries
    FOR INSERT WITH CHECK (true);

-- Users can only update their own beneficiaries
CREATE POLICY beneficiaries_update_policy ON beneficiaries
    FOR UPDATE USING (true);

-- Users can only delete their own beneficiaries
CREATE POLICY beneficiaries_delete_policy ON beneficiaries
    FOR DELETE USING (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_beneficiaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_beneficiaries_timestamp
    BEFORE UPDATE ON beneficiaries
    FOR EACH ROW
    EXECUTE FUNCTION update_beneficiaries_updated_at();
