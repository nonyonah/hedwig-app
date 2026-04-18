-- Phase 1: User integrations foundation (Gmail, Outlook, Google Calendar, Slack)
CREATE TABLE IF NOT EXISTS user_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(50) NOT NULL,          -- 'gmail' | 'google_calendar' | 'slack'
  status          VARCHAR(20) NOT NULL DEFAULT 'connected', -- 'connected' | 'error' | 'token_expired'
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  scope           TEXT,
  provider_user_id   VARCHAR(255),
  provider_email     VARCHAR(255),
  metadata        JSONB    NOT NULL DEFAULT '{}',
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Phase 2: Email threads ingested from Gmail/Outlook
CREATE TABLE IF NOT EXISTS email_threads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id        UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  provider              VARCHAR(50) NOT NULL,
  provider_thread_id    VARCHAR(255) NOT NULL,
  subject               TEXT,
  snippet               TEXT,
  from_email            VARCHAR(255),
  from_name             VARCHAR(255),
  participants          TEXT[]   NOT NULL DEFAULT '{}',
  message_count         INT      NOT NULL DEFAULT 0,
  has_attachments       BOOLEAN  NOT NULL DEFAULT FALSE,
  last_message_at       TIMESTAMPTZ,
  labels                TEXT[]   NOT NULL DEFAULT '{}',
  -- Phase 3: Gemini summarization
  summary               TEXT,
  summary_generated_at  TIMESTAMPTZ,
  -- Phase 5: Matching engine results
  matched_client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  matched_project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  matched_document_id   UUID,
  matched_document_type VARCHAR(50),
  match_confidence      FLOAT,
  is_archived           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider, provider_thread_id)
);

-- Phase 4: Email attachments stored in Cloudflare R2
CREATE TABLE IF NOT EXISTS email_attachments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id               UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_attachment_id  VARCHAR(255),
  provider_message_id     VARCHAR(255),
  filename                VARCHAR(500) NOT NULL,
  content_type            VARCHAR(100),
  size_bytes              BIGINT,
  r2_key                  TEXT,           -- object key in R2 bucket
  attachment_type         VARCHAR(50),    -- 'invoice' | 'contract' | 'receipt' | 'other'
  parsed_data             JSONB,          -- structured data extracted from the attachment
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 6: Calendar events from Google Calendar / Apple ICS
CREATE TABLE IF NOT EXISTS external_calendar_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id      UUID REFERENCES user_integrations(id) ON DELETE SET NULL,
  provider            VARCHAR(50) NOT NULL, -- 'google_calendar' | 'apple_ics'
  provider_event_id   VARCHAR(255),
  title               TEXT,
  description         TEXT,
  location            TEXT,
  start_at            TIMESTAMPTZ,
  end_at              TIMESTAMPTZ,
  all_day             BOOLEAN NOT NULL DEFAULT FALSE,
  attendees           TEXT[]  NOT NULL DEFAULT '{}',
  -- matching
  matched_client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  matched_project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider, provider_event_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id    ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_provider   ON user_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_email_threads_user_id        ON email_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_integration    ON email_threads(integration_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_from_email     ON email_threads(from_email);
CREATE INDEX IF NOT EXISTS idx_email_threads_last_message   ON email_threads(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_email_threads_matched_client ON email_threads(matched_client_id) WHERE matched_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_attachments_thread     ON email_attachments(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_user       ON email_attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_ext_calendar_user            ON external_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_ext_calendar_start           ON external_calendar_events(start_at DESC NULLS LAST);
