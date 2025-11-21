-- Hedwig Backend Initial Schema for Supabase
-- Generated from Prisma schema

-- Enable UUID extension for better ID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums
CREATE TYPE project_status AS ENUM ('ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED');
CREATE TYPE document_type AS ENUM ('INVOICE', 'PROPOSAL', 'CONTRACT', 'PAYMENT_LINK');
CREATE TYPE document_status AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'PAID', 'CANCELLED');
CREATE TYPE transaction_type AS ENUM ('PAYMENT_RECEIVED', 'PAYMENT_SENT', 'OFFRAMP', 'FEE_COLLECTION');
CREATE TYPE transaction_status AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');
CREATE TYPE chain AS ENUM ('BASE', 'CELO', 'SOLANA');
CREATE TYPE offramp_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE message_role AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT ('user_' || replace(uuid_generate_v4()::text, '-', '')),
    
    -- Privy authentication
    privy_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    
    -- Wallet addresses (one per chain)
    base_wallet_address TEXT UNIQUE,
    celo_wallet_address TEXT UNIQUE,
    solana_wallet_address TEXT UNIQUE,
    
    -- Profile
    first_name TEXT,
    last_name TEXT,
    avatar TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to users
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Clients table
CREATE TABLE clients (
    id TEXT PRIMARY KEY DEFAULT ('client_' || replace(uuid_generate_v4()::text, '-', '')),
    
    user_id TEXT NOT NULL,
    
    -- Client details
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    address TEXT,
    wallet_address TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_clients_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Projects table
CREATE TABLE projects (
    id TEXT PRIMARY KEY DEFAULT ('project_' || replace(uuid_generate_v4()::text, '-', '')),
    
    client_id TEXT NOT NULL,
    
    -- Project details
    name TEXT NOT NULL,
    description TEXT,
    status project_status NOT NULL DEFAULT 'ACTIVE',
    budget DOUBLE PRECISION,
    currency TEXT NOT NULL DEFAULT 'USD',
    
    -- Dates
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_projects_client
        FOREIGN KEY (client_id)
        REFERENCES clients(id)
        ON DELETE CASCADE
);

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Documents table
CREATE TABLE documents (
    id TEXT PRIMARY KEY DEFAULT ('doc_' || replace(uuid_generate_v4()::text, '-', '')),
    
    user_id TEXT NOT NULL,
    client_id TEXT,
    project_id TEXT,
    
    -- Document details
    type document_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount DOUBLE PRECISION,
    currency TEXT,
    
    -- Document content
    content JSONB,
    pdf_url TEXT,
    pdf_path TEXT,
    
    -- Payment link specific
    payment_link_id TEXT UNIQUE,
    payment_link_url TEXT,
    
    -- Status
    status document_status NOT NULL DEFAULT 'DRAFT',
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_documents_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_documents_client
        FOREIGN KEY (client_id)
        REFERENCES clients(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_documents_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE SET NULL
);

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Transactions table
CREATE TABLE transactions (
    id TEXT PRIMARY KEY DEFAULT ('tx_' || replace(uuid_generate_v4()::text, '-', '')),
    
    user_id TEXT NOT NULL,
    document_id TEXT,
    
    -- Transaction details
    type transaction_type NOT NULL,
    status transaction_status NOT NULL DEFAULT 'PENDING',
    chain chain NOT NULL,
    tx_hash TEXT UNIQUE,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    
    -- Amounts
    amount DOUBLE PRECISION NOT NULL,
    amount_in_ngn DOUBLE PRECISION,
    token TEXT NOT NULL,
    platform_fee DOUBLE PRECISION NOT NULL,
    network_fee DOUBLE PRECISION,
    
    -- Metadata
    block_number INTEGER,
    timestamp TIMESTAMPTZ,
    error_message TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_transactions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_transactions_document
        FOREIGN KEY (document_id)
        REFERENCES documents(id)
        ON DELETE SET NULL
);

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Offramp orders table
CREATE TABLE offramp_orders (
    id TEXT PRIMARY KEY DEFAULT ('offramp_' || replace(uuid_generate_v4()::text, '-', '')),
    
    user_id TEXT NOT NULL,
    
    -- Paycrest order details
    paycrest_order_id TEXT UNIQUE NOT NULL,
    status offramp_status NOT NULL DEFAULT 'PENDING',
    
    -- Crypto side
    chain chain NOT NULL,
    token TEXT NOT NULL,
    crypto_amount DOUBLE PRECISION NOT NULL,
    tx_hash TEXT,
    
    -- Fiat side
    fiat_currency TEXT NOT NULL DEFAULT 'NGN',
    fiat_amount DOUBLE PRECISION NOT NULL,
    exchange_rate DOUBLE PRECISION NOT NULL,
    service_fee DOUBLE PRECISION NOT NULL,
    
    -- Bank details
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT,
    
    -- Metadata
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    CONSTRAINT fk_offramp_orders_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TRIGGER update_offramp_orders_updated_at
    BEFORE UPDATE ON offramp_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Conversations table
CREATE TABLE conversations (
    id TEXT PRIMARY KEY DEFAULT ('conv_' || replace(uuid_generate_v4()::text, '-', '')),
    
    user_id TEXT NOT NULL,
    
    -- Conversation metadata
    title TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_conversations_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY DEFAULT ('msg_' || replace(uuid_generate_v4()::text, '-', '')),
    
    conversation_id TEXT NOT NULL,
    
    -- Message content
    role message_role NOT NULL,
    content TEXT NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX idx_users_privy_id ON users(privy_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_base_wallet ON users(base_wallet_address);
CREATE INDEX idx_users_celo_wallet ON users(celo_wallet_address);
CREATE INDEX idx_users_solana_wallet ON users(solana_wallet_address);

CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_client_id ON documents(client_id);
CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_payment_link_id ON documents(payment_link_id);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_document_id ON transactions(document_id);
CREATE INDEX idx_transactions_tx_hash ON transactions(tx_hash);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_chain ON transactions(chain);

CREATE INDEX idx_offramp_orders_user_id ON offramp_orders(user_id);
CREATE INDEX idx_offramp_orders_paycrest_order_id ON offramp_orders(paycrest_order_id);
CREATE INDEX idx_offramp_orders_status ON offramp_orders(status);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offramp_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own data"
    ON users FOR SELECT
    USING (auth.uid()::text = privy_id);

CREATE POLICY "Users can update their own data"
    ON users FOR UPDATE
    USING (auth.uid()::text = privy_id);

CREATE POLICY "Users can insert their own data"
    ON users FOR INSERT
    WITH CHECK (auth.uid()::text = privy_id);

-- RLS Policies for clients table
CREATE POLICY "Users can view their own clients"
    ON clients FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can create their own clients"
    ON clients FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can update their own clients"
    ON clients FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can delete their own clients"
    ON clients FOR DELETE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

-- RLS Policies for projects table
CREATE POLICY "Users can view their own projects"
    ON projects FOR SELECT
    USING (client_id IN (SELECT id FROM clients WHERE user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text)));

CREATE POLICY "Users can create their own projects"
    ON projects FOR INSERT
    WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text)));

CREATE POLICY "Users can update their own projects"
    ON projects FOR UPDATE
    USING (client_id IN (SELECT id FROM clients WHERE user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text)));

CREATE POLICY "Users can delete their own projects"
    ON projects FOR DELETE
    USING (client_id IN (SELECT id FROM clients WHERE user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text)));

-- RLS Policies for documents table
CREATE POLICY "Users can view their own documents"
    ON documents FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can create their own documents"
    ON documents FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can update their own documents"
    ON documents FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can delete their own documents"
    ON documents FOR DELETE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

-- RLS Policies for transactions table
CREATE POLICY "Users can view their own transactions"
    ON transactions FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can create their own transactions"
    ON transactions FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can update their own transactions"
    ON transactions FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

-- RLS Policies for offramp_orders table
CREATE POLICY "Users can view their own offramp orders"
    ON offramp_orders FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can create their own offramp orders"
    ON offramp_orders FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can update their own offramp orders"
    ON offramp_orders FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

-- RLS Policies for conversations table
CREATE POLICY "Users can view their own conversations"
    ON conversations FOR SELECT
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can create their own conversations"
    ON conversations FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can update their own conversations"
    ON conversations FOR UPDATE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

CREATE POLICY "Users can delete their own conversations"
    ON conversations FOR DELETE
    USING (user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text));

-- RLS Policies for messages table
CREATE POLICY "Users can view messages in their conversations"
    ON messages FOR SELECT
    USING (conversation_id IN (SELECT id FROM conversations WHERE user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text)));

CREATE POLICY "Users can create messages in their conversations"
    ON messages FOR INSERT
    WITH CHECK (conversation_id IN (SELECT id FROM conversations WHERE user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text)));

CREATE POLICY "Users can update messages in their conversations"
    ON messages FOR UPDATE
    USING (conversation_id IN (SELECT id FROM conversations WHERE user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text)));

CREATE POLICY "Users can delete messages in their conversations"
    ON messages FOR DELETE
    USING (conversation_id IN (SELECT id FROM conversations WHERE user_id IN (SELECT id FROM users WHERE privy_id = auth.uid()::text)));
