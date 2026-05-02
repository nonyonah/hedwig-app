-- 040_client_segment_activity_trigger.sql
-- Add last_activity_at + segment columns to clients.
-- Add Postgres trigger that recomputes total_earnings, outstanding_balance,
-- last_activity_at and segment whenever a document changes.
-- Replaces ad-hoc ClientService.updateClientStats() calls and prevents drift.

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS segment TEXT NOT NULL DEFAULT 'new'
        CHECK (segment IN ('new', 'active', 'lapsing', 'dormant'));

CREATE INDEX IF NOT EXISTS idx_clients_user_activity
    ON clients (user_id, last_activity_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_clients_user_segment
    ON clients (user_id, segment);

-- Recompute stats for a single client.
-- Safe to call repeatedly. NULL p_client_id is a no-op.
CREATE OR REPLACE FUNCTION recompute_client_stats(p_client_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_total_earnings   DECIMAL(18, 2);
    v_outstanding      DECIMAL(18, 2);
    v_last_activity    TIMESTAMPTZ;
    v_created_at       TIMESTAMPTZ;
    v_segment          TEXT;
BEGIN
    IF p_client_id IS NULL THEN
        RETURN;
    END IF;

    -- Note: document_status enum has no OVERDUE. Overdue invoices are still
    -- 'SENT' or 'VIEWED' with content.due_date < now, so they are already
    -- counted in outstanding_balance via the SENT/VIEWED branch.
    SELECT
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE
            WHEN type = 'INVOICE' AND status IN ('SENT', 'VIEWED')
                THEN amount ELSE 0
        END), 0),
        MAX(GREATEST(created_at, updated_at))
    INTO v_total_earnings, v_outstanding, v_last_activity
    FROM documents
    WHERE client_id = p_client_id;

    SELECT created_at INTO v_created_at FROM clients WHERE id = p_client_id;

    -- Segment rules:
    --   new:     created < 14d ago AND no earnings yet
    --   active:  any activity within last 30 days OR has earnings and no activity yet
    --   lapsing: last activity 30-90d ago
    --   dormant: last activity > 90d ago
    IF v_last_activity IS NULL THEN
        IF v_created_at > NOW() - INTERVAL '14 days' AND v_total_earnings = 0 THEN
            v_segment := 'new';
        ELSIF v_total_earnings > 0 THEN
            v_segment := 'active';
        ELSE
            v_segment := 'new';
        END IF;
    ELSIF v_last_activity > NOW() - INTERVAL '30 days' THEN
        IF v_created_at > NOW() - INTERVAL '14 days' AND v_total_earnings = 0 THEN
            v_segment := 'new';
        ELSE
            v_segment := 'active';
        END IF;
    ELSIF v_last_activity > NOW() - INTERVAL '90 days' THEN
        v_segment := 'lapsing';
    ELSE
        v_segment := 'dormant';
    END IF;

    UPDATE clients
    SET total_earnings     = v_total_earnings,
        outstanding_balance = v_outstanding,
        last_activity_at   = v_last_activity,
        segment            = v_segment,
        updated_at         = NOW()
    WHERE id = p_client_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger: any document insert/update/delete recomputes the affected client(s)
CREATE OR REPLACE FUNCTION trg_documents_recompute_client()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_client_stats(OLD.client_id);
        RETURN OLD;
    END IF;

    -- If client_id changed on UPDATE, recompute the old client too
    IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
        PERFORM recompute_client_stats(OLD.client_id);
    END IF;

    PERFORM recompute_client_stats(NEW.client_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_recompute_client_stats ON documents;
CREATE TRIGGER documents_recompute_client_stats
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION trg_documents_recompute_client();

-- One-time recompute for every existing client so cached values match reality
DO $$
DECLARE
    cid TEXT;
BEGIN
    FOR cid IN SELECT id FROM clients LOOP
        PERFORM recompute_client_stats(cid);
    END LOOP;
END $$;

COMMENT ON COLUMN clients.last_activity_at IS
    'Latest document activity (created_at or updated_at) for this client. Maintained by trigger.';
COMMENT ON COLUMN clients.segment IS
    'Engagement bucket: new, active, lapsing, dormant. Maintained by trigger.';
COMMENT ON FUNCTION recompute_client_stats(TEXT) IS
    'Recompute total_earnings, outstanding_balance, last_activity_at, segment for one client.';
