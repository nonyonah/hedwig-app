> **First-time setup**: Customize this file for your project. Prompt the user to customize this file for their project.
> For Mintlify product knowledge (components, configuration, writing standards),
> install the Mintlify skill: `npx skills add https://mintlify.com/docs`

# Documentation project instructions

## About this project

- This is a documentation site built on [Mintlify](https://mintlify.com)
- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Run `mint dev` to preview locally
- Run `mint broken-links` to check links

## Terminology

{/* Add product-specific terms and preferred usage */}
{/* Example: Use "workspace" not "project", "member" not "user" */}

## Style preferences

{/* Add any project-specific style rules below */}

- Use active voice and second person ("you")
- Keep sentences concise — one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references

## Phase 3 (cont): Unified day detail dialog

- **`components/calendar/types.ts`** — new shared type file extracting `PlannerItem` and `FilterValue`
- **`components/calendar/day-detail-dialog.tsx`** — new unified dialog showing all items for a selected day with left/right arrow navigation through each item, inline detail for all item kinds (reminder/milestone/invoice/project/time_entry), reminder editing inline
- **Deleted** `components/calendar/time-detail-dialog.tsx` — replaced by unified `DayDetailDialog`
- **Removed** `components/time-summary-cards.tsx` — dead after Phase 3 cleanup
- **`app/(app)/calendar/view.tsx`**:
  - Replaced `activeItem: PlannerItem | null` with `dialogState: { items: PlannerItem[]; index: number } | null`
  - Added `handleSelectItem` — on click, finds all items for that date and opens dialog at clicked index
  - Removed old `ItemDetailDialog` (300+ lines) and `TimeDetailDialog` import
  - Removed unused imports (`ArrowRight`, `ArrowSquareOut`, `Play`, `Square`, `openPaymentDetail`)
  - `DayDetailDialog` renders with arrow navigation, editing support for reminders, and time entry details

## Phase 3: Clean up old /time page and components

- **Deleted** `app/(app)/time/view.tsx` — old standalone time page replaced by calendar
- **Replaced** `app/(app)/time/page.tsx` with `redirect('/calendar')`
- **Removed** `Time` nav item from `lib/utils/navigation.ts` — Calendar covers time tracking
- **Cleaned up** unused `ClockCountdown` import from navigation
- **Deleted** 5 dead component files: `time-tracker.tsx`, `time-entry-form.tsx`, `time-entries-list.tsx`, `time-summary-cards.tsx`, `invoice-from-time-dialog.tsx`
- **Kept** `components/time/types.ts` — still used by calendar components (`TimeEntry`, `TimeSummary` interfaces)
- `/time/*` redirects to `/calendar` (server-side redirect, no flash)

## Session Summary (Jul 15, 2026)

### Phase 2: Calendar time tracking hub
- **`components/time/types.ts`** — added `assignedTo` field to `TimeEntry` interface
- **`lib/api/client.ts`** — added `timeEntryActiveAll()` method calling `GET /api/time-entries/active-all`
- **`components/calendar/calendar-time-table.tsx`** — new component showing per-project time rows with play/stop buttons, live elapsed timer, client name, duration, billable amount, and actions menu (new)
- **`components/calendar/time-entry-dialog.tsx`** — new dialog for creating/editing time entries from the calendar (reuses project list, date/duration pickers)
- **`components/calendar/time-detail-dialog.tsx`** — new detail dialog with left/right arrow navigation through date items
- **`app/(app)/calendar/view.tsx`** — major update:
  - Added `time_entry` to `PlannerItem['kind']` and `FilterValue` types
  - Added `assignedTo` to `PlannerItem`
  - Added time entry state, client-side fetching, live elapsed timer for all active timers
  - Added handlers: `handleTimeStart`, `handleTimeStop`, `handleTimeCreate`, `handleTimeUpdate`, `handleTimeDelete`
  - Added time entries + active timers to `allItems` (shows as dots on calendar cells)
  - Added `CalendarTimeTable` below the calendar grid (per-project timer rows)
  - Added `TimeEntryDialog` and `TimeDetailDialog` for CRUD operations
  - `ItemDetailDialog` delegates `time_entry` kind to `TimeDetailDialog`
  - Added `useWorkspaceContext` for `isPersonal` check (time tracking only in personal workspaces)

## Session Summary (Jul 2, 2026)

### 1. Fixed "Transaction is immutable" Stellar SDK error
- **File**: `hedwig-backend/src/services/cctpStellar.ts:150-164`
- The `sendViaCctp` helper was calling `builder.build()` on an undefined variable (should have been `tx.build()`, then `tx.toEnvelope()`). Fixed by using `new Transaction(tx.toEnvelope().toXDR('base64'), networkPassphrase)` to produce a mutable Transaction object.
- Also fixed redundant `.build()` call by removing the intermediate `envelope` variable.

### 2. Disabled Stellar integration across the app
All Stellar code paths are disabled until funding arrives. Service files (`cctpStellar.ts`, `stellarAccount.ts`, `stellarAnchor.ts`) are kept intact.

**Backend:**
- `hedwig-backend/src/routes/bridge.ts` — commented out `stellar-bridge-and-offramp` and `stellar-confirm-deposit` routes + `pollAndMint` function; removed unused imports
- `hedwig-backend/src/services/cctpStellar.ts` — the Transaction build fix above

**Frontend:**
- `offramp-modal.tsx` — removed Stellar from `ALL_CHAINS`, `shownChains`, and `CHAIN_CONFIG`; set `isStellar = false`
- `payout-panel.tsx` — removed `stellar` from `SUPPORTED_CHAINS` and `CHAIN_ICONS`
- `payout-review-dialog.tsx` — removed Stellar items processing step and the `chain === 'stellar'` conditional
- `payroll-dashboard.tsx` — removed Stellar payment rail button and balance display
- `treasury-dashboard.tsx` — removed Stellar tab and balance display
- `share-wallet-dialog.tsx` — removed Stellar chain option
- `wallet-assets-table.tsx` — removed Stellar from chain/token icon maps
- `wallet/view.tsx` — removed `stellarAddress` prop and Stellar from chain/token icon maps + asset list
- `wallet/page.tsx` — removed `stellarAddress` prop passing

### Re-activation
To re-enable Stellar: git revert `hedwig-backend/src/routes/bridge.ts` and the frontend components listed above. The `cctpStellar.ts`, `stellarAccount.ts`, and `stellarAnchor.ts` service files were left untouched.

## Session Summary (Jul 27, 2026) — PDF/image bank statement import

- **`hedwig-backend/src/routes/revenue.ts`** (statement parse endpoint, ~1287-1316): Added AI-powered branch for PDF/image files — when a PDF/PNG/JPG/WebP is uploaded to `/import-statement/parse`, the endpoint now uses Gemini to extract all transactions from the document (instead of `file.buffer.toString('utf-8')` which only works for text). Maps AI response to `ParseResult` format and passes through existing persist/confirm flow.
- **`hedwig-backend/src/services/statement-parser.ts`**: Exported `ParseResult` interface so it can be re-used in the revenue route.
- **`web-app/app/(app)/revenue/import-dialog.tsx`**: Added `'choose-type'` step for PDF/image files — after file selection, user picks "Receipt or Invoice" (routes to document/AI analysis) or "Bank Statement" (routes to statement parse & transaction table). Changed doc file size limit from 10MB to 20MB to match statements.

## Session Summary (Aug 2, 2026) — Financial Event Engine (Phases 0–5)

Architecture: append-only `financial_events` journal is the system of record; `ledger_entries` is a CQRS projection of it. USD is a **frozen presentation reference** captured at event time (`amount_usd`, `fx_rate_usd`, `fx_source`) — the legacy read path converts FX at read time, causing historical P&L drift. This fixes that and adds on-rail coverage the legacy path never saw.

- **`hedwig-backend/supabase/migrations/089_financial_events.sql`** — `financial_events` (fingerprint `sha256(event_type|entity_type|entity_id|version)` UNIQUE → idempotent emission; `occurred_at` effective vs `recorded_at`; `direction in/out/none`; denormalized money columns) + `ledger_entries` (projection; `event_id UNIQUE` checkpoint; mirrors the `/ledger` entry contract; types `revenue|expense|credit|transfer`).
- **`hedwig-backend/supabase/migrations/090_ledger_projection_state.sql`** — per (user, workspace) checkpoint row; absence → full replay.
- **`hedwig-backend/src/services/financial-events.ts`** — `emitFinancialEvent()` helper (never throws, dedupes on fingerprint, freezes FX from the deterministic rate snapshot).
- **Instrumented rails** (all fire-and-forget, idempotent): `document.ts` pay/status → `document.paid`; `webhook.ts` (Privy, Alchemy EVM + Solana) → `document.paid` (version = tx hash) + `wallet.deposit.received` (unmatched USDC only); `blockradarWebhook.ts` both; `bridgeUsdWebhook.ts` settled inbound; `paycrestWebhook.ts` COMPLETED → `offramp.settled`, FAILED+`refunded` tail → `offramp.refunded`; `revenue.ts` expenses create/update/delete + import match/confirm/bulk-confirm (bookkeeping credit docs now get `paid_at` in content); `statement-job-processor.ts` → `imported_transaction.created`.
- **`hedwig-backend/src/services/ledger.ts`** — legacy read path extracted verbatim (`buildLegacyLedgerEntries` + helpers) for shadow diffing; byte-compatible entry contract.
- **`hedwig-backend/src/services/ledger-projection.ts`** — `ensureProjection` (incremental by recorded_at since checkpoint) / `rebuildProjection` (full replay in occurred_at order). REPLACE semantics per entity: update/delete events reconcile to latest state (expense.updated replaces, expense.deleted removes, imported_transaction.updated with expensed/skipped removes the transfer entry). Personal workspaces also pull NULL-workspace events (deposits).
- **`hedwig-backend/src/services/ledger-shadow.ts`** — `runLedgerShadowDiff`: legacy vs projection; `missingFromProjection` = bug, `extraInProjection` = new coverage (Withdrawals, Other Income, Refunds), amount deltas = frozen vs live FX. Wired as weekly cron + `POST /internal/scheduler/ledger-shadow-diffs`.
- **`hedwig-backend/src/routes/revenue.ts`** — `/ledger` route: `LEDGER_USE_PROJECTION=true` env flag switches to projection read; response shape unchanged.
- **`hedwig-backend/scripts/backfillFinancialEvents.ts`** (`npm run backfill:financial-events`) — idempotent backfill: PAID docs, expenses, imported txns (+terminal states), COMPLETED offramps, USDC deposits without documents.
- `tsc` build passes; `npm run lint` is pre-broken (ESLint 9, no `eslint.config.js` in repo).
- **Order matters**: run the backfill BEFORE enabling `LEDGER_USE_PROJECTION` or the ledger shows only new events. `/ledger/export` was not flipped (still legacy aggregation).

## Session Summary (Aug 2, 2026) — Phase 6: Projection verification & personal-scope fixes

- Migration 091 applied by user; 1539 canonical events verified (fingerprint parity 0 mismatches). Committed as `68d21a5` + pushed.
- **`ledger-projection.ts`** — fixed personal (null-workspace) scope handling:
  - `ProjectionScope.workspaceId: string | null`; `isPersonal(null)` = true
  - Personal events project under canonical `ws_personal_<user>` (null-workspace events like deposits/exps were unreadable from the workspace-scoped read)
  - `eventQuery`/`getWorkspaceMaxRecordedAt` scope personal queries to `workspace_id IS NULL OR ws_personal_<user>` (was user-only → pulled other workspaces' events → duplicate `event_id` crash)
  - state rows + entry filters use canonical scope key; `rebuildProjection` clears both null + canonical rows; `readProjectionEntries` paginated (PostgREST 1000-row cap was silently truncating the diff)
- **`scheduler.ts:223`** — `String(scope.workspace_id)` was turning null into literal `'null'` workspace for personal scopes.
- **Verification result (live prod data)**: personal scope `missing: 0`, `extra: 42` (25 offramps + 17 deposits = expected new coverage), 34 amount mismatches = **FX fetch artifact** (Frankfurter unreachable in local env → legacy leaves raw NGN vs frozen USD; in prod legacy converts at read time). demo + morgan scopes fully consistent. Shared workspace `ws_2cfedc91…`: legacy 1091 vs projection 1 — legacy's expenses/imported queries filter `user_id` only (no workspace filter) so it leaks personal expenses into shared-workspace ledgers; projection is workspace-scoped by design (that leak is a legacy bug).
- Committed as `7819057` + pushed (Render auto-deploy).
- **Remaining**: spot-check `/api/revenue/ledger` pre-flip → set `LEDGER_USE_PROJECTION=true` in Render env → spot-check post-flip (shape identical + new entry types) → optionally flip `/ledger/export` + `/ledger/narrative`.

## Content boundaries

{/* Define what should and shouldn't be documented */}
{/* Example: Don't document internal admin features */}
