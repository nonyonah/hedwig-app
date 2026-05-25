-- 056_user_usage_tracking.sql
-- Tracks per-user monthly usage of AI, email, and document operations
-- for infrastructure cost control and future plan enforcement.

CREATE TABLE user_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_metric_period UNIQUE (user_id, metric, period_start)
);

CREATE INDEX idx_user_usage_lookup ON user_usage (user_id, metric, period_start);
CREATE INDEX idx_user_usage_period ON user_usage (period_start);

COMMENT ON TABLE user_usage IS 'Monthly per-user usage counters for cost-controlled features';
COMMENT ON COLUMN user_usage.metric IS 'One of: ai_prompts, emails_sent, document_imports';
COMMENT ON COLUMN user_usage.period_start IS 'Start of the monthly billing/usage period (always 1st of month)';

-- Atomic increment function: creates row if missing, otherwise increments count.
CREATE OR REPLACE FUNCTION increment_user_usage(
    p_user_id TEXT,
    p_metric TEXT,
    p_period_start TIMESTAMPTZ,
    p_amount INTEGER DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
    v_new_count INTEGER;
BEGIN
    INSERT INTO user_usage (user_id, metric, period_start, count)
    VALUES (p_user_id, p_metric, p_period_start, p_amount)
    ON CONFLICT (user_id, metric, period_start)
    DO UPDATE SET count = user_usage.count + p_amount, updated_at = NOW()
    RETURNING count INTO v_new_count;

    RETURN v_new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
