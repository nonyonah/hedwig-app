-- 096_demo_booking.sql
-- Demo-booking funnel: lets the product know a user has booked (or clicked a
-- demo CTA) so onboarding reminders don't nag them, and dedupes reminder emails.
--
-- 1) users.demo_booked_at: set when a logged-in user clicks any "Book a Demo"
--    CTA (welcome modal, dashboard banner). Idempotent — a single timestamp.
-- 2) users.last_demo_reminder_at: dedupe guard for the daily demo-reminder
--    scheduler job (one reminder per user, ever).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS demo_booked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_demo_reminder_at TIMESTAMPTZ;

COMMENT ON COLUMN users.demo_booked_at IS
    'When the user clicked a "Book a Demo" CTA while signed in. Suppresses demo reminder emails.';
COMMENT ON COLUMN users.last_demo_reminder_at IS
    'When the demo-reminder email was last sent (scheduler dedupe; one reminder per user).';

CREATE INDEX IF NOT EXISTS idx_users_demo_reminder_window
    ON users (created_at DESC)
    WHERE demo_booked_at IS NULL AND last_demo_reminder_at IS NULL;

NOTIFY pgrst, 'reload schema';
