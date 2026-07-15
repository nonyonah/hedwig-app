-- Imported bank statement transactions for bookkeeping reconciliation

create table if not exists imported_transactions (
    id                   text primary key default ('itxn_' || replace(uuid_generate_v4()::text, '-', '')),
    user_id              text not null references users(id) on delete cascade,
    workspace_id         text references workspaces(id) on delete set null,
    statement_id         text not null,
    transaction_date     date not null,
    description          text not null default '',
    original_description text not null default '',
    amount               numeric(18,6) not null,
    currency             text not null default 'USD',
    type                 text not null check (type in ('debit', 'credit')),
    category             text,
    bank_name            text,
    account_number       text,
    running_balance      numeric(18,6),
    reference            text,

    matched_client_id    text references clients(id) on delete set null,
    matched_invoice_id   text references documents(id) on delete set null,
    matched_expense_id   text references expenses(id) on delete set null,
    match_confidence     numeric(4,3),
    match_method         text,

    status               text not null default 'pending' check (status in ('pending', 'matched', 'expensed', 'skipped', 'reconciled')),
    ai_suggestion        jsonb,

    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

create index if not exists idx_imported_txns_user on imported_transactions(user_id);
create index if not exists idx_imported_txns_statement on imported_transactions(statement_id);
create index if not exists idx_imported_txns_status on imported_transactions(status);

create table if not exists statement_imports (
    id                   text primary key default ('stm_' || replace(uuid_generate_v4()::text, '-', '')),
    user_id              text not null references users(id) on delete cascade,
    workspace_id         text references workspaces(id) on delete set null,
    original_filename    text not null,
    file_format          text not null,
    bank_name            text,
    account_number       text,
    start_date           date,
    end_date             date,
    currency             text not null default 'USD',
    transaction_count    integer not null default 0,
    total_debits         numeric(18,6),
    total_credits        numeric(18,6),
    status               text not null default 'pending' check (status in ('pending', 'reviewing', 'confirmed', 'partially_confirmed', 'cancelled')),
    import_summary       jsonb,
    created_at           timestamptz not null default now()
);

create index if not exists idx_stmt_imports_user on statement_imports(user_id);
