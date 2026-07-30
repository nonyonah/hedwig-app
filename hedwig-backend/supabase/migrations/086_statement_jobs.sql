CREATE TABLE statement_jobs (
    id TEXT PRIMARY KEY DEFAULT ('sj_' || uuid_generate_v4()),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_format TEXT NOT NULL,
    file_data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'complete', 'failed', 'partial')),
    error_message TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    chunk_success_count INTEGER NOT NULL DEFAULT 0,
    chunk_fail_count INTEGER NOT NULL DEFAULT 0,
    chunk_info JSONB,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_statement_jobs_user_id ON statement_jobs(user_id);
CREATE INDEX idx_statement_jobs_status ON statement_jobs(status);

ALTER TABLE statement_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own statement jobs"
    ON statement_jobs FOR SELECT
    USING (user_id = current_user);

NOTIFY pgrst, 'reload schema';
