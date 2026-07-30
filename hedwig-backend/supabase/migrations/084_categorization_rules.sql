-- 084: Categorization rules for auto-categorization engine

create table if not exists categorization_rules (
    id             text primary key default ('rule_' || replace(uuid_generate_v4()::text, '-', '')),
    user_id        text not null references users(id) on delete cascade,
    workspace_id   text references workspaces(id) on delete set null,
    conditions     jsonb not null,
    category       text not null,
    priority       integer not null default 0,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists idx_cat_rules_workspace on categorization_rules(workspace_id);
create index if not exists idx_cat_rules_user on categorization_rules(user_id);

alter table categorization_rules enable row level security;

create policy cat_rules_select_own on categorization_rules
  for select using (
    user_id = auth.uid()::text
    or exists (
      select 1 from workspace_members wm
      where wm.workspace_id = categorization_rules.workspace_id
        and wm.user_id = auth.uid()::text
        and wm.role in ('owner', 'admin')
    )
  );

create policy cat_rules_insert_own on categorization_rules
  for insert with check (user_id = auth.uid()::text);

create policy cat_rules_update_own on categorization_rules
  for update using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

create policy cat_rules_delete_own on categorization_rules
  for delete using (user_id = auth.uid()::text);
