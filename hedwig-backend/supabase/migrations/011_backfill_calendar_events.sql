-- Backfill calendar_events from existing documents with due dates
-- Run this after the 010_calendar_events.sql migration

-- Insert calendar events for invoices with due dates
INSERT INTO calendar_events (user_id, title, event_date, event_type, source_type, source_id, description, status)
SELECT 
    d.user_id,
    CONCAT('Invoice due: ', COALESCE(d.content->>'client_name', 'Client')),
    (d.content->>'due_date')::date,
    'invoice_due',
    'invoice',
    d.id,
    CONCAT('Invoice for $', d.amount),
    CASE WHEN d.status = 'PAID' THEN 'completed'::calendar_event_status ELSE 'upcoming'::calendar_event_status END
FROM documents d
WHERE d.type = 'INVOICE'
AND d.content->>'due_date' IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM calendar_events ce 
    WHERE ce.source_type = 'invoice' AND ce.source_id = d.id
);

-- Insert calendar events for payment links with due dates
INSERT INTO calendar_events (user_id, title, event_date, event_type, source_type, source_id, description, status)
SELECT 
    d.user_id,
    CONCAT('Payment due: ', COALESCE(d.content->>'client_name', d.title)),
    (d.content->>'due_date')::date,
    'invoice_due',
    'payment_link',
    d.id,
    CONCAT('Payment link for $', d.amount),
    CASE WHEN d.status = 'PAID' THEN 'completed'::calendar_event_status ELSE 'upcoming'::calendar_event_status END
FROM documents d
WHERE d.type = 'PAYMENT_LINK'
AND d.content->>'due_date' IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM calendar_events ce 
    WHERE ce.source_type = 'payment_link' AND ce.source_id = d.id
);

-- Insert calendar events for milestones with due dates
INSERT INTO calendar_events (user_id, title, event_date, event_type, source_type, source_id, description, status)
SELECT 
    p.user_id,
    CONCAT('Milestone due: ', m.title),
    m.due_date::date,
    'milestone_due',
    'milestone',
    m.id,
    CONCAT('$', m.amount, ' - ', COALESCE(p.name, 'Project')),
    CASE WHEN m.status = 'paid' THEN 'completed'::calendar_event_status ELSE 'upcoming'::calendar_event_status END
FROM milestones m
JOIN projects p ON p.id = m.project_id
WHERE m.due_date IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM calendar_events ce 
    WHERE ce.source_type = 'milestone' AND ce.source_id = m.id
);

-- Insert calendar events for project deadlines
INSERT INTO calendar_events (user_id, title, event_date, event_type, source_type, source_id, description, status)
SELECT 
    p.user_id,
    CONCAT('Project deadline: ', p.name),
    p.deadline::date,
    'project_deadline',
    'project',
    p.id,
    CONCAT('Budget: $', COALESCE(p.budget, 0)),
    CASE WHEN p.status = 'COMPLETED' THEN 'completed'::calendar_event_status ELSE 'upcoming'::calendar_event_status END
FROM projects p
WHERE p.deadline IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM calendar_events ce 
    WHERE ce.source_type = 'project' AND ce.source_id = p.id
);
