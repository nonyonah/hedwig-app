## Goal
- Rewrite the landing page with new brand positioning (freelancer invoicing → global business financial ops), then implement QuickBooks, Xero, and Linear integrations via Composio as first-class citizens inside Hedwig.

## Constraints & Preferences
- Landing page must target modern businesses globally, not African freelancers
- Remove all crypto jargon, API references, and defensive messaging
- 4 feature pillars: Receive, Manage, Move, Scale
- Pricing: 1% settlement fee, no subscriptions, no hidden fees
- Mobile app section must be present with TestFlight + Google Play download links
- For integrations: follow existing codebase patterns exactly — OAuth flows, settings UI, component system, AI tool registration, notification/error patterns
- Do not redesign the product or introduce inconsistent UI
- Use Composio as the integration layer (already used for Google services)
- Integrations must work from both AI assistant and traditional UI workflows
- Production-ready: retries, error states, loading states, audit trails, expired token handling
- QuickBooks + Xero sync must work with Bookkeeping/Revenue/Insights pages
- Linear must work with Projects/Clients pages
- No regressions to existing integrations
- Typecheck must pass with zero new errors

## Progress
### Done
- Analyzed full current landing page vs required changes (side-by-side gap table)
- Wrote new `app/page.tsx` (576 lines) with complete brand repositioning — hero, trust bar, 4-step flow, treasury mockup, pricing, FAQ, CTA, mobile app
- Wrote new `app/features-showcase.tsx` (371 lines) with 4-pillar structure: Receive, Manage, Move, Scale
- Created DB migration `071_composio_commercial_providers.sql` — adds `xero` and `linear` to provider CHECK constraint + `sync_settings` JSONB column
- Extended `composio.ts` — added `quickbooks`, `xero`, `linear` to `ComposioProvider`, `COMPOSIO_PROVIDERS`, toolkit slugs, labels, descriptions
- Created `composioCommercial.ts` — sync service: `syncInvoiceToQuickBooks`, `exportRevenueToQuickBooks`, `pushEntriesToXero`, `createLinearProject`, `syncLinearProjectStatus`, `getLinearProjectLink`, `unlinkLinearProject`
- Created `composio-commercial-tools.ts` — 8 AI tool definitions following existing pattern
- Registered `getCommercialToolsForUser()` in `assistant-runtime.ts` alongside existing tools
- Updated `composio-integrations.tsx` frontend — added QuickBooks/Xero/Linear to Provider type, ICON_PATH, PLACEHOLDER_CONNECTIONS
- Created frontend API proxy routes for all sync actions (quickbooks/sync, xero/push, linear/create, linear/sync-status, linear/link)
- Added Express backend routes for all sync actions in `src/routes/integrations.ts`
- Added QuickBooks + Xero sync buttons to Revenue page header (secondary variant, next to Export)
- Replaced toolbar Linear button with per-project Linear icon in each project row (always visible, not hover-hidden)
- Added Linear create button to project detail page header
- Created `/public/icons/xero.svg`, `/public/icons/linear.svg` — replaced with actual brand logos (Linear SVG, QuickBooks/Xero PNG)
- Fixed 15 pre-existing type errors across `externalRecipients.ts`, `offrampV2.ts`, `settlementPreferences.ts`, `payroll.ts`, `composioCommercial.ts`
- Fixed `LINEAR_CREATE_PROJECT` slug → `LINEAR_CREATE_LINEAR_PROJECT` (and `LINEAR_GET_PROJECT` → `LINEAR_GET_LINEAR_PROJECT`)
- Fixed `createLinearProject` parameters based on actual tool schema:
  - `teamId` → `team_ids` (array of strings, plural — confirmed via SDK introspection)
  - `dueDate` → `target_date` (Linear's field name for due date)
- Fetch teams first via `LINEAR_LIST_LINEAR_TEAMS` to get a valid team UUID
- Reverted `projectId` → `project_id` in `syncLinearProjectStatus` (original was correct, schema uses snake_case)
- Added milestone syncing to `createLinearProject` — each Hedwig milestone becomes a Linear issue in the project (title, amount, status, due date)
- Updated success toast messages in both project list and detail views to show milestone sync count
- `syncLinearProjectStatus` now maps Linear project state → Hedwig status and updates the project in supabase
- Added `getAllLinkedProjects` + `GET /composio/linear/links` endpoint for batch lookup of linked projects
- Project list loads linked projects on mount via `GET /composio/linear/links`
- Synced projects show a green refresh icon (re-sync), unsynced projects show the original circular arrow (create)
- Project detail page fetches link status on mount; shows "Synced" (with sync icon) or "Sync with Linear" accordingly
- Added AI-powered milestone suggestion endpoint `POST /api/integrations/suggest-milestones` — uses LLM to generate milestones from description/budget/deadline
- Updated "Suggest milestones" button in create-menu.tsx to call AI endpoint instead of hardcoded 30/40/50 split
- Updated "Summarize scope" to scroll and focus the description textarea after condensing
- Fixed milestone sync to avoid passing `undefined` for `due_date`; added debug logging for milestone count

### Done
- Project creation in Linear now works (params match tool schema)
- Milestones are synced as Linear issues within the created project

## Key Decisions
- Reuse existing `composio_connections` table instead of creating a separate integrations table
- Extend existing `composio-integrations.tsx` component rather than creating new files
- Created separate `composioCommercial.ts` service instead of bloating `composio.ts`
- Created separate `composio-commercial-tools.ts` for AI tools
- Linear project links stored in `composio_connections.metadata JSONB`
- Per-project Linear buttons (one per row) instead of a single toolbar button — users see the action next to each project
- Always-visible Linear icon rather than hover-reveal so users know the feature exists
- Auto-fetch Linear teams so user doesn't have to provide a teamId manually

## Next Steps
1. User to test Linear project creation after the `teamId` fix
2. If it still doesn't work, check the `LINEAR_LIST_LINEAR_TEAMS` response shape and `LINEAR_CREATE_LINEAR_PROJECT` parameter names
3. Add a synced indicator (Linked / Not linked badge) on each project row once linking is reliable
4. Add `syncLinearProjectStatus` button to project detail page (already created the handler, just needs a UI trigger)
5. Verify QuickBooks + Xero sync also work end-to-end (currently untested)

## Critical Context
- Composio tool slug for Linear create is `LINEAR_CREATE_LINEAR_PROJECT` (not `LINEAR_CREATE_PROJECT`)
- The `executeTool` function in `composioCommercial.ts` returns the full response from `sdk.tools.execute()` including `.data`, `.error`, `.successful`, `.logId`, `.sessionInfo`
- `result.data` is the actual tool output (transformed by `transformToolExecuteResponse`)
- Linear's GraphQL API requires `teamId` to create a project — we auto-fetch it
- The response shape for creation is flattened by Composio: `result.data.projectCreate?.project ?? result.data.project ?? result.data`
- All 15 pre-existing type errors fixed across 4 files
