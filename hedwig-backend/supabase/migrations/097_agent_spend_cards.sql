-- 097_agent_spend_cards.sql — Nche port: agents + spend policies + approvals +
-- cards + x402 receipts + disputes + manual review.
-- wallet_ledger intentionally NOT created: Hedwig's append-only
-- financial_events journal (089) is the ledger; ports emit events there.
-- Audit likewise goes through financial_events / timeline_events (094).

-- Agents (one user may own many; v1 shares one card across agents)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  workspace_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  avatar_style INT DEFAULT 0,
  parsed_instructions_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);

-- One deterministic spend policy per agent
CREATE TABLE IF NOT EXISTS spend_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  monthly_cap NUMERIC(20,2) NOT NULL DEFAULT 0,
  per_transaction_cap NUMERIC(20,2) NOT NULL DEFAULT 0,
  limit_period TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (limit_period IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  merchant_allowlist TEXT[] NOT NULL DEFAULT '{}',
  merchant_types TEXT[] NOT NULL DEFAULT '{}',
  allow_new_vendors BOOLEAN NOT NULL DEFAULT false,
  requires_approval_above NUMERIC(20,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Human approval queue for agent spend / invoices held by policy
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('TRANSACTION','INVOICE')),
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  invoice_id TEXT,
  bridge_auth_id TEXT,
  source_type TEXT,
  source_reference TEXT,
  merchant_name TEXT,
  merchant_url TEXT,
  intent_metadata JSONB,
  idempotency_key TEXT,
  amount NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',
  reason TEXT NOT NULL,
  policy_snapshot JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DECLINED','EXPIRED')),
  decision TEXT,
  decided_by_user_id TEXT,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approvals_user_status ON approval_requests(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_approvals_idempotency ON approval_requests(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Bridge-issued stablecoin cards funded from the owner's Privy wallet
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  bridge_card_id TEXT UNIQUE,
  bridge_card_token TEXT,
  last4 TEXT,
  brand TEXT,
  exp_month TEXT,
  exp_year TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_FUNDING',
  funding_address TEXT,
  funding_tx_hash TEXT,
  issuance_fee_charged NUMERIC(20,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);

CREATE TABLE IF NOT EXISTS card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  bridge_transaction_id TEXT UNIQUE,
  bridge_auth_id TEXT,
  type TEXT,
  status TEXT,
  amount NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',
  merchant_name TEXT,
  merchant_id TEXT,
  raw_payload JSONB,
  ledger_event_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_card_tx_card ON card_transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_card_tx_user ON card_transactions(user_id);

-- x402 (USDC on Base) inflow receipts; ledger lives in financial_events
CREATE TABLE IF NOT EXISTS x402_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  payer_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  amount NUMERIC(20,2) NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  tx_hash TEXT NOT NULL UNIQUE,
  settlement JSONB,
  ledger_event_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_x402_user ON x402_receipts(user_id);

-- Disputes / support tickets (card + invoice)
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  card_transaction_id UUID REFERENCES card_transactions(id) ON DELETE SET NULL,
  invoice_id TEXT,
  reason TEXT NOT NULL,
  details JSONB,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disputes_user ON disputes(user_id);

-- Manual KYC/KYB review queue (unified Didit + Bridge state lives on users/kyc tables)
CREATE TABLE IF NOT EXISTS manual_review_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  reference_id TEXT,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','APPROVED','REJECTED')),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_user ON manual_review_cases(user_id);
