-- Enable per-project running timers (multiple timers can run simultaneously)

-- Drop the global one-running-timer constraint
drop index if exists idx_one_running_timer;

-- Allow one running timer per project
create unique index idx_one_running_timer_per_project on time_entries(user_id, workspace_id, project_id)
  where status = 'running' and project_id is not null;

-- Allow at most one running timer without a project
create unique index idx_one_running_timer_no_project on time_entries(user_id, workspace_id)
  where status = 'running' and project_id is null;

-- Add assigned_to for team workspace support
alter table time_entries add column if not exists assigned_to text references users(id) on delete set null;
