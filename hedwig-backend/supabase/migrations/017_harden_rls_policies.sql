-- Harden overly permissive direct-access policies.
-- The backend uses the Supabase service role and bypasses RLS, so these changes
-- only affect anon/authenticated client access.

-- Restore scoped inserts on users instead of allowing public inserts.
DROP POLICY IF EXISTS "Users can insert their own data" ON users;
DROP POLICY IF EXISTS "Allow user creation" ON users;
DROP POLICY IF EXISTS "Enable insert for all users" ON users;

CREATE POLICY "Users can insert their own data"
    ON users FOR INSERT
    WITH CHECK (auth.uid()::text = privy_id);

-- Remove permissive Bridge USD policies.
DROP POLICY IF EXISTS user_usd_accounts_select_policy ON user_usd_accounts;
DROP POLICY IF EXISTS user_usd_accounts_insert_policy ON user_usd_accounts;
DROP POLICY IF EXISTS user_usd_accounts_update_policy ON user_usd_accounts;
DROP POLICY IF EXISTS user_usd_accounts_delete_policy ON user_usd_accounts;

DROP POLICY IF EXISTS bridge_webhook_events_select_policy ON bridge_webhook_events;
DROP POLICY IF EXISTS bridge_webhook_events_insert_policy ON bridge_webhook_events;
DROP POLICY IF EXISTS bridge_webhook_events_update_policy ON bridge_webhook_events;
DROP POLICY IF EXISTS bridge_webhook_events_delete_policy ON bridge_webhook_events;

DROP POLICY IF EXISTS bridge_usd_transfers_select_policy ON bridge_usd_transfers;
DROP POLICY IF EXISTS bridge_usd_transfers_insert_policy ON bridge_usd_transfers;
DROP POLICY IF EXISTS bridge_usd_transfers_update_policy ON bridge_usd_transfers;
DROP POLICY IF EXISTS bridge_usd_transfers_delete_policy ON bridge_usd_transfers;

DROP POLICY IF EXISTS usd_fee_ledger_select_policy ON usd_fee_ledger;
DROP POLICY IF EXISTS usd_fee_ledger_insert_policy ON usd_fee_ledger;
DROP POLICY IF EXISTS usd_fee_ledger_update_policy ON usd_fee_ledger;
DROP POLICY IF EXISTS usd_fee_ledger_delete_policy ON usd_fee_ledger;

-- Allow authenticated users to read only their own USD-account data if direct
-- DB access is ever introduced later. Writes stay backend-only.
CREATE POLICY user_usd_accounts_select_own_policy ON user_usd_accounts
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY bridge_usd_transfers_select_own_policy ON bridge_usd_transfers
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY usd_fee_ledger_select_own_policy ON usd_fee_ledger
    FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

-- No client policies for bridge_webhook_events. Webhook payloads should remain
-- backend-only even for authenticated users.
