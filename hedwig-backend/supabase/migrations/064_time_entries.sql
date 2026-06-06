-- Time tracking for personal workspaces
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  description text,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_seconds integer,
  hourly_rate numeric(10,2),
  billable_amount numeric(10,2) generated always as (
    case
      when duration_seconds is not null and hourly_rate is not null
      then (duration_seconds::numeric / 3600) * hourly_rate
      else null
    end
  ) stored,
  status text not null default 'stopped' check (status in ('running', 'stopped', 'manual', 'billed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_time_entries_user_ws on time_entries(user_id, workspace_id);
create index idx_time_entries_project on time_entries(project_id);
create index idx_time_entries_status on time_entries(status);
create index idx_time_entries_start on time_entries(start_time desc);

-- Only one running timer per user+workspace
create unique index idx_one_running_timer on time_entries(user_id, workspace_id)
  where status = 'running';

-- Add hourly rate to projects
alter table projects add column if not exists hourly_rate numeric(10,2);

-- Enable RLS (use service role, bypass for now)
alter table time_entries enable row level security;

create policy "users can manage own time entries"
  on time_entries for all
  using (user_id in (select id from users where privy_id = auth.uid()::text))
  with check (user_id in (select id from users where privy_id = auth.uid()::text));
