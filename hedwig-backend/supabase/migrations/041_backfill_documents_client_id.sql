-- 041_backfill_documents_client_id.sql
-- Resolve missing documents.client_id by looking at content JSONB.
-- Many documents (assistant-created drafts, imports, legacy rows) have only
-- client_name / client_email stashed in content. The agent's "wrong client"
-- bug stems from these unlinked rows. This backfill links them to a real
-- clients row (creating one if needed), so future queries are consistent.

DO $$
DECLARE
    doc                  RECORD;
    resolved_client_id   TEXT;
    c_email              TEXT;
    c_name               TEXT;
BEGIN
    FOR doc IN
        SELECT id, user_id, content
        FROM documents
        WHERE client_id IS NULL
          AND content IS NOT NULL
    LOOP
        c_email := NULLIF(LOWER(TRIM(COALESCE(
            doc.content ->> 'client_email',
            doc.content ->> 'clientEmail',
            doc.content ->> 'recipient_email',
            doc.content ->> 'recipientEmail'
        ))), '');

        c_name := NULLIF(TRIM(COALESCE(
            doc.content ->> 'client_name',
            doc.content ->> 'clientName',
            doc.content ->> 'recipient_name',
            doc.content ->> 'recipientName'
        )), '');

        resolved_client_id := NULL;

        -- 1. Try email match (case-insensitive)
        IF c_email IS NOT NULL THEN
            SELECT id INTO resolved_client_id
            FROM clients
            WHERE user_id = doc.user_id
              AND LOWER(email) = c_email
            LIMIT 1;
        END IF;

        -- 2. Try name match (case-insensitive)
        IF resolved_client_id IS NULL AND c_name IS NOT NULL THEN
            SELECT id INTO resolved_client_id
            FROM clients
            WHERE user_id = doc.user_id
              AND LOWER(name) = LOWER(c_name)
            LIMIT 1;
        END IF;

        -- 3. Auto-create when we have at least an email or a name
        IF resolved_client_id IS NULL AND (c_email IS NOT NULL OR c_name IS NOT NULL) THEN
            INSERT INTO clients (user_id, name, email)
            VALUES (
                doc.user_id,
                COALESCE(c_name, split_part(c_email, '@', 1), 'Unknown Client'),
                c_email
            )
            RETURNING id INTO resolved_client_id;
        END IF;

        IF resolved_client_id IS NOT NULL THEN
            UPDATE documents
            SET client_id = resolved_client_id
            WHERE id = doc.id;
        END IF;
    END LOOP;
END $$;

-- Trigger from migration 040 will fire on every UPDATE above and recompute
-- stats automatically, so no manual recompute step is needed here.
