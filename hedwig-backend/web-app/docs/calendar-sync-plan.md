# Calendar Sync Plan

## Goal
Build reliable, two-way productivity sync for Hedwig calendar events across:
- Google Calendar
- Apple Calendar (via CalDAV/ICS ingestion strategy)
- Slack
- GitHub
- Google Drive

This should preserve Hedwig as the source of truth for billing/project events while allowing external edits where supported.

## Product Scope
- Sync Hedwig reminders, milestones, invoices, and project deadlines to external calendars.
- Ingest selected external events back into Hedwig as "external" calendar events.
- Push actionable updates to Slack (new due items, overdue, status changes).
- Link calendar events to GitHub issues/PRs and Drive docs where relevant.

## Principles
- Hedwig event IDs are canonical.
- Every sync action is idempotent.
- No direct provider-to-provider sync; Hedwig orchestrates all flows.
- Users can choose one-way or two-way per integration.
- Clear conflict rules and audit logs for every sync action.

## Architecture

### 1) Integration Layer
- OAuth providers for Google, Slack, GitHub.
- Secure token storage (encrypted at rest, scoped by workspace + user).
- Refresh-token lifecycle handling and revocation support.

### 2) Sync Engine
- Event bus + job queue for background sync tasks.
- Per-provider adapters:
  - `googleCalendarAdapter`
  - `appleCalendarAdapter` (initially ICS outbound + optional CalDAV inbound in later phase)
  - `slackAdapter`
  - `githubAdapter`
  - `driveAdapter`
- Cursor/checkpoint tables for incremental sync.

### 3) Data Model Additions
- `integration_connections`
- `calendar_sync_preferences`
- `external_event_mappings` (hedwig_event_id <-> provider_event_id)
- `sync_checkpoints`
- `sync_failures` and retry metadata
- `sync_audit_logs`

### 4) Conflict Strategy
- Default: Hedwig-wins for internal entities (invoice deadlines, milestones).
- Optional external-wins for user-created personal reminders.
- Detect conflicts by `updated_at` + provider `etag`/version markers.
- Surface conflict notifications in app + Slack.

## Rollout Phases

### Phase 1: Foundation (2 weeks)
- Build integration settings UI and token plumbing.
- Keep existing ICS subscription for read-only calendar export.
- Add sync schema and queue workers.

### Phase 2: Google Calendar two-way (2–3 weeks)
- Outbound: Hedwig -> Google for selected event classes.
- Inbound: Google -> Hedwig external events (filtered calendars only).
- Deletion and reschedule handling.

### Phase 3: Slack + GitHub + Drive productivity hooks (2 weeks)
- Slack notifications and optional slash-command status checks.
- GitHub links: attach issue/PR metadata to Hedwig events.
- Drive links: attach meeting docs/specs to events.

### Phase 4: Apple support expansion (2 weeks)
- Keep ICS for simple Apple calendar subscription.
- Add CalDAV ingestion only if required by customer demand.

### Phase 5: Hardening (ongoing)
- Retry policies, dead-letter queue, alerting dashboards.
- Rate-limit handling and provider outage fallbacks.
- Workspace-level observability for sync health.

## Reliability + Security Requirements
- OAuth scopes: least privilege by provider.
- Token encryption with key rotation strategy.
- Webhook signature validation.
- Idempotency keys on all outbound writes.
- Exponential backoff + bounded retries.
- Per-tenant throttling and circuit breakers.

## UX Requirements
- Integration status page with:
  - Connected providers
  - Last sync timestamp
  - Last error
  - Retry now button
- Per-calendar toggles and one-way/two-way controls.
- Explicit conflict resolution prompts.

## Implementation Order Recommendation
1. Google Calendar two-way first (highest value, clean APIs).
2. Slack notifications second (fast impact).
3. GitHub/Drive attachments third.
4. Apple CalDAV only after Google path is stable.

