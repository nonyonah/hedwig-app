
<!-- HEROUI-REACT-AGENTS-MD-START -->
[HeroUI React v3 Docs Index]|root: ./.heroui-docs/react|STOP. What you remember about HeroUI React v3 is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: heroui agents-md --react --output AGENTS.md|demos/cn/accordion:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-styles.tsx,disabled.tsx,faq.tsx,multiple.tsx,surface.tsx,without-separator.tsx}|demos/cn/alert-dialog:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-icon.tsx,custom-portal.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,sizes.tsx,statuses.tsx,with-close-button.tsx}|demos/cn/alert:{basic.tsx}|demos/cn/autocomplete:{allows-empty-collection.tsx,asynchronous-filtering.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,default.tsx,disabled.tsx,email-recipients.tsx,full-width.tsx,location-search.tsx,multiple-select.tsx,required.tsx,single-select.tsx,tag-group-selection.tsx,user-selection-multiple.tsx,user-selection.tsx,variants.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/cn/avatar:{basic.tsx,colors.tsx,custom-styles.tsx,fallback.tsx,group.tsx,sizes.tsx,variants.tsx}|demos/cn/badge:{basic.tsx,colors.tsx,dot.tsx,placements.tsx,sizes.tsx,variants.tsx,with-content.tsx}|demos/cn/breadcrumbs:{basic.tsx,custom-render-function.tsx,custom-separator.tsx,disabled.tsx,level-2.tsx,level-3.tsx}|demos/cn/button-group:{basic.tsx,disabled.tsx,full-width.tsx,orientation.tsx,sizes.tsx,variants.tsx,with-icons.tsx,without-separator.tsx}|demos/cn/button:{basic.tsx,custom-render-function.tsx,custom-variants.tsx,disabled.tsx,full-width.tsx,icon-only.tsx,loading-state.tsx,loading.tsx,outline-variant.tsx,ripple-effect.tsx,sizes.tsx,social.tsx,variants.tsx,with-icons.tsx}|demos/cn/calendar:{basic.tsx,booking-calendar.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,in... (line truncated to 2000 chars)
<!-- HEROUI-REACT-AGENTS-MD-END -->

## Goal
- Unify wallet as accounts view, build bank statement import, enhance Gmail/Drive/Docs/Calendar integrations, fix calendar sync, add inbox auto-import, fix UI bugs

## Constraints & Preferences
- Payout banks moved from Settings to Wallet page, not duplicate
- Design language: `rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs` containers, `text-[15px] font-semibold text-[var(--color-foreground)]` titles, `text-[13px] text-[var(--color-text-muted)]` descriptions, `space-y-6` page spacing
- CSV/OFX/QFX parsed to AI (Gemini → AI Gateway → OpenRouter fallback) for categorization & client matching
- Only Hedwig assistant chat sidebar removed — contextual suggestions, dashboard brief panel, and all other AI features kept
- Calendar sync via Composio `GOOGLECALENDAR_EVENTS_LIST`, both push and pull
- Feature paywall: Pro required for composio integrations (Gmail/Calendar/Drive/Docs) and assistant chat; all plans have unlimited invoices/contracts; free plan gets 200 AI prompts/month

## Progress
### Done (all from Jul 15–16, 2026)
- Moved `PayoutBankSection` from Settings to Wallet page; renamed page title "Revenue" → "Accounts"
- Built statement parser service (`src/services/statement-parser.ts`): OFX/QFX via `<STMTTRN>` regex extraction, CSV via `csv-parse` with auto-detect columns by header name
- Created DB migration `081_imported_transactions.sql` with `imported_transactions` (per-line-item) and `statement_imports` (per-batch) tables
- Backend routes `POST /api/revenue/import-statement/parse` and `POST /api/revenue/import-statement/confirm`
- Added OpenRouter fallback to `llmService` (`generateWithOpenRouter`) as third provider after Gemini → AI Gateway
- Removed assistant chat sidebar; kept `use-assistant-page-context.ts` as no-op; restored assistant-panel/suggestion-card/brief/weekly
- Replaced inline assistant summary on dashboard with `<AssistantPanel max-h-[560px] />`
- **Fixed calendar sync bugs**: composio status URL, auth headers, connect button
- **Fixed magic inbox PATCH**: Created dynamic Next.js route at `app/api/integrations/threads/[id]/route.ts`
- **Fixed time entry saving**: Added `workspaceId` to opts, error toasts on start/stop, `await` on dialog save
- **Inbox auto-import actions**: Import as contract/expense/invoice in ThreadDetailPanel
- **Backend**: matchedDocumentId/Type on PATCH thread; all types importable
- **Drive upload + Google Docs**: Backend routes + UI buttons on invoices/contracts
- **Fixed TS build errors**: Unused variables, DocumentType casing, patchThread type
- **Navigation**: Inbox in Overview, "Members" → "Team"
- **Unified import dialog**: Merged document + bank statement import into single `ImportDialog` with tabs; deleted `statement-import-dialog.tsx`
- **Removed statement import from Wallet**; single "Import" button on Revenue page
- **Fixed dropdown arrows**: `right-2.5`/`right-3` → `right-3`/`right-4` in 3 components
- **Reorganized homescreen**: "Next reminder" compact card in right-column stats area; Assistant Panel full-width
- **Payroll fixes**: Removed "Test (1 min)" frequency option from schedule creation; fixed "1th" → "1st" ordinal suffix; removed "minute" type from state

### In Progress
- (none)

## Cron Job Recommendation
**Platform: cron-job.org** (not Inngest — not available/desired)
- **Free**: 60 cron jobs, every 5 min minimum
- **Why**: Zero code changes needed. The app already has `SCHEDULER_MODE=cloud` with a `schedulerRouter` at `POST /internal/scheduler/<job>` protected by `SCHEDULER_SECRET`
- **Setup**: Create 18 cron jobs at cron-job.org, each pointing to `https://your-app.fly.dev/internal/scheduler/<job>` with `Authorization: Bearer <SCHEDULER_SECRET>` header
- **Alternative** (if HTTP-based is preferred): GCP Cloud Scheduler ($0.30/job/mo = $5.40/mo for 18 jobs)
- **Note**: Fly.io `auto_stop_machines = stop` will stop the machine between cron pings. Either set `auto_stop_machines = false` in `fly.toml` or use Fly's cheapest always-on tier

## Revenue Metrics Research
Per-workspace P&L, runway, burn rate, and expenses-by-category **are feasible** using existing tables (`documents`, `expenses`, `imported_transactions`). Key gap: existing revenue queries filter by `user_id` only — need `.eq('workspace_id', effectiveWsId)` added. No new tables required.

## Relevant Files
- `web-app/app/(app)/revenue/import-dialog.tsx`: Unified import with Document/Bank Statement tabs
- `web-app/app/(app)/revenue/statement-import-dialog.tsx`: DELETED
- `web-app/app/(app)/dashboard/view.tsx`: Homescreen — reminder moved, full-width assistant
- `web-app/app/(app)/inbox/view.tsx`: Fixed PATCH + auth
- `web-app/app/api/integrations/threads/[id]/route.ts`: NEW dynamic PATCH route
- `web-app/components/email/thread-detail-panel.tsx`: Added toast + error handling
- `web-app/components/workspace/payroll-dashboard.tsx`: Removed 1min test, fixed 1st ordinal
