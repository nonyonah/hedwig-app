-- 049_user_subscription_wallet_defaults.sql
-- Make the free-plan state explicit for new and existing users. Wallets are
-- still assigned by Privy and saved by /api/auth/register; this keeps account
-- limits deterministic even when billing rows have not been created yet.

ALTER TABLE public.users
    ALTER COLUMN subscription_status SET DEFAULT 'inactive';

UPDATE public.users
SET subscription_status = 'inactive'
WHERE subscription_status IS NULL;

COMMENT ON COLUMN public.users.subscription_status IS
    'Unified billing status. Defaults to inactive so new users start on the free plan until a paid subscription is active.';
