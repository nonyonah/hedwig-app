-- 044_assistant_brief_email_defaults.sql
-- Brief emails are part of the assistant experience. The original columns were
-- introduced with DEFAULT false, which left weekly summaries off for users who
-- were otherwise receiving assistant email.

ALTER TABLE users
    ALTER COLUMN asst_daily_brief_email SET DEFAULT TRUE,
    ALTER COLUMN asst_weekly_summary_email SET DEFAULT TRUE;

-- Preserve explicit daily opt-outs, but repair existing daily-brief subscribers
-- who never had the matching weekly preference enabled.
UPDATE users
SET asst_weekly_summary_email = TRUE
WHERE asst_daily_brief_email = TRUE
  AND asst_weekly_summary_email = FALSE;

COMMENT ON COLUMN users.asst_daily_brief_email IS
    'Whether the user receives daily assistant brief emails. Defaults on for new users.';
COMMENT ON COLUMN users.asst_weekly_summary_email IS
    'Whether the user receives weekly assistant summary emails. Defaults on for new users.';
