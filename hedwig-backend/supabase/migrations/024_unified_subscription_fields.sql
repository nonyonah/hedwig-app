ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS subscription_status TEXT,
    ADD COLUMN IF NOT EXISTS subscription_provider TEXT,
    ADD COLUMN IF NOT EXISTS subscription_expiry TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_subscription_provider_check'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_subscription_provider_check
            CHECK (
                subscription_provider IS NULL
                OR subscription_provider IN ('polar', 'revenue_cat')
            );
    END IF;
END $$;
