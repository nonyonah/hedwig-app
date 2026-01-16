-- Demo Account Seed Data for Apple App Review
-- This creates a demo user with sample data for Apple reviewers to test the app

-- Demo user credentials:
-- Email: demo@hedwig.app
-- OTP Code: 123456 (handled in app, no actual OTP needed)

-- Insert demo user
INSERT INTO users (
    id,
    privy_id,
    email,
    first_name,
    last_name,
    avatar,
    ethereum_wallet_address,
    monthly_target,
    created_at,
    updated_at,
    last_login
) VALUES (
    'demo@hedwig.app',
    'demo-privy-id-hedwig-app-review',
    'demo@hedwig.app',
    'Demo',
    'User',
    '{"type":"emoji","emoji":"🦉","colorIndex":0}',
    '0xDemoWalletAddress1234567890abcdef',
    10000,
    NOW() - INTERVAL '30 days',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    avatar = EXCLUDED.avatar,
    updated_at = NOW();

-- Insert demo clients
INSERT INTO clients (id, user_id, name, email, phone, company, total_earnings, outstanding_balance, created_at)
VALUES 
    (gen_random_uuid(), 'demo@hedwig.app', 'Acme Corporation', 'billing@acme.com', '+1 555-0101', 'Acme Corp', 4500.00, 0, NOW() - INTERVAL '25 days'),
    (gen_random_uuid(), 'demo@hedwig.app', 'TechStart Inc', 'finance@techstart.io', '+1 555-0102', 'TechStart', 2800.00, 1200.00, NOW() - INTERVAL '20 days'),
    (gen_random_uuid(), 'demo@hedwig.app', 'Creative Studios', 'hello@creativestudios.com', '+1 555-0103', 'Creative Studios LLC', 1500.00, 500.00, NOW() - INTERVAL '15 days'),
    (gen_random_uuid(), 'demo@hedwig.app', 'Global Ventures', 'ap@globalventures.co', '+1 555-0104', 'Global Ventures', 3200.00, 0, NOW() - INTERVAL '10 days'),
    (gen_random_uuid(), 'demo@hedwig.app', 'Sarah Johnson', 'sarah.johnson@email.com', '+1 555-0105', NULL, 750.00, 750.00, NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- Insert demo documents (invoices and payment links)
DO $$
DECLARE
    acme_client_id TEXT;
    techstart_client_id TEXT;
    creative_client_id TEXT;
    global_client_id TEXT;
    sarah_client_id TEXT;
BEGIN
    -- Get client IDs
    SELECT id INTO acme_client_id FROM clients WHERE user_id = 'demo@hedwig.app' AND name = 'Acme Corporation' LIMIT 1;
    SELECT id INTO techstart_client_id FROM clients WHERE user_id = 'demo@hedwig.app' AND name = 'TechStart Inc' LIMIT 1;
    SELECT id INTO creative_client_id FROM clients WHERE user_id = 'demo@hedwig.app' AND name = 'Creative Studios' LIMIT 1;
    SELECT id INTO global_client_id FROM clients WHERE user_id = 'demo@hedwig.app' AND name = 'Global Ventures' LIMIT 1;
    SELECT id INTO sarah_client_id FROM clients WHERE user_id = 'demo@hedwig.app' AND name = 'Sarah Johnson' LIMIT 1;

    -- Insert invoices (using correct columns from 001_initial_schema.sql)
    -- Columns: id, user_id, client_id, type, title, description, amount, currency, status, content, created_at
    INSERT INTO documents (id, user_id, client_id, type, title, description, amount, currency, status, content, created_at)
    VALUES 
        -- Paid invoices
        (gen_random_uuid(), 'demo@hedwig.app', acme_client_id, 'INVOICE', 'Website Redesign - Phase 1', 'Complete redesign of company website including responsive design and SEO optimization', 2500.00, 'USD', 'PAID', '{"network": "base", "token": "USDC"}'::jsonb, NOW() - INTERVAL '25 days'),
        (gen_random_uuid(), 'demo@hedwig.app', acme_client_id, 'INVOICE', 'Website Redesign - Phase 2', 'E-commerce integration and payment gateway setup', 2000.00, 'USD', 'PAID', '{"network": "base", "token": "USDC"}'::jsonb, NOW() - INTERVAL '15 days'),
        (gen_random_uuid(), 'demo@hedwig.app', global_client_id, 'INVOICE', 'Brand Identity Package', 'Logo design, brand guidelines, and marketing materials', 3200.00, 'USD', 'PAID', '{"network": "base", "token": "USDC"}'::jsonb, NOW() - INTERVAL '12 days'),
        
        -- Pending invoices
        (gen_random_uuid(), 'demo@hedwig.app', techstart_client_id, 'INVOICE', 'Mobile App Development', 'React Native mobile app development - MVP phase', 1200.00, 'USD', 'SENT', '{"network": "base", "token": "USDC"}'::jsonb, NOW() - INTERVAL '5 days'),
        (gen_random_uuid(), 'demo@hedwig.app', creative_client_id, 'INVOICE', 'Social Media Campaign', 'Design and strategy for Q1 social media campaign', 500.00, 'USD', 'VIEWED', '{"network": "base", "token": "USDC"}'::jsonb, NOW() - INTERVAL '3 days'),
        (gen_random_uuid(), 'demo@hedwig.app', sarah_client_id, 'INVOICE', 'Portfolio Website', 'Personal portfolio website development', 750.00, 'USD', 'SENT', '{"network": "base", "token": "USDC"}'::jsonb, NOW() - INTERVAL '2 days'),
        
        -- Payment links
        (gen_random_uuid(), 'demo@hedwig.app', NULL, 'PAYMENT_LINK', 'Quick Payment', 'General consulting services payment link', 100.00, 'USD', 'DRAFT', '{"network": "base", "token": "USDC"}'::jsonb, NOW() - INTERVAL '7 days'),
        (gen_random_uuid(), 'demo@hedwig.app', techstart_client_id, 'PAYMENT_LINK', 'Consulting Hour', 'One hour of technical consulting', 150.00, 'USD', 'PAID', '{"network": "base", "token": "USDC"}'::jsonb, NOW() - INTERVAL '14 days')
    ON CONFLICT DO NOTHING;
    
    -- Insert demo transactions
    -- Columns: id, user_id, type(enum), amount, token, chain(enum), status(enum), from_address, to_address, tx_hash, platform_fee, created_at
    INSERT INTO transactions (id, user_id, type, amount, token, chain, status, from_address, to_address, tx_hash, platform_fee, created_at)
    VALUES
        (gen_random_uuid(), 'demo@hedwig.app', 'PAYMENT_RECEIVED', 2500.00, 'USDC', 'BASE', 'CONFIRMED', '0xAcmePayerAddress123', '0xDemoWalletAddress1234567890abcdef', '0xdemotxhash1' || substr(md5(random()::text), 0, 50), 25.00, NOW() - INTERVAL '20 days'),
        (gen_random_uuid(), 'demo@hedwig.app', 'PAYMENT_RECEIVED', 2000.00, 'USDC', 'BASE', 'CONFIRMED', '0xAcmePayerAddress123', '0xDemoWalletAddress1234567890abcdef', '0xdemotxhash2' || substr(md5(random()::text), 0, 50), 20.00, NOW() - INTERVAL '10 days'),
        (gen_random_uuid(), 'demo@hedwig.app', 'PAYMENT_RECEIVED', 3200.00, 'USDC', 'BASE', 'CONFIRMED', '0xGlobalVenturesAddress', '0xDemoWalletAddress1234567890abcdef', '0xdemotxhash3' || substr(md5(random()::text), 0, 50), 32.00, NOW() - INTERVAL '5 days'),
        (gen_random_uuid(), 'demo@hedwig.app', 'PAYMENT_RECEIVED', 150.00, 'USDC', 'BASE', 'CONFIRMED', '0xTechStartAddress123', '0xDemoWalletAddress1234567890abcdef', '0xdemotxhash4' || substr(md5(random()::text), 0, 50), 1.50, NOW() - INTERVAL '14 days'),
        (gen_random_uuid(), 'demo@hedwig.app', 'OFFRAMP', 1500.00, 'USDC', 'BASE', 'CONFIRMED', '0xDemoWalletAddress1234567890abcdef', '0xBankOfframpAddress', '0xdemotxhash5' || substr(md5(random()::text), 0, 50), 15.00, NOW() - INTERVAL '8 days')
    ON CONFLICT DO NOTHING;
    
    -- Insert demo projects (using correct schema from 001_initial_schema.sql)
    -- Projects table has: id, client_id, name, description, status, budget, currency, start_date, end_date, created_at
    -- Plus from 008 migration: deadline, user_id
    INSERT INTO projects (id, client_id, user_id, name, description, status, budget, currency, start_date, end_date, deadline, created_at)
    VALUES
        (gen_random_uuid(), acme_client_id, 'demo@hedwig.app', 'Acme Website Overhaul', 'Complete website redesign and development project', 'COMPLETED', 4500.00, 'USD', NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '30 days'),
        (gen_random_uuid(), techstart_client_id, 'demo@hedwig.app', 'TechStart Mobile App', 'React Native mobile application development', 'ONGOING', 8000.00, 'USD', NOW() - INTERVAL '10 days', NOW() + INTERVAL '60 days', NOW() + INTERVAL '60 days', NOW() - INTERVAL '10 days'),
        (gen_random_uuid(), creative_client_id, 'demo@hedwig.app', 'Q1 Marketing Campaign', 'Social media and marketing campaign for Q1', 'ONGOING', 2000.00, 'USD', NOW() - INTERVAL '5 days', NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days', NOW() - INTERVAL '5 days')
    ON CONFLICT DO NOTHING;
    
END $$;

-- Insert demo calendar events (using correct schema from 010_calendar_events.sql)
-- Columns: id, user_id, title, description, event_date, event_type(enum), status(enum), created_at
INSERT INTO calendar_events (id, user_id, title, description, event_date, event_type, status, created_at)
SELECT 
    gen_random_uuid(),
    'demo@hedwig.app',
    title,
    description,
    event_date,
    event_type::calendar_event_type,
    'upcoming'::calendar_event_status,
    NOW()
FROM (VALUES
    ('Client Call - Acme Corp', 'Discuss phase 3 requirements', NOW() + INTERVAL '2 days' + INTERVAL '10 hours', 'custom'),
    ('Invoice Due - TechStart', 'Mobile App Development invoice due', NOW() + INTERVAL '15 days', 'invoice_due'),
    ('Project Deadline - Marketing', 'Q1 Marketing Campaign deadline', NOW() + INTERVAL '30 days', 'project_deadline'),
    ('Weekly Review', 'Review weekly progress and plan next week', NOW() + INTERVAL '5 days' + INTERVAL '14 hours', 'custom')
) AS events(title, description, event_date, event_type)
ON CONFLICT DO NOTHING;

-- Insert a few demo conversations
INSERT INTO conversations (id, user_id, title, created_at, updated_at)
VALUES
    (gen_random_uuid(), 'demo@hedwig.app', 'Create invoice for Acme', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
    (gen_random_uuid(), 'demo@hedwig.app', 'Help me track my earnings', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
    (gen_random_uuid(), 'demo@hedwig.app', 'Generate a payment link', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- Add notifications for demo user (using correct schema from 007_notifications.sql)
-- Columns: id(UUID), user_id, type, title, message, metadata, is_read, created_at
INSERT INTO notifications (id, user_id, type, title, message, metadata, is_read, created_at)
VALUES
    (gen_random_uuid(), 'demo@hedwig.app', 'payment_received', 'Payment Received! 🎉', 'You received $3,200.00 USDC from Global Ventures', '{"amount": 3200, "token": "USDC"}', false, NOW() - INTERVAL '5 days'),
    (gen_random_uuid(), 'demo@hedwig.app', 'payment_received', 'Payment Received!', 'You received $2,000.00 USDC from Acme Corporation', '{"amount": 2000, "token": "USDC"}', true, NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;
