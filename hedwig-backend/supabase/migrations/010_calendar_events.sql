-- Migration: Calendar Events for Freelance Workflows
-- Auto-generated events from invoices and milestones

-- Create event_type enum
CREATE TYPE calendar_event_type AS ENUM ('invoice_due', 'milestone_due', 'project_deadline', 'custom');

-- Create event_status enum
CREATE TYPE calendar_event_status AS ENUM ('upcoming', 'completed', 'cancelled');

-- Create calendar_events table
CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY DEFAULT ('event_' || replace(uuid_generate_v4()::text, '-', '')),
    
    user_id TEXT NOT NULL,
    
    -- Event details
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    event_type calendar_event_type NOT NULL DEFAULT 'custom',
    status calendar_event_status NOT NULL DEFAULT 'upcoming',
    
    -- Source reference (for auto-generated events)
    source_type TEXT, -- 'invoice', 'milestone', 'project'
    source_id TEXT,   -- ID of the source document/milestone/project
    
    -- Notification tracking
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_calendar_events_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- Apply updated_at trigger to calendar_events
CREATE TRIGGER update_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for calendar_events
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON calendar_events(source_type, source_id);

-- Enable Row Level Security
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own calendar events"
    ON calendar_events FOR SELECT
    USING (user_id IN (
        SELECT id FROM users WHERE privy_id = auth.uid()::text
    ));

CREATE POLICY "Users can create their own calendar events"
    ON calendar_events FOR INSERT
    WITH CHECK (user_id IN (
        SELECT id FROM users WHERE privy_id = auth.uid()::text
    ));

CREATE POLICY "Users can update their own calendar events"
    ON calendar_events FOR UPDATE
    USING (user_id IN (
        SELECT id FROM users WHERE privy_id = auth.uid()::text
    ));

CREATE POLICY "Users can delete their own calendar events"
    ON calendar_events FOR DELETE
    USING (user_id IN (
        SELECT id FROM users WHERE privy_id = auth.uid()::text
    ));
